# IgwebuIke Alumni Network — Backend API

Express.js + MongoDB backend for the IgwebuIke Alumni Network & Job Portal.

---

## Project Structure

```
igwebuike-backend/
├── server.js                  ← Entry point
├── package.json
├── .env.example               ← Copy this to .env and fill in your values
├── .gitignore
├── models/
│   ├── Alumni.js              ← Alumni database schema
│   └── Booking.js             ← Event booking schema
├── routes/
│   ├── alumni.js              ← POST /api/alumni/register, GET /api/alumni/recent
│   └── events.js              ← POST /api/events/book
└── middleware/
    └── rateLimiter.js         ← Protects API from spam
```

---

## API Endpoints

| Method | Endpoint                | Access        | Description                                   |
|--------|-------------------------|---------------|-----------------------------------------------|
| GET    | `/`                     | public        | Health check                                  |
| POST   | `/api/alumni/register`  | public        | Register (needs consent) and auto-login       |
| GET    | `/api/alumni/recent`    | public        | 10 newest members (names/codes masked)        |
| POST   | `/api/auth/login`       | public        | Log in; sets httpOnly cookie                  |
| POST   | `/api/auth/logout`      | any           | Log out and revoke all sessions               |
| GET    | `/api/auth/me`          | logged in     | Current user                                  |
| POST   | `/api/events/book`      | logged in     | Book an event (identity from session)         |
| GET    | `/api/events/bookings`  | admin only    | List bookings                                 |
| GET    | `/api/jobs`             | public        | Published jobs (`q`, `type`, `skill`, `location`, `page`) |
| POST   | `/api/jobs`             | logged in     | Post a job (members: pending approval)        |
| GET    | `/api/jobs/mine`        | logged in     | My jobs + application counts                  |
| GET    | `/api/jobs/:id`         | public        | One published job                             |
| POST   | `/api/jobs/:id/apply`   | logged in     | Apply (optional referral code)                |
| GET    | `/api/jobs/:id/applications` | owner/admin | Applicants                                |
| PATCH  | `/api/jobs/:id/close`   | owner/admin   | Close a job                                   |
| GET    | `/api/applications/mine`| logged in     | My applications                               |
| GET/PATCH | `/api/alumni/me`     | logged in     | My matching profile (skills, occupation, bio) |
| GET    | `/api/jobs/recommended` | logged in     | Jobs ranked for me (ML, with keyword fallback) |
| POST   | `/api/jobs/recommendations/events` | logged in | Log view/apply/dismiss feedback |
| PATCH  | `/api/applications/:id/status` | owner/admin | Move an application through the pipeline |
| GET/PATCH | `/api/admin/jobs/...` | admin only   | Moderation queue: approve / reject            |

## Development, testing & CI

```bash
npm install                      # also creates package-lock.json - COMMIT IT (CI and Docker need it)
npm run test:unit                # 13 fast tests, no database needed
# integration tests need a local MongoDB; the DB name MUST end in _test (it gets dropped):
MONGO_URI_TEST=mongodb://127.0.0.1:27017/igwebuike_test npm run test:integration
docker compose up --build        # whole stack (API + MongoDB) with one command
```
- Integration test files each use their own database (`igwebuike_auth_test`, `igwebuike_jobs_test`), so they can run in parallel.
- `npm test` runs everything (33 unit + 58 integration tests). `npm run test:coverage` prints coverage.
- GitHub Actions (`.github/workflows/ci.yml`) runs the tests on Node 20 and 22 against a real MongoDB,
  runs `npm audit` for high/critical vulnerabilities, and checks the Docker image builds.
  `codeql.yml` adds static security analysis weekly and on every push. Dependabot opens update PRs.
- API reference: `docs/openapi.yaml` (paste it into https://editor.swagger.io to browse).

## Optional: ML matching service
Set `ML_SERVICE_URL` and `ML_INTERNAL_KEY` (24+ chars, identical on both services) to enable AI ranking from `../ml-service`. Without them the site uses keyword matching. `npm run export-corpus > corpus.json` exports anonymised text to retrain the model.

## Security
See `docs/SECURITY.md` for the threat model. Run tests with `npm test`.
Make a company an employer (jobs publish without review): `ROLE_EMAIL=hr@co.com ROLE=employer npm run set-role`

Create the first admin (from your own machine, never via the API):
`ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='long passphrase' npm run create-admin`

## New environment variables (REQUIRED on Render)
| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 48+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | exact Netlify URL, e.g. `https://yoursite.netlify.app` (no trailing slash) |

Also: in MongoDB Atlas, replace "Allow access from anywhere (0.0.0.0/0)" with Render's outbound IPs where possible.

---

## DEPLOYMENT GUIDE (Step by Step)

### STEP 1 — Create a GitHub Account & Repository

1. Go to https://github.com and create a free account
2. Click **New repository**
3. Name it `igwebuike-backend`
4. Set it to **Public**, click **Create repository**
5. On your PC, open a terminal/command prompt in the `igwebuike-backend` folder and run:

```bash
git init
git add .
git commit -m "Initial backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/igwebuike-backend.git
git push -u origin main
```

> ⚠️ Make sure `.env` is in `.gitignore` — never push your secrets to GitHub.

---

### STEP 2 — Set Up MongoDB Atlas (Free Database)

1. Go to https://mongodb.com/atlas and create a free account
2. Click **Build a Database** → choose **FREE (M0 Shared)** → pick any region → click **Create**
3. Set a **username** and **password** (save these — you'll need them)
4. Under **Network Access** → click **Add IP Address** → choose **Allow Access from Anywhere** (0.0.0.0/0)
5. Click **Connect** on your cluster → **Drivers** → choose **Node.js**
6. Copy the connection string. It looks like:
   ```
   mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
7. Edit it to include your database name:
   ```
   mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/igwebuike?retryWrites=true&w=majority
   ```
   Keep this string — you'll paste it into Render in the next step.

---

### STEP 3 — Deploy Backend to Render (Free Hosting)

1. Go to https://render.com and create a free account
2. Click **New +** → **Web Service**
3. Connect your GitHub account and select your `igwebuike-backend` repository
4. Fill in the settings:
   - **Name**: `igwebuike-api` (or anything you like)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. Scroll down to **Environment Variables** and add:
   | Key           | Value                                      |
   |---------------|--------------------------------------------|
   | `MONGO_URI`   | Your MongoDB connection string from Step 2 |
   | `FRONTEND_URL`| `https://your-site.netlify.app` (update after Step 4) |
6. Click **Create Web Service**
7. Wait ~2 minutes. You'll get a live URL like: `https://igwebuike-api.onrender.com`
8. Test it by opening: `https://igwebuike-api.onrender.com` — you should see:
   ```json
   { "status": "ok", "message": "IgwebuIke API is running ✅" }
   ```

---

### STEP 4 — Deploy Frontend to Netlify (Free Hosting)

1. Go to https://netlify.com and create a free account
2. Click **Add new site** → **Deploy manually**
3. Drag and drop your entire `igwebuike front` folder onto the upload area
4. Your site will be live in seconds at a URL like: `https://random-name.netlify.app`
5. Optionally rename it: **Site settings** → **Change site name**

---

### STEP 5 — Connect Frontend to Backend

1. Open `igwebuike front/script.js`
2. Find these lines near the top:

```javascript
const IS_PRODUCTION = false;

const API_BASE = IS_PRODUCTION
  ? "https://YOUR-APP-NAME.onrender.com"   // ← replace with your Render URL
  : "http://localhost:5000";
```

3. Replace `https://YOUR-APP-NAME.onrender.com` with your actual Render URL from Step 3
4. Change `IS_PRODUCTION` to `true`
5. Save the file and re-upload the updated `igwebuike front` folder to Netlify

---

### STEP 6 — Update CORS on Render

1. Go back to your Render dashboard → your web service → **Environment**
2. Update `FRONTEND_URL` to your Netlify URL (e.g. `https://igwebuike.netlify.app`)
3. Click **Save Changes** — Render will restart the server automatically

---

### STEP 7 — Test the Full Live Flow

1. Visit your Netlify URL
2. Fill in the registration form and submit → you should get an alumni code
3. Check MongoDB Atlas → **Browse Collections** → `alumni` collection — your record should be there
4. Test event booking with the alumni code you just generated
5. The timeline should show your registration after ~30 seconds

---

## Running Locally (For Development)

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Then edit .env and paste your MongoDB URI

# 3. Start the server
npm run dev     # uses nodemon — auto-restarts on file changes
# OR
npm start       # plain node

# Server runs at: http://localhost:5000
```

Open your frontend with VS Code Live Server (port 5500) or any local server.
The frontend script.js defaults to `http://localhost:5000` when IS_PRODUCTION is false.

---

## Notes

- **Render free tier** spins down after 15 minutes of inactivity. The first request after idle takes ~30 seconds to wake up. This is normal on the free plan.
- **MongoDB Atlas free tier** gives you 512MB — more than enough for thousands of alumni records.
- **Netlify free tier** has no usage limits for static sites.
- Passwords are hashed with bcrypt before being saved — they are never stored in plain text.
