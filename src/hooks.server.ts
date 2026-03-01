import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export const handle: Handle = async ({ event, resolve }) => {
  // Check authentication for protected routes
  const isPublicPath = PUBLIC_PATHS.some(path => event.url.pathname.startsWith(path));
  
  if (!isPublicPath) {
    const isAuthenticated = validateSession(event.cookies);
    
    if (!isAuthenticated) {
      // Redirect to login for page requests
      if (!event.url.pathname.startsWith('/api/')) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/login' }
        });
      }
      
      // Return 401 for API requests
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  const response = await resolve(event);
  
  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  return response;
};
