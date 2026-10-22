const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function main(){
 const storage=new Map(),calls=[];let reply={ok:true,reports:[],feedbackCount:0};
 const context={window:{},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>reply}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../backend.js','utf8'),context);const api=context.window.traceBackend;
 await api.request('list');assert.equal(calls[0].options.method,'GET');
 reply={ok:true,token:'test-session-token',expiresIn:3600};await api.login('test-admin','test-password');assert.equal(api.token(),'test-session-token');
 const login=JSON.parse(calls[1].options.body);assert.equal(login.action,'login');assert.equal(login.password,'test-password');assert(!calls[1].url.includes('test-password'));assert.equal(calls[1].options.headers['Content-Type'],'text/plain;charset=utf-8');
 reply={ok:true,report:{id:'server-generated-id'}};await api.request('save',{title:'Title'},true);const save=JSON.parse(calls[2].options.body);assert.equal(save.token,'test-session-token');assert(!('password' in save));
 reply={ok:false,code:'VALIDATION',error:'Invalid date'};await assert.rejects(api.request('save',{},true),/Invalid date/);assert.equal(api.token(),'test-session-token');
 reply={ok:false,code:'UNAUTHORIZED',error:'Session expired'};await assert.rejects(api.request('listAdmin',{},true),/Session expired/);assert.equal(api.token(),'');assert.equal(storage.size,0);
 reply={ok:true,token:'second-session-token',expiresIn:3600};await api.login('test-admin','test-password');reply={ok:true};await api.logout();assert.equal(api.token(),'');
 const source=fs.readFileSync(__dirname+'/../app.js','utf8');assert(!source.includes('admin123'));assert(!source.includes('localStorage'));assert(!source.includes('function persist('));assert(source.includes('...(report?{id:report.id}:{})'));
 for(const name of ['index.html','student.html']){const html=fs.readFileSync(__dirname+'/../'+name,'utf8');assert(html.indexOf('backend.js')<html.indexOf('app.js'))}
 console.log('Passed: public reads, login, session handling, authenticated saves, server errors, logout, and HTML script order.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
