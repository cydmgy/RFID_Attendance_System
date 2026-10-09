// ============================================================
// STUDENT PORTAL LOGIC
// ============================================================

function initStudentPortal() {
  const today = new Date().toISOString().split('T')[0];
  const stdLeaveDateEl = document.getElementById('std-leave-date');
  if (stdLeaveDateEl) {
    stdLeaveDateEl.value = today;
    stdLeaveDateEl.min = today;
  }

  // Populate subjects dropdown
  const subSelect = document.getElementById('std-leave-subject');
  if (subSelect) {
    subSelect.innerHTML = '<option value="">-- Choose Subject --</option>' +
      subjects.map(s => `<option value="${s.id}">${s.code ? s.code + ' - ' : ''}${s.name}</option>`).join('');
  }

  showStudentTab('overview');
  loadStudentPortalData();
}

function showStudentTab(tab) {
  ['overview', 'logs', 'leave'].forEach(t => {
    document.getElementById(`std-tab-${t}`)?.classList.toggle('d-none', t !== tab);
    document.getElementById(`tablink-std-${t}`)?.classList.toggle('active', t === tab);
  });
}

async function loadStudentPortalData() {
  // Update Profile Info
  const navNameEl = document.getElementById('student-nav-name');
  if (navNameEl) navNameEl.textContent = `${studentUser.name} (${studentUser.section})`;
  
  const cardNameEl = document.getElementById('std-card-name');
  if (cardNameEl) cardNameEl.textContent = studentUser.name;

  const cardIdEl = document.getElementById('std-card-id');
  if (cardIdEl) cardIdEl.textContent = studentUser.student_id;

  const cardCourseEl = document.getElementById('std-card-course');
  if (cardCourseEl) cardCourseEl.textContent = `${studentUser.course} - Year ${studentUser.year} (${studentUser.section})`;

  const cardRfidEl = document.getElementById('std-card-rfid');
  if (cardRfidEl) cardRfidEl.textContent = studentUser.rfid;

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

    const totalEl = document.getElementById('std-stat-total');
    if (totalEl) totalEl.textContent = totalDays;

    const presentEl = document.getElementById('std-stat-present');
    if (presentEl) presentEl.textContent = presentCount;

    const absentEl = document.getElementById('std-stat-absent');
    if (absentEl) absentEl.textContent = absentCount;
    
    const rate = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 100;
    const rateEl = document.getElementById('std-stat-rate');
    if (rateEl) rateEl.textContent = `${rate}%`;

    // Render Logs Table
    const tbody = document.getElementById('std-logs-table-body');
    if (tbody) {
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
    }

    // Load leave requests
    loadStudentLeaveHistory();
  } catch (err) {
    console.error('Error fetching student logs', err);
  }
}

async function loadStudentLeaveHistory() {
  const tbody = document.getElementById('std-leaves-status-tbody');
  if (!tbody) return;

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
    const dateInput = document.getElementById('std-leave-date');
    if (dateInput) {
      dateInput.value = today;
      dateInput.min = today;
    }
    await loadStudentLeaveHistory();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    notify('student', `Failed to submit leave: ${msg}`, 'danger');
  }
}
