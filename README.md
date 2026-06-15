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

| Method | Endpoint                  | Description                          |
|--------|---------------------------|--------------------------------------|
| GET    | `/`                       | Health check                         |
| POST   | `/api/alumni/register`    | Register a new alumni member         |
| GET    | `/api/alumni/recent`      | Get 10 most recent registrations     |
| POST   | `/api/events/book`        | Book a spot for an event             |
| GET    | `/api/events/bookings`    | List all bookings (admin)            |

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
