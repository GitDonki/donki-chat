import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { createSession, getSession, deleteSession, cleanExpiredSessions } from './db';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE = 'donki_session';
const SESSION_DURATION_DAYS = 7;

export async function verifyPassword(password: string): Promise<boolean> {
  const passwordHash = env.PASSWORD_HASH;
  
  if (!passwordHash) {
    console.error('PASSWORD_HASH not set in environment');
    return false;
  }
  
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function createUserSession(cookies: Cookies): string {
  // Clean up expired sessions
  cleanExpiredSessions();
  
  const sessionId = uuid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  
  createSession(sessionId, expiresAt);
  
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt
  });
  
  return sessionId;
}

export function validateSession(cookies: Cookies): boolean {
  const sessionId = cookies.get(SESSION_COOKIE);
  
  if (!sessionId) {
    return false;
  }
  
  const session = getSession(sessionId);
  return !!session;
}

export function destroySession(cookies: Cookies): void {
  const sessionId = cookies.get(SESSION_COOKIE);
  
  if (sessionId) {
    deleteSession(sessionId);
  }
  
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function requireAuth(cookies: Cookies): boolean {
  return validateSession(cookies);
}
