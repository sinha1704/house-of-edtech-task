import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-house-of-edtech-987654';

export interface UserSessionPayload {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export function signToken(payload: UserSessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): UserSessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserSessionPayload;
  } catch (error) {
    return null;
  }
}
