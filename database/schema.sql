-- ============================================================
-- IoT Attendance Monitoring System — Fixed Full Schema
-- ============================================================

-- 1. INSTRUCTORS
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

-- 3. SUBJECTS
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

-- 5. GUARDIANS
CREATE TABLE IF NOT EXISTS guardians (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  full_name    VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  relationship VARCHAR(50),
  sms_enabled  BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 6. SCHEDULES
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

-- 7. ATTENDANCE LOGS
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID REFERENCES students(id) ON DELETE SET NULL,
  room_id            UUID REFERENCES rooms(id) ON DELETE SET NULL,
  rfid_uid           VARCHAR(50) NOT NULL,
  timestamp          TIMESTAMPTZ DEFAULT now(),
  status             VARCHAR(20) DEFAULT 'present'
                       CHECK (status IN ('present', 'late', 'absent', 'excused', 'unknown')),
  device_id          VARCHAR(50),
  is_first_tap_today BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 8. ATTENDANCE OVERRIDES
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
-- INDEXES (Fixed)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_attendance_rfid       ON attendance_logs(rfid_uid);
CREATE INDEX IF NOT EXISTS idx_attendance_student    ON attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_room       ON attendance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp  ON attendance_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_student     ON schedules(student_id);
CREATE INDEX IF NOT EXISTS idx_schedules_subject     ON schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_leave_student         ON leave_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_status          ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_sms_student           ON sms_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student     ON guardians(student_id);

-- Optional: Expression index fixed using timezone casting if explicit date filtering index is needed:
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance_logs (( (timestamp AT TIME ZONE 'UTC')::date ));

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO rooms (name, location) VALUES
  ('Room 101', 'Building A, Floor 1'),
  ('Room 202', 'Building B, Floor 2'),
  ('Laboratory 1', 'Building C, Ground Floor')
ON CONFLICT DO NOTHING;