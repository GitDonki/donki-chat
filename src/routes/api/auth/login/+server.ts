import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassword, createUserSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const { password } = await request.json();
    
    if (!password) {
      return json({ error: 'Passwort erforderlich' }, { status: 400 });
    }
    
    const isValid = await verifyPassword(password);
    
    if (!isValid) {
      return json({ error: 'Falsches Passwort' }, { status: 401 });
    }
    
    createUserSession(cookies);
    
    return json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return json({ error: 'Login fehlgeschlagen' }, { status: 500 });
  }
};
