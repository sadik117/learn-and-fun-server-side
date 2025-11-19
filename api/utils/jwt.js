import { sign, verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const generateToken = (payload, expires = '3d') => sign(payload, JWT_SECRET, { expiresIn: expires });

export const verifyToken = (token) => {
  try {
    return verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};
