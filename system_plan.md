# IoT-Based Attendance Monitoring System
## with Centralized Web Analytics
### Full System Plan & Architecture Document

---

## 1. Project Overview

**System Name:** IoT-Based Attendance Monitoring System with Centralized Web Analytics  
**Objective:** A door-mounted RFID scanning system that transmits student entry logs over Wi-Fi to a centralized web application. The system records attendance timestamps, identifies frequently absent students, and generates reports. A live dashboard lets instructors and admins monitor classroom attendance in real time.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   IoT Hardware Layer                │
│                                                     │
│   [RFID RC522] ──── [ESP32] ──── [I2C LCD 16x2]    │
│                        │                            │
│              Wi-Fi HTTP POST                        │
└────────────────────────┼────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  Cloud / Backend Layer              │
│                                                     │
│   [Node.js + Express API]  ◄──►  [Supabase]        │
│         │                         │                 │
│      REST API               PostgreSQL DB           │
│         │                   + Auth                  │
│         │                   + Realtime              │
└─────────┼───────────────────────┼───────────────────┘
          │                       │
          ▼                       ▼ (WebSocket)
┌─────────────────────────────────────────────────────┐
│                  Frontend Layer                     │
│                                                     │
│   [HTML + CSS + Vanilla JS Dashboard]               │
│   • Live attendance feed                            │
│   • Charts & Reports                                │
│   • Student Management                              │
│   • Admin Panel                                     │
└─────────────────────────────────────────────────────┘
```

---

## 3. Full Tech Stack

| Layer | Technology | Hosting | Notes |
|---|---|---|---|
| **IoT Microcontroller** | ESP32 | Physical device | Built-in Wi-Fi + BLE |
| **RFID Module** | RC522 (SPI) | On ESP32 | 13.56 MHz, reads MIFARE cards |
| **Display** | 16x2 I2C LCD | On ESP32 | Uses PCF8574 I2C expander |
| **Firmware** | Arduino C++ | Flashed to ESP32 | Arduino IDE or PlatformIO |
| **Backend API** | Node.js + Express.js | Railway or Render | REST API endpoints |
| **Database** | PostgreSQL via Supabase | Supabase Cloud | Free tier available |
| **Auth** | Supabase Auth | Supabase Cloud | Email/password for instructors |
| **Realtime** | Supabase Realtime | Supabase Cloud | WebSocket live updates |
| **Frontend** | HTML + CSS + JS | Vercel | Static files |
| **Charts** | Chart.js | CDN | Free, lightweight |

---

## 4. Hardware Components

### Per Classroom Node (ESP32 Unit)
| Component | Model | Quantity | Notes |
|---|---|---|---|
| Microcontroller | ESP32 DevKit v1 | 1 | 30-pin or 38-pin |
| RFID Reader | RC522 | 1 | SPI connection |
| LCD Display | 16x2 with I2C | 1 | PCF8574 backpack |
| Buzzer | Passive/Active | 1 | Tap feedback |
| LED (optional) | Green/Red | 2 | Success/failure feedback |
| Power Supply | 5V USB / Power Bank | 1 | Wall adapter or USB |
| Jumper Wires | — | ~20 | For breadboard |
| Breadboard | — | 1 | Prototyping |

### ESP32 ↔ RC522 Wiring (SPI)
```
RC522 Pin  →  ESP32 Pin
SDA (SS)   →  GPIO 5
SCK        →  GPIO 18
MOSI       →  GPIO 23
MISO       →  GPIO 19
IRQ        →  (not connected)
GND        →  GND
RST        →  GPIO 22
3.3V       →  3.3V
```

### ESP32 ↔ LCD Wiring (I2C)
```
LCD Pin  →  ESP32 Pin
VCC      →  5V (VIN)
GND      →  GND
SDA      →  GPIO 21
SCL      →  GPIO 22
```

> ⚠️ Note: RST for RC522 and SCL for LCD both use GPIO 22 — use a different pin (e.g., GPIO 4) for RC522 RST in practice.

---

## 5. Database Schema (Supabase / PostgreSQL)

### Tables

#### `students`
```sql
CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_uid    VARCHAR(50) UNIQUE NOT NULL,  -- UID from the RFID card
  student_id  VARCHAR(20) UNIQUE NOT NULL,  -- School ID number
  full_name   VARCHAR(100) NOT NULL,
  course      VARCHAR(100),
  year_level  INTEGER,
  section     VARCHAR(20),
  email       VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `rooms`
```sql
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,         -- e.g., "Room 101"
  location    VARCHAR(200),                  -- e.g., "Building A, Floor 1"
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `subjects`
```sql
CREATE TABLE subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20),
  instructor  VARCHAR(100),
  room_id     UUID REFERENCES rooms(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `schedules`
```sql
CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id),
  subject_id  UUID REFERENCES subjects(id),
  day_of_week VARCHAR(10),                   -- 'Monday', 'Tuesday', etc.
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `attendance_logs` (Core Table)
```sql
CREATE TABLE attendance_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id),
  room_id     UUID REFERENCES rooms(id),
  rfid_uid    VARCHAR(50) NOT NULL,          -- Raw UID for fallback
  timestamp   TIMESTAMPTZ DEFAULT now(),
  status      VARCHAR(20) DEFAULT 'present', -- 'present', 'late', 'absent'
  device_id   VARCHAR(50),                   -- Which ESP32 node
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `instructors` (separate from Supabase Auth)
```sql
CREATE TABLE instructors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,                   -- Links to Supabase Auth user
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  role        VARCHAR(20) DEFAULT 'instructor', -- 'instructor' | 'admin'
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### Entity Relationship Diagram
```
students ──< schedules >── subjects ──> rooms
    │                                     │
    └──────────< attendance_logs >────────┘
```

---

## 6. API Endpoints (Node.js + Express)

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Instructor/admin login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### IoT Endpoints (used by ESP32)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/scan` | Log an RFID scan (main ESP32 endpoint) |
| GET | `/api/device/ping` | Health check from ESP32 |

### Students
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/students` | List all students |
| POST | `/api/students` | Register a new student |
| GET | `/api/students/:id` | Get student details |
| PUT | `/api/students/:id` | Update student info |
| DELETE | `/api/students/:id` | Remove student |

### Attendance
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/attendance` | Get all logs (filterable) |
| GET | `/api/attendance/daily` | Daily report |
| GET | `/api/attendance/weekly` | Weekly report |
| GET | `/api/attendance/monthly` | Monthly report |
| GET | `/api/attendance/absentees` | Frequently absent students |
| GET | `/api/attendance/live` | Live attendance for a room |

### Rooms & Subjects
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rooms` | List all rooms |
| POST | `/api/rooms` | Add a room |
| GET | `/api/subjects` | List subjects |
| POST | `/api/subjects` | Add a subject |

---

## 7. ESP32 Firmware Logic (Pseudocode)

```
SETUP:
  1. Connect to Wi-Fi (SSID + Password stored in config)
  2. Initialize RC522 RFID reader
  3. Initialize I2C LCD
  4. Display "Ready to Scan" on LCD
  5. Wait for card...

LOOP:
  1. Poll RC522 for new card
  2. IF card detected:
     a. Read UID (e.g., "A1B2C3D4")
     b. Display "Scanning..." on LCD
     c. Send HTTP POST to: https://your-api.railway.app/api/scan
        Body: { uid: "A1B2C3D4", room: "room-uuid", device_id: "ESP32-01" }
     d. Wait for response (timeout: 5 seconds)
     e. IF success: Display student name + "✓ Present" on LCD, beep once
     f. IF not found: Display "Unknown Card" on LCD, beep twice
     g. IF error: Display "Server Error" on LCD
  3. Wait 2 seconds before next scan
  4. Return to "Ready to Scan"
```

---

## 8. Frontend Dashboard Pages

### Page 1: Login
- Email/password login for instructors and admins

### Page 2: Live Dashboard
- **Real-time attendance feed** (new entries appear instantly via Supabase Realtime)
- **Room selector** dropdown
- **Student count** present vs. total
- **Recent scans** list with avatar, name, time

### Page 3: Reports
- **Daily view:** Who was present/absent today per subject
- **Weekly view:** Attendance trend chart (Chart.js bar chart)
- **Monthly view:** Heatmap or calendar view of attendance
- **Export to CSV** button

### Page 4: Absent Alerts
- List of students below attendance threshold (e.g., <75%)
- Configurable threshold per subject
- Email notification trigger (optional)

### Page 5: Student Management
- Table of all students
- **Register RFID** — tap card to enroll new student
- Search/filter by name, course, year

### Page 6: Room & Subject Management
- Add/edit rooms
- Add/edit subjects and assign instructors

### Page 7: Admin Panel
- Manage instructor accounts
- System settings (attendance thresholds, school year, etc.)

---

## 9. Security Considerations

| Concern | Solution |
|---|---|
| ESP32 API Authentication | API key in request header (stored in ESP32 firmware) |
| Dashboard Auth | Supabase Auth (JWT tokens) |
| Database Access | Row Level Security (RLS) in Supabase |
| HTTPS | All traffic over HTTPS (Railway/Vercel enforce this) |
| Rate Limiting | Express rate-limiter on `/api/scan` endpoint |
| UID Spoofing | Whitelist-only — unregistered UIDs are logged but flagged |

---

## 10. Development Phases & Milestones

### Phase 1 — Database & Backend (Week 1-2)
- [ ] Create Supabase project
- [ ] Run schema SQL (create all tables)
- [ ] Set up Row Level Security policies
- [ ] Initialize Node.js + Express project
- [ ] Build `/api/scan` endpoint (core IoT endpoint)
- [ ] Build student CRUD endpoints
- [ ] Build attendance report endpoints
- [ ] Deploy backend to Railway

### Phase 2 — Frontend Dashboard (Week 2-3)
- [ ] Create HTML/CSS layout with navigation
- [ ] Build Login page with Supabase Auth
- [ ] Build Live Dashboard with Realtime feed
- [ ] Build Reports page with Chart.js
- [ ] Build Student Management page
- [ ] Deploy frontend to Vercel

### Phase 3 — ESP32 Firmware (Week 3-4)
- [ ] Install Arduino libraries (MFRC522, LiquidCrystal_I2C, HTTPClient)
- [ ] Wire RC522 and LCD to ESP32
- [ ] Write Wi-Fi connection code
- [ ] Write RFID scan + HTTP POST code
- [ ] Write LCD display response code
- [ ] Test end-to-end with live backend

### Phase 4 — Integration & Testing (Week 4-5)
- [ ] Full end-to-end test (tap card → dashboard updates)
- [ ] Test with multiple ESP32 nodes
- [ ] Test report generation
- [ ] Stress test with multiple concurrent scans
- [ ] Fix bugs and edge cases

### Phase 5 — Polish & Deployment (Week 5-6)
- [ ] Responsive design for mobile/tablet
- [ ] Student enrollment flow (scan card to register)
- [ ] Absent threshold alerts
- [ ] Documentation / User manual
- [ ] Final demo

---

## 11. Libraries & Dependencies

### Node.js Backend
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.0.0",
    "dotenv": "^16.0.0",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0"
  }
}
```

### Frontend (via CDN)
```html
<!-- Supabase JS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<!-- Chart.js for graphs -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Font Awesome for icons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
```

### ESP32 Arduino Libraries
```
MFRC522       — by GithubCommunity (RFID reader)
LiquidCrystal_I2C — by Frank de Brabander (LCD)
WiFi          — built-in ESP32
HTTPClient    — built-in ESP32
ArduinoJson   — by Benoit Blanchon (JSON parsing)
```

---

## 12. Estimated Costs

| Item | Cost |
|---|---|
| Supabase (Free tier) | $0/month |
| Railway (Hobby plan) | $5/month or free with sleep |
| Vercel (Free tier) | $0/month |
| ESP32 DevKit | ~$3-8 USD per unit |
| RC522 RFID Module | ~$1-3 USD per unit |
| LCD 16x2 I2C | ~$1-3 USD per unit |
| RFID cards/tags | ~$0.20-0.50 USD each |

> **Total per classroom node (hardware only): ~$5-14 USD**

---

*Document generated: 2026-10-08*
*System: IoT-Based Attendance Monitoring System with Centralized Web Analytics*
