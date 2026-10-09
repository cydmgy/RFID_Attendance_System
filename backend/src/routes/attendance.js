// /api/attendance — attendance logs, live feed, and reports
// GET /api/attendance/live     — today's logs for a specific room (live feed)
// GET /api/attendance/daily    — daily report
// GET /api/attendance/weekly   — weekly report with per-student stats
// GET /api/attendance/monthly  — monthly report
// GET /api/attendance/absentees — students below threshold

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// ── GET /api/attendance ──────────────────────────────────────────
// Returns attendance logs (optional room_id filter, limit)
router.get('/', auth, async (req, res) => {
  try {
    const { room_id, limit = 100 } = req.query;

    let query = supabase
      .from('attendance_logs')
      .select(`
        id, rfid_uid, timestamp, status, is_first_tap_today, device_id,
        students(id, full_name, student_id, course, year_level, section),
        rooms(id, name, location)
      `)
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit));

    if (room_id) {
      query = query.eq('room_id', room_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ logs: data, count: data.length });
  } catch (err) {
    console.error('[GET /attendance]', err);
    return res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

// ── GET /api/attendance/live?room_id=xxx ─────────────────────────
// Returns today's attendance logs for a room (used by live dashboard)
router.get('/live', auth, async (req, res) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ error: 'room_id is required' });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('attendance_logs')
      .select(`
        id, rfid_uid, timestamp, status, is_first_tap_today, device_id,
        students(id, full_name, student_id, course, year_level, section),
        rooms(id, name)
      `)
      .eq('room_id', room_id)
      .gte('timestamp', startOfDay.toISOString())
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return res.json({ logs: data, count: data.length });
  } catch (err) {
    console.error('[GET /attendance/live]', err);
    return res.status(500).json({ error: 'Failed to fetch live attendance' });
  }
});

// ── GET /api/attendance/daily?date=2026-10-08&room_id=xxx ────────
router.get('/daily', auth, async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const { room_id, subject_id } = req.query;

    const startOfDay = new Date(dateStr + 'T00:00:00');
    const endOfDay   = new Date(dateStr + 'T23:59:59');

    let query = supabase
      .from('attendance_logs')
      .select(`
        id, rfid_uid, timestamp, status,
        students(id, full_name, student_id, section),
        rooms(id, name)
      `)
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp', { ascending: false });

    if (room_id) query = query.eq('room_id', room_id);

    const { data, error } = await query;
    if (error) throw error;

    // Get total enrolled students count for ratio (e.g. 28/30)
    const { count: totalEnrolled } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    const enrolled = totalEnrolled || 0;
    const present = data.filter(l => l.status === 'present').length;
    const late = data.filter(l => l.status === 'late').length;
    const excused = data.filter(l => l.status === 'excused').length;
    const explicitlyAbsent = data.filter(l => l.status === 'absent').length;
    const unscanned = Math.max(0, enrolled - (present + late + excused + explicitlyAbsent));
    const totalAbsent = explicitlyAbsent + unscanned;
    const attendanceRate = enrolled > 0 ? Math.round(((present + late) / enrolled) * 100) : 0;

    // Tally status counts
    const summary = {
      enrolled,
      present,
      late,
      excused,
      explicitly_absent: explicitlyAbsent,
      absent: totalAbsent,
      unknown: data.filter(l => l.status === 'unknown').length,
      total_scans: data.length,
      attendance_rate: attendanceRate,
    };

    return res.json({ date: dateStr, summary, logs: data });
  } catch (err) {
    console.error('[GET /attendance/daily]', err);
    return res.status(500).json({ error: 'Failed to fetch daily report' });
  }
});

// ── GET /api/attendance/weekly?from=2026-10-01&to=2026-10-07&subject_id=xxx ──
router.get('/weekly', auth, async (req, res) => {
  try {
    const { from, to, subject_id, room_id } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date params are required' });
    }

    let query = supabase
      .from('attendance_logs')
      .select(`
        id, student_id, timestamp, status,
        students(id, full_name, student_id, section)
      `)
      .gte('timestamp', from + 'T00:00:00')
      .lte('timestamp', to + 'T23:59:59')
      .neq('status', 'unknown');

    if (room_id) query = query.eq('room_id', room_id);

    const { data, error } = await query;
    if (error) throw error;

    // Calculate unique school days in the range
    const fromDate = new Date(from);
    const toDate = new Date(to);
    let schoolDays = 0;
    const d = new Date(fromDate);
    while (d <= toDate) {
      const day = d.getDay();
      if (day >= 1 && day <= 5) schoolDays++; // Mon-Fri
      d.setDate(d.getDate() + 1);
    }

    // Aggregate per student
    const studentMap = {};
    for (const log of data) {
      if (!log.student_id) continue;
      const id = log.student_id;
      if (!studentMap[id]) {
        studentMap[id] = {
          student: log.students,
          present: 0,
          late: 0,
          excused: 0,
        };
      }
      studentMap[id][log.status]++;
    }

    // Compute attendance percentage
    const report = Object.values(studentMap).map(s => ({
      ...s,
      total_logged: s.present + s.late + s.excused,
      attendance_percent: schoolDays > 0
        ? Math.round(((s.present + s.late + s.excused) / schoolDays) * 100)
        : 0,
    }));

    return res.json({ from, to, school_days: schoolDays, report });
  } catch (err) {
    console.error('[GET /attendance/weekly]', err);
    return res.status(500).json({ error: 'Failed to fetch weekly report' });
  }
});

// ── GET /api/attendance/monthly?year=2026&month=10&room_id=xxx ───
router.get('/monthly', auth, async (req, res) => {
  try {
    const year  = parseInt(req.query.year  || new Date().getFullYear());
    const month = parseInt(req.query.month || (new Date().getMonth() + 1));
    const { room_id } = req.query;

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    let query = supabase
      .from('attendance_logs')
      .select('student_id, timestamp, status, students(full_name, student_id)')
      .gte('timestamp', from + 'T00:00:00')
      .lte('timestamp', to + 'T23:59:59')
      .neq('status', 'unknown');

    if (room_id) query = query.eq('room_id', room_id);

    const { data, error } = await query;
    if (error) throw error;

    // Aggregate per student per day
    const byStudent = {};
    for (const log of data) {
      if (!log.student_id) continue;
      const sid = log.student_id;
      const day = new Date(log.timestamp).getDate();
      if (!byStudent[sid]) {
        byStudent[sid] = { student: log.students, days: {} };
      }
      byStudent[sid].days[day] = log.status;
    }

    return res.json({ year, month, report: Object.values(byStudent) });
  } catch (err) {
    console.error('[GET /attendance/monthly]', err);
    return res.status(500).json({ error: 'Failed to fetch monthly report' });
  }
});

// ── GET /api/attendance/absentees?subject_id=xxx&threshold=75 ────
// Returns students whose attendance % falls below the threshold
router.get('/absentees', auth, async (req, res) => {
  try {
    const { subject_id, threshold = 75 } = req.query;

    // Get the subject details including its own threshold if not overridden
    let subjectThreshold = parseInt(threshold);
    if (subject_id) {
      const { data: subject } = await supabase
        .from('subjects')
        .select('min_attendance_percent, school_year')
        .eq('id', subject_id)
        .maybeSingle();
      if (subject) subjectThreshold = subject.min_attendance_percent;
    }

    // Fetch all logs for this term (simplified: last 30 days)
    const since = new Date();
    since.setDate(since.getDate() - 30);

    let query = supabase
      .from('attendance_logs')
      .select('student_id, status, students(id, full_name, student_id, section)')
      .gte('timestamp', since.toISOString())
      .neq('status', 'unknown');

    const { data, error } = await query;
    if (error) throw error;

    // Compute per-student stats
    const stats = {};
    for (const log of data) {
      if (!log.student_id) continue;
      const sid = log.student_id;
      if (!stats[sid]) stats[sid] = { student: log.students, present: 0, late: 0, excused: 0 };
      stats[sid][log.status]++;
    }

    // Total unique school days in range
    const totalDays = 22; // approximate — refine later with schedules

    const absentees = Object.values(stats)
      .map(s => ({
        ...s.student,
        total_attended: s.present + s.late + s.excused,
        attendance_percent: Math.round(((s.present + s.late + s.excused) / totalDays) * 100),
      }))
      .filter(s => s.attendance_percent < subjectThreshold)
      .sort((a, b) => a.attendance_percent - b.attendance_percent);

    return res.json({ threshold: subjectThreshold, absentees });
  } catch (err) {
    console.error('[GET /attendance/absentees]', err);
    return res.status(500).json({ error: 'Failed to fetch absentees' });
  }
});

module.exports = router;
