/** CSC T.R.A.C.E. — paste into a spreadsheet-bound Apps Script project.
 * Configure ADMIN_PASSWORD in Project Settings > Script properties, then run setup.
 * Deploy as a web app: Execute as Me; Who has access: Anyone.
 * Keep the spreadsheet private. Admin operations require a server-issued session.
 */
const COUNCILS = ['President', 'Vice President', 'Finance', 'Secretary',
  'Academics & Research Council', 'External Affairs Council',
  'Information Dissemination & Technical Team', 'Physical Development Council',
  'Social Development Council', 'Spiritual Development Council',
  'Student Welfare & Basic Services'];
const REPORT_HEADERS = ['id','council','title','body','date','status','published',
  'link','evaluationLink','createdAt','updatedAt'];
const FEEDBACK_HEADERS = ['id','council','body','rating','date'];
const SESSION_SECONDS = 3600;

// Run only from the Apps Script editor, once before deploying.
function setup() {
  const properties = PropertiesService.getScriptProperties();
  const password = properties.getProperty('ADMIN_PASSWORD') || '';
  if (password.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters in Script properties first.');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open your Google Sheet, then Extensions > Apps Script.');
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  if (!properties.getProperty('ADMIN_USERNAME')) properties.setProperty('ADMIN_USERNAME', 'admin');
  if (!properties.getProperty('AUTH_VERSION')) properties.setProperty('AUTH_VERSION', Utilities.getUuid());
  createSheet_(spreadsheet, 'Reports', REPORT_HEADERS);
  createSheet_(spreadsheet, 'Feedback', FEEDBACK_HEADERS);
  console.log('Setup complete. Reports and Feedback sheets are ready. Deploy this project as a web app.');
}

// Run from the editor after changing ADMIN_PASSWORD to invalidate existing logins.
function revokeAdminSessions() {
  PropertiesService.getScriptProperties().setProperty('AUTH_VERSION', Utilities.getUuid());
  console.log('Existing admin sessions have been revoked.');
}

function doGet(e) {
  return respond_(function () {
    const action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'health') return { service: 'CSC T.R.A.C.E.', configured: !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') };
    if (action !== 'list') fail_('INVALID_ACTION', 'Use POST for login and administrator actions.');
    const reports = readRows_('Reports', REPORT_HEADERS).filter(function (r) { return r.published; });
    reports.sort(function (a,b) { return b.date.localeCompare(a.date); });
    return { reports: reports, feedbackCount: Math.max(0, sheet_('Feedback', FEEDBACK_HEADERS).getLastRow() - 1) };
  });
}

function doPost(e) {
  return respond_(function () {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 40000) fail_('INVALID_REQUEST', 'Missing request or request too large.');
    let input;
    try { input = JSON.parse(raw); } catch (_) { fail_('INVALID_REQUEST', 'Send a JSON request body.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail_('INVALID_REQUEST', 'Invalid request body.');
    if (input.action === 'login') return login_(input);
    if (input.action === 'feedback') return saveFeedback_(input);
    authorize_(input.token);
    switch (input.action) {
      case 'listAdmin':
        return { reports: readRows_('Reports', REPORT_HEADERS).sort(function (a,b) { return b.date.localeCompare(a.date); }),
          feedback: readRows_('Feedback', FEEDBACK_HEADERS) };
      case 'save': return saveReport_(input);
      case 'delete': return deleteReport_(input);
      case 'logout':
        CacheService.getScriptCache().remove('session:' + hash_(input.token));
        return { message: 'Logged out.' };
      default: fail_('INVALID_ACTION', 'Unknown administrator action.');
    }
  });
}

function login_(input) {
  return locked_(function () {
    const properties = PropertiesService.getScriptProperties();
    const username = properties.getProperty('ADMIN_USERNAME') || 'admin';
    const password = properties.getProperty('ADMIN_PASSWORD');
    if (!password || password.length < 12) fail_('NOT_CONFIGURED', 'Administrator login is not configured.');
    const cache = CacheService.getScriptCache();
    // A global limit is deliberate: requests have no trustworthy client IP here.
    const attemptKey = 'login-attempts:' + Math.floor(Date.now() / 300000);
    const attempts = Number(cache.get(attemptKey) || 0);
    if (attempts >= 10) fail_('RATE_LIMIT', 'Too many login attempts. Try again in five minutes.');
    cache.put(attemptKey, String(attempts + 1), 600);
    if (typeof input.username !== 'string' || typeof input.password !== 'string' ||
        !equal_(hash_(input.username), hash_(username)) || !equal_(hash_(input.password), hash_(password))) {
      fail_('UNAUTHORIZED', 'Incorrect username or password.');
    }
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('session:' + hash_(token), JSON.stringify({
      version: properties.getProperty('AUTH_VERSION'), expires: Date.now() + SESSION_SECONDS * 1000
    }), SESSION_SECONDS);
    return { token: token, expiresIn: SESSION_SECONDS, username: username };
  });
}

function authorize_(token) {
  if (typeof token !== 'string' || token.length > 200) fail_('UNAUTHORIZED', 'Please log in.');
  const saved = CacheService.getScriptCache().get('session:' + hash_(token));
  if (!saved) fail_('UNAUTHORIZED', 'Your session expired. Please log in again.');
  const session = JSON.parse(saved);
  if (session.expires <= Date.now() || session.version !== PropertiesService.getScriptProperties().getProperty('AUTH_VERSION')) {
    fail_('UNAUTHORIZED', 'Your session expired. Please log in again.');
  }
}

function saveReport_(input) {
  const council = council_(input.council);
  const title = text_(input.title, 'Title', 160);
  const body = text_(input.body, 'Details', 20000);
  const date = text_(input.date, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
    fail_('VALIDATION', 'Enter a valid date in YYYY-MM-DD format.');
  }
  if (['Completed','In progress','Planned'].indexOf(input.status) === -1) fail_('VALIDATION', 'Select a valid project status.');
  if (typeof input.published !== 'boolean' && input.published !== 0 && input.published !== 1) fail_('VALIDATION', 'Published must be true or false.');
  const link = optionalLink_(input.link, false);
  const evaluationLink = optionalLink_(input.evaluationLink, true);
  const suppliedId = input.id ? text_(input.id, 'Report ID', 100) : '';
  return locked_(function () {
    const sheet = sheet_('Reports', REPORT_HEADERS);
    const existing = readRows_('Reports', REPORT_HEADERS);
    const index = existing.findIndex(function (r) { return r.id === suppliedId; });
    if (suppliedId && index < 0) fail_('NOT_FOUND', 'Report not found. Refresh and try again.');
    const now = new Date().toISOString();
    const report = { id: suppliedId || Utilities.getUuid(), council: council, title: title, body: body,
      date: date, status: input.status, published: input.published === true || input.published === 1,
      link: link, evaluationLink: evaluationLink, createdAt: index < 0 ? now : existing[index].createdAt, updatedAt: now };
    writeRow_(sheet, index < 0 ? sheet.getLastRow() + 1 : index + 2, REPORT_HEADERS.map(function (h) { return report[h]; }));
    SpreadsheetApp.flush();
    return { report: report };
  });
}

function deleteReport_(input) {
  const id = text_(input.id, 'Report ID', 100);
  return locked_(function () {
    const sheet = sheet_('Reports', REPORT_HEADERS);
    const index = readRows_('Reports', REPORT_HEADERS).findIndex(function (r) { return r.id === id; });
    if (index < 0) fail_('NOT_FOUND', 'Report not found.');
    sheet.deleteRow(index + 2);
    SpreadsheetApp.flush();
    return { message: 'Report deleted.' };
  });
}

function saveFeedback_(input) {
  const council = council_(input.council);
  const body = text_(input.body, 'Feedback', 3000);
  if (body.length < 5) fail_('VALIDATION', 'Enter at least five characters of feedback.');
  if (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    fail_('VALIDATION', 'Choose a rating from one to five.');
  }
  return locked_(function () {
    // Bound anonymous writes. For a widely advertised site, add CAPTCHA verification.
    const cache = CacheService.getScriptCache();
    const minuteKey = 'feedback-count:' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(minuteKey) || 0);
    if (count >= 30) fail_('RATE_LIMIT', 'Feedback is busy. Try again in a minute.');
    const dedupKey = 'feedback:' + hash_(JSON.stringify([council,body,input.rating]));
    if (cache.get(dedupKey)) fail_('DUPLICATE', 'This feedback was already submitted recently.');
    const entry = { id: Utilities.getUuid(), council: council, body: body, rating: input.rating, date: new Date().toISOString() };
    const sheet = sheet_('Feedback', FEEDBACK_HEADERS);
    writeRow_(sheet, sheet.getLastRow() + 1, FEEDBACK_HEADERS.map(function (h) { return entry[h]; }));
    SpreadsheetApp.flush();
    cache.put(minuteKey, String(count + 1), 120);
    cache.put(dedupKey, '1', 300);
    return { message: 'Feedback submitted.' };
  });
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_('NOT_CONFIGURED', 'Run setup in the Apps Script editor first.');
  return SpreadsheetApp.openById(id);
}
function createSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  checkHeaders_(sheet, headers);
}
function sheet_(name, headers) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) fail_('NOT_CONFIGURED', 'Missing ' + name + ' sheet. Run setup first.');
  checkHeaders_(sheet, headers);
  return sheet;
}
function checkHeaders_(sheet, headers) {
  const actual = sheet.getRange(1,1,1,headers.length).getValues()[0];
  if (actual.join('|') !== headers.join('|')) fail_('SCHEMA', 'Unexpected columns in ' + sheet.getName() + '. Keep the generated headers unchanged.');
}
function readRows_(name, headers) {
  const sheet = sheet_(name, headers);
  const count = sheet.getLastRow() - 1;
  if (count <= 0) return [];
  // Empty rows are rejected rather than silently corrupting row-number mapping.
  return sheet.getRange(2,1,count,headers.length).getValues().map(function (values) {
    const row = {};
    headers.forEach(function (h,i) {
      if (h === 'published') row[h] = values[i] === true || values[i] === 1 || /^(true|1)$/i.test(String(values[i]));
      else if (h === 'rating') row[h] = Number(values[i]);
      else row[h] = values[i] instanceof Date ? Utilities.formatDate(values[i], 'UTC', h === 'date' && name === 'Reports' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss'Z'") : String(values[i]);
    });
    if (!row.id) fail_('SCHEMA', 'Blank record in ' + name + '. Remove empty rows inside the data.');
    return row;
  });
}
function writeRow_(sheet, row, values) {
  // Treat user text as text, never as spreadsheet formulas.
  sheet.getRange(row,1,1,values.length).setNumberFormat('@').setValues([values.map(function (v) {
    return typeof v === 'string' && /^[\s]*[=+\-@]/.test(v) ? "'" + v : v;
  })]);
}
function council_(value) {
  if (COUNCILS.indexOf(value) === -1) fail_('VALIDATION', 'Select a valid council or office.');
  return value;
}
function text_(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail_('VALIDATION', label + ' is required and must be at most ' + max + ' characters.');
  return value.trim();
}
function optionalLink_(value, googleForm) {
  if (value === undefined || value === null || value === '') return '';
  const link = text_(value, 'Link', 2000);
  if (!/^https?:\/\/[^\s]+$/i.test(link)) fail_('VALIDATION', 'Use a valid http or https link.');
  // Apps Script does not provide the browser URL constructor.
  if (googleForm && !/^https:\/\/(?:forms\.gle\/[^\s]+|docs\.google\.com\/forms\/[^\s]+|forms\.google\.com(?:\/[^\s]*)?)$/i.test(link)) {
    fail_('VALIDATION', 'Use an HTTPS Google Forms link.');
  }
  return link;
}
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function equal_(a,b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY', 'The server is busy. Try again shortly.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function fail_(code,message) { const error = new Error(message); error.code = code; throw error; }
function respond_(fn) {
  let result;
  try { result = Object.assign({ok:true}, fn()); }
  catch (error) { result = {ok:false, code:error.code || 'SERVER_ERROR', error:error.code ? error.message : 'Could not complete the request. Check the Apps Script execution log.'}; if (!error.code) console.error(error); }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
