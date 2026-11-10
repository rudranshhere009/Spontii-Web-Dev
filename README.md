# Spontii

Spontii helps people find plans nearby and meet others who share their vibe.
This repository contains the React app, Express API, real-time chat, and a
super-admin portal.

## Run locally

1. Start MySQL or MariaDB and create the `spontiii` database.
2. Copy `server/.env.example` to `server/.env`, then set the database details,
   a random `JWT_SECRET` of at least 32 characters, and email delivery settings.
3. Set `SUPER_ADMIN_EMAIL` and a unique `SUPER_ADMIN_PASSWORD` (at least 12
   characters) to provision the first admin account on API startup. Remove the
   password from `server/.env` after the first successful admin sign-in.
4. Run `npm install`, then start `npm run server` and `npm run dev` in separate
   terminals.
5. Open the Vite URL for the app. The admin portal is at `/admin`.

The API creates and migrates its database tables on startup. See
[`server/README.md`](server/README.md) for backend setup and behavior details.
Never commit `server/.env`.

## Admin portal

Admins sign in at `/admin` using their configured email and password, followed
by an emailed one-time code. The first sign-in requires a password change.
The portal includes a dashboard, user and event moderation, reports,
announcements, platform settings, admin account management, an audit log, and
system health information.

Additional admin accounts and account recovery can be managed from the server
shell:

```text
npm run admin -- create ops@example.com "Ops Admin"
npm run admin -- reset-password ops@example.com
npm run admin -- unlock ops@example.com
```
