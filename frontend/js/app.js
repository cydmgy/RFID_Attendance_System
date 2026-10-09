// ============================================================
// IoT Attendance System - Multi-Portal Logic (Axios + Bootstrap)
// ============================================================

// Dynamically detect backend port 3000 when running from VS Code Live Server (port 5500/5501)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? 'http://localhost:3000'
  : window.location.origin;

let activePortal = 'login';
let systemConfig = { defaultIotKey: 'your-secret-esp32-api-key-here' };

let rooms = [];
let subjects = [];
let students = [];
let allLogs = [];
let overrideModal = null;

// Target demo student profile
let studentUser = {
  id: '',
  name: 'Clyde Magnaye',
  student_id: '2024-00101',
  rfid: 'E3:4A:9B:1C',
  course: 'BS Information Technology',
  section: '3A',
  year: 3
};

// ── DOM Initialization ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const modalEl = document.getElementById('overrideModal');
  if (modalEl) overrideModal = new bootstrap.Modal(modalEl);

  // Set default dates to today's date in local time YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  const dateInputs = ['inst-analytics-date', 'export-date', 'std-leave-date'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // QoL Feature: Enforce absence date cannot be in the past
  const stdLeaveDateEl = document.getElementById('std-leave-date');
  if (stdLeaveDateEl) {
    stdLeaveDateEl.min = today;
  }

  await loadSystemData();
});

// ── System Data Loader (Axios) ────────────────────────────────

async function loadSystemData() {
  try {
    const [cfgRes, roomsRes, subjRes, stdRes] = await Promise.all([
      axios.get(`${API_BASE}/api/config`).catch(() => ({ data: {} })),
      axios.get(`${API_BASE}/api/rooms`).catch(() => ({ data: { rooms: [] } })),
      axios.get(`${API_BASE}/api/subjects`).catch(() => ({ data: { subjects: [] } })),
      axios.get(`${API_BASE}/api/students`).catch(() => ({ data: { students: [] } }))
    ]);

    systemConfig = { ...systemConfig, ...cfgRes.data };
    rooms = roomsRes.data.rooms || [];
    subjects = subjRes.data.subjects || [];
    students = stdRes.data.students || [];

    // Match Clyde Magnaye
    const matched = students.find(s => s.student_id === '2024-00101' || s.full_name.toLowerCase().includes('clyde'));
    if (matched) {
      studentUser = {
        id: matched.id,
        name: matched.full_name,
        student_id: matched.student_id,
        rfid: matched.rfid_uid,
        course: matched.course || 'BSIT',
        section: matched.section || '3A',
        year: matched.year_level || 3
      };
    }

    populateDropdowns();
  } catch (err) {
    console.error('Data initialization error:', err);
  }
}

function populateDropdowns() {
  // Rooms
  const roomSelects = ['inst-room-filter', 'export-room', 'adm-sim-room'];
  roomSelects.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const isFilter = id !== 'adm-sim-room';
      el.innerHTML = (isFilter ? '<option value="">All Classrooms</option>' : '') +
        rooms.map(r => `<option value="${r.id}">${r.name} (${r.location || 'Room'})</option>`).join('');
    }
  });

  // Subjects
  const subSelect = document.getElementById('std-leave-subject');
  if (subSelect) {
    subSelect.innerHTML = '<option value="">-- Choose Subject --</option>' +
      subjects.map(s => `<option value="${s.id}">${s.code ? s.code + ' - ' : ''}${s.name}</option>`).join('');
  }

  // Quick student select for RFID scanner
  const simQuickSelect = document.getElementById('adm-sim-student-quick');
  if (simQuickSelect) {
    simQuickSelect.innerHTML = '<option value="">-- Choose student or enter custom UID --</option>' +
      students.map(s => `<option value="${s.rfid_uid}">${s.full_name} (${s.student_id}) [${s.rfid_uid}]</option>`).join('');
  }
}

// ── Screen & Tab Navigation ───────────────────────────────────

function loginAs(role) {
  activePortal = role;
  document.getElementById('screen-login').classList.add('d-none');
  document.getElementById('screen-student').classList.add('d-none');
  document.getElementById('screen-instructor').classList.add('d-none');
  document.getElementById('screen-admin').classList.add('d-none');

  if (role === 'student') {
    document.getElementById('screen-student').classList.remove('d-none');
    showStudentTab('overview');
    loadStudentPortalData();
  } else if (role === 'instructor') {
    document.getElementById('screen-instructor').classList.remove('d-none');
    showInstructorTab('analytics');
    loadInstructorAnalytics();
    loadInstructorAttendance();
    loadInstructorLeaves();
    loadExportSheetData();
  } else if (role === 'admin') {
    document.getElementById('screen-admin').classList.remove('d-none');
    showAdminTab('scanner');
    loadAdminStudents();
    loadAdminLogs();
  }
}

function logout() {
  activePortal = 'login';
  document.getElementById('screen-student').classList.add('d-none');
  document.getElementById('screen-instructor').classList.add('d-none');
  document.getElementById('screen-admin').classList.add('d-none');
  document.getElementById('screen-login').classList.remove('d-none');
}

// Student Portal Tabs
function showStudentTab(tab) {
  ['overview', 'logs', 'leave'].forEach(t => {
    document.getElementById(`std-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-std-${t}`)?.classList.toggle('active', t !== tab);
  });
}

// Instructor Portal Tabs
function showInstructorTab(tab) {
  ['analytics', 'attendance', 'export', 'leaves'].forEach(t => {
    document.getElementById(`inst-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-inst-${t}`)?.classList.toggle('active', t !== tab);
  });
  if (tab === 'analytics') loadInstructorAnalytics();
  if (tab === 'attendance') loadInstructorAttendance();
  if (tab === 'export') loadExportSheetData();
  if (tab === 'leaves') loadInstructorLeaves();
}

// Admin Portal Tabs
function showAdminTab(tab) {
  ['scanner', 'students', 'logs'].forEach(t => {
    document.getElementById(`adm-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-adm-${t}`)?.classList.toggle('active', t !== tab);
  });
  if (tab === 'students') loadAdminStudents();
  if (tab === 'logs') loadAdminLogs();
}

function notify(target, message, type = 'success') {
  const container = document.getElementById(`${target}-alert-box`);
  if (!container) return;
  const icon = type === 'success' ? 'check-circle' : type === 'warning' ? 'triangle-exclamation' : 'circle-exclamation';
  container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show shadow-sm" role="alert">
      <i class="fas fa-${icon} me-2"></i> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  setTimeout(() => { container.innerHTML = ''; }, 4500);
}

// ============================================================
// STUDENT PORTAL LOGIC
// ============================================================

async function loadStudentPortalData() {
  // Update Profile Info
  document.getElementById('student-nav-name').textContent = `${studentUser.name} (${studentUser.section})`;
  document.getElementById('std-card-name').textContent = studentUser.name;
  document.getElementById('std-card-id').textContent = studentUser.student_id;
  document.getElementById('std-card-course').textContent = `${studentUser.course} - Year ${studentUser.year} (${studentUser.section})`;
  document.getElementById('std-card-rfid').textContent = studentUser.rfid;

  try {
    const res = await axios.get(`${API_BASE}/api/attendance`);
    allLogs = res.data.logs || [];

    // Filter logs for this student
    const studentLogs = allLogs.filter(l => l.students && (l.students.id === studentUser.id || l.rfid_uid === studentUser.rfid));
    
    // QoL feature: Absent count for Student dashboard
    const presentCount = studentLogs.filter(l => l.status === 'present').length;
    const lateCount = studentLogs.filter(l => l.status === 'late').length;
    const absentCount = studentLogs.filter(l => l.status === 'absent' || l.status === 'excused').length;
    const totalDays = studentLogs.length;

    document.getElementById('std-stat-total').textContent = totalDays;
    document.getElementById('std-stat-present').textContent = presentCount;
    document.getElementById('std-stat-absent').textContent = absentCount;
    
    const rate = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 100;
    document.getElementById('std-stat-rate').textContent = `${rate}%`;

    // Render Logs Table
    const tbody = document.getElementById('std-logs-table-body');
    if (studentLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No attendance logs found for your RFID card.</td></tr>`;
    } else {
      tbody.innerHTML = studentLogs.map(l => {
        const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const roomName = l.rooms?.name || 'Classroom';
        const badgeClass = `badge-status-${l.status || 'unknown'}`;
        return `
          <tr>
            <td><strong>${date}</strong> at ${time}</td>
            <td><i class="fas fa-door-open text-success me-1"></i> ${escapeHtml(roomName)}</td>
            <td><span class="badge ${badgeClass} text-uppercase">${escapeHtml(l.status)}</span></td>
            <td><code>${escapeHtml(l.rfid_uid)}</code></td>
          </tr>
        `;
      }).join('');
    }

    // Load leave requests
    loadStudentLeaveHistory();
  } catch (err) {
    console.error('Error fetching student logs', err);
  }
}

async function loadStudentLeaveHistory() {
  const tbody = document.getElementById('std-leaves-status-tbody');
  try {
    const res = await axios.get(`${API_BASE}/api/leave?student_id=${studentUser.id}`);
    const leaves = res.data.leave_requests || [];

    if (leaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-muted">You have not submitted any excuse requests yet.</td></tr>`;
    } else {
      tbody.innerHTML = leaves.map(lv => {
        const badgeClass = lv.status === 'approved' ? 'bg-success' : lv.status === 'rejected' ? 'bg-danger' : 'bg-warning text-dark';
        return `
          <tr>
            <td><strong>${escapeHtml(lv.subjects?.name || 'Subject')}</strong></td>
            <td>${escapeHtml(lv.leave_date)}</td>
            <td class="text-truncate" style="max-width: 250px;">${escapeHtml(lv.reason)}</td>
            <td><span class="badge ${badgeClass} text-uppercase">${escapeHtml(lv.status)}</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitStudentLeave(e) {
  e.preventDefault();
  const subjectId = document.getElementById('std-leave-subject').value;
  const leaveDate = document.getElementById('std-leave-date').value;
  const reason = document.getElementById('std-leave-reason').value.trim();

  // QoL check: ensure date cannot be before today
  const today = new Date().toISOString().split('T')[0];
  if (leaveDate < today) {
    notify('student', 'Absence date cannot be before today.', 'danger');
    return;
  }

  try {
    await axios.post(`${API_BASE}/api/leave`, {
      student_id: studentUser.id,
      subject_id: subjectId,
      leave_date: leaveDate,
      reason: reason
    });

    notify('student', `Leave request filed successfully for ${leaveDate}!`, 'success');
    e.target.reset();
    document.getElementById('std-leave-date').value = today;
    document.getElementById('std-leave-date').min = today;
    await loadStudentLeaveHistory();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    notify('student', `Failed to submit leave: ${msg}`, 'danger');
  }
}

// ============================================================
// INSTRUCTOR PORTAL LOGIC
// ============================================================

// QoL feature: Analytics for Instructors for the day (e.g. 28/30 students)
async function loadInstructorAnalytics() {
  const dateVal = document.getElementById('inst-analytics-date')?.value || new Date().toISOString().split('T')[0];

  try {
    const res = await axios.get(`${API_BASE}/api/attendance/daily?date=${dateVal}`);
    const summary = res.data.summary || {};

    const enrolled = summary.enrolled || students.length || 0;
    const present = summary.present || 0;
    const late = summary.late || 0;
    const absent = summary.absent || 0;
    const attendanceRate = summary.attendance_rate || 0;

    // Display 28 / 30 Students Present (93%)
    const totalPresent = present + late;
    document.getElementById('inst-ratio-text').textContent = `${totalPresent} / ${enrolled} Students Present`;
    document.getElementById('inst-ratio-sub').textContent = `${attendanceRate}% classroom attendance rate for ${dateVal}`;

    const progressBar = document.getElementById('inst-ratio-bar');
    if (progressBar) {
      progressBar.style.width = `${attendanceRate}%`;
      progressBar.textContent = `${attendanceRate}%`;
    }

    document.getElementById('inst-stat-enrolled').textContent = enrolled;
    document.getElementById('inst-stat-present').textContent = present;
    document.getElementById('inst-stat-late').textContent = late;
    document.getElementById('inst-stat-absent').textContent = absent;
  } catch (err) {
    console.error('Error loading instructor analytics', err);
  }
}

async function loadInstructorAttendance() {
  const roomFilter = document.getElementById('inst-room-filter')?.value;
  const tbody = document.getElementById('inst-attendance-tbody');

  try {
    let url = `${API_BASE}/api/attendance`;
    if (roomFilter) url += `?room_id=${encodeURIComponent(roomFilter)}`;

    const res = await axios.get(url);
    const logs = res.data.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No attendance scans recorded for this room.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const student = l.students;
      const studentName = student ? escapeHtml(student.full_name) : `<span class="text-muted">Unregistered (${escapeHtml(l.rfid_uid)})</span>`;
      const studentId = student ? escapeHtml(student.student_id) : '—';
      const roomName = l.rooms?.name || 'Classroom';
      const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const badgeClass = `badge-status-${l.status || 'unknown'}`;

      return `
        <tr>
          <td><strong>${studentName}</strong></td>
          <td><code>${studentId}</code></td>
          <td>${escapeHtml(roomName)}</td>
          <td><span class="badge ${badgeClass} text-uppercase">${escapeHtml(l.status)}</span></td>
          <td class="small text-muted">${date} ${time}</td>
          <td class="text-end">
            <button class="btn btn-outline-primary btn-sm" onclick="openOverrideModal('${l.id}', '${student ? escapeHtml(student.full_name) : 'Unknown'}', '${l.status}')">
              <i class="fas fa-edit me-1"></i> Override
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Failed to load attendance stream</td></tr>`;
  }
}

// QoL feature: Export to attendance sheets on that specific day
async function loadExportSheetData() {
  const dateVal = document.getElementById('export-date')?.value || new Date().toISOString().split('T')[0];
  const roomVal = document.getElementById('export-room')?.value;
  const tbody = document.getElementById('export-sheet-tbody');

  document.getElementById('export-sheet-target-date').textContent = dateVal;
  document.getElementById('export-sheet-gen-date').textContent = new Date().toLocaleString();

  try {
    let url = `${API_BASE}/api/attendance/daily?date=${dateVal}`;
    if (roomVal) url += `&room_id=${encodeURIComponent(roomVal)}`;

    const res = await axios.get(url);
    const logs = res.data.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No attendance records found for ${dateVal}.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map((l, index) => {
      const student = l.students;
      const studentName = student ? escapeHtml(student.full_name) : 'Unregistered Card';
      const studentId = student ? escapeHtml(student.student_id) : '—';
      const section = student?.section ? `${student.course || 'IT'} ${student.section}` : '—';
      const room = l.rooms?.name || 'Classroom';
      const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <tr>
          <td>${index + 1}</td>
          <td><code>${studentId}</code></td>
          <td class="fw-semibold">${studentName}</td>
          <td>${escapeHtml(section)}</td>
          <td>${escapeHtml(room)}</td>
          <td><span class="badge badge-status-${l.status} text-uppercase">${escapeHtml(l.status)}</span></td>
          <td>${time}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Failed to generate export sheet</td></tr>`;
  }
}

// CSV Exporter for instructor attendance sheets
async function downloadAttendanceCSV() {
  const dateVal = document.getElementById('export-date')?.value || new Date().toISOString().split('T')[0];
  const roomVal = document.getElementById('export-room')?.value;

  try {
    let url = `${API_BASE}/api/attendance/daily?date=${dateVal}`;
    if (roomVal) url += `&room_id=${encodeURIComponent(roomVal)}`;

    const res = await axios.get(url);
    const logs = res.data.logs || [];

    if (logs.length === 0) {
      alert(`No records found for ${dateVal} to export.`);
      return;
    }

    let csvContent = 'Number,StudentID,FullName,CourseSection,Room,Status,Time\n';
    logs.forEach((l, i) => {
      const s = l.students;
      const num = i + 1;
      const id = s ? s.student_id : 'N/A';
      const name = s ? `"${s.full_name}"` : '"Unknown"';
      const sec = s ? `"${s.section || ''}"` : '""';
      const rm = l.rooms ? `"${l.rooms.name}"` : '"Room"';
      const st = l.status;
      const tm = new Date(l.timestamp).toLocaleTimeString();
      csvContent += `${num},${id},${name},${sec},${rm},${st},${tm}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_sheet_${dateVal}.csv`;
    link.click();
  } catch (err) {
    alert('Export error: ' + err.message);
  }
}

function printAttendanceSheet() {
  window.print();
}

// Instructor Leave Queue
async function loadInstructorLeaves() {
  const container = document.getElementById('inst-leaves-list');
  try {
    const res = await axios.get(`${API_BASE}/api/leave?status=pending`);
    const leaves = res.data.leave_requests || [];

    if (leaves.length === 0) {
      container.innerHTML = `<div class="p-4 text-center text-muted small"><i class="fas fa-check-circle text-success fs-3 d-block mb-2"></i>No pending excuse requests right now.</div>`;
      return;
    }

    container.innerHTML = leaves.map(lv => `
      <div class="list-group-item p-3">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <strong class="text-dark">${escapeHtml(lv.students?.full_name || 'Student')}</strong>
          <span class="badge bg-warning text-dark">${escapeHtml(lv.leave_date)}</span>
        </div>
        <p class="small text-muted mb-1">Subject: <strong>${escapeHtml(lv.subjects?.name || 'Class')}</strong></p>
        <p class="small fst-italic p-2 bg-light rounded text-secondary mb-2">"${escapeHtml(lv.reason)}"</p>
        <div class="d-flex gap-2">
          <button class="btn btn-success btn-sm flex-fill fw-bold" onclick="resolveInstructorLeave('${lv.id}', 'approved')">
            <i class="fas fa-check me-1"></i> Approve
          </button>
          <button class="btn btn-outline-danger btn-sm flex-fill fw-bold" onclick="resolveInstructorLeave('${lv.id}', 'rejected')">
            <i class="fas fa-xmark me-1"></i> Reject
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="p-3 text-center text-danger">Failed to load leave requests</div>`;
  }
}

async function resolveInstructorLeave(id, action) {
  try {
    await axios.patch(`${API_BASE}/api/leave/${id}`, { action });
    notify('instructor', `Leave request marked as ${action.toUpperCase()}!`, 'success');
    await loadInstructorLeaves();
  } catch (err) {
    notify('instructor', `Error resolving leave: ${err.message}`, 'danger');
  }
}

// QoL Bugfix: Present to absent override
function openOverrideModal(logId, studentName, currentStatus) {
  document.getElementById('override-log-id').value = logId;
  document.getElementById('override-student-name').value = studentName;
  document.getElementById('override-status').value = currentStatus || 'present';
  document.getElementById('override-reason').value = '';
  overrideModal.show();
}

async function submitInstructorOverride(e) {
  e.preventDefault();
  const logId = document.getElementById('override-log-id').value;
  const newStatus = document.getElementById('override-status').value;
  const reason = document.getElementById('override-reason').value.trim();

  try {
    await axios.patch(`${API_BASE}/api/override/${logId}`, {
      new_status: newStatus,
      reason: reason
    });

    notify('instructor', `Attendance status updated to ${newStatus.toUpperCase()}!`, 'success');
    overrideModal.hide();
    await loadInstructorAttendance();
    await loadInstructorAnalytics();
    await loadExportSheetData();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    notify('instructor', `Override failed: ${msg}`, 'danger');
  }
}

// ============================================================
// ADMINISTRATOR PORTAL LOGIC
// ============================================================

// Virtual Door RFID Scanner Simulator
async function handleAdminSimScan(e) {
  e.preventDefault();
  const roomId = document.getElementById('adm-sim-room').value;
  const uid = document.getElementById('adm-sim-uid').value.trim();
  const lcd1 = document.getElementById('adm-lcd-1');
  const lcd2 = document.getElementById('adm-lcd-2');
  const btn = document.getElementById('adm-sim-btn');

  if (!uid || !roomId) {
    notify('admin', 'Select room and enter RFID UID', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin me-1"></i> Transmitting...`;
  lcd1.textContent = 'Transmitting Tap...';
  lcd2.textContent = `UID: ${uid}`;

  try {
    const res = await axios.post(`${API_BASE}/api/scan`, {
      uid: uid,
      room_id: roomId,
      device_id: 'ESP32-DOOR-01'
    }, {
      headers: { 'x-api-key': systemConfig.defaultIotKey }
    });

    const data = res.data;
    const name = data.student_name ? data.student_name.slice(0, 16) : 'Unknown Card';
    lcd1.textContent = name;
    lcd2.textContent = `✓ STATUS: ${data.status.toUpperCase()}`;
    notify('admin', `Scan logged: ${name} (${data.status.toUpperCase()})`, 'success');

    await loadAdminLogs();
  } catch (err) {
    if (err.response?.status === 409) {
      // Duplicate guard
      lcd1.textContent = 'DUPLICATE SCAN';
      lcd2.textContent = 'Already Logged!';
      notify('admin', 'Duplicate Guard: Student already tapped within 5 minutes', 'warning');
    } else {
      lcd1.textContent = 'SCAN ERROR';
      lcd2.textContent = err.response?.data?.error || 'Server Error';
      notify('admin', `Scan error: ${err.message}`, 'danger');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-wifi me-1"></i> Simulate RFID Tap`;
    setTimeout(() => {
      lcd1.textContent = 'Ready to Scan...';
      lcd2.textContent = 'Please tap card';
    }, 4500);
  }
}

function onAdminQuickStudent(uid) {
  if (uid) document.getElementById('adm-sim-uid').value = uid;
}

// Student Enrollment
async function handleAdminEnroll(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('adm-reg-name').value.trim(),
    student_id: document.getElementById('adm-reg-id').value.trim(),
    rfid_uid: document.getElementById('adm-reg-rfid').value.trim().toUpperCase(),
    course: document.getElementById('adm-reg-course').value.trim(),
    year_level: parseInt(document.getElementById('adm-reg-year').value) || 1,
    section: document.getElementById('adm-reg-sec').value.trim()
  };

  try {
    await axios.post(`${API_BASE}/api/students`, payload);
    notify('admin', `Enrolled ${payload.full_name} successfully!`, 'success');
    e.target.reset();
    await loadSystemData();
    await loadAdminStudents();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    notify('admin', `Enrollment failed: ${msg}`, 'danger');
  }
}

async function loadAdminStudents() {
  const tbody = document.getElementById('adm-students-tbody');
  try {
    const res = await axios.get(`${API_BASE}/api/students`);
    students = res.data.students || [];

    document.getElementById('adm-student-count').textContent = students.length;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No students enrolled yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr>
        <td class="fw-bold">${escapeHtml(s.full_name)}</td>
        <td><code>${escapeHtml(s.student_id)}</code></td>
        <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(s.rfid_uid)}</span></td>
        <td>${escapeHtml(s.course || '—')} (${escapeHtml(s.section || '—')})</td>
        <td class="text-end">
          <button class="btn btn-outline-danger btn-sm" onclick="handleAdminDeleteStudent('${s.id}', '${escapeHtml(s.full_name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleAdminDeleteStudent(id, name) {
  if (!confirm(`Delete student record for ${name}?`)) return;
  try {
    await axios.delete(`${API_BASE}/api/students/${id}`);
    notify('admin', `Removed student ${name}`, 'warning');
    await loadSystemData();
    await loadAdminStudents();
  } catch (err) {
    notify('admin', `Delete failed: ${err.message}`, 'danger');
  }
}

async function loadAdminLogs() {
  const tbody = document.getElementById('adm-logs-tbody');
  try {
    const res = await axios.get(`${API_BASE}/api/attendance`);
    const logs = res.data.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No attendance logs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const student = l.students;
      const name = student ? escapeHtml(student.full_name) : `<span class="text-muted">Unregistered (${escapeHtml(l.rfid_uid)})</span>`;
      const id = student ? escapeHtml(student.student_id) : '—';
      const room = l.rooms?.name || 'Classroom';
      const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const badgeClass = `badge-status-${l.status || 'unknown'}`;

      return `
        <tr>
          <td><strong>${name}</strong></td>
          <td><code>${id}</code></td>
          <td>${escapeHtml(room)}</td>
          <td><span class="badge ${badgeClass} text-uppercase">${escapeHtml(l.status)}</span></td>
          <td class="small text-muted">${date} ${time}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function seedSampleStudents() {
  const samples = [
    { full_name: 'Clyde Magnaye', student_id: '2024-00101', rfid_uid: 'E3:4A:9B:1C', course: 'BSIT', year_level: 3, section: '3A' },
    { full_name: 'Maria Santos', student_id: '2024-00102', rfid_uid: 'A1:F2:78:33', course: 'BSCS', year_level: 3, section: '3A' },
    { full_name: 'Juan Dela Cruz', student_id: '2024-00103', rfid_uid: '90:BC:44:EE', course: 'BSIT', year_level: 2, section: '2B' }
  ];

  for (const s of samples) {
    try { await axios.post(`${API_BASE}/api/students`, s); } catch (e) {}
  }

  notify('admin', 'Sample students seeded into Supabase!', 'success');
  await loadSystemData();
  await loadAdminStudents();
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
