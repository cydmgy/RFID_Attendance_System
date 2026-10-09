// ============================================================
// ADMINISTRATOR PORTAL LOGIC
// ============================================================

function initAdminPortal() {
  // Populate Room select for Virtual Scanner
  const roomSelect = document.getElementById('adm-sim-room');
  if (roomSelect) {
    roomSelect.innerHTML = '<option value="">Choose Classroom Door Node</option>' +
      rooms.map(r => `<option value="${r.id}">${r.name} (${r.location || 'Room'})</option>`).join('');
  }

  // Populate Quick student select for virtual scanner
  const simQuickSelect = document.getElementById('adm-sim-student-quick');
  if (simQuickSelect) {
    simQuickSelect.innerHTML = '<option value="">-- Choose student or enter custom UID --</option>' +
      students.map(s => `<option value="${s.rfid_uid}">${s.full_name} (${s.student_id}) [${s.rfid_uid}]</option>`).join('');
  }

  showAdminTab('scanner');
}

// Admin Portal Tabs
function showAdminTab(tab) {
  ['scanner', 'students', 'logs'].forEach(t => {
    document.getElementById(`adm-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-adm-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'students') loadAdminStudents();
  if (tab === 'logs') loadAdminLogs();
}

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
      if (lcd1) lcd1.textContent = 'Ready to Scan...';
      if (lcd2) lcd2.textContent = 'Please tap card';
    }, 4500);
  }
}

function onAdminQuickStudent(uid) {
  if (uid) {
    const uidInput = document.getElementById('adm-sim-uid');
    if (uidInput) uidInput.value = uid;
  }
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
  if (!tbody) return;

  try {
    const res = await axios.get(`${API_BASE}/api/students`);
    students = res.data.students || [];

    const countEl = document.getElementById('adm-student-count');
    if (countEl) countEl.textContent = students.length;

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
  if (!tbody) return;

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
