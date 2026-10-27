# GNITS_develop

A complete project issue workspace built with HTML, CSS, plain JavaScript, and Supabase. There are no TypeScript files and no framework build step. Modern Angular requires TypeScript, so this implementation follows the requested JavaScript-only constraint.

## Start locally

Install Node.js, open this folder in a terminal, and run:

```
npm start
```

Open http://127.0.0.1:4173. Choose **Explore demo workspace** to try the app before configuring Supabase. Sample data stays in this browser and is separate from live Supabase data. Password actions are simulated in demo mode. Reset sample data from Settings.

## Connect live Supabase

The supplied project URL and public publishable key are already in `dist/config.js`. A publishable key belongs in the frontend; server secrets never do.

1. Run `supabase/migrations/002_usernames.sql` after the initial setup below. Existing installations should run only this new migration; do not rerun `001_workspace.sql`.

   Open the Supabase project → SQL Editor → New query. Paste the contents of `supabase/migrations/001_workspace.sql` and run it **once**. It creates tables, role rules, project access rules, activity/notification triggers, and a private `issue-images` bucket. The SQL is transactional: an error rolls back the setup.
2. Go to Authentication → Users → Add user → Create new user. Create your own admin login with Auto Confirm User enabled. Promote that exact account from SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'YOUR_ADMIN_EMAIL';
   ```

   Verify that one row was updated. User-supplied metadata never grants admin permissions.
3. Turn off public sign-ups in the Supabase Authentication settings. All tester/developer accounts are created by the administrator.
4. Deploy the account-management Edge Function. Install the official Supabase CLI if needed, then run these commands from this project folder:

   ```
   supabase login
   supabase link --project-ref aywtgapueekmhvyomoyc
   supabase functions deploy admin-users
   supabase functions deploy username-login
   ```

   `supabase/config.toml` points at `index.js`, so no TypeScript is needed. Gateway JWT verification is disabled because the function explicitly verifies each user JWT through `auth.getUser(token)` and checks the caller's active administrator profile before privileged operations. Supabase provides the server credential to its function runtime. Never put that credential in `dist/` or share it in chat.
5. Sign in to the app as your administrator. Create projects, create tester/developer accounts, and open each project's settings → **Manage project access**. Share initial passwords privately. Members can change their own passwords in Settings.

## Included workflows

- Admin, developer, and tester roles; account creation, disabling, role changes, and password reset.
- Multiple projects, project descriptions/colors, member assignments, and archiving.
- Issue summaries and descriptions; bug/improvement/feature types; priorities; reproduction steps; expected/actual results; device/browser; app version.
- List and board views, combined filters, search, pagination, assignment, and issue links.
- Open → In progress → Ready for testing → Closed workflow. Testers can verify ready fixes or reopen closed issues. Testers can edit their own reports; project developers and admins can edit reports in accessible projects.
- Private image uploads (PNG/JPEG/WebP/GIF up to 10 MB), short-lived signed links, and screenshot removal. Up to five images during initial submission; more can be added from the issue detail screen.
- Comments, database-generated activity history, duplicate linking within a project, in-app notifications, and read tracking.
- Dashboard counts and project resolution progress; CSV export with protection against spreadsheet formula injection.
- Responsive layouts, keyboard navigation, native accessible dialogs, and helpful setup/error screens.

Every project member sees all reports in their assigned project. Administrators see every project. Developers only see their assigned projects. Disabled users lose database access even if an old authentication session remains open. Passwords are managed by Supabase Auth and never stored in public application tables.

## Hosting and sharing

GitHub Pages is configured to publish `main` → `/ (root)`. The root `index.html` loads the app assets from `dist/` using a relative base URL, so both project URLs and issue hash links work. Keep the root entry page in sync if the document head or script entry changes. `.nojekyll` disables unnecessary Jekyll processing.


Deploy the contents of `dist/` to any static web host over HTTPS. The Sites preview is owner-private by default, so testers cannot visit it until its access is explicitly shared or the frontend is hosted at a URL they can reach. Supabase authentication and row-level project permissions remain enforced independently of frontend hosting.

The app refreshes when the browser regains focus and every 60 seconds while visible. Realtime subscriptions work if you enable the `issues` and `notifications` tables for Supabase Realtime; polling remains available without that optional configuration.

Only images are accepted. No email or chat messages are sent by the app; notifications are inside the workspace.

## Validation

```
npm run check
npm test
```

Database security checks use PGlite against a simulated Supabase auth/storage schema. Install it in a temporary folder and run:

```
npm install --prefix /tmp/gnits-db-check @electric-sql/pglite@0.3.14
node tests/access-control.mjs /tmp/gnits-db-check/node_modules/@electric-sql/pglite/dist/index.js
```

These checks cover project isolation, privilege escalation, reporter spoofing, workflow permissions, screenshot isolation, audit/notification tampering, archived projects, and disabled accounts. Live sign-in, live storage, and account-function deployment still require completing your Supabase setup.

## Files

- `dist/` — deployable browser application and downloadable setup files.
- `supabase/migrations/001_workspace.sql` — database and access-control setup.
- `supabase/functions/admin-users/index.js` — secure server-side account management.
- `supabase/config.toml` — JavaScript function deployment configuration.
- `server.js` — dependency-free local preview server.
- `tests/` — application logic and database access checks.

External browser dependencies: Supabase JS 2.57.4 from esm.sh and fonts from Google Fonts (system-font fallback). The app requires an internet connection for live Supabase use.


## Email and username sign-in

The same password works with either an email or an assigned username. Email login continues to work without the username function. New accounts require a unique username (3–32 lowercase letters, numbers, dots, underscores, or hyphens). Existing accounts have no username until one is assigned.

After running both migrations and deploying `admin-users` and `username-login`, an administrator can open Team members → Manage → Set username, including on their own account. The username action allows the admin to edit their username while still preventing self-demotion or disabling their own account.

For your first administrator, you can set a username directly in Supabase SQL Editor after the account exists:

```sql
update public.profiles
set username = 'mgokulnarayana'
where email = 'mgokulnarayana@gmail.com';
```

This assigns a sign-in name; it does not create an account, set a password, or change its role. You must still create your own Supabase Auth user and promote that profile to admin using the setup instructions above.

The username function authenticates through Supabase Auth, returns session tokens only after password verification, never returns the account email, rejects disabled users, and limits attempts to 10 per username per 15-minute window. Sign in with your email if that username is temporarily throttled. The lookup and throttle use server-only privileges; no anonymous profile lookup is granted. The `username-login` function is intentionally callable before sign-in, while `admin-users` always verifies the caller's administrator permissions.


## Removing and restoring issues

Run `supabase db push --linked` to apply `003_issue_trash.sql`. Administrators and developers can open an issue → Move to trash → confirm. Trashed issues are excluded from active lists, board views, counts, and exports. Open Trash from the sidebar to restore a report. Comments and private screenshots are preserved and become accessible again after restoration. Testers cannot delete or restore issues. Developers can only manage issues in assigned projects. Trash and restore operations are recorded in the activity history. Permanent deletion is intentionally not exposed.


## Appearance

Use the sun/moon button on the sign-in screen or workspace header to switch between light and dark mode. Settings → Appearance also offers Match device. Theme preference is saved in this browser, follows device changes in automatic mode, and synchronizes across tabs.
