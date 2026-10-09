# Database ERD & Sequence Diagrams
## IoT Attendance Monitoring System — v3
### Confirmed Features Integrated

---

## 1. Confirmed Feature Set

| # | Feature | Status |
|---|---|---|
| 1 | Real-time live attendance dashboard | ✅ Core |
| 2 | Daily / Weekly / Monthly reports | ✅ Core |
| 3 | RFID Student Enrollment | ✅ Core |
| 4 | Role-Based Access (Admin / Instructor) | ✅ Core |
| 5 | **Manual Attendance Override** | ✅ Added |
| 6 | **Leave / Excuse Requests** | ✅ Added |
| 7 | **Duplicate Scan Guard** | ✅ Added |
| 8 | **SMS Notification to Parents (Conceptual)** | ✅ Added |

---

## 2. Entity Relationship Diagram (Full — 8 Tables)

```mermaid
erDiagram
    STUDENTS {
        uuid id PK
        varchar rfid_uid UK
        varchar student_id UK
        varchar full_name
        varchar course
        int year_level
        varchar section
        timestamptz created_at
    }

    GUARDIANS {
        uuid id PK
        uuid student_id FK
        varchar full_name
        varchar phone_number
        varchar relationship
        bool sms_enabled
        timestamptz created_at
    }

    ROOMS {
        uuid id PK
        varchar name
        varchar location
        timestamptz created_at
    }

    SUBJECTS {
        uuid id PK
        varchar name
        varchar code
        uuid room_id FK
        uuid instructor_id FK
        int late_threshold_minutes
        int min_attendance_percent
        varchar school_year
        timestamptz created_at
    }

    SCHEDULES {
        uuid id PK
        uuid student_id FK
        uuid subject_id FK
        varchar day_of_week
        time start_time
        time end_time
        timestamptz created_at
    }

    ATTENDANCE_LOGS {
        uuid id PK
        uuid student_id FK
        uuid room_id FK
        varchar rfid_uid
        timestamptz timestamp
        varchar status
        varchar device_id
        bool is_first_tap_today
        timestamptz created_at
    }

    ATTENDANCE_OVERRIDES {
        uuid id PK
        uuid attendance_log_id FK
        uuid changed_by FK
        varchar old_status
        varchar new_status
        text reason
        timestamptz created_at
    }

    LEAVE_REQUESTS {
        uuid id PK
        uuid student_id FK
        uuid subject_id FK
        date leave_date
        text reason
        varchar status
        uuid reviewed_by FK
        timestamptz reviewed_at
        timestamptz created_at
    }

    SMS_LOGS {
        uuid id PK
        uuid student_id FK
        uuid guardian_id FK
        varchar message
        varchar provider_status
        timestamptz sent_at
    }

    INSTRUCTORS {
        uuid id PK
        uuid auth_id UK
        varchar full_name
        varchar email UK
        varchar role
        timestamptz created_at
    }

    STUDENTS         ||--o{ SCHEDULES          : "enrolled in"
    SUBJECTS         ||--o{ SCHEDULES          : "has many students"
    STUDENTS         ||--o{ ATTENDANCE_LOGS    : "generates"
    ROOMS            ||--o{ ATTENDANCE_LOGS    : "recorded in"
    ROOMS            ||--o{ SUBJECTS           : "hosts many subjects"
    INSTRUCTORS      ||--o{ SUBJECTS           : "teaches many"
    STUDENTS         ||--o{ GUARDIANS          : "has guardian(s)"
    STUDENTS         ||--o{ LEAVE_REQUESTS     : "files"
    SUBJECTS         ||--o{ LEAVE_REQUESTS     : "for subject"
    INSTRUCTORS      ||--o{ LEAVE_REQUESTS     : "reviews"
    ATTENDANCE_LOGS  ||--o{ ATTENDANCE_OVERRIDES : "can be corrected"
    INSTRUCTORS      ||--o{ ATTENDANCE_OVERRIDES : "performed by"
    STUDENTS         ||--o{ SMS_LOGS           : "triggered by"
    GUARDIANS        ||--o{ SMS_LOGS           : "received by"
```

---

## 3. Table Relationships at a Glance

```
INSTRUCTORS ──teaches──► SUBJECTS ──held in──► ROOMS
                              │                    │
                  (via SCHEDULES junction)          │
                              ▼                    ▼
                          STUDENTS ─────────► ATTENDANCE_LOGS
                              │                    │
                              │                    ├──► ATTENDANCE_OVERRIDES
                              │                    │       (manual corrections)
                              ▼                    │
                          GUARDIANS ◄──────── SMS_LOGS
                          (parents)           (first tap alert)
                              │
                              ▼
                         LEAVE_REQUESTS
                         (excused absences)
```

---

## 4. New Tables Explained

### 👪 GUARDIANS
> **"Every student can have one or more parents/guardians who receive SMS notifications."**

- `phone_number` — where the SMS goes (e.g., "+639XXXXXXXXX")
- `relationship` — `"Mother"`, `"Father"`, `"Guardian"`
- `sms_enabled` — toggle per guardian (some families may opt out)
- One student → One or more guardians

---

### 📝 ATTENDANCE_OVERRIDES *(Audit Trail)*
> **"Tracks every manual correction an instructor or admin makes to an attendance record."**

- `attendance_log_id` → the original scan log being corrected
- `changed_by` → which instructor made the change
- `old_status` / `new_status` → e.g., `"absent"` → `"present"`
- `reason` → required text explaining why (accountability)
- Protects data integrity — original log is **never deleted**, only a correction is added

---

### 📋 LEAVE_REQUESTS
> **"A student (filed by admin on their behalf) requests to be marked excused for a specific date and subject."**

- `status`: `"pending"` → `"approved"` or `"rejected"`
- `reviewed_by` → instructor who acted on it
- When **approved** → triggers an override on the related `attendance_log` (absent → excused)
- When **rejected** → original `absent` status remains

---

### 📱 SMS_LOGS
> **"Tracks every SMS notification sent — for auditing and preventing duplicate messages."**

- Linked to both the `student` and the specific `guardian` who received it
- `provider_status`: `"sent"`, `"failed"`, `"delivered"` (from Twilio callback)
- Used to check: *"Was an SMS already sent for this student today?"* before sending again

---

## 5. Cardinality Summary (Complete)

| Relationship | Type | Description |
|---|---|---|
| Student → Schedules | 1 to Many | One student, many class enrollments |
| Subject → Schedules | 1 to Many | One subject, many students enrolled |
| Student → Attendance Logs | 1 to Many | One student generates many scan records |
| Room → Attendance Logs | 1 to Many | One room's door logs many scans |
| Room → Subjects | 1 to Many | One room hosts many subjects |
| Instructor → Subjects | 1 to Many | One instructor teaches many subjects |
| Student → Guardians | 1 to Many | One student can have multiple guardians |
| Student → Leave Requests | 1 to Many | One student can file many leave requests |
| Instructor → Leave Requests | 1 to Many | One instructor reviews many requests |
| Attendance Log → Overrides | 1 to Many | One log can have correction history |
| Instructor → Overrides | 1 to Many | One instructor can make many corrections |
| Student → SMS Logs | 1 to Many | Many SMS events per student over time |
| Guardian → SMS Logs | 1 to Many | Many SMS messages per guardian |
| Students ↔ Subjects | Many to Many | Resolved via SCHEDULES |

---

## 6. Sequence Diagrams

### 6.1 — Student Taps Card (Core + Duplicate Guard + SMS)

```mermaid
sequenceDiagram
    actor Student
    participant ESP32
    participant API as Node.js API
    participant DB as Supabase
    participant Twilio as Twilio SMS
    participant Parent as Parent's Phone
    participant RT as Supabase Realtime
    participant Dashboard

    Student->>ESP32: Taps RFID card
    ESP32->>ESP32: RC522 reads UID "A1B2C3D4"
    ESP32->>API: POST /api/scan { uid, room_id, device_id }

    Note over API: ── DUPLICATE SCAN GUARD ──
    API->>DB: SELECT last attendance_log WHERE rfid_uid = "A1B2C3D4" AND room_id = X
    DB-->>API: Last scan timestamp

    alt Scanned within 5 minutes
        API-->>ESP32: 409 { message: "Already scanned recently" }
        ESP32->>ESP32: LCD: "Already Logged"
        ESP32->>ESP32: Short beep (ignored)
    else First scan or > 5 minutes ago
        API->>DB: SELECT student WHERE rfid_uid = "A1B2C3D4"
        DB-->>API: Student record

        API->>DB: SELECT schedule → check start_time for status
        DB-->>API: Schedule info

        Note over API: ── FIRST TAP OF DAY CHECK ──
        API->>DB: SELECT COUNT(*) FROM attendance_logs WHERE student_id = X AND DATE(timestamp) = today
        DB-->>API: count = 0 (first tap today!) OR count > 0 (already tapped today)

        API->>DB: INSERT attendance_logs { ..., is_first_tap_today = (count==0) }
        DB-->>API: Log saved ✓

        API-->>ESP32: 200 OK { name: "Juan Dela Cruz", status: "present" }
        ESP32->>ESP32: LCD: "Juan Dela Cruz ✓"
        ESP32->>ESP32: Beep once

        DB->>RT: Realtime event fires
        RT-->>Dashboard: Live feed updates

        Note over API: ── SMS NOTIFICATION ──
        alt is_first_tap_today = true AND guardian.sms_enabled = true
            API->>DB: SELECT guardians WHERE student_id = X AND sms_enabled = true
            DB-->>API: Guardian { full_name, phone_number }
            API->>Twilio: Send SMS to "+639XXXXXXXXX"<br/>"Hi Maria! Juan Dela Cruz has arrived at school<br/>and tapped their ID at 7:32 AM. - School System"
            Twilio-->>Parent: SMS delivered ✓
            API->>DB: INSERT sms_logs { student_id, guardian_id, message, status: "sent" }
        else Not first tap or SMS disabled
            Note over API: Skip SMS — already notified today
        end
    end
```

---

### 6.2 — Manual Attendance Override

```mermaid
sequenceDiagram
    actor Instructor
    participant Dashboard
    participant API as Node.js API
    participant DB as Supabase

    Instructor->>Dashboard: Views today's attendance for their class
    Instructor->>Dashboard: Finds student "Pedro Santos" marked "absent" incorrectly
    Instructor->>Dashboard: Clicks "Override" → selects "Present" → types reason

    Dashboard->>API: PATCH /api/attendance/:log_id/override
    Note over API: Body: { new_status: "present", reason: "Student was present but card was faulty" }

    API->>DB: Verify instructor owns this subject (authorization check)
    DB-->>API: Authorized ✓

    API->>DB: SELECT current status FROM attendance_logs WHERE id = :log_id
    DB-->>API: old_status = "absent"

    API->>DB: UPDATE attendance_logs SET status = "present" WHERE id = :log_id
    API->>DB: INSERT INTO attendance_overrides {
    Note over API: attendance_log_id, changed_by (instructor id),<br/>old_status: "absent", new_status: "present",<br/>reason: "Student was present but card was faulty" }

    DB-->>API: Both saved ✓
    API-->>Dashboard: 200 OK { success: true }
    Dashboard->>Dashboard: Status updates on screen
    Dashboard->>Dashboard: Override badge appears on that log row
```

---

### 6.3 — Leave / Excuse Request Flow

```mermaid
sequenceDiagram
    actor Admin
    actor Instructor
    participant Dashboard
    participant API as Node.js API
    participant DB as Supabase

    Note over Admin,Dashboard: Admin files a leave on behalf of the student
    Admin->>Dashboard: Goes to Student Profile → "File Leave Request"
    Admin->>Dashboard: Selects subject, date, types reason: "Medical certificate submitted"
    Dashboard->>API: POST /api/leave-requests { student_id, subject_id, leave_date, reason }

    API->>DB: INSERT INTO leave_requests { status: "pending", ... }
    DB-->>API: Request created ✓
    API-->>Dashboard: "Leave request submitted"

    Note over Instructor,Dashboard: Instructor sees pending request on their dashboard
    Instructor->>Dashboard: Sees notification "1 pending leave request"
    Instructor->>Dashboard: Reviews: Pedro Santos — Medical — Oct 8, 2026
    Instructor->>Dashboard: Clicks "Approve"

    Dashboard->>API: PATCH /api/leave-requests/:id { action: "approved" }

    API->>DB: UPDATE leave_requests SET status = "approved", reviewed_by = instructor_id
    API->>DB: SELECT attendance_log WHERE student_id = X AND DATE(timestamp) = leave_date
    
    alt Attendance log exists (student was marked absent)
        API->>DB: UPDATE attendance_logs SET status = "excused"
        API->>DB: INSERT attendance_overrides { old_status: "absent", new_status: "excused", reason: "Leave approved" }
    else No log exists (student didn't tap at all)
        API->>DB: INSERT attendance_logs { student_id, status: "excused", timestamp: leave_date }
        Note over API: Manual entry — no RFID scan needed
    end

    DB-->>API: All updated ✓
    API-->>Dashboard: "Leave approved — status updated to Excused"
    Dashboard->>Dashboard: Student now shows "Excused" instead of "Absent"
```

---

### 6.4 — Duplicate Scan Guard Detail

```mermaid
sequenceDiagram
    participant ESP32
    participant API as Node.js API
    participant DB as Supabase

    Note over ESP32,API: Student accidentally taps card twice in quick succession

    ESP32->>API: POST /api/scan { uid: "A1B2C3D4", room_id: "xyz" } [1st scan]
    API->>DB: Check last log for this uid + room in last 5 minutes
    DB-->>API: No recent log found
    API->>DB: INSERT attendance_log ✓
    API-->>ESP32: 200 OK { name: "Juan", status: "present" }

    Note over ESP32: Student taps again 30 seconds later...

    ESP32->>API: POST /api/scan { uid: "A1B2C3D4", room_id: "xyz" } [2nd scan]
    API->>DB: Check last log for this uid + room in last 5 minutes
    DB-->>API: Found! Last scan was 30 seconds ago
    
    Note over API: Guard triggered — skip insert
    API-->>ESP32: 409 Conflict { message: "Duplicate scan — already logged", last_scan: "07:32:10" }
    ESP32->>ESP32: LCD: "Already Logged ✓"
    ESP32->>ESP32: Short double-beep (soft warning)

    Note over API: No new row inserted — no duplicate data
```

---

### 6.5 — SMS Notification Concept (Parent View)

```mermaid
sequenceDiagram
    participant API as Node.js API
    participant DB as Supabase
    participant Twilio as Twilio / SMS Gateway
    participant Parent as Parent Phone 📱

    Note over API: This triggers ONLY on first card tap of the day

    API->>DB: is_first_tap_today = true → fetch guardians
    DB-->>API: [{ full_name: "Maria Santos", phone: "+63912XXXXXXX", sms_enabled: true }]

    API->>API: Build SMS message:
    Note over API: "Hi Maria Santos! Your child Juan Dela Cruz<br/>has arrived at school and tapped their ID<br/>at 07:32 AM on October 8, 2026.<br/>- Attendance System"

    API->>Twilio: POST https://api.twilio.com/Messages<br/>{ to: "+63912XXXXXXX", body: "Hi Maria Santos!..." }
    Twilio-->>API: { status: "queued", sid: "SMxxx" }

    API->>DB: INSERT sms_logs { student_id, guardian_id, message, provider_status: "sent", sent_at: now() }

    Twilio-->>Parent: SMS arrives on phone 📱
    Note over Parent: "Hi Maria Santos! Your child Juan Dela Cruz<br/>has arrived at school and tapped their ID<br/>at 07:32 AM on October 8, 2026."

    Note over API,Twilio: If SMS fails:
    Twilio-->>API: { status: "failed", error: "Invalid number" }
    API->>DB: UPDATE sms_logs SET provider_status = "failed"
    Note over API: Log failure — admin can review failed SMS logs on dashboard
```

---

## 7. Full Database Schema (PostgreSQL / Supabase)

```sql
-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE instructors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  role        VARCHAR(20) DEFAULT 'instructor', -- 'instructor' | 'admin'
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  location    VARCHAR(200),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subjects (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(100) NOT NULL,
  code                     VARCHAR(20),
  room_id                  UUID REFERENCES rooms(id),
  instructor_id            UUID REFERENCES instructors(id),
  late_threshold_minutes   INTEGER DEFAULT 15,      -- configurable per subject
  min_attendance_percent   INTEGER DEFAULT 75,      -- for flagging
  school_year              VARCHAR(20),             -- e.g., "2026-2027"
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_uid    VARCHAR(50) UNIQUE NOT NULL,
  student_id  VARCHAR(20) UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  course      VARCHAR(100),
  year_level  INTEGER,
  section     VARCHAR(20),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id  UUID REFERENCES subjects(id) ON DELETE CASCADE,
  day_of_week VARCHAR(10) NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID REFERENCES students(id),
  room_id           UUID REFERENCES rooms(id),
  rfid_uid          VARCHAR(50) NOT NULL,
  timestamp         TIMESTAMPTZ DEFAULT now(),
  status            VARCHAR(20) DEFAULT 'present', -- 'present'|'late'|'excused'|'unknown'
  device_id         VARCHAR(50),
  is_first_tap_today BOOLEAN DEFAULT false,        -- triggers SMS if true
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FEATURE TABLES
-- ============================================================

-- Guardians (for SMS notifications)
CREATE TABLE guardians (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  full_name    VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  relationship VARCHAR(50),                        -- 'Mother', 'Father', 'Guardian'
  sms_enabled  BOOLEAN DEFAULT true,               -- opt-out toggle
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- SMS notification log
CREATE TABLE sms_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES students(id),
  guardian_id      UUID REFERENCES guardians(id),
  message          TEXT NOT NULL,
  provider_status  VARCHAR(20) DEFAULT 'sent',    -- 'sent'|'failed'|'delivered'
  sent_at          TIMESTAMPTZ DEFAULT now()
);

-- Manual attendance corrections (audit trail)
CREATE TABLE attendance_overrides (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id  UUID REFERENCES attendance_logs(id),
  changed_by         UUID REFERENCES instructors(id),
  old_status         VARCHAR(20) NOT NULL,
  new_status         VARCHAR(20) NOT NULL,
  reason             TEXT NOT NULL,               -- required for accountability
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Leave / Excuse requests
CREATE TABLE leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES students(id),
  subject_id   UUID REFERENCES subjects(id),
  leave_date   DATE NOT NULL,
  reason       TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending',     -- 'pending'|'approved'|'rejected'
  reviewed_by  UUID REFERENCES instructors(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES (for performance on large datasets)
-- ============================================================

CREATE INDEX idx_attendance_rfid_uid      ON attendance_logs(rfid_uid);
CREATE INDEX idx_attendance_student_id    ON attendance_logs(student_id);
CREATE INDEX idx_attendance_room_id       ON attendance_logs(room_id);
CREATE INDEX idx_attendance_timestamp     ON attendance_logs(timestamp DESC);
CREATE INDEX idx_leave_requests_student   ON leave_requests(student_id);
CREATE INDEX idx_leave_requests_status    ON leave_requests(status);
CREATE INDEX idx_sms_logs_student         ON sms_logs(student_id);
```

---

## 8. Duplicate Scan Guard — API Logic

> This is **not a table** — it's a check in the Node.js API before inserting a new log.

```javascript
// In POST /api/scan handler

const DUPLICATE_GUARD_MINUTES = 5;

// Check if this UID was already scanned in this room recently
const { data: lastScan } = await supabase
  .from('attendance_logs')
  .select('timestamp')
  .eq('rfid_uid', uid)
  .eq('room_id', room_id)
  .gte('timestamp', new Date(Date.now() - DUPLICATE_GUARD_MINUTES * 60 * 1000).toISOString())
  .order('timestamp', { ascending: false })
  .limit(1)
  .single();

if (lastScan) {
  // Duplicate detected — reject
  return res.status(409).json({
    message: 'Duplicate scan — already logged recently',
    last_scan: lastScan.timestamp
  });
}

// Not a duplicate — proceed with logging...
```

---

## 9. Data Flow Summary (All Features)

```
Student taps card
      │
      ▼
ESP32 reads UID → HTTP POST → Node.js API
      │
      ├─── DUPLICATE GUARD ──── Already scanned < 5 min? → Reject (409)
      │
      ├─── LOOKUP student by rfid_uid
      │
      ├─── CHECK schedule → determine: present / late / unknown
      │
      ├─── FIRST TAP TODAY? 
      │         YES → set is_first_tap_today = true
      │              → Fetch guardian → Send SMS via Twilio
      │              → Log to sms_logs
      │         NO  → Skip SMS
      │
      ├─── INSERT attendance_logs
      │
      └─── Supabase Realtime → Dashboard live update
                │
                ├── Instructor sees real-time feed
                │
                ├── Can OVERRIDE any record → attendance_overrides audit log
                │
                └── Admin can file LEAVE REQUEST → leave_requests
                          │
                          └── Instructor approves → status → "excused"
```

---

*Updated: 2026-10-08 | v3 — Manual Override + Leave Requests + Duplicate Guard + SMS Notification integrated*
