// POST /api/scan
// Called by the ESP32 every time a student taps their RFID card
// Handles: duplicate guard, student lookup, late check, first-tap SMS trigger

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const iotAuth = require('../middleware/iotAuth');

router.post('/', iotAuth, async (req, res) => {
  const { uid, room_id, device_id } = req.body;

  // ── Validate input ──────────────────────────────────────────
  if (!uid || !room_id) {
    return res.status(400).json({ error: 'Missing required fields: uid, room_id' });
  }

  const guardMinutes = parseInt(process.env.DUPLICATE_GUARD_MINUTES || '5');
  const guardCutoff = new Date(Date.now() - guardMinutes * 60 * 1000).toISOString();

  try {
    // ── STEP 1: Duplicate Scan Guard ─────────────────────────
    const { data: recentScan } = await supabase
      .from('attendance_logs')
      .select('id, timestamp')
      .eq('rfid_uid', uid)
      .eq('room_id', room_id)
      .gte('timestamp', guardCutoff)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentScan) {
      return res.status(409).json({
        message: 'Duplicate scan — already logged recently',
        last_scan: recentScan.timestamp,
      });
    }

    // ── STEP 2: Look up student by RFID UID ─────────────────
    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, student_id, section')
      .eq('rfid_uid', uid)
      .maybeSingle();

    // ── STEP 3: Determine attendance status ─────────────────
    let status = 'unknown';
    let studentId = null;

    if (student) {
      studentId = student.id;
      status = 'present'; // default

      // Get today's day name (e.g., "Monday")
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = days[new Date().getDay()];
      const nowTime = new Date().toTimeString().slice(0, 5); // "HH:MM"

      // Find matching schedule for this student in this room today
      const { data: schedule } = await supabase
        .from('schedules')
        .select('start_time, end_time, subject_id, subjects(late_threshold_minutes)')
        .eq('student_id', student.id)
        .eq('day_of_week', todayName)
        .maybeSingle();

      if (schedule) {
        const threshold = schedule.subjects?.late_threshold_minutes ?? 15;
        const [sh, sm] = schedule.start_time.split(':').map(Number);
        const lateAfter = new Date();
        lateAfter.setHours(sh, sm + threshold, 0, 0);

        if (new Date() > lateAfter) {
          status = 'late';
        }
      }
    }

    // ── STEP 4: Check if this is the first tap today ─────────
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('attendance_logs')
      .select('id', { count: 'exact', head: true })
      .eq('rfid_uid', uid)
      .gte('timestamp', startOfDay.toISOString());

    const isFirstTapToday = (count === 0);

    // ── STEP 5: Insert attendance log ────────────────────────
    const { data: log, error: insertError } = await supabase
      .from('attendance_logs')
      .insert({
        student_id: studentId,
        room_id,
        rfid_uid: uid,
        status,
        device_id: device_id || null,
        is_first_tap_today: isFirstTapToday,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ── STEP 6: SMS Notification (conceptual placeholder) ────
    // If isFirstTapToday and student found, trigger SMS to guardians
    // In production: call Twilio API here
    if (isFirstTapToday && student) {
      const { data: guardians } = await supabase
        .from('guardians')
        .select('id, full_name, phone_number')
        .eq('student_id', student.id)
        .eq('sms_enabled', true);

      if (guardians && guardians.length > 0) {
        const timeStr = new Date().toLocaleTimeString('en-PH', {
          hour: '2-digit', minute: '2-digit', hour12: true
        });
        const dateStr = new Date().toLocaleDateString('en-PH', {
          month: 'long', day: 'numeric', year: 'numeric'
        });

        for (const guardian of guardians) {
          const message =
            `Hi ${guardian.full_name}! Your child ${student.full_name} has arrived ` +
            `at school and tapped their ID at ${timeStr} on ${dateStr}. - Attendance System`;

          // TODO: Replace this with actual Twilio call in production
          console.log(`[SMS SIMULATION] To: ${guardian.phone_number} | ${message}`);

          // Log the SMS attempt
          await supabase.from('sms_logs').insert({
            student_id: student.id,
            guardian_id: guardian.id,
            message,
            provider_status: 'sent', // simulated
          });
        }
      }
    }

    // ── STEP 7: Respond to ESP32 ─────────────────────────────
    return res.status(200).json({
      success: true,
      student_name: student ? student.full_name : null,
      status,
      log_id: log.id,
      is_first_tap_today: isFirstTapToday,
    });

  } catch (err) {
    console.error('[SCAN ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
