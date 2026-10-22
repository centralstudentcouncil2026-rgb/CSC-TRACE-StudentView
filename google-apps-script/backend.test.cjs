// Local contract tests with mocked Google services; no Google account is accessed.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const properties = new Map([['ADMIN_PASSWORD','local-test-password-only']]);
const cache = new Map();
const sheets = new Map();
function makeSheet(name) {
  const rows = [];
  return { getName:()=>name, getLastRow:()=>rows.length, setFrozenRows:()=>{},
    deleteRow:n=>rows.splice(n-1,1),
    getRange(row,col,height,width) {
      return { getValues:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>rows[row+y-1]?.[col+x-1]??'')),
        setValues(values){values.forEach((values,y)=>{rows[row+y-1] ||= [];values.forEach((v,x)=>{rows[row+y-1][col+x-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v})});return this},
        setNumberFormat(){return this},setFontWeight(){return this} };
    }
  };
}
const spreadsheet={getId:()=> 'local-test-sheet',getSheetByName:n=>sheets.get(n),insertSheet:n=>{const sheet=makeSheet(n);sheets.set(n,sheet);return sheet}};
const context={console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,String(v))})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet,openById:()=>spreadsheet,flush(){}},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(alg,v)=>[...crypto.createHash(alg).update(v).digest()]},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})}
};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),context);
const post=value=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(value)}}).text);
const get=()=>JSON.parse(context.doGet({parameter:{}}).text);
context.setup();
assert(sheets.has('Reports')&&sheets.has('Feedback'));
assert.deepEqual(get(),{ok:true,reports:[],feedbackCount:0});
assert.equal(post({action:'listAdmin'}).code,'UNAUTHORIZED');
assert.equal(post({action:'login',username:'admin',password:'wrong'}).ok,false);
const login=post({action:'login',username:'admin',password:'local-test-password-only'});
assert.equal(login.ok,true);const token=login.token;
const draft={action:'save',token,council:'President',title:'Report title',body:'Report details',date:'2026-10-22',status:'Completed',published:false,link:'https://example.org/document',evaluationLink:'https://forms.gle/example'};
assert.equal(post({...draft,token:'invalid'}).code,'UNAUTHORIZED');
assert.equal(post({...draft,evaluationLink:'https://forms.gle.evil.test/example'}).code,'VALIDATION');
assert.equal(post({...draft,date:'2026-02-30'}).code,'VALIDATION');
const saved=post(draft);assert.equal(saved.ok,true);const id=saved.report.id;
assert.equal(get().reports.length,0);
let admin=post({action:'listAdmin',token});assert.equal(admin.reports.length,1);
assert.equal(admin.reports[0].evaluationLink,draft.evaluationLink);
assert.equal(post({...draft,id,published:true}).ok,true);
assert.equal(get().reports.length,1);assert.equal(get().reports[0].evaluationLink,draft.evaluationLink);
const feedback={action:'feedback',council:'President',body:'Helpful activity for students',rating:5};
assert.equal(post({...feedback,rating:9}).code,'VALIDATION');
assert.equal(post(feedback).ok,true);assert.equal(post(feedback).code,'DUPLICATE');
assert.equal(get().feedbackCount,1);assert.equal(get().feedback,undefined);
admin=post({action:'listAdmin',token});assert.equal(admin.feedback[0].body,feedback.body);
assert.equal(post({...draft,id,title:'=HYPERLINK("bad")'}).ok,true);
assert.equal(post({action:'save',...draft,id:'missing'}).code,'NOT_FOUND');
assert.equal(post({action:'delete',id,token}).ok,true);
assert.equal(get().reports.length,0);
context.setup();assert.equal(post({action:'listAdmin',token}).feedback.length,1);
context.revokeAdminSessions();assert.equal(post({action:'listAdmin',token}).code,'UNAUTHORIZED');
const again=post({action:'login',username:'admin',password:'local-test-password-only'});
assert.equal(post({action:'logout',token:again.token}).ok,true);
assert.equal(post({action:'listAdmin',token:again.token}).code,'UNAUTHORIZED');
console.log('Passed: setup, login, authorization, drafts, publishing, links, dates, feedback privacy, duplicate rejection, edit, delete, session revocation, logout.');
