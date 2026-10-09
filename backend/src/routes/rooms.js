// /api/rooms — Room management
const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// GET /api/rooms — list all rooms
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.json({ rooms: data });
  } catch (err) {
    console.error('[GET /rooms]', err);
    return res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// POST /api/rooms — create a new room
router.post('/', auth, async (req, res) => {
  try {
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert({ name, location })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ message: 'Room created', room: data });
  } catch (err) {
    console.error('[POST /rooms]', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
});

module.exports = router;
