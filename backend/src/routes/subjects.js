// /api/subjects — Subject management
const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// GET /api/subjects — list all subjects with room info
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('*, rooms(name, location), instructors(full_name, email)')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.json({ subjects: data });
  } catch (err) {
    console.error('[GET /subjects]', err);
    return res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// POST /api/subjects — create a new subject
router.post('/', auth, async (req, res) => {
  try {
    const { name, code, room_id, instructor_id, late_threshold_minutes, school_year } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const { data, error } = await supabase
      .from('subjects')
      .insert({
        name,
        code,
        room_id: room_id || null,
        instructor_id: instructor_id || null,
        late_threshold_minutes: late_threshold_minutes || 15,
        school_year: school_year || '2026-2027'
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ message: 'Subject created', subject: data });
  } catch (err) {
    console.error('[POST /subjects]', err);
    return res.status(500).json({ error: 'Failed to create subject' });
  }
});

module.exports = router;
