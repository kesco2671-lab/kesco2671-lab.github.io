/* KESCO Supabase 연결 모듈
 * 현재 화면은 기존 수정32 UI/로직을 유지하고, 데이터 저장만 Supabase로 전환합니다.
 */
const SUPABASE_URL = 'https://zennpzvncrydckibewujo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_y-MVtkOLn38eg7NLgXR6tQ_kvd_w1y';

let KESCO_DB = null;
let KESCO_DB_READY = false;
let KESCO_SYNCING = Promise.resolve();

function sbHeaders(extra={}){
  return Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer '+SUPABASE_KEY,
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

async function replaceRequestChildren(requestId, rows){
  await sbRequest('request_equipment?request_id=eq.'+requestId,{method:'DELETE'});
  const equipmentIds=[...new Set(rows.map(r=>Number(r.equipmentId)).filter(Number.isFinite))];
  if(equipmentIds.length) await sbRequest('request_equipment',{method:'POST',headers:sbHeaders({'Prefer':'return=minimal'}),body:JSON.stringify(equipmentIds.map(id=>({request_id:requestId,equipment_id:id})))});
  await sbRequest('request_history?request_id=eq.'+requestId,{method:'DELETE'});
  const seen=new Set();
  const histories=[];
  (rows[0]?.history||[]).forEach(h=>{
    const k=[h.at,h.status,h.detail,h.actor].join('|');
    if(seen.has(k))return;seen.add(k);
    histories.push({request_id:requestId,status:h.status||null,detail:h.detail||'',actor_type:['사업소','업체','관리자','시스템'].includes(h.actor)?h.actor:'시스템',actor_name:null,created_at:h.at||new Date().toISOString()});
  });
  if(histories.length) await sbRequest('request_history',{method:'POST',headers:sbHeaders({'Prefer':'return=minimal'}),body:JSON.stringify(histories)});
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
    let dbId=Number(r.dbRequestId)||0;
    const payload={office_id:Number(officeId),vendor_id:Number(r.vendorId),applicant:r.applicant,extension:r.extension||null,email:r.email||null,date1:r.date1,date2:r.date2||null,memo:r.memo||null,status:r.status||'업체 회신 대기',confirmed_date:r.confirmedDate||null,rejection_reason:r.rejectionReason||null};
    if(dbId){
      await sbRequest('requests?id=eq.'+dbId,{method:'PATCH',headers:sbHeaders({'Prefer':'return=minimal'}),body:JSON.stringify(payload)});
    }else{
      const created=await sbRequest('requests',{method:'POST',headers:sbHeaders({'Prefer':'return=representation'}),body:JSON.stringify(payload)});
      dbId=Number(created?.[0]?.id);
      if(!dbId) throw new Error('신청번호를 생성하지 못했습니다.');
      rows.forEach(x=>{x.dbRequestId=dbId;x.batchId='db:'+dbId});
    }
    currentDbIds.add(dbId);
    await replaceRequestChildren(dbId,rows);
  }
  const knownR=new Set((d._knownRequestIds||[]).map(Number));
  for(const id of knownR) if(!currentDbIds.has(id)){
    await sbRequest('requests?id=eq.'+id,{method:'DELETE'});
  }
  // 새로 생성된 DB ID를 현재 메모리에도 유지합니다.
  const refreshed=await supabaseLoad();
  KESCO_DB=refreshed;
}
