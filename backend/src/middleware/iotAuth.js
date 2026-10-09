// Middleware: Verifies that IoT requests (from ESP32) include the correct API key
// The ESP32 must send this header:  x-api-key: <your IOT_API_KEY from .env>

module.exports = function iotAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.IOT_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing IoT API key' });
  }

  next();
};
