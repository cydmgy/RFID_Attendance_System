# Phase 1 Setup Guide
## Database (Supabase) + Local Tools Installation

> **Strategy:** You do NOT need to install PostgreSQL locally.
> Supabase IS your PostgreSQL — hosted in the cloud, accessible anywhere.
> We only need Node.js installed locally to run our backend API.

---

## Step 1 — Install Node.js (Required for Backend)

1. Go to: **https://nodejs.org**
2. Download the **LTS version** (e.g., v20.x or v22.x)
3. Run the installer — keep all defaults, make sure **"Add to PATH"** is checked
4. Restart your terminal / VS Code after installing
5. Verify installation:
   ```powershell
   node --version   # should print v20.x.x or higher
   npm --version    # should print 10.x.x or higher
   ```

---

## Step 2 — Create Your Supabase Project

1. Go to **https://supabase.com**
2. Click **"Start your project"** → Sign up with GitHub or email
3. Click **"New Project"**
4. Fill in:
   - **Organization:** Your name or school name
   - **Project name:** `attendance-system`
   - **Database password:** Create a strong password — **SAVE THIS SOMEWHERE SAFE**
   - **Region:** Choose `Southeast Asia (Singapore)` — closest to Philippines
5. Click **"Create new project"**
6. Wait ~2 minutes for the project to spin up

---

## Step 3 — Run the SQL Schema

Once your project is ready:

1. In your Supabase dashboard, click **"SQL Editor"** (left sidebar)
2. Click **"New query"**
3. Copy and paste the entire SQL below
4. Click **"Run"** (or press `Ctrl+Enter`)

```sql
-- ============================================================
-- IoT Attendance Monitoring System — Full Schema
-- Paste this into Supabase SQL Editor and run it
-- ============================================================

-- 1. INSTRUCTORS (must be first — referenced by subjects)
CREATE TABLE IF NOT EXISTS instructors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  role        VARCHAR(20) DEFAULT 'instructor'
                CHECK (role IN ('instructor', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. ROOMS
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  location    VARCHAR(200),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. SUBJECTS (depends on rooms + instructors)
CREATE TABLE IF NOT EXISTS subjects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(100) NOT NULL,
  code                    VARCHAR(20),
  room_id                 UUID REFERENCES rooms(id) ON DELETE SET NULL,
  instructor_id           UUID REFERENCES instructors(id) ON DELETE SET NULL,
  late_threshold_minutes  INTEGER DEFAULT 15,
  min_attendance_percent  INTEGER DEFAULT 75,
  school_year             VARCHAR(20),
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- 4. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_uid    VARCHAR(50) UNIQUE NOT NULL,
  student_id  VARCHAR(20) UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  course      VARCHAR(100),
  year_level  INTEGER,
  section     VARCHAR(20),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 5. GUARDIANS (for SMS notifications)
CREATE TABLE IF NOT EXISTS guardians (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  full_name    VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  relationship VARCHAR(50),
  sms_enabled  BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 6. SCHEDULES (junction: students <-> subjects)
CREATE TABLE IF NOT EXISTS schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id  UUID REFERENCES subjects(id) ON DELETE CASCADE,
  day_of_week VARCHAR(10) NOT NULL
                CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 7. ATTENDANCE LOGS (core table — every RFID tap)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID REFERENCES students(id) ON DELETE SET NULL,
  room_id            UUID REFERENCES rooms(id) ON DELETE SET NULL,
  rfid_uid           VARCHAR(50) NOT NULL,
  timestamp          TIMESTAMPTZ DEFAULT now(),
  status             VARCHAR(20) DEFAULT 'present'
                       CHECK (status IN ('present', 'late', 'excused', 'unknown')),
  device_id          VARCHAR(50),
  is_first_tap_today BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 8. ATTENDANCE OVERRIDES (manual correction audit trail)
CREATE TABLE IF NOT EXISTS attendance_overrides (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id  UUID REFERENCES attendance_logs(id) ON DELETE CASCADE,
  changed_by         UUID REFERENCES instructors(id) ON DELETE SET NULL,
  old_status         VARCHAR(20) NOT NULL,
  new_status         VARCHAR(20) NOT NULL,
  reason             TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 9. LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id   UUID REFERENCES subjects(id) ON DELETE CASCADE,
  leave_date   DATE NOT NULL,
  reason       TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  UUID REFERENCES instructors(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 10. SMS LOGS
CREATE TABLE IF NOT EXISTS sms_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES students(id) ON DELETE SET NULL,
  guardian_id      UUID REFERENCES guardians(id) ON DELETE SET NULL,
  message          TEXT NOT NULL,
  provider_status  VARCHAR(20) DEFAULT 'sent'
                     CHECK (provider_status IN ('sent', 'failed', 'delivered')),
  sent_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES (speeds up queries on large data)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_attendance_rfid       ON attendance_logs(rfid_uid);
CREATE INDEX IF NOT EXISTS idx_attendance_student    ON attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_room       ON attendance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp  ON attendance_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance_logs(DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_schedules_student     ON schedules(student_id);
CREATE INDEX IF NOT EXISTS idx_schedules_subject     ON schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_leave_student         ON leave_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_status          ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_sms_student           ON sms_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student     ON guardians(student_id);

-- ============================================================
-- SEED DATA (optional — for testing)
-- ============================================================

-- Insert a test room
INSERT INTO rooms (name, location) VALUES
  ('Room 101', 'Building A, Floor 1'),
  ('Room 202', 'Building B, Floor 2'),
  ('Laboratory 1', 'Building C, Ground Floor')
ON CONFLICT DO NOTHING;

-- Done! Check the Table Editor to confirm all 10 tables were created.
```

---

## Step 4 — Enable Realtime on `attendance_logs`

This allows the dashboard to receive live updates when a student taps their card.

1. In Supabase, go to **"Database"** → **"Replication"** (left sidebar)
2. Under **"Supabase Realtime"**, find `attendance_logs`
3. Toggle it **ON** ✅
4. Also enable for `leave_requests` (for live notifications on the dashboard)

---

## Step 5 — Get Your API Keys

You'll need these to connect your backend and frontend to Supabase.

1. Go to **"Project Settings"** → **"API"** (left sidebar)
2. Copy and save these three values:

| Key | Where to find it | Used by |
|---|---|---|
| **Project URL** | `https://xxxx.supabase.co` | Backend + Frontend |
| **anon / public key** | Under "Project API keys" | Frontend (safe to expose) |
| **service_role key** | Under "Project API keys" | Backend ONLY — keep secret! |

> ⚠️ **NEVER** put `service_role` key in your frontend HTML/JS. Only use it in your Node.js backend on the server.

---

## Step 6 — Set Up the Project Folder Structure

Run these commands in PowerShell from your project folder:

```powershell
# Navigate to your project
cd "C:\Users\Clyde Magnaye\OneDrive\Documents\3rd year stuff\1st_Sem_Project"

# Create the folder structure
mkdir backend
mkdir backend\src
mkdir backend\src\routes
mkdir backend\src\middleware
mkdir frontend
mkdir frontend\pages
mkdir frontend\css
mkdir frontend\js
mkdir frontend\assets

# Initialize the backend Node.js project
cd backend
npm init -y
npm install express cors dotenv @supabase/supabase-js express-rate-limit helmet
cd ..
```

---

## Step 7 — Create the `.env` File (Backend Secrets)

Inside the `backend` folder, create a file named `.env`:

```env
# Supabase
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Server
PORT=3000

# Duplicate scan guard (minutes)
DUPLICATE_GUARD_MINUTES=5

# ESP32 API Key (you choose this — ESP32 must send this in headers)
IOT_API_KEY=your-secret-esp32-api-key-here
```

> Replace the values with your actual Supabase keys from Step 5.

---

## Step 8 — Verify Everything Works

After running the SQL, go to **"Table Editor"** in Supabase.
You should see all **10 tables** listed:

- ✅ `instructors`
- ✅ `rooms`
- ✅ `subjects`
- ✅ `students`
- ✅ `guardians`
- ✅ `schedules`
- ✅ `attendance_logs`
- ✅ `attendance_overrides`
- ✅ `leave_requests`
- ✅ `sms_logs`

---

## Final Project Structure (After Setup)

```
1st_Sem_Project/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── scan.js          ← ESP32 endpoint
│   │   │   ├── students.js      ← Student CRUD
│   │   │   ├── attendance.js    ← Reports + live
│   │   │   ├── override.js      ← Manual corrections
│   │   │   └── leave.js         ← Leave requests
│   │   ├── middleware/
│   │   │   ├── auth.js          ← JWT verification
│   │   │   └── iotAuth.js       ← ESP32 API key check
│   │   └── supabase.js          ← Supabase client setup
│   ├── index.js                 ← Entry point
│   ├── .env                     ← Your secrets (never commit this!)
│   ├── .gitignore
│   └── package.json
│
├── frontend/
│   ├── pages/
│   │   ├── login.html
│   │   ├── dashboard.html       ← Live feed
│   │   ├── reports.html
│   │   ├── students.html
│   │   └── leave-requests.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── supabase-client.js
│   │   ├── dashboard.js
│   │   └── reports.js
│   └── assets/
│
├── database/
│   └── schema.sql               ← The SQL we ran on Supabase
│
├── erd_and_sequence.md
└── system_plan.md
```

---

*Phase 1 Complete when: All 10 tables exist in Supabase Table Editor ✅*
*Next: Phase 1b — Build the Node.js/Express backend API*
