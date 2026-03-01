import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllConversations } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    const conversations = getAllConversations();
    return json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
};
