# Google Sheets backend setup

1. Create a new Google Sheet named **CSC TRACE**. Keep its sharing restricted; do not publish the sheet to the web.
2. In the sheet, choose **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with the provided `Code.gs`, then save.
4. Open **Project Settings → Script properties → Add script property**:
   - `ADMIN_USERNAME`: your chosen admin username (or `admin`).
   - `ADMIN_PASSWORD`: a unique password with at least 12 characters. Keep it private; do not send it in chat or put it in website source.
5. Return to the editor, select **setup**, and click **Run**. Authorize access using your sheet-owner account. It creates `Reports` and `Feedback` tabs and saves the spreadsheet ID. It does not erase existing records. If Google or your organization blocks authorization, use the supported account/admin approval process.
6. Choose **Deploy → New deployment → Web app**:
   - Execute as: **Me**.
   - Who has access: **Anyone** (needed for student viewing; administrator writes still require login). If your school disables this option, tell me which choices are available.
7. Click **Deploy**. Copy the web app URL ending in `/exec`.
8. Open that URL. A new empty backend should show `{"ok":true,"reports":[],"feedbackCount":0}`. Visiting `?action=health` returns a configuration check. Errors have `ok:false`; resolve them before connecting the website.
9. Send me the **web app `/exec` URL** and **Google Sheet link**. The sheet can remain private: I only need its URL/ID for configuration. Do not send the password. I will connect your existing HTML and replace its demo login/storage.

The HTML dashboard is already connected through backend.js to the configured Apps Script deployment. Existing local records are not automatically uploaded. The Google Forms **Evaluate** link is stored per report; evaluation responses remain in the linked form unless separately integrated.

When you edit Apps Script later, use **Deploy → Manage deployments → Edit → New version → Deploy** to keep the same `/exec` URL. Admin password changes take effect for new logins immediately; run `revokeAdminSessions` after changing it to invalidate existing sessions.

## Interface for the website integration

Public `GET /exec`: published reports only, plus feedback count. No drafts or feedback text are returned.

POST to `/exec` with a JSON string sent as `Content-Type: text/plain;charset=utf-8` to avoid a JSON preflight when called from separate HTML hosting. Apps Script redirects ContentService output: follow the redirects. Browser integration must verify readable responses on the actual hosting origin; never use `mode: no-cors` to pretend a write succeeded.

- `login`: `{action, username, password}` → `{ok, token, expiresIn, username}`. Sessions last up to one hour and may expire earlier if Google evicts cache entries.
- `listAdmin`: `{action, token}` → all reports and private feedback.
- `save`: `{action, token, id?, council, title, body, date, status, published, link, evaluationLink}` → saved report. Omit `id` for a new report; pass the existing ID to edit. Status: Completed / In progress / Planned. Date: YYYY-MM-DD. Published: boolean.
- `delete`: `{action, token, id}`.
- `logout`: `{action, token}`.
- `feedback`: `{action, council, body, rating}`. Rating is an integer 1–5.

Every response includes `ok`. Errors include `code` and `error`; ContentService responses do not use custom HTTP error status codes. Send admin tokens only in POST bodies, never URL parameters. Store the token in session memory or sessionStorage, not source code. Never pass `ADMIN_PASSWORD` to public GET endpoints.

The script serializes writes with LockService, validates inputs, protects against formula injection, limits login attempts, limits feedback volume, and rejects short-term identical feedback. These limits use best-effort Google cache entries; they are not an abuse-resistant identity system. Consider CAPTCHA and Google-account admin authentication before a large public rollout. Keep Google Apps Script quotas in mind, and avoid frequent full-list polling. Only trusted administrators should be editors of the Sheet or script, since editors can change data or read Script properties.

Do not rename generated column headers, insert blank rows inside records, or reorder data columns. Sorting complete rows is supported.
