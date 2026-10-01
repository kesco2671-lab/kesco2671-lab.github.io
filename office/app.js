function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function inferCategory(name){const n=String(name||'');if(n.includes('열화상'))return '열화상';if(n.includes('절연'))return '절연';if(n.includes('접지'))return '접지';return '기타';}
function fillOffices(){const list=(data()._offices||[]).filter(x=>x.active!==false).map(x=>x.name);const fallback=typeof OFFICE_LIST!=='undefined'?OFFICE_LIST:[];const names=list.length?list:fallback;const html=names.map(x=>`<option>${esc(x)}</option>`).join('');document.getElementById('office').innerHTML=html;document.getElementById('findOffice').innerHTML=html;}
function todayISO(){const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function selectedBoxes(){return [...document.querySelectorAll('.equipment-check:checked')];}
function updateSelectionState(){
 const boxes=[...document.querySelectorAll('.equipment-check')];
 const selected=selectedBoxes();
 const vendorIds=[...new Set(selected.map(x=>String(x.dataset.vendorId)))];
 boxes.forEach(x=>{x.disabled=selected.length>0 && !vendorIds.includes(String(x.dataset.vendorId));});
 const count=document.getElementById('global-selected-count'); if(count) count.textContent=selected.length+'개 선택';
 const btn=document.getElementById('global-apply'); if(btn) btn.disabled=selected.length===0;
 document.querySelectorAll('[id^="selected-count-"]').forEach(el=>{const vid=el.id.replace('selected-count-','');el.textContent=selected.filter(x=>String(x.dataset.vendorId)===String(vid)).length+'개 선택'});
 document.querySelectorAll('[id^="vendor-apply-"]').forEach(el=>{const vid=el.id.replace('vendor-apply-','');const n=selected.filter(x=>String(x.dataset.vendorId)===String(vid)).length;el.disabled=n===0;});
}
function showPage(id){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.page===id));window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.page==='admin'){openAdminLogin();return}showPage(b.dataset.page);}));

function renderEquipment(){
 let d=data();
 if(!d.equipment.length){document.getElementById('equipmentList').innerHTML='<div class="empty">등록된 장비가 없습니다.</div>';return}
 const vendors=Object.fromEntries(d.vendors.map(v=>[v.id,v]));
 const mode=document.getElementById('equipmentViewMode')?.value||'vendor';
 const groups={};
 d.equipment.filter(e=>e.active!==false).forEach(e=>{const key=mode==='category'?(e.group||e.category||'기타'):(e.vendorId||'미지정');(groups[key]??=[]).push(e);});
 const keys=Object.keys(groups).sort((a,b)=>{const aa=mode==='vendor'?(vendors[a]?.name||'판매업체 미지정'):a;const bb=mode==='vendor'?(vendors[b]?.name||'판매업체 미지정'):b;return String(aa).localeCompare(String(bb),'ko')});
 document.getElementById('equipmentList').innerHTML=keys.map((key,i)=>{
   const items=groups[key]||[]; const title=mode==='vendor'?(vendors[key]?.name||'판매업체 미지정'):key;
   const vendorId=mode==='vendor'?key:'';
   return `<details class="group ${mode==='vendor'?'vendor-group':''}" ${i===0?'open':''}>
     <summary><span>${esc(title)}</span><span class="group-count">${items.length}개 장비</span></summary>
     <div class="group-body">
       <table class="group-table"><thead><tr><th style="width:54px">선택</th>${mode==='vendor'?'<th>그룹</th>':'<th>판매업체</th>'}<th>계측기명</th><th>모델</th><th>제작사</th><th>간략소개</th></tr></thead>
       <tbody>${items.map(e=>`<tr><td><input class="equipment-check" type="checkbox" data-vendor-id="${esc(e.vendorId)}" value="${e.id}" onchange="updateSelectionState()" aria-label="${esc(e.name)} 선택"></td><td>${mode==='vendor'?esc(e.group||e.category||'기타'):esc(vendors[e.vendorId]?.name||'판매업체 미지정')}</td><td>${esc(e.name)}</td><td>${esc(e.model)}</td><td>${esc(e.company)}</td><td>${esc(e.intro)}</td></tr>`).join('')}</tbody></table>
       ${mode==='vendor'?`<div class="vendor-actions"><span class="selected-count" id="selected-count-${esc(vendorId)}">0개 선택</span><button class="btn primary small" id="vendor-apply-${esc(vendorId)}" disabled onclick="openSelectedApply(${esc(vendorId)})">선택한 장비 신청</button></div>`:''}
     </div>
   </details>`;
 }).join('');
 updateSelectionState();
}

function renderVendorSelect(){let d=data();document.getElementById('eqVendor').innerHTML='<option value="">판매업체 선택</option>'+d.vendors.map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('');}
function openSelectedApply(vendorId){
 const checks=[...document.querySelectorAll(`.equipment-check[data-vendor-id="${vendorId}"]:checked`)];
 if(!checks.length){alert('신청할 장비를 하나 이상 선택해주세요.');return}
 openApplyWithChecks(checks);
}
function openSelectedApplyFromGlobal(){const checks=selectedBoxes();if(!checks.length){alert('신청할 장비를 하나 이상 선택해주세요.');return}openApplyWithChecks(checks)}
function openApplyWithChecks(checks){
 const ids=checks.map(x=>Number(x.value));
 const vendorIds=[...new Set(checks.map(x=>Number(x.dataset.vendorId)))];
 if(vendorIds.length!==1){alert('한 번에 한 판매업체의 장비만 신청할 수 있습니다.');return}
 const vendorId=vendorIds[0],d=data(),v=d.vendors.find(x=>x.id===vendorId);
 if(!v){alert('판매업체 정보를 찾을 수 없습니다.');return}
 const items=d.equipment.filter(e=>ids.includes(e.id));
 document.getElementById('selectedVendor').textContent=v.name;
 document.getElementById('selectedEquipmentList').innerHTML='<b>선택 장비 '+items.length+'개</b><ul style="margin:7px 0 0 18px;padding:0">'+items.map(e=>`<li>${esc(e.name)} <span class="muted">(${esc(e.model)})</span></li>`).join('')+'</ul>';
 document.getElementById('apply').dataset.ids=JSON.stringify(ids);document.getElementById('apply').dataset.vendorId=String(vendorId);
 document.getElementById('office').value=OFFICE_LIST[0];['applicant','extension','email','date1','date2','memo'].forEach(id=>document.getElementById(id).value='');
 document.getElementById('date1').min=todayISO();document.getElementById('date2').min=todayISO();showPage('apply');
}
function submitRequest(){
 let d=data(),a=document.getElementById('applicant').value.trim(),o=document.getElementById('office').value,ext=document.getElementById('extension').value.trim(),email=document.getElementById('email').value.trim(),d1=document.getElementById('date1').value,d2=document.getElementById('date2').value,m=document.getElementById('memo').value.trim();
 let ids=[];try{ids=JSON.parse(document.getElementById('apply').dataset.ids||'[]')}catch(e){}
 const vendorId=Number(document.getElementById('apply').dataset.vendorId||0),items=d.equipment.filter(e=>ids.includes(e.id));
 if(!a||!o||!ext||!email||!d1||!d2||!items.length||!vendorId){alert('필수 항목을 입력해주세요.');return}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){alert('회사 이메일 형식을 확인해주세요.');return}
 if(d1<todayISO()||d2<todayISO()){alert('희망일은 오늘 이후 날짜만 선택할 수 있습니다.');return}
 if(d1===d2){alert('희망일 1과 희망일 2는 서로 다른 날짜를 선택해주세요.');return}
 if(items.some(e=>Number(e.vendorId)!==vendorId)){alert('같은 판매업체의 장비만 한 번에 신청할 수 있습니다.');return}
 if(!d.vendors.some(v=>v.id===vendorId)){alert('판매업체 정보를 찾을 수 없습니다.');return}
 const now=new Date().toISOString(),batchId='B'+Date.now();
 items.forEach((e,i)=>d.requests.push({id:Date.now()+i,batchId,equipmentId:e.id,vendorId,office:o,applicant:a,extension:ext,email,date1:d1,date2:d2,memo:m,status:'업체 회신 대기',confirmedDate:'',createdAt:now,history:[{at:now,status:'신청 접수',detail:'설명 일정 신청이 접수되었습니다.',actor:'사업소'}]}));
 save(d);alert(items.length+'개 장비의 설명 신청이 접수되었습니다.');['applicant','extension','email','date1','date2','memo'].forEach(id=>document.getElementById(id).value='');document.getElementById('apply').dataset.ids='[]';document.getElementById('apply').dataset.vendorId='';renderEquipment();showPage('equipment');
}
function requestGroupKey(r){if(r.batchId)return 'batch:'+r.batchId;const day=(r.createdAt||'').slice(0,10);return ['legacy',r.vendorId,r.office,r.applicant,r.extension||'',r.email||'',day,r.date1||'',r.date2||'',r.memo||''].join('|')}
function groupRequests(rows){const map=new Map();rows.forEach(r=>{const key=requestGroupKey(r);if(!map.has(key))map.set(key,{key,rows:[]});map.get(key).rows.push(r)});return [...map.values()].map(g=>{g.rows.sort((a,b)=>(new Date(a.createdAt||0).getTime()||a.id)-(new Date(b.createdAt||0).getTime()||b.id));const first=g.rows[g.rows.length-1];const rejected=g.rows.find(r=>r.status==='일정 불가');const histMap=new Map();g.rows.forEach(r=>(r.history||[]).forEach(h=>{const k=[h.at,h.status,h.detail,h.actor].join('|');if(!histMap.has(k))histMap.set(k,h)}));const history=[...histMap.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at)));return {...first,groupIds:g.rows.map(r=>r.id),equipmentIds:[...new Set(g.rows.map(r=>r.equipmentId))],status:rejected?'일정 불가':(first.status||'업체 회신 대기'),rejectionReason:[...new Set(g.rows.map(r=>String(r.rejectionReason||'').trim()).filter(Boolean))].join(' / '),history}})}
function equipmentLabel(e){return e?String(e.name||'장비')+'('+String(e.model||'-')+' / '+String(e.company||'-')+')':'장비'}
function getRequestGroupById(id){const d=data(),r=d.requests.find(x=>x.id===id);if(!r)return null;const key=requestGroupKey(r);return groupRequests(d.requests.filter(x=>requestGroupKey(x)===key))[0]||null}
function applyToGroup(group,fn){const d=data();d.requests.filter(r=>group.groupIds.includes(r.id)).forEach(fn);save(d)}
function historyMessage(h){const s=String(h.status||'변경');const d=String(h.detail||'');const actor=String(h.actor||'');let msg='';if(s==='신청 접수'){msg='설명 일정 <strong>신청이 접수</strong>되었습니다.'}else if(s==='신청내용 수정'){msg='<strong>신청내용이 수정</strong>되었습니다.'}else if(s==='일정 불가'){const m=d.match(/사유:\s*(.*)$/);msg='<strong>일정 불가</strong> 처리되었습니다.';if(m&&m[1])msg+=' 사유: '+esc(m[1])}else if(s==='일정 불가 사유 수정'){const m=d.match(/사유를 수정했습니다:\s*(.*)$/);msg='<strong>일정 불가 사유가 수정</strong>되었습니다.';if(m&&m[1])msg+=' 사유: '+esc(m[1])}else if(s==='업체 회신 대기'){msg='업체가 <strong>다시 일정 회신</strong>으로 변경했습니다.'}else if(s==='일정 협의 필요'){msg='업체가 <strong>일정 협의</strong>를 요청했습니다.'}else if(s==='일정 확정'){const m=d.match(/(\d{4}-\d{2}-\d{2})/);msg=m?'업체가 <strong>'+esc(m[1])+' 일정으로 확정</strong>했습니다.':'업체가 <strong>일정 확정</strong>했습니다.'}else if(s==='확정 일정 변경'){const m=d.match(/(\d{4}-\d{2}-\d{2})에서 (\d{4}-\d{2}-\d{2})로/);msg=m?'업체가 <strong>확정 일정을 '+esc(m[1])+' → '+esc(m[2])+'로 변경</strong>했습니다.':'업체가 <strong>확정 일정</strong>을 변경했습니다.'}else{msg='<strong>'+esc(s)+'</strong> 처리되었습니다.'}return msg+' <span class="muted">('+esc(actor)+')</span>'}
function historyHtml(history){if(!history?.length)return '';return '<details class="history-box"><summary>상태 변경 이력 · '+history.length+'건</summary><ul class="history-list">'+history.map(h=>'<li class="history-item"><span class="history-time">'+esc(new Date(h.at).toLocaleString('ko-KR'))+'</span><span class="history-message">'+historyMessage(h)+'</span></li>').join('')+'</ul></details>'}

function findRequests(){
 let o=document.getElementById('findOffice').value,n=document.getElementById('findName').value.trim(),box=document.getElementById('results');
 if(!o||!n){box.innerHTML='<div class="notice">사업소와 신청자 이름을 모두 입력해주세요.</div>';return}
 let d=data(),eq=Object.fromEntries(d.equipment.map(e=>[e.id,e])),ven=Object.fromEntries(d.vendors.map(v=>[v.id,v])),arr=groupRequests(d.requests.filter(r=>r.office===o&&r.applicant===n));
 if(!arr.length){box.innerHTML='<div class="notice">해당 사업소와 신청자 이름으로 등록된 신청이 없습니다.</div>';return}
 let cards=arr.slice().reverse().map(function(g){let confirmed=!!g.confirmedDate;let rejected=g.status==='일정 불가';let changed=(g.history||[]).some(h=>h.status==='확정 일정 변경');let editBtn=confirmed?'':'<button class="btn secondary small" onclick="startOwnEdit('+g.groupIds[0]+')">수정</button>';let status=confirmed?'<span class="status-confirmed">● 일정 확정</span>':rejected?'<span class="status-pending">● 업체 일정 불가</span>':'<span class="status-pending">● 미확정</span>';if(changed)status+=' <span class="change-badge">확정 일정 변경</span>';let names=g.equipmentIds.map(id=>equipmentLabel(eq[id]));return '<div class="admin-box own-request '+(confirmed?'confirmed-card':'')+'" style="margin-top:12px" id="own-card-'+g.groupIds[0]+'"><div class="actions" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0 0 5px">'+esc(ven[g.vendorId]?.name||'판매업체 미지정')+' · '+names.length+'개 장비 '+status+'</h3><div class="muted">신청일 '+esc((g.createdAt||'').slice(0,10))+'</div></div><div class="actions">'+editBtn+'<button class="btn danger small" onclick="deleteOwnRequest('+g.groupIds[0]+')">신청내역 삭제</button></div></div><div style="margin-top:14px"><span class="muted">신청 장비</span><div class="own-value">'+names.map(esc).join(' · ')+'</div></div><div class="grid" style="margin-top:12px"><div><span class="muted">희망일 1</span><div class="own-value">'+esc(g.date1||'-')+'</div></div><div><span class="muted">희망일 2</span><div class="own-value">'+esc(g.date2||'-')+'</div></div></div><div style="margin-top:12px"><span class="muted">추가 요청사항</span><div class="own-value memo-view">'+esc(g.memo||'없음')+'</div></div><div class="notice" style="margin-top:12px">업체 확정일: <b>'+esc(g.confirmedDate||'미확정')+'</b>'+(rejected?'<div style="margin-top:8px"><span class="muted">업체 일정 불가 사유</span><div class="own-value" style="margin-top:4px">'+esc(g.rejectionReason||'사유 미입력')+'</div></div>':'')+'</div><div id="own-edit-'+g.groupIds[0]+'" class="hidden" style="margin-top:14px"><div class="grid"><div class="field"><label>희망일 1</label><input id="own-date1-'+g.groupIds[0]+'" type="date" value="'+esc(g.date1||'')+'" min="'+todayISO()+'" onclick="this.showPicker&&this.showPicker()"></div><div class="field"><label>희망일 2</label><input id="own-date2-'+g.groupIds[0]+'" type="date" value="'+esc(g.date2||'')+'" min="'+todayISO()+'" onclick="this.showPicker&&this.showPicker()"></div></div><div class="field"><label>추가 요청사항</label><textarea id="own-memo-'+g.groupIds[0]+'" placeholder="예: 오전 10시부터 설명을 요청합니다">'+esc(g.memo||'')+'</textarea></div><div class="actions"><button class="btn primary" onclick="saveOwnRequest('+g.groupIds[0]+')">수정사항 저장</button><button class="btn secondary" onclick="cancelOwnEdit('+g.groupIds[0]+')">취소</button></div></div>'+historyHtml(g.history)+'</div>';}).join('');
 box.innerHTML='<div class="notice"><b>'+esc(o)+'</b> / <b>'+esc(n)+'</b> 신청 '+arr.length+'건</div>'+cards;
}
function startOwnEdit(id){let g=getRequestGroupById(id);if(g?.confirmedDate){alert('일정이 확정된 신청은 수정할 수 없습니다.');return}document.getElementById('own-edit-'+id)?.classList.remove('hidden');document.querySelectorAll('#own-card-'+id+' .actions > .secondary').forEach((b,i)=>{if(i===0)b.classList.add('hidden')});}
function cancelOwnEdit(id){document.getElementById('own-edit-'+id)?.classList.add('hidden');document.querySelectorAll('#own-card-'+id+' .actions > .secondary').forEach((b,i)=>{if(i===0)b.classList.remove('hidden')});}
function saveOwnRequest(id){let g=getRequestGroupById(id);if(!g)return;if(g.confirmedDate){alert('일정이 확정된 신청은 수정할 수 없습니다.');return}let d1=document.getElementById('own-date1-'+id)?.value||'',d2=document.getElementById('own-date2-'+id)?.value||'',memo=document.getElementById('own-memo-'+id)?.value.trim()||'';if(!d1||!d2){alert('희망일 1과 희망일 2를 모두 입력해주세요.');return}if(d1<todayISO()||d2<todayISO()){alert('희망일은 오늘 이후 날짜만 선택할 수 있습니다.');return}if(d1===d2){alert('희망일 1과 희망일 2는 서로 다른 날짜를 선택해주세요.');return}const now=new Date().toISOString();applyToGroup(g,r=>{r.date1=d1;r.date2=d2;r.memo=memo;r.updatedAt=now;if(!Array.isArray(r.history))r.history=[];r.history.push({at:now,status:'신청내용 수정',detail:'희망일 또는 추가 요청사항이 수정되었습니다.',actor:'사업소'})});alert('신청 내용이 수정되었습니다.');findRequests();}
function deleteOwnRequest(id){if(!confirm('이 업체의 신청 장비를 모두 포함하여 신청내역을 삭제할까요? 삭제하면 복구할 수 없습니다.'))return;let g=getRequestGroupById(id);if(!g)return;let d=data();d.requests=d.requests.filter(r=>!g.groupIds.includes(r.id));save(d);alert('신청내역이 삭제되었습니다.');findRequests();}

function openAdminLogin(){document.getElementById('adminPw').value='';document.getElementById('pwError').textContent='';document.getElementById('adminModal').classList.add('show');setTimeout(()=>document.getElementById('adminPw').focus(),50);}
function closeAdminLogin(){document.getElementById('adminModal').classList.remove('show');}
function loginAdmin(){if(document.getElementById('adminPw').value!==ADMIN_PASSWORD){document.getElementById('pwError').textContent='비밀번호가 올바르지 않습니다.';return}closeAdminLogin();showPage('admin');document.getElementById('adminPanel').classList.remove('hidden');renderAdmin();renderVendorSelect();}
let editingEq=null,editingVendor=null;
function saveEquipment(){
 let d=data(),name=eqName.value.trim(),model=eqModel.value.trim(),company=eqCompany.value.trim(),group=eqGroup.value.trim(),intro=eqIntro.value.trim(),vendorId=Number(eqVendor.value);
 if(!name||!model||!company||!group||!intro||!vendorId){alert('장비 정보와 그룹, 판매업체를 모두 입력해주세요.');return}
 if(editingEq){let e=d.equipment.find(x=>x.id===editingEq);Object.assign(e,{name,model,company,group,intro,vendorId,category:group});editingEq=null;eqSaveBtn.textContent='장비 등록';eqCancelBtn.classList.add('hidden')}
 else d.equipment.push({id:Date.now(),name,model,company,group,intro,vendorId,category:group,active:true});
 save(d);clearEq();renderAdmin();renderEquipment();
}

function editEquipment(id){let e=data().equipment.find(x=>x.id===id);if(!e)return;editingEq=id;eqName.value=e.name;eqModel.value=e.model;eqCompany.value=e.company;eqGroup.value=e.group||e.category||'';eqIntro.value=e.intro;renderVendorSelect();eqVendor.value=e.vendorId||'';eqSaveBtn.textContent='장비 수정 저장';eqCancelBtn.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});}

function cancelEquipmentEdit(){editingEq=null;clearEq();eqSaveBtn.textContent='장비 등록';eqCancelBtn.classList.add('hidden');}
function clearEq(){eqName.value=eqModel.value=eqCompany.value=eqGroup.value=eqIntro.value='';eqVendor.value='';}

function deleteEquipment(id){let d=data(),e=d.equipment.find(x=>x.id===id);if(!e)return;const next=e.active===false;const msg=next?'사용중지된 장비를 다시 사용 상태로 변경할까요?':'이 장비를 사용중지할까요?\n기존 신청내역은 유지되고 신규 신청에서만 숨겨집니다.';if(!confirm(msg))return;e.active=next;save(d);renderAdmin();renderEquipment();}
function saveVendor(){let d=data(),name=vendorName.value.trim(),code=vendorCode.value.trim(),contact=vendorContact.value.trim(),email=vendorEmail.value.trim(),phone=vendorPhone.value.trim();if(!name||!code||!contact||!email||!phone){alert('판매업체명, 접근코드, 담당자, 이메일, 연락처를 모두 입력해주세요.');return}if(d.vendors.some(v=>v.code===code&&v.id!==editingVendor)){alert('이미 사용 중인 접근코드입니다.');return}if(editingVendor){let v=d.vendors.find(x=>x.id===editingVendor);Object.assign(v,{name,code,contact,email,phone});editingVendor=null;vendorSaveBtn.textContent='업체 등록';vendorCancelBtn.classList.add('hidden')}else d.vendors.push({id:Date.now(),name,code,email,phone,contact});save(d);clearVendor();renderAdmin();renderVendorSelect();}
function editVendor(id){let v=data().vendors.find(x=>x.id===id);if(!v)return;editingVendor=id;vendorName.value=v.name;vendorCode.value=v.code;vendorContact.value=v.contact||'';vendorEmail.value=v.email||'';vendorPhone.value=v.phone||'';vendorSaveBtn.textContent='업체 수정 저장';vendorCancelBtn.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});}
function cancelVendorEdit(){editingVendor=null;clearVendor();vendorSaveBtn.textContent='업체 등록';vendorCancelBtn.classList.add('hidden');}
function clearVendor(){vendorName.value=vendorCode.value=vendorContact.value=vendorEmail.value=vendorPhone.value='';}
function deleteVendor(id){let d=data();if(d.requests.some(r=>r.vendorId===id)||d.equipment.some(e=>e.vendorId===id)){alert('신청내역 또는 등록 장비가 연결된 업체는 삭제할 수 없습니다. 먼저 연결된 장비/신청을 정리하거나 업체 정보를 수정해 주세요.');return}if(!confirm('이 업체를 삭제할까요?'))return;d.vendors=d.vendors.filter(v=>v.id!==id);save(d);renderAdmin();renderVendorSelect();}
function deleteRequest(id){if(!confirm('이 업체 신청에 포함된 장비를 모두 포함하여 삭제할까요? 삭제하면 복구할 수 없습니다.'))return;let g=getRequestGroupById(id);if(!g)return;let d=data();d.requests=d.requests.filter(r=>!g.groupIds.includes(r.id));save(d);renderAdmin();}
function xmlEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function xmlCell(v){return '<Cell><Data ss:Type="String">'+xmlEsc(v)+'</Data></Cell>';}
function xmlSheet(name,headers,rows){let out='<Worksheet ss:Name="'+xmlEsc(name)+'"><Table><Row>'+headers.map(xmlCell).join('')+'</Row>';rows.forEach(row=>{out+='<Row>'+row.map(xmlCell).join('')+'</Row>'});return out+'</Table></Worksheet>';}
function downloadAdminExcel(){
 const d=data(),eq=Object.fromEntries(d.equipment.map(e=>[e.id,e])),ven=Object.fromEntries(d.vendors.map(v=>[v.id,v])),groups=groupRequests(d.requests);
 const reqRows=groups.slice().reverse().map(g=>{const status=g.confirmedDate?'일정 확정':(g.status||'업체 회신 대기');const names=g.equipmentIds.map(id=>eq[id]?.name||'-').join(' · ');const history=(g.history||[]).map(h=>{const t=new Date(h.at).toLocaleString('ko-KR');return t+' | '+(h.status||'')+' | '+(h.detail||'')+' | '+(h.actor||'')}).join('\n');return [g.office,g.applicant,g.extension||'',g.email||'',names,ven[g.vendorId]?.name||'',g.date1||'',g.date2||'',status,g.confirmedDate||'',g.rejectionReason||'',g.memo||'',history];});
 const eqRows=d.equipment.map(e=>[ven[e.vendorId]?.name||'',e.name||'',e.model||'',e.company||'',e.group||e.category||'',e.intro||'',e.active===false?'사용중지':'사용중']);
 const vendorRows=d.vendors.map(v=>[v.name||'',v.code||'',v.contact||'',v.email||'',v.phone||'']);
 const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
   xmlSheet('전체 신청현황',['사업소','신청자','내선번호','이메일','장비','판매업체','희망일1','희망일2','상태','확정일','일정 불가 사유','추가 요청사항','상태 변경 이력'],reqRows)+
   xmlSheet('장비목록',['판매업체','계측기명','모델','제작사','그룹','간략소개','상태'],eqRows)+
   xmlSheet('판매업체',['판매업체','접근코드','담당자','이메일','연락처'],vendorRows)+
   '</Workbook>';
 const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='KESCO_관리자_전체데이터.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderAdmin(){
 let d=data(),eq=Object.fromEntries(d.equipment.map(e=>[e.id,e])),ven=Object.fromEntries(d.vendors.map(v=>[v.id,v]));
 document.getElementById('adminEquipment').innerHTML=d.equipment.length?d.equipment.map(e=>`<tr><td>${esc(ven[e.vendorId]?.name||'미연결')}</td><td>${esc(e.name)}</td><td>${esc(e.model)}</td><td>${esc(e.company)}</td><td>${esc(e.group||e.category||'기타')}</td><td>${esc(e.intro)}</td><td><span class="${e.active===false?'equipment-inactive':'equipment-active'}">${e.active===false?'사용중지':'사용중'}</span></td><td><div class="actions"><button class="btn secondary small" onclick="editEquipment(${e.id})">수정</button><button class="btn ${e.active===false?'primary':'danger'} small" onclick="deleteEquipment(${e.id})">${e.active===false?'사용 재개':'사용중지'}</button></div></td></tr>`).join(''):'<tr><td colspan="8" class="empty">등록된 장비가 없습니다.</td></tr>';
 document.getElementById('adminVendors').innerHTML=d.vendors.length?d.vendors.map(v=>`<tr><td>${esc(v.name)}</td><td><b>${esc(v.code)}</b></td><td>${esc(v.contact||'-')}</td><td>${esc(v.email)}</td><td>${esc(v.phone)}</td><td><div class="actions"><button class="btn secondary small" onclick="editVendor(${v.id})">수정</button><button class="btn danger small" onclick="deleteVendor(${v.id})">삭제</button></div></td></tr>`).join(''):'<tr><td colspan="6" class="empty">등록된 업체가 없습니다.</td></tr>';
 const groups=groupRequests(d.requests);
 document.getElementById('adminRequests').innerHTML=groups.length?groups.slice().reverse().map(g=>{const names=g.equipmentIds.map(id=>eq[id]?.name||'-');const status=g.confirmedDate?'일정 확정':(g.status||'업체 회신 대기');const cls=status==='일정 확정'?'confirmed':status==='일정 불가'?'rejected':status==='일정 협의 필요'?'agreement':'waiting';const changed=(g.history||[]).some(h=>h.status==='확정 일정 변경');return `<tr><td>${esc(g.office)}</td><td>${esc(g.applicant)}</td><td>${esc(g.extension||'-')}</td><td>${esc(g.email||'-')}</td><td>${esc(names.join(' · '))}</td><td>${esc(ven[g.vendorId]?.name||'-')}</td><td>${esc(g.date1)}</td><td>${esc(g.date2)}</td><td><span class="admin-status ${cls}">${esc(status)}</span>${changed?'<span class="change-badge">확정 일정 변경</span>':''}</td><td>${esc(g.confirmedDate||'-')}</td><td class="request-delete"><button class="btn danger small" onclick="deleteRequest(${g.groupIds[0]})">삭제</button></td></tr>`}).join(''):'<tr><td colspan="11" class="empty">신청내역이 없습니다.</td></tr>';
}

fillOffices();renderEquipment();renderVendorSelect();


window.kescoAfterInit=function(){fillOffices();renderEquipment();renderVendorSelect();};
kescoInit();
