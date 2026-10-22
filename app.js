'use strict';
// HTML dashboard connected to Google Sheets through Apps Script.
const councils = ['President','Vice President','Finance','Secretary','Academics & Research Council','External Affairs Council','Information Dissemination & Technical Team','Physical Development Council','Social Development Council','Spiritual Development Council','Student Welfare & Basic Services'];
const api=window.traceBackend;
const app=document.querySelector('#app');
const admin=document.body.dataset.view==='admin';
let selected='',search='',tab='councils',signedIn=admin&&!!api.token(),data={reports:[],feedback:[],feedbackCount:0};
let loading=true,loadError='',loadSequence=0,lastLoad=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(value='')=>councils.map(c=>`<option ${c===value?'selected':''}>${esc(c)}</option>`).join('');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const id=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
async function load(){
 const sequence=++loadSequence,wasAdmin=admin&&signedIn;loading=true;loadError='';
 try{const result=await api.request(wasAdmin?'listAdmin':'list',{},wasAdmin);
  if(sequence!==loadSequence||wasAdmin!==(admin&&signedIn))return;
  if(!Array.isArray(result.reports))throw new Error('The backend returned invalid report data.');
  data={reports:result.reports,feedback:Array.isArray(result.feedback)?result.feedback:[],feedbackCount:wasAdmin?(result.feedback||[]).length:Number(result.feedbackCount)||0};lastLoad=Date.now();
 }catch(error){if(sequence!==loadSequence)return;loadError=error.message;if(error.code==='UNAUTHORIZED'){expireLogin();notify(error.message)}}
 finally{if(sequence===loadSequence){loading=false;if(!document.querySelector('.modal-backdrop')&&!document.activeElement?.closest('#feedback-form'))render()}}
}
function expireLogin(){signedIn=false;data={reports:[],feedback:[],feedbackCount:0};api.clearSession();closeModal()}
function formBusy(form,busy){form.dataset.busy=busy?'true':'false';const button=form.querySelector('button[type="submit"],button.primary');if(button)button.disabled=busy}
async function submitLogin(e){
 e.preventDefault();const form=e.target;if(form.dataset.busy==='true')return;const f=new FormData(form);formBusy(form,true);form.querySelector('#login-error').textContent='';
 try{await api.login(String(f.get('username')),String(f.get('password')));signedIn=true;loading=true;data={reports:[],feedback:[],feedbackCount:0};render();await load()}
 catch(error){const message=document.querySelector('#login-error');if(message)message.textContent=error.message}finally{formBusy(form,false)}
}
async function submitReport(e,report){
 e.preventDefault();const form=e.target;if(form.dataset.busy==='true')return;const f=new FormData(form),link=String(f.get('link')).trim(),evaluationLink=String(f.get('evaluationLink')||'').trim();
 if(link&&!/^https?:\/\//i.test(link)){notify('Use an http or https document link.');return}
 if(evaluationLink&&!validEvaluationLink(evaluationLink)){notify('Enter a valid HTTPS Google Forms link.');return}
 const title=String(f.get('title')).trim(),body=String(f.get('body')).trim();if(!title||!body){notify('Enter a title and accomplishment details.');return}
 const updated={...(report?{id:report.id}:{}),council:String(f.get('council')),title,body,date:String(f.get('date')),status:String(f.get('status')),link,evaluationLink,published:f.has('published')};formBusy(form,true);
 try{const result=await api.request('save',updated,true);if(!result.report||!result.report.id)throw new Error('Save response was incomplete. Refresh before trying again.');data.reports=data.reports.filter(r=>r.id!==result.report.id);data.reports.push(result.report);closeModal();render();notify(updated.published?'Accomplishment published.':'Draft saved.')}
 catch(error){if(error.code==='UNAUTHORIZED'){expireLogin();render()}notify(error.message)}finally{formBusy(form,false)}
}
async function logout(){try{await api.logout()}catch(error){notify(error.message)}finally{expireLogin();selected='';tab='councils';render();load()}}
async function deleteReport(report){
 const button=document.querySelector('#confirm-delete');if(button.disabled)return;button.disabled=true;
 try{await api.request('delete',{id:report.id},true);data.reports=data.reports.filter(r=>r.id!==report.id);closeModal();render();notify('Report deleted.')}
 catch(error){if(error.code==='UNAUTHORIZED'){expireLogin();render()}notify(error.message)}finally{button.disabled=false}
}
function notify(message){document.querySelector('.toast')?.remove();const toast=document.createElement('div');toast.className='toast';toast.setAttribute('role','status');toast.textContent=message;document.body.append(toast);setTimeout(()=>toast.remove(),6000)}
function published(){return data.reports.filter(r=>r.published)}
function header(){if(!admin)return '';return `<header><div class="brand"><a class="seal" href="index.html" aria-label="CSC home"><img src="assets/csc-logo.png" alt="Central Student Council logo" width="44" height="66"></a><a class="wordmark" href="index.html"><strong>CSC T.R.A.C.E.</strong><small>Transparency, Reporting, Accountability, Communication, and Evaluation</small></a></div>${admin&&signedIn?'<div class="admin-actions header-actions"><button class="primary" data-action="new">New accomplishment</button><button class="icon-button" data-action="logout">Log out</button></div>':''}</header>`}
function footer(){return `<footer><strong>CSC T.R.A.C.E.</strong><span>Transparent leadership. Meaningful impact.</span><small>Central Student Council</small></footer>`}
function render(){
 stopPanorama();
 app.innerHTML=(admin&&!signedIn?'':header())+(admin&&!signedIn?login():dashboard())+footer();
 if(admin&&!signedIn)document.querySelector('#login-form').addEventListener('submit',submitLogin);
 document.querySelector('#feedback-form')?.addEventListener('submit',submitFeedback);
 document.querySelector('#search')?.addEventListener('input',e=>{search=e.target.value;document.querySelector('#report-list').innerHTML=reportList();syncFeedbackCouncil()});
 document.querySelector('#feedback-form')?.addEventListener('change',e=>{if(e.target.name==='rating'){const rating=Number(e.target.value);document.querySelectorAll('.rating-option').forEach(label=>label.classList.toggle('is-selected',Number(label.querySelector('input').value)<=rating))}});
 startPanorama();
}
function login(){return `<main class="login-wrap"><section class="login-story"><span class="eyebrow">THE CENTRAL STUDENT COUNCIL</span><h1>Good leadership.<br>Visible impact.</h1><p>A shared space to document the work,<br>celebrate progress, and keep students informed.</p><div class="large-flame"><img src="assets/csc-logo.png" alt="Central Student Council logo" width="100" height="150"></div><span>ACCOUNTABILITY STARTS WITH US.</span></section><section class="login-card"><div class="login-icon"><img src="assets/csc-logo.png" alt="Central Student Council logo" width="31" height="46"></div><span class="eyebrow">ADMINISTRATOR ACCESS</span><h2>Welcome back.</h2><p>Log in to manage council accomplishments and student feedback.</p><form id="login-form"><label>Username<input name="username" autocomplete="username" required></label><label style="margin-top:16px">Password<input name="password" type="password" autocomplete="current-password" required></label><p id="login-error" role="alert" style="color:#a33"></p><button class="primary full" type="submit">Log in to dashboard</button></form><a class="back-link" href="student.html">Return to student dashboard</a></section></main>`}
function dashboard(){const p=published();return `<main><section class="intro"><div><h1>${admin?'Council Publishing Dashboard':'Council Transparency Dashboard'}</h1></div></section>${loadError?`<div class="error" role="alert">${esc(loadError)}<button data-action="retry">Try again</button></div>`:''}<section class="stats">${[['▤',p.length,'Published reports','Open for everyone to explore','blue'],['✓',p.filter(r=>r.status==='Completed').length,'Completed projects','Ideas turned into real impact','green'],['☏',data.feedbackCount,'Feedback received','Your voice makes a difference','gold']].map(([icon,n,title,desc,color])=>`<div class="stat"><div><strong>${loading?'—':String(n).padStart(2,'0')}</strong><span>${title}</span></div></div>`).join('')}</section><div class="section-bar"><div class="tabs"><button data-action="councils" class="${tab==='councils'?'current':''}">Councils & leadership <span>${String(councils.length).padStart(2,'0')}</span></button>${admin?`<button data-action="feedback" class="${tab==='feedback'?'current':''}">Student feedback <span>${data.feedback.length}</span></button>`:''}</div></div>${tab==='feedback'&&admin?feedbackList():`${!selected?councilGrid():''}<section class="feed ${selected?'office-feed':''}"><div class="feed-heading"><div><h2>${esc(selected||'Latest accomplishments')}</h2></div><label class="search"><input id="search" aria-label="Search accomplishments" placeholder="Search accomplishments…" value="${esc(search)}"></label></div>${selected&&admin?'<button class="primary" data-action="new">Publish for this office</button>':''}<div id="report-list">${reportList()}</div></section>${!admin?feedbackForm():''}`}</main>`}
function councilGrid(){return `<section class="council-grid">${councils.map((c,i)=>`<button class="council-card ${c==='President'?'council-7':c==='Vice President'?'council-8':'office-card'}" data-action="council" data-index="${i}"><h2>${esc(c)}</h2></button>`).join('')}</section><div class="slideshow-controls"><button type="button" data-action="slideshow">${panoramaPaused?'Play slideshow':'Pause slideshow'}</button></div>`}
function validEvaluationLink(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&((url.hostname==='forms.gle'&&url.pathname.length>1)||(url.hostname==='docs.google.com'&&url.pathname.startsWith('/forms/'))||url.hostname==='forms.google.com')}catch{return false}
}
function evaluationButton(value){return validEvaluationLink(value)?`<a class="evaluate-button" href="${esc(value)}" target="_blank" rel="noopener noreferrer" aria-label="Evaluate report (opens Google Form in a new tab)">Evaluate</a>`:''}
function reportList(){if(loading&&!data.reports.length)return '<div class="empty" role="status">Loading reports…</div>';if(loadError&&!data.reports.length)return '<div class="empty">Reports could not be loaded.</div>';const reports=(admin?data.reports:published()).filter(r=>(!selected||r.council===selected)&&`${r.title} ${r.body} ${r.council}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));return reports.length?`<div class="report-grid">${reports.map(r=>`<article class="report"><div class="report-meta"><span class="tag">${esc(r.council)}</span><span class="status ${!r.published?'status-draft':r.status==='Completed'?'status-completed':r.status==='In progress'?'status-progress':'status-planned'}">${r.published?esc(r.status):'Draft'}</span></div><small>${esc(r.date)}</small><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><div class="report-actions"><button class="text-button" data-action="read" data-id="${esc(r.id)}">Read report</button>${evaluationButton(r.evaluationLink)}${admin?`<button data-action="edit" data-id="${esc(r.id)}">Edit</button><button data-action="delete" data-id="${esc(r.id)}">Delete</button>`:''}</div></article>`).join('')}</div>`:`<div class="empty"><h3>${search?'No matching accomplishments':'No accomplishments yet'}</h3><p>${search?'Try another title or keyword.':admin?'Create a report to get started.':'No published reports.'}</p>${admin?'<button class="text-button" data-action="new">Create an accomplishment</button>':''}</div>`}
function feedbackTarget(query=search,office=selected){
 const q=query.trim().replace(/\s+/g,' ').toLowerCase();
 if(q){const exact=councils.find(c=>c.toLowerCase()===q);if(exact)return exact;const matches=councils.filter(c=>c.toLowerCase().includes(q));if(matches.length===1)return matches[0]}
 return office||'';
}
function syncFeedbackCouncil(){const select=document.querySelector('#feedback-form select[name="council"]');if(select)select.value=feedbackTarget()}
function feedbackForm(){return `<section class="feedback-panel"><div class="feedback-copy"><h2>Suggestions &amp; Evaluation</h2></div><form id="feedback-form"><div class="feedback-form-top"><label>Which council or office?<select name="council" required><option value="">Select a council or office</option>${options(feedbackTarget())}</select></label><fieldset><legend>How was your experience?</legend><div class="stars">${[1,2,3,4,5].map(n=>`<label class="rating-option"><input type="radio" name="rating" value="${n}" required aria-label="${n} star${n===1?'':'s'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg></label>`).join('')}</div></fieldset></div><label>Your suggestions & feedback<textarea name="body" placeholder="Tell us what’s on your mind…" required minlength="5" maxlength="3000"></textarea></label><div class="feedback-form-bottom"><button class="primary">Submit feedback</button></div></form></section>`}
async function submitFeedback(e){
 e.preventDefault();const form=e.target;if(form.dataset.busy==='true')return;const f=new FormData(form),rating=Number(f.get('rating')),body=String(f.get('body')).trim(),council=String(f.get('council'));
 if(!councils.includes(council)||body.length<5||rating<1||rating>5){notify('Select a council, a rating, and enter your feedback.');return}formBusy(form,true);
 try{await api.request('feedback',{council,rating,body});data.feedbackCount++;form.reset();syncFeedbackCouncil();document.querySelectorAll('.rating-option').forEach(label=>label.classList.remove('is-selected'));render();notify('Thank you! Your feedback was submitted.');load()}
 catch(error){notify(error.message)}finally{formBusy(form,false)}
}
function feedbackList(){return `<section class="feed"><h2 style="margin-bottom:20px">Suggestions & evaluations</h2>${data.feedback.length?data.feedback.slice().reverse().map(f=>`<article class="feedback-item"><span class="tag">${esc(f.council)}</span><span class="stars-text">${'★'.repeat(Math.max(0,Math.min(5,Number(f.rating)||0)))}</span><p>${esc(f.body)}</p><small>${esc(f.date)}</small></article>`).join(''):'<div class="empty"><h3>No feedback yet</h3><p>Student suggestions and ratings will appear here.</p></div>'}</section>`}
let previousFocus;
function modal(content){previousFocus=document.activeElement;const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="close" data-action="close" aria-label="Close dialog">✕</button>${content}</section>`;document.body.append(overlay);document.body.style.overflow='hidden';overlay.querySelector('input,textarea,button')?.focus()}
function closeModal(){document.querySelector('.modal-backdrop')?.remove();document.body.style.overflow='';previousFocus?.focus()}
function editor(report){if(!admin||!signedIn)return;const r=report||{council:selected||councils[0],title:'',body:'',date:today(),status:'Completed',link:'',evaluationLink:'',published:true};modal(`<span class="eyebrow">COUNCIL PUBLISHING AREA</span><h2 id="dialog-title">${report?'Edit':'Share'} an accomplishment</h2><p>Published reports appear on the student dashboard.</p><form id="report-form"><label>Council or office<select name="council">${options(r.council)}</select></label><label>Report title<input name="title" required maxlength="160" value="${esc(r.title)}"></label><div class="form-row"><label>Accomplishment date<input name="date" type="date" required value="${esc(r.date)}"></label><label>Project status<select name="status">${['Completed','In progress','Planned'].map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select></label></div><label>Accomplishment details<textarea name="body" required maxlength="20000" rows="6">${esc(r.body)}</textarea></label><label>Supporting document link (optional)<input name="link" type="url" placeholder="https://…" value="${esc(r.link)}"></label><label>Evaluation form link (optional)<input name="evaluationLink" type="url" placeholder="https://forms.gle/…" value="${esc(r.evaluationLink)}"><small class="field-help">Paste the Google Form link students should use to evaluate this report.</small></label><label class="checkbox"><input name="published" type="checkbox" ${r.published?'checked':''}> Publish to student view (uncheck to save a draft)</label><button class="primary full">Save accomplishment</button></form>`);document.querySelector('#report-form').addEventListener('submit',e=>submitReport(e,report))}
app.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;if(action==='logout'){logout();return}if(action==='retry'){load();return}if(action==='council'){selected=councils[Number(b.dataset.index)];search='';render()}if(action==='all'||action==='councils'){selected='';search='';tab='councils';render()}if(action==='feedback'&&admin&&signedIn){tab='feedback';render()}if(action==='new')editor();const report=data.reports.find(r=>r.id===b.dataset.id);if(action==='edit'&&report)editor(report);if(action==='read'&&report&&(report.published||(admin&&signedIn))){modal(`<span class="eyebrow">${esc(report.council)}</span><h2 id="dialog-title">${esc(report.title)}</h2><p>${esc(report.date)} · ${esc(report.status)}</p><div class="report-body">${esc(report.body)}</div>${evaluationButton(report.evaluationLink)}${/^https?:\/\//i.test(report.link)?`<a class="primary" href="${esc(report.link)}" target="_blank" rel="noopener noreferrer">View supporting document</a>`:''}`)}if(action==='delete'&&admin&&signedIn&&report){modal('<h2 id="dialog-title">Delete this report?</h2><p>This also removes it from the student dashboard.</p><div class="admin-actions"><button data-action="close">Cancel</button><button class="primary" id="confirm-delete">Delete report</button></div>');document.querySelector('#confirm-delete').onclick=()=>deleteReport(report)}});
document.addEventListener('click',e=>{if(e.target.closest('[data-action="close"]'))closeModal()});
document.addEventListener('keydown',e=>{const dialog=document.querySelector('.modal');if(e.key==='Escape'){closeModal()}if(e.key==='Tab'&&dialog){const focusable=dialog.querySelectorAll('button,input,select,textarea,a[href]');const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

window.addEventListener('focus',()=>{if(Date.now()-lastLoad>30000&&!document.querySelector('.modal-backdrop')&&!document.activeElement?.closest('form')&&document.activeElement?.id!=='search')load()});
// Each card is a window onto the same full-grid photograph.
const panoramaSources = ['assets/campus-monument.jpg','assets/campus-gateway.jpg','assets/campus-aerial.jpg','assets/campus-flags.jpg'];
const panoramaImages = panoramaSources.map(src=>{const image=new Image();image.src=src;return image});
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
let panoramaPaused=motionPreference.matches, panoramaIndex=0, panoramaTimer=null, panoramaFade=null, panoramaObserver=null;
function stopPanorama(){clearInterval(panoramaTimer);clearTimeout(panoramaFade);panoramaObserver?.disconnect();panoramaObserver=null;}
function startPanorama(){
 const grid=document.querySelector('.council-grid');if(!grid)return;
 const measure=()=>{grid.style.setProperty('--panorama-width',`${grid.clientWidth}px`);grid.style.setProperty('--panorama-height',`${grid.clientHeight}px`);grid.querySelectorAll('.council-card').forEach(card=>{card.style.setProperty('--tile-left',`${-card.offsetLeft-card.clientLeft}px`);card.style.setProperty('--tile-top',`${-card.offsetTop-card.clientTop}px`)})};
 grid.style.setProperty('--panorama-current',`url("${panoramaSources[panoramaIndex]}")`);
 grid.style.setProperty('--panorama-next',`url("${panoramaSources[panoramaIndex]}")`);
 measure();panoramaObserver=new ResizeObserver(measure);panoramaObserver.observe(grid);
 if(panoramaPaused)return;
 panoramaTimer=setInterval(()=>{
  if(document.hidden)return;
  const next=(panoramaIndex+1)%panoramaSources.length;
  if(!panoramaImages[next].complete||!panoramaImages[next].naturalWidth)return;
  grid.style.setProperty('--panorama-next',`url("${panoramaSources[next]}")`);
  grid.classList.add('panorama-fading');
  panoramaFade=setTimeout(()=>{panoramaIndex=next;grid.style.setProperty('--panorama-current',`url("${panoramaSources[panoramaIndex]}")`);grid.classList.remove('panorama-fading')},1000);
 },6000);
}
app.addEventListener('click',e=>{const button=e.target.closest('[data-action="slideshow"]');if(!button)return;panoramaPaused=!panoramaPaused;stopPanorama();const grid=document.querySelector('.council-grid');grid?.classList.remove('panorama-fading');startPanorama();button.textContent=panoramaPaused?'Play slideshow':'Pause slideshow'});
motionPreference.addEventListener('change',e=>{panoramaPaused=e.matches;stopPanorama();document.querySelector('.council-grid')?.classList.remove('panorama-fading');startPanorama();const button=document.querySelector('[data-action="slideshow"]');if(button)button.textContent=panoramaPaused?'Play slideshow':'Pause slideshow'});
render();load();






