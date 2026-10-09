// /api/override — Manual attendance corrections (with audit trail)
// PATCH /api/override/:log_id — Change a student's attendance status

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// PATCH /api/override/:log_id
// Body: { new_status: "present" | "late" | "excused" | "unknown", reason: "..." }
router.patch('/:log_id', auth, async (req, res) => {
  try {
    const { log_id } = req.params;
    const { new_status, reason } = req.body;

    // Validate
    const validStatuses = ['present', 'late', 'absent', 'excused', 'unknown'];
    if (!new_status || !validStatuses.includes(new_status)) {
      return res.status(400).json({ error: `new_status must be one of: ${validStatuses.join(', ')}` });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A reason of at least 5 characters is required' });
    }

    // Fetch the original log to get old_status
    const { data: originalLog, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('id, status, student_id, students(full_name)')
      .eq('id', log_id)
      .single();

    if (fetchError || !originalLog) {
      return res.status(404).json({ error: 'Attendance log not found' });
    }

    const old_status = originalLog.status;

    // Find the instructor record linked to this Supabase auth user
    const { data: instructor } = await supabase
      .from('instructors')
      .select('id, role')
      .eq('auth_id', req.user?.id)
      .maybeSingle();

    if (!instructor && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Only registered instructors can override attendance' });
    }

    // Update the attendance log status
    const { error: updateError } = await supabase
      .from('attendance_logs')
      .update({ status: new_status })
      .eq('id', log_id);

    if (updateError) {
      if (updateError.code === '23514') {
        return res.status(400).json({
          error: "Database constraint error: In your Supabase SQL Editor, please run: ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_status_check; ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_status_check CHECK (status IN ('present', 'late', 'absent', 'excused', 'unknown'));"
        });
      }
      throw updateError;
    }

    // Insert audit record into attendance_overrides
    const { data: override, error: overrideError } = await supabase
      .from('attendance_overrides')
      .insert({
        attendance_log_id: log_id,
        changed_by: instructor ? instructor.id : null,
        old_status,
        new_status,
        reason: reason.trim(),
      })
      .select()
      .single();

    if (overrideError) throw overrideError;

    return res.json({
      success: true,
      message: `Attendance changed from "${old_status}" to "${new_status}"`,
      student_name: originalLog.students?.full_name,
      override,
    });

  } catch (err) {
    console.error('[PATCH /override/:log_id]', err);
    return res.status(500).json({ error: 'Failed to override attendance' });
  }
});

// GET /api/override/:log_id — get override history for a specific log
router.get('/:log_id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_overrides')
      .select(`
        id, old_status, new_status, reason, created_at,
        instructors(full_name, email)
      `)
      .eq('attendance_log_id', req.params.log_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ overrides: data });
  } catch (err) {
    console.error('[GET /override/:log_id]', err);
    return res.status(500).json({ error: 'Failed to fetch override history' });
  }
});

module.exports = router;
