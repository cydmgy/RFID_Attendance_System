// /api/leave — Leave / Excuse Request management
// POST  /api/leave          — File a new leave request (admin on behalf of student)
// GET   /api/leave          — List leave requests (filterable by status)
// PATCH /api/leave/:id      — Approve or reject a request (instructor)

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// POST /api/leave — file a leave request
router.post('/', auth, async (req, res) => {
  try {
    const { student_id, subject_id, leave_date, reason } = req.body;

    if (!student_id || !subject_id || !leave_date || !reason) {
      return res.status(400).json({
        error: 'student_id, subject_id, leave_date, and reason are all required'
      });
    }

    // Validate that leave_date is not in the past
    const todayStr = new Date().toISOString().split('T')[0];
    if (leave_date < todayStr) {
      return res.status(400).json({
        error: 'Absence date cannot be before today'
      });
    }

    // Prevent duplicate requests for the same student + subject + date
    const { data: existing } = await supabase
      .from('leave_requests')
      .select('id, status')
      .eq('student_id', student_id)
      .eq('subject_id', subject_id)
      .eq('leave_date', leave_date)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: `A leave request already exists for this date (status: ${existing.status})`,
        existing_id: existing.id
      });
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .insert({ student_id, subject_id, leave_date, reason, status: 'pending' })
      .select(`
        id, leave_date, reason, status, created_at,
        students(full_name, student_id),
        subjects(name, code)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({ leave_request: data });
  } catch (err) {
    console.error('[POST /leave]', err);
    return res.status(500).json({ error: 'Failed to file leave request' });
  }
});

// GET /api/leave?status=pending&subject_id=xxx — list leave requests
router.get('/', auth, async (req, res) => {
  try {
    const { status, subject_id, student_id } = req.query;

    let query = supabase
      .from('leave_requests')
      .select(`
        id, leave_date, reason, status, created_at, reviewed_at,
        students(id, full_name, student_id, section),
        subjects(id, name, code),
        instructors(full_name)
      `)
      .order('created_at', { ascending: false });

    if (status)     query = query.eq('status', status);
    if (subject_id) query = query.eq('subject_id', subject_id);
    if (student_id) query = query.eq('student_id', student_id);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ leave_requests: data, count: data.length });
  } catch (err) {
    console.error('[GET /leave]', err);
    return res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// PATCH /api/leave/:id — approve or reject a leave request
// Body: { action: "approved" | "rejected" }
router.patch('/:id', auth, async (req, res) => {
  try {
    const action = req.body.action || req.body.status;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approved" or "rejected"' });
    }

    // Get the instructor record
    const { data: instructor } = await supabase
      .from('instructors')
      .select('id')
      .eq('auth_id', req.user?.id)
      .maybeSingle();

    if (!instructor && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Only instructors can review leave requests' });
    }

    // Fetch the leave request
    const { data: leave, error: fetchError } = await supabase
      .from('leave_requests')
      .select('id, student_id, subject_id, leave_date, status')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !leave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    if (leave.status !== 'pending') {
      return res.status(409).json({ error: `Request is already ${leave.status}` });
    }

    // Update the leave request status
    const { error: updateError } = await supabase
      .from('leave_requests')
      .update({
        status: action,
        reviewed_by: instructor ? instructor.id : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    // If APPROVED — also update the attendance log to "excused"
    if (action === 'approved') {
      const leaveStart = new Date(leave.leave_date + 'T00:00:00');
      const leaveEnd   = new Date(leave.leave_date + 'T23:59:59');

      // Check if an attendance log exists for this student on this date
      const { data: existingLog } = await supabase
        .from('attendance_logs')
        .select('id, status')
        .eq('student_id', leave.student_id)
        .gte('timestamp', leaveStart.toISOString())
        .lte('timestamp', leaveEnd.toISOString())
        .maybeSingle();

      if (existingLog) {
        // Update existing log to "excused"
        await supabase
          .from('attendance_logs')
          .update({ status: 'excused' })
          .eq('id', existingLog.id);

        // Write to audit override log
        await supabase.from('attendance_overrides').insert({
          attendance_log_id: existingLog.id,
          changed_by: instructor.id,
          old_status: existingLog.status,
          new_status: 'excused',
          reason: 'Leave request approved',
        });
      } else {
        // No scan found — create a manual excused entry
        await supabase.from('attendance_logs').insert({
          student_id: leave.student_id,
          rfid_uid: 'MANUAL_ENTRY',
          timestamp: new Date(leave.leave_date + 'T08:00:00').toISOString(),
          status: 'excused',
          device_id: 'SYSTEM',
          is_first_tap_today: false,
        });
      }
    }

    return res.json({
      success: true,
      message: `Leave request ${action}`,
      action,
    });

  } catch (err) {
    console.error('[PATCH /leave/:id]', err);
    return res.status(500).json({ error: 'Failed to process leave request' });
  }
});

module.exports = router;
