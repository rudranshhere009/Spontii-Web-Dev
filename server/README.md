# Local authentication API

The API uses Node.js, Express, XAMPP's MySQL/MariaDB database, and the
`spontiii` database. It creates the `clients` table on startup if it does not
already exist. The equivalent SQL is in `schema.sql`.

1. Start MySQL in the XAMPP Control Panel.
2. Copy `server/.env.example` to `server/.env`. For XAMPP's default local
   setup, use `127.0.0.1`, port `3306`, user `root`, and database `spontiii`;
   set `DB_PASSWORD` if your MySQL root account has a password. Replace
   `JWT_SECRET` with a random secret of at least 32 characters. Set
   `MAIL_USER` and `MAIL_APP_PASSWORD` to a Gmail address and its Google app
   password to enable signup verification emails. Never commit `server/.env`.
3. Install the project dependencies with `npm install`.
4. In one terminal run `npm run server`; in another run `npm run dev`.
5. Open the Vite URL. The development server proxies `/api` requests to port
   3001.

Signup requires email verification before account creation. A six-digit code is
sent using `server/mail.js`, expires after three minutes, and is limited to five
verification attempts; resend is available after 30 seconds. The verified-email
proof is signed and expires after 30 minutes. Signup stores a bcrypt password
hash, not the original password, and does not create a session; the user must
log in after signup. Login supports both an email and password and a one-time
email login code from the Forgot password page. Login codes expire after three
minutes, are limited to five verification attempts, and can be resent after 30
seconds. The login-code endpoint does not reveal whether an email has an
account. Successful password or code login returns an HTTP-only session cookie.
The `clients` table stores a unique email and phone number for each account.
Phone is collected and stored but is not verified by SMS. Each account receives
a unique `SPONTIII-…` ID and starts with 20 Spontii Score points. Profile photos
(JPG, PNG, or WebP, up to 5 MB) and profile fields are stored in MySQL. Profile
completion covers photo, city, tagline, bio, and at least one tag; reaching 50%,
75%, and 100% adds 45, 20, and 35 points.

Notifications are stored per account in the MySQL `notifications` table. The
API creates a daily greeting and records each time the profile-completion
reminder is shown. A daily notification lets an account claim 20 Spontii points
once per database day. Event creation requires 100 points for the first lifetime
activity and 50 more for each later one. Points are not deducted; each published
activity awards 50 points, and both the requirement check and award are
transactional. Creating an event also creates a persistent host notification;
it can be opened but cannot be dismissed manually. Hosts complete an event from
its detail page, which removes the notification and hides the event from Home
and Explore.

Events created from `/create` are stored in the MySQL `activities` and
`activity_media` tables. The form supports map-selected locations, start/end
times, capacity, food and beverage details, reusable Spontii banners, and
optional venue photos/videos. Public events are listed to users searching the
event's state; friends-only events are visible to the host and accepted friends;
private events are visible only to their host. Exact venue details and map
coordinates are returned to the host and approved attendees. Join requests are
stored in `activity_join_requests`; hosts can review them from the event detail
page, and each event configures when requests close (15 minutes before start by
default). Only approved attendees and the host can view attendee profiles or use
the event's database-backed live chat. Live chat messages older than 24 hours
are deleted by the cleanup interval. Hosts can complete an event early with
`PATCH /api/activities/:id/complete`; otherwise it is completed automatically
at its scheduled end, its host notification is cleared, and the event and
attached media are removed. Expiry runs at startup and on a one-minute cleanup
interval.
Venue uploads accept JPG, PNG, WebP, MP4, WebM, and MOV files up to 12 MB each
(up to 6 photos and 2 videos).

People search and friend requests use the MySQL `clients`, `friendships`, and
`notifications` tables. Search returns only minimal profile details. A friend
request creates a notification for the recipient; accepting it makes both
accounts friends and unlocks friends-only events between them. The Home friend
section lists accepted friends only.

Chat lives in `server/chat.js`. Who can message whom is decided on the server
for every message:

- Event live chat: the host and approved attendees, while the event is active.
  Hosts can remove an attendee, which closes the live chat and host messages
  for them and stops them requesting again.
- Direct messages: accepted friends, or a host and an approved attendee of the
  same active event. Attendees who aren't friends talk only in the live chat.
  When the event ends, host ↔ attendee history stays readable but closed until
  they become friends.
- Blocking (either direction) stops direct messages, ends any friendship,
  hides each person from the other's search and hides the blocked person's
  live chat messages from the blocker. People can report messages; the text is
  saved in `message_reports` so it survives message cleanup.
- Messages are sent over REST (20 per minute per account) and delivered in
  real time over Socket.IO on the same port. The socket only pushes; it
  authenticates with the session cookie and checks the Origin. Direct messages
  are kept for 90 days. A declined friend request can't be resent for 7 days.

The API runs as a single instance; running several would need a shared
Socket.IO adapter such as `@socket.io/redis-adapter`, and the API host must
support WebSockets.

For a separately hosted frontend, set `VITE_API_BASE_URL` to the API's base
URL and configure `FRONTEND_ORIGIN` on the API to the exact frontend origin
(comma-separate several). In production, `FRONTEND_ORIGIN` is required:
requests that change data are rejected unless their `Origin` matches it,
because the session cookie is sent cross-site (`SameSite=None`).
