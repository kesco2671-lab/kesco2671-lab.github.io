/* KESCO Supabase 연결 모듈
 * 현재 화면/로직은 유지하고, 데이터 저장은 Supabase에서 처리합니다.
 *
 * 중복 저장 방지:
 * 1) 같은 신청을 짧은 시간에 여러 번 save()가 호출해도 하나의 DB 신청번호를 재사용합니다.
 * 2) 새 신청번호를 만든 뒤 장비/이력 저장에서 오류가 나면 생성된 부모 신청도 함께 정리합니다.
 */
const SUPABASE_URL = 'https://bpavztuiimwhlzemysyk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KmG68pZH0gHH7fg2P4JaZQ_vqjMBcFv';

let KESCO_DB = null;
let KESCO_DB_READY = false;
let KESCO_SYNCING = Promise.resolve();

// 아직 supabaseLoad()가 끝나기 전인 연속 저장을 같은 신청으로 묶기 위한 메모리 맵
const KESCO_PENDING_REQUESTS = new Map();

function sbHeaders(extra={}){
  return Object.assign({
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json'
  }, extra);
}

function sbRequest(path, options={}){
  return fetch(SUPABASE_URL+'/rest/v1/'+path, Object.assign({headers:sbHeaders()}, options))
    .then(async r=>{
      const text=await r.text();
      let body=null; try{body=text?JSON.parse(text):null}catch(e){body=text}
      if(!r.ok){throw new Error((body&&body.message)||body?.error_description||body?.hint||('Supabase 오류 '+r.status));}
      return body;
    });
}

async function supabaseLoad(){
  const [offices,vendors,equipment,requests,links,histories] = await Promise.all([
    sbRequest('offices?select=*&order=id'),
    sbRequest('vendors?select=*&order=id'),
    sbRequest('equipment?select=*&order=id'),
    sbRequest('requests?select=*&order=created_at.desc'),
    sbRequest('request_equipment?select=*&order=request_id'),
    sbRequest('request_history?select=*&order=created_at')
  ]);

  const officeById=Object.fromEntries(offices.map(x=>[x.id,x]));
  const historyByRequest={};
  histories.forEach(h=>(historyByRequest[h.request_id]??=[]).push({
    at:h.created_at,status:h.status||'',detail:h.detail,actor:h.actor_type
  }));
  const linksByRequest={};
  links.forEach(x=>(linksByRequest[x.request_id]??=[]).push(Number(x.equipment_id)));

  const legacyRequests=[];
  requests.forEach(r=>{
    const ids=linksByRequest[r.id]||[];
    const history=historyByRequest[r.id]||[];
    const base={
      batchId:'db:'+r.id,
      dbRequestId:r.id,
      vendorId:Number(r.vendor_id),
      office:officeById[r.office_id]?.name||'',
      applicant:r.applicant||'',extension:r.extension||'',email:r.email||'',
      date1:r.date1||'',date2:r.date2||'',memo:r.memo||'',
      status:r.status||'업체 회신 대기',confirmedDate:r.confirmed_date||'',
      rejectionReason:r.rejection_reason||'',createdAt:r.created_at,updatedAt:r.updated_at,
      history:history.length?history:[{at:r.created_at,status:'신청 접수',detail:'설명 일정 신청이 접수되었습니다.',actor:'사업소'}]
    };
    (ids.length?ids:[null]).forEach((equipmentId,i)=>legacyRequests.push({...base,id:Number(String(r.id)+String(i).padStart(3,'0')),equipmentId}));
  });

  const legacyEquipment=equipment.map(e=>({
    id:Number(e.id),name:e.name,model:e.model,company:e.manufacturer||'',
    group:e.group_name||'기타',category:e.group_name||'기타',intro:e.intro||'',
    vendorId:Number(e.vendor_id),active:e.active!==false
  }));
  const legacyVendors=vendors.map(v=>({
    id:Number(v.id),name:v.name,code:v.access_code||'',contact:v.contact_name||'',phone:v.phone||'',email:v.email||'',active:v.active!==false
  }));

  return {equipment:legacyEquipment,vendors:legacyVendors,requests:legacyRequests,_offices:offices,_knownRequestIds:requests.map(x=>Number(x.id)),_knownEquipmentIds:equipment.map(x=>Number(x.id)),_knownVendorIds:vendors.map(x=>Number(x.id))};
}

async function kescoInit(){
  try{
    KESCO_DB=await supabaseLoad();
    KESCO_DB_READY=true;
    if(window.kescoAfterInit) window.kescoAfterInit();
  }catch(err){
    console.error(err);
    KESCO_DB={equipment:[],vendors:[],requests:[],_offices:[],_knownRequestIds:[],_knownEquipmentIds:[],_knownVendorIds:[]};
    KESCO_DB_READY=false;
    document.body.insertAdjacentHTML('afterbegin','<div id="dbError" style="position:fixed;z-index:99999;top:0;left:0;right:0;background:#fff3cd;color:#664d03;border-bottom:1px solid #ffecb5;padding:12px 16px;font:14px/1.5 sans-serif">Supabase 연결에 실패했습니다. Supabase SQL Editor에서 RLS 정책을 먼저 실행했는지 확인해주세요.<br><small>'+String(err.message||err)+'</small></div>');
  }
}

function data(){return KESCO_DB||{equipment:[],vendors:[],requests:[]};}

function save(d){
  KESCO_DB=d;
  const snapshot=JSON.parse(JSON.stringify(d));
  KESCO_SYNCING=KESCO_SYNCING.then(()=>supabaseSync(snapshot)).catch(err=>{
    console.error(err); alert('Supabase 저장 중 오류가 발생했습니다.\n'+(err.message||err));
  });
}

function requestGroupsForSync(d){
  const map=new Map();
  (d.requests||[]).forEach(r=>{const key=requestGroupKey(r);if(!map.has(key))map.set(key,[]);map.get(key).push(r)});
  return [...map.values()];
}

// 새 신청이 여러 번 동기화될 때 동일 신청임을 판별하는 키.
// batchId는 신청 버튼을 한 번 눌렀을 때 생성되므로, 정상적인 새 신청끼리는 서로 다른 값입니다.
function pendingRequestKey(rows){
  const r=rows[0]||{};
  if(r.dbRequestId) return 'db:'+Number(r.dbRequestId);
  if(r.batchId) return 'batch:'+String(r.batchId);
  return [
    r.vendorId||'',r.office||'',r.applicant||'',r.extension||'',r.email||'',
    r.date1||'',r.date2||'',r.memo||'',r.createdAt||'',
    [...new Set(rows.map(x=>Number(x.equipmentId)).filter(Number.isFinite))].sort((a,b)=>a-b).join(',')
  ].join('|');
}

async function deleteRequestCompletely(requestId){
  // 자식부터 삭제하면 RLS/외래키 환경에서도 정리하기 쉽습니다.
  await sbRequest('request_history?request_id=eq.'+requestId,{method:'DELETE'});
  await sbRequest('request_equipment?request_id=eq.'+requestId,{method:'DELETE'});
  await sbRequest('requests?id=eq.'+requestId,{method:'DELETE'});
}

async function replaceRequestChildren(requestId, rows){
  await sbRequest('request_equipment?request_id=eq.'+requestId,{method:'DELETE'});
  const equipmentIds=[...new Set(rows.map(r=>Number(r.equipmentId)).filter(Number.isFinite))];
  if(equipmentIds.length) await sbRequest('request_equipment',{
    method:'POST',
    headers:sbHeaders({'Prefer':'return=minimal'}),
    body:JSON.stringify(equipmentIds.map(id=>({request_id:requestId,equipment_id:id})))
  });

  await sbRequest('request_history?request_id=eq.'+requestId,{method:'DELETE'});
  const seen=new Set();
  const histories=[];
  (rows[0]?.history||[]).forEach(h=>{
    const k=[h.at,h.status,h.detail,h.actor].join('|');
    if(seen.has(k))return;seen.add(k);
    histories.push({
      request_id:requestId,
      status:h.status||null,
      detail:h.detail||'',
      actor_type:['사업소','업체','관리자','시스템'].includes(h.actor)?h.actor:'시스템',
      actor_name:null,
      created_at:h.at||new Date().toISOString()
    });
  });
  if(histories.length) await sbRequest('request_history',{
    method:'POST',
    headers:sbHeaders({'Prefer':'return=minimal'}),
    body:JSON.stringify(histories)
  });
}

async function supabaseSync(d){
  // 업체/장비는 현재 화면에서 수정된 상태를 그대로 서버에 반영합니다.
  const vendorRows=(d.vendors||[]).map(v=>({id:Number(v.id),name:v.name,contact_name:v.contact||null,phone:v.phone||null,email:v.email||null,access_code:v.code||null,active:v.active!==false}));
  if(vendorRows.length) await sbRequest('vendors?on_conflict=id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(vendorRows)});
  const knownV=new Set((d._knownVendorIds||[]).map(Number));
  const currentV=new Set(vendorRows.map(v=>v.id));
  for(const id of knownV) if(!currentV.has(id)) await sbRequest('vendors?id=eq.'+id,{method:'DELETE'});

  const eqRows=(d.equipment||[]).map(e=>({id:Number(e.id),vendor_id:Number(e.vendorId),group_name:e.group||e.category||null,name:e.name,model:e.model||null,manufacturer:e.company||null,intro:e.intro||null,active:e.active!==false}));
  if(eqRows.length) await sbRequest('equipment?on_conflict=id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(eqRows)});
  const knownE=new Set((d._knownEquipmentIds||[]).map(Number));
  const currentE=new Set(eqRows.map(e=>e.id));
  for(const id of knownE) if(!currentE.has(id)) await sbRequest('equipment?id=eq.'+id,{method:'DELETE'});

  const groups=requestGroupsForSync(d);
  const currentDbIds=new Set();
  const officeByName=Object.fromEntries((d._offices||[]).map(o=>[o.name,o.id]));
  const vendorById=Object.fromEntries((d.vendors||[]).map(v=>[v.id,v]));

  for(const rows of groups){
    const r=rows[0];
    const officeId=officeByName[r.office];
    if(!officeId || !vendorById[r.vendorId]) continue;

    const payload={
      office_id:Number(officeId),
      vendor_id:Number(r.vendorId),
      applicant:r.applicant,
      extension:r.extension||null,
      email:r.email||null,
      date1:r.date1,
      date2:r.date2||null,
      memo:r.memo||null,
      status:r.status||'업체 회신 대기',
      confirmed_date:r.confirmedDate||null,
      rejection_reason:r.rejectionReason||null
    };

    let dbId=Number(r.dbRequestId)||0;
    let createdHere=false;
    const pKey=pendingRequestKey(rows);

    // 같은 신청의 앞선 동기화가 이미 DB 번호를 만들었다면 그 번호를 재사용합니다.
    if(!dbId){
      const pendingId=Number(KESCO_PENDING_REQUESTS.get(pKey)||0);
      if(pendingId) dbId=pendingId;
    }

    try{
      if(dbId){
        await sbRequest('requests?id=eq.'+dbId,{
          method:'PATCH',
          headers:sbHeaders({'Prefer':'return=minimal'}),
          body:JSON.stringify(payload)
        });
      }else{
        const created=await sbRequest('requests',{
          method:'POST',
          headers:sbHeaders({'Prefer':'return=representation'}),
          body:JSON.stringify(payload)
        });
        dbId=Number(created?.[0]?.id);
        if(!dbId) throw new Error('신청번호를 생성하지 못했습니다.');
        createdHere=true;
        KESCO_PENDING_REQUESTS.set(pKey,dbId);
      }

      rows.forEach(x=>{x.dbRequestId=dbId;x.batchId='db:'+dbId});
      currentDbIds.add(dbId);
      await replaceRequestChildren(dbId,rows);

      // 정상 완료 후에도 같은 신청의 후속 save가 이 번호를 재사용할 수 있도록 유지합니다.
      KESCO_PENDING_REQUESTS.set(pKey,dbId);
    }catch(err){
      // 새 부모 신청만 여기서 만들었다면 실패한 부모까지 함께 삭제합니다.
      // 그래야 다음 재시도에서 같은 신청이 새 번호로 중복 생성되지 않습니다.
      if(createdHere && dbId){
        try{ await deleteRequestCompletely(dbId); }
        catch(cleanErr){ console.error('실패한 신청 정리 중 오류:',cleanErr); }
        KESCO_PENDING_REQUESTS.delete(pKey);
      }
      throw err;
    }
  }

  const knownR=new Set((d._knownRequestIds||[]).map(Number));
  for(const id of knownR) if(!currentDbIds.has(id)){
    await sbRequest('requests?id=eq.'+id,{method:'DELETE'});
  }

  // 새로 생성된 DB ID를 현재 메모리에도 유지합니다.
  const refreshed=await supabaseLoad();
  KESCO_DB=refreshed;
}
