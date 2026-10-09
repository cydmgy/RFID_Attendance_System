// ============================================================
// INSTRUCTOR PORTAL LOGIC
// ============================================================

function initInstructorPortal() {
  const modalEl = document.getElementById('overrideModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    overrideModal = new bootstrap.Modal(modalEl);
  }

  const today = new Date().toISOString().split('T')[0];
  const dateInputs = ['inst-analytics-date', 'export-date'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Populate Room dropdowns
  const roomSelects = ['inst-room-filter', 'export-room'];
  roomSelects.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<option value="">All Classrooms</option>' +
        rooms.map(r => `<option value="${r.id}">${r.name} (${r.location || 'Room'})</option>`).join('');
    }
  });

  showInstructorTab('analytics');
}

// Instructor Portal Tabs
function showInstructorTab(tab) {
  ['analytics', 'attendance', 'export', 'leaves'].forEach(t => {
    document.getElementById(`inst-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-inst-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'analytics') loadInstructorAnalytics();
  if (tab === 'attendance') loadInstructorAttendance();
  if (tab === 'export') loadExportSheetData();
  if (tab === 'leaves') loadInstructorLeaves();
}

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
    const ratioText = document.getElementById('inst-ratio-text');
    if (ratioText) ratioText.textContent = `${totalPresent} / ${enrolled} Students Present`;

    const ratioSub = document.getElementById('inst-ratio-sub');
    if (ratioSub) ratioSub.textContent = `${attendanceRate}% classroom attendance rate for ${dateVal}`;

    const progressBar = document.getElementById('inst-ratio-bar');
    if (progressBar) {
      progressBar.style.width = `${attendanceRate}%`;
      progressBar.textContent = `${attendanceRate}%`;
    }

    const statEnrolled = document.getElementById('inst-stat-enrolled');
    if (statEnrolled) statEnrolled.textContent = enrolled;

    const statPresent = document.getElementById('inst-stat-present');
    if (statPresent) statPresent.textContent = present;

    const statLate = document.getElementById('inst-stat-late');
    if (statLate) statLate.textContent = late;

    const statAbsent = document.getElementById('inst-stat-absent');
    if (statAbsent) statAbsent.textContent = absent;
  } catch (err) {
    console.error('Error loading instructor analytics', err);
  }
}

async function loadInstructorAttendance() {
  const roomFilter = document.getElementById('inst-room-filter')?.value;
  const tbody = document.getElementById('inst-attendance-tbody');
  if (!tbody) return;

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
  if (!tbody) return;

  const targetDateEl = document.getElementById('export-sheet-target-date');
  if (targetDateEl) targetDateEl.textContent = dateVal;

  const genDateEl = document.getElementById('export-sheet-gen-date');
  if (genDateEl) genDateEl.textContent = new Date().toLocaleString();

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
  if (!container) return;

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
  if (overrideModal) overrideModal.show();
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
    if (overrideModal) overrideModal.hide();
    await loadInstructorAttendance();
    await loadInstructorAnalytics();
    await loadExportSheetData();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    notify('instructor', `Override failed: ${msg}`, 'danger');
  }
}
