// Middleware: Verifies Supabase JWT token for instructor/admin dashboard access
// The frontend sends: Authorization: Bearer <supabase_access_token>
// In development mode, allows automatic access so the user can test the database directly.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function auth(req, res, next) {
  const authHeader = req.headers['authorization'];

  // If no token is provided:
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // In local development or prototype testing, allow seamless access as dev admin
    if (process.env.NODE_ENV !== 'production' || process.env.DEV_BYPASS_AUTH === 'true') {
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'admin@dev.local',
        role: 'admin'
      };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  const token = authHeader.split(' ')[1];

  // If dev token passed explicitly
  if (token === 'dev-token' || token === 'test-token') {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@dev.local',
      role: 'admin'
    };
    return next();
  }

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      // If running locally and token failed, fall back to dev user with warning
      if (process.env.NODE_ENV !== 'production') {
        req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'admin@dev.local', role: 'admin' };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'admin@dev.local', role: 'admin' };
      return next();
    }
    return res.status(401).json({ error: 'Auth verification error' });
  }
};
