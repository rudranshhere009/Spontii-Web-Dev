# Local authentication API

The API uses Node.js, Express, XAMPP's MySQL/MariaDB database, and the
`spontiii` database. It creates the `clients` table on startup if it does not
already exist. The equivalent SQL is in `schema.sql`.

1. Start MySQL in the XAMPP Control Panel.
2. This checkout has a local, ignored `server/.env` configured for the
   confirmed XAMPP defaults. If it is missing, copy `server/.env.example` to
   `server/.env`, set the MySQL credentials and Gmail `MAIL_USER` /
   `MAIL_APP_PASSWORD` (a Google app password), and replace `JWT_SECRET` with
   a random secret of at least 32 characters. Never commit `server/.env`.
3. Install the project dependencies with `npm install`.
4. In one terminal run `npm run server`; in another run `npm run dev`.
5. Open the Vite URL. The development server proxies `/api` requests to port
   3001.

Signup requires email verification before account creation. A six-digit code is
sent using `server/mail.js`, expires after three minutes, and is limited to five
verification attempts; resend is available after 30 seconds. The verified-email
proof is signed and expires after 30 minutes. Signup stores a bcrypt password
hash, not the original password, and does not create a session; the user must
log in after signup. Login returns an HTTP-only session cookie. The `clients`
table stores a unique email and phone number for each account. Login currently
uses email and password; phone is collected and stored but is not verified by
SMS. Each account receives a unique `SPONTIII-…` ID and starts with 20 Spontii
Score points. Profile photos (JPG, PNG, or WebP, up to 5 MB) and profile fields
are stored in MySQL. Profile completion covers photo, city, tagline, bio, and
at least one tag; reaching 50%, 75%, and 100% adds 45, 20, and 35 points.

For a separately hosted frontend, set `VITE_API_BASE_URL` to the API's base
URL and configure `FRONTEND_ORIGIN` on the API to the exact frontend origin.
