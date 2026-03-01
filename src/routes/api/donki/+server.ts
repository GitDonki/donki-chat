import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const OPENCLAW_URL = env.OPENCLAW_URL || 'https://192.168.0.155:18789';
const OPENCLAW_TOKEN = env.OPENCLAW_TOKEN || '5239a6586070529b6e4973bcd58c3de5';

// This endpoint sends messages to the main Donki session
// instead of creating isolated chat completions sessions
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message } = await request.json();
    
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Send to main session via OpenClaw internal API
    const response = await fetch(`${OPENCLAW_URL}/api/sessions/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        sessionKey: 'agent:main:main',
        message: message,
        // Mark as coming from webchat
        metadata: {
          source: 'donki-chat',
          channel: 'webchat'
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      ok: true,
      response: result.response || result.message || 'Message sent'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Donki API error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to send message'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
