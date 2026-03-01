import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateSession } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
  const isAuthenticated = validateSession(cookies);
  return json({ authenticated: isAuthenticated });
};
