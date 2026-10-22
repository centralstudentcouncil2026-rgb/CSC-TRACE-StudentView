# CSC T.R.A.C.E. StudentView

Serve index.html with any static web server. student.html is an alias for the same dashboard. No npm installation or build is required.

This repository includes its own copies of app.js, backend.js, styles.css, assets/, and google-apps-script/. It runs independently of the other dashboard repository. Both dashboards use the same configured Google Apps Script backend, so published reports and student feedback stay connected.

See google-apps-script/SETUP.md for backend configuration. Administrator credentials belong in Apps Script properties and are not included in this repository.

Run contract checks:

    node google-apps-script/backend.test.cjs
    node google-apps-script/frontend.test.cjs

The older full-stack csc-trace project and deployment archive are not required by this HTML version.
