# Kilimo Bridge - Developer Setup Guide

> **Note:** The app in this repo runs on **SQLite + Express** (`backend/data/kilimo.db`), not Supabase.
> Supabase references below are for a planned future phase.

**Get the app running on your computer in 10 minutes**

---

## ✅ Prerequisites (Install First)

### 1. Node.js 18+
Download from [nodejs.org](https://nodejs.org/)

Verify installation:
```bash
node --version
npm --version
```

### 2. Git
Download from [git-scm.com](https://git-scm.com/)

Verify installation:
```bash
git --version
```

### 3. Code Editor (Optional)
- [VS Code](https://code.visualstudio.com/) (recommended)
- [WebStorm](https://www.jetbrains.com/webstorm/)
- Any text editor

### 4. Postman (Optional, for API testing)
Download from [postman.com](https://www.postman.com/)

---

## 🚀 Quick Start (10 minutes)

### Step 1: Clone Repository
```bash
git clone https://github.com/kilimo/bridge.git
cd bridge
```

### Step 2: Setup Backend
```bash
cd backend
npm install
```

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
PORT=3000
NODE_ENV=development
```

**Get Supabase credentials:**
1. Go to [supabase.com](https://supabase.com)
2. Login to Kilimo project
3. Settings → API → Copy URL and anon key

Start backend:
```bash
npm run dev
```

**Expected output:**
```
✅ Server running on http://localhost:3000
✅ Database connected
```

---

### Step 3: Setup Frontend
Open new terminal:
```bash
cd bridge/web
npm install
```

Create `.env.local`:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

Start frontend:
```bash
npm start
```

**Expected output:**
```
✅ Compiled successfully
✅ App running on http://localhost:5173
```

---

### Step 4: Verify It Works

1. **Open browser:** http://localhost:5173
2. **Create account:**
   - Click "Sign Up"
   - Email: `test@example.com`
   - Password: `Test123!`
   - Name: `Test Farmer`
   - Role: `farmer`
3. **Login with credentials**
4. **See dashboard** with metrics

---

## 🔧 Backend Only Setup

If you only want to work on the backend:

```bash
cd bridge/backend
npm install
npm run dev
```

**Test API:**
```bash
curl http://localhost:3000/api/health
# Expected: { "status": "ok" }
```

---

## 🎨 Frontend Only Setup

If you only want to work on the frontend:

```bash
cd bridge/web
npm install
npm start
```

**Note:** You'll need backend running to make API calls. Or use mock data in development mode.

---

## ⚡ Common Commands

### Backend
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm test             # Run tests
npm run lint         # Check code quality
npm run migrate      # Run database migrations
```

### Frontend
```bash
npm start            # Start dev server
npm run build        # Build for production
npm test             # Run tests
npm run lint         # Check code quality
npm run format       # Auto-format code
```

---

## 🐛 Troubleshooting

### "npm: command not found"
**Solution:** Install Node.js from [nodejs.org](https://nodejs.org/)

### "Cannot find module"
**Solution:** Run `npm install` again
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Port 3000 already in use"
**Solution:** Kill the process using port 3000

**macOS/Linux:**
```bash
lsof -i :3000
kill -9 <PID>
```

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### "Cannot connect to Supabase"
**Solution:** Check `.env` credentials
```bash
# Verify URL format
echo $SUPABASE_URL
# Should output: https://xxxxxxxxxxxx.supabase.co

# Verify key length
echo $SUPABASE_ANON_KEY
# Should be ~100+ characters
```

### "CORS error" or "Cannot POST to API"
**Solution:** Ensure backend is running
```bash
# In another terminal
cd backend
npm run dev

# Verify it's running
curl http://localhost:3000/api/health
```

### "Database connection failed"
**Solution:** Check Supabase credentials and network
1. Verify `.env` has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
2. Check internet connection
3. Go to [supabase.com](https://supabase.com) and verify project is running
4. Check project status: Settings → Status

---

## 📝 Environment Variables Reference

### Backend (.env)
```
# Supabase
SUPABASE_URL=               # Project URL from Supabase
SUPABASE_ANON_KEY=          # Anon key from Supabase
SUPABASE_SERVICE_ROLE_KEY=  # Service role key (for admin operations)

# Security
JWT_SECRET=                 # Secret for signing JWTs

# Server
PORT=3000                   # Server port
NODE_ENV=development        # development, staging, production

# Email (optional, for notifications)
SENDGRID_API_KEY=           # For email service
SENDGRID_FROM_EMAIL=        # From address

# Payments (optional, for Phase 2)
STRIPE_SECRET_KEY=          # Stripe test key
STRIPE_PUBLISHABLE_KEY=     # Stripe test key

# Logging (optional)
LOG_LEVEL=info              # debug, info, warn, error
```

### Frontend (.env.local)
```
# API
REACT_APP_API_URL=http://localhost:3000/api

# Supabase
REACT_APP_SUPABASE_URL=     # Same as backend
REACT_APP_SUPABASE_ANON_KEY=# Same as backend

# Features
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_PAYMENTS=false  # For Phase 2
```

---

## 🧪 Testing Your Setup

### 1. Backend Health Check
```bash
curl http://localhost:3000/api/health
```

**Expected response:**
```json
{ "status": "ok", "timestamp": "2026-07-12T10:00:00Z" }
```

### 2. Frontend Loads
Go to http://localhost:5173 in browser
Should see login page

### 3. Can Create Account
1. Click "Sign Up"
2. Fill form
3. Click "Register"
4. Should be logged in automatically

### 4. API Authentication
```bash
# Get token from login
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}' \
  | jq '.token')

# Use token to call API
curl http://localhost:3000/api/farmers \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📚 Next Steps

1. **Read the docs:**
   - [API Documentation](./API.md)
   - [Database Schema](./SCHEMA.md)
   - [Pull Request Guide](#pull-request-guide)

2. **Explore the code:**
   - Backend: `backend/src/routes/` (API endpoints)
   - Backend: `backend/src/models/` (Database models)
   - Frontend: `web/src/pages/` (React pages)
   - Frontend: `web/src/components/` (Reusable components)

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Pick a task:** See [Project Dashboard](https://kilimobridgeprojectdashboard.netlify.app/)

5. **Ask questions:** Slack #kilimo-dev or @georgia

---

## 🆘 Need Help?

1. **Check existing issues:** GitHub → Issues
2. **Search in docs:** Use Ctrl+F
3. **Ask in Slack:** #kilimo-dev
4. **Pair with Georgia:** Book calendar slot

---

## ✨ Tips for Success

- **Start small:** Don't try to understand everything at once
- **Use Postman:** Test API endpoints before debugging frontend
- **Check the logs:** Backend logs show errors clearly
- **Ask questions:** Better to ask than be stuck
- **Commit often:** Smaller commits are easier to review
- **Test locally:** Always test before pushing

---

**Welcome to the team! You're ready to build. 🚀**

**Last Updated:** July 2026
