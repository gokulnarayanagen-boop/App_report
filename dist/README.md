# GNITS_develop

A project issue workspace using HTML, CSS, plain JavaScript, and Supabase. There are no TypeScript files or framework build steps.

Live frontend: https://gokulnarayanagen-boop.github.io/App_report/

## Local preview

With Node.js installed, run `npm start` from this folder and open http://127.0.0.1:4173. Choose **Explore demo workspace** to use sample data saved only in this browser. Demo attachments are limited to 1.5 MB; demo password changes are simulated. Reset sample data in Settings.

## Features

- Administrator, developer, and tester roles; admin-created accounts, account disabling, roles, usernames, and password management.
- Multiple projects, project membership, archiving, and row-level access control. Admins see every project; other users see assigned projects.
- Issue summary, description, type, priority, **severity**, reproduction steps, expected/actual results, affected app version, device, **target release**, and **due date**.
- **Releases:** version/build, name, target date, notes, and Planned / Testing / Released status. Cards calculate open issues, blockers, resolution progress, and whether all linked issues are closed. Release status is a team decision; computed readiness does not automatically publish anything.
- **Issue templates:** built-in bug/improvement/feature forms, plus project-specific templates managed by admins and assigned developers. Applying a template replaces the description, steps, results, type, priority, and severity; it preserves the summary and attachments.
- List and board views, search, pagination, project/status/priority/type/severity/release/deadline filters, and assignment.
- **Bulk actions:** admins and assigned developers select up to 100 issues and change status, priority, severity, assignee, release, due date, or move to trash. Database updates are atomic: one invalid or unauthorized row rolls back the entire action. A release must belong to each selected issue's project.
- **Saved views:** each account privately saves filter combinations. Views persist in Supabase across devices; “Due today” evaluates the current local calendar date each time.
- **Attachments:** private PNG/JPEG/WebP/GIF images (up to 10 MB) and MP4/WebM/MOV recordings (up to 50 MB). The report form accepts up to five initial files; further files can be attached from the issue. In-browser capture records video only, requires the user's screen-sharing permission, and stops after three minutes. Unsupported browsers can upload an existing recording. Use the Open link for formats your browser cannot play.
- Comments with **@mentions**. The mention picker inserts a teammate's handle; typing a handle directly also works. Active mentioned teammates must belong to the project or be admins. Notifications stay inside the app. Up to 20 teammates can be mentioned in one comment.
- Database-generated activity history, in-app notifications, read tracking, duplicate links, dashboard counts, and CSV exports protected against formula injection.
- Recoverable issue deletion. Admins and assigned developers use **Move to trash** and restore from **Trash**. Comments and attachments are preserved. Testers cannot trash or restore issues. Permanent issue deletion is not exposed.
- Light/dark/device appearance mode, responsive layouts, keyboard navigation, accessible dialogs, and session-change recovery when switching accounts in another tab.

## Supabase setup

The browser's publishable configuration is in `dist/config.js`. Never place a secret or service-role key in frontend files or GitHub.

1. Sign in to the Supabase account that owns the project and link it:

   ```bash
   supabase login --agent no --output-format text
   supabase link --project-ref aywtgapueekmhvyomoyc --agent no
   ```

2. Apply database migrations in order using `supabase db push --linked --agent no`. Existing installations apply only migrations not recorded as applied. The migrations are:

   - `001_workspace.sql`: accounts/profiles, projects, membership, issues, comments, images, activity, notifications, and access control.
   - `002_usernames.sql`: unique usernames and server-only username login throttling.
   - `003_issue_trash.sql`: recoverable issue deletion.
   - `004_release_workflows.sql`: releases, templates, severity, deadlines, saved views, atomic bulk updates, mentions, and videos.

   You can instead paste each entire file into Supabase SQL Editor once, in order. If a file was already run manually, mark that version applied with `supabase migration repair VERSION --status applied --linked` before using `db push`. Do not mark a version applied unless its complete SQL has succeeded. Each migration is transactional.

3. Create your own login in Supabase → Authentication → Users → Add user → Create new user. Choose a private password and enable Auto Confirm User if you do not need email verification. Then promote the exact account from SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin', username = 'your_username'
   where email = 'YOUR_ADMIN_EMAIL'
   returning email, role, username;
   ```

   The user must exist first. Username is 3–32 lowercase letters, numbers, dots, underscores, or hyphens. Public user metadata never grants administrator privileges. Turn off public sign-ups if all accounts are administrator-created.

4. Deploy account and username functions:

   ```bash
   supabase functions deploy admin-users --project-ref aywtgapueekmhvyomoyc
   supabase functions deploy username-login --project-ref aywtgapueekmhvyomoyc
   ```

   Both use JavaScript entrypoints configured in `supabase/config.toml`. Gateway JWT verification is disabled because `admin-users` explicitly verifies the user's JWT with Supabase and requires an active admin profile, while `username-login` must run before authentication and verifies the password through Supabase Auth. The server credentials are provided inside the Supabase function runtime.

5. Sign in, create projects and accounts, then open project settings → Manage project access. Share initial credentials privately. Users can change their password in Settings.

Email login works independently of the username function. The same password works with an assigned username. Username sign-in returns only verified session tokens, never an email lookup. Attempts are limited to 10 per username per 15-minute window; email sign-in remains available if a username is temporarily throttled.

## Sharing and hosting

GitHub Pages publishes `main` → `/ (root)`. The root `index.html` has a relative base pointing to `dist/`, and `.nojekyll` avoids unnecessary processing. For other static hosts, deploy `dist/`. Frontend hosting is public; Supabase authentication and project rules control access to data independently.

External browser dependencies are Supabase JS 2.57.4 from esm.sh and Google Fonts, with system-font fallback. Live data needs internet access. The app refreshes on browser focus and every 60 seconds while visible. Optional Realtime subscriptions work if `issues` and `notifications` are enabled for Supabase Realtime. No emails or chat messages are sent by application features.

## Validation

```bash
npm run check
npm test
```

The database tests use a temporary PostgreSQL-compatible PGlite instance with a simulated Supabase auth/storage schema:

```bash
npm install --prefix /tmp/gnits-db-check @electric-sql/pglite@0.3.14
node tests/access-control.mjs /tmp/gnits-db-check/node_modules/@electric-sql/pglite/dist/index.js
```

Optional DOM interaction checks use Happy DOM (not a full browser):

```bash
npm install --prefix /tmp/gnits-ui-check happy-dom@20.8.4
node tests/ui-flows.mjs /tmp/gnits-ui-check/node_modules/happy-dom/lib/index.js
```

Coverage includes project isolation, privilege escalation, issue workflow restrictions, deleted-record access, release associations, saved-view privacy, mention recipients, media limits, atomic bulk rollback, session mismatches, and interface form flows. Screen capture lifecycle uses a fake stream in tests; real screen capture requires a compatible browser and user permission.
