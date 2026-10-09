// /api/students — CRUD for student management
// GET    /api/students         — list all students
// POST   /api/students         — register new student
// GET    /api/students/:id     — get one student
// PUT    /api/students/:id     — update student
// DELETE /api/students/:id     — delete student

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// GET /api/students — list all students (with optional search)
router.get('/', auth, async (req, res) => {
  try {
    const { search, course, year_level, section } = req.query;

    let query = supabase
      .from('students')
      .select('*')
      .order('full_name', { ascending: true });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,student_id.ilike.%${search}%`);
    }
    if (course)      query = query.eq('course', course);
    if (year_level)  query = query.eq('year_level', parseInt(year_level));
    if (section)     query = query.eq('section', section);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ students: data });
  } catch (err) {
    console.error('[GET /students]', err);
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// POST /api/students — register a new student (link RFID UID to student profile)
router.post('/', auth, async (req, res) => {
  try {
    const { rfid_uid, student_id, full_name, course, year_level, section } = req.body;

    if (!rfid_uid || !student_id || !full_name) {
      return res.status(400).json({ error: 'rfid_uid, student_id, and full_name are required' });
    }

    const { data, error } = await supabase
      .from('students')
      .insert({ rfid_uid, student_id, full_name, course, year_level, section })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        const field = error.message.includes('rfid_uid') ? 'RFID UID' : 'Student ID';
        return res.status(409).json({ error: `${field} already exists` });
      }
      throw error;
    }

    return res.status(201).json({ student: data });
  } catch (err) {
    console.error('[POST /students]', err);
    return res.status(500).json({ error: 'Failed to register student' });
  }
});

// GET /api/students/:id — get a single student + their guardians
router.get('/:id', auth, async (req, res) => {
  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('*, guardians(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    return res.json({ student });
  } catch (err) {
    console.error('[GET /students/:id]', err);
    return res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// PUT /api/students/:id — update student info
router.put('/:id', auth, async (req, res) => {
  try {
    const { rfid_uid, student_id, full_name, course, year_level, section } = req.body;

    const { data, error } = await supabase
      .from('students')
      .update({ rfid_uid, student_id, full_name, course, year_level, section })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Student not found' });

    return res.json({ student: data });
  } catch (err) {
    console.error('[PUT /students/:id]', err);
    return res.status(500).json({ error: 'Failed to update student' });
  }
});

// DELETE /api/students/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    return res.json({ success: true, message: 'Student deleted' });
  } catch (err) {
    console.error('[DELETE /students/:id]', err);
    return res.status(500).json({ error: 'Failed to delete student' });
  }
});

module.exports = router;
