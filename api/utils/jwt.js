const { verify, sign } = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;

function generateToken(payload, expires = '3d') {
  return sign(payload, jwtSecret, { expiresIn: expires });
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  verify(token, jwtSecret, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = decoded;
    next();
  });
}

module.exports = { generateToken, verifyToken };
