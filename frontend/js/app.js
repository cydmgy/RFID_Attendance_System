// ============================================================
// IoT Attendance System - Core Router & State Management
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
  await loadSystemData();
  await loadPage('login');
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
  } catch (err) {
    console.error('Data initialization error:', err);
  }
}

// ── Modular Page Router ───────────────────────────────────────

async function loadPage(page) {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  try {
    const response = await fetch(`pages/${page}.html`);
    if (!response.ok) throw new Error(`Failed to load page: ${page} (${response.status})`);
    
    const html = await response.text();
    appContainer.innerHTML = html;
    activePortal = page;

    // Initialize the loaded page components
    if (page === 'student' && typeof initStudentPortal === 'function') {
      initStudentPortal();
    } else if (page === 'instructor' && typeof initInstructorPortal === 'function') {
      initInstructorPortal();
    } else if (page === 'admin' && typeof initAdminPortal === 'function') {
      initAdminPortal();
    }
  } catch (err) {
    console.error(`Page routing error for '${page}':`, err);
    appContainer.innerHTML = `
      <div class="container py-5 text-center">
        <div class="alert alert-danger shadow-sm d-inline-block text-start p-4">
          <h5 class="fw-bold"><i class="fas fa-triangle-exclamation me-2"></i> Error Loading Page</h5>
          <p class="mb-2">Could not load <code>pages/${escapeHtml(page)}.html</code>.</p>
          <small class="text-muted d-block mb-3">If running from file://, make sure you open the project via VS Code Live Server or Node server.</small>
          <button class="btn btn-outline-danger btn-sm" onclick="logout()">Return to Login</button>
        </div>
      </div>
    `;
  }
}

function loginAs(role) {
  loadPage(role);
}

function logout() {
  loadPage('login');
}

// ── Shared UI Utilities ───────────────────────────────────────

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
