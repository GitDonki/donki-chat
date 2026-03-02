import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllConversations, createConversation, getConversation } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    const conversations = getAllConversations();
    return json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
};

// Create a new conversation
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { id, title } = await request.json();
    
    if (!id) {
      return json({ error: 'id is required' }, { status: 400 });
    }
    
    // Check if already exists
    const existing = getConversation(id);
    if (existing) {
      return json({ conversation: existing, created: false });
    }
    
    createConversation(id, title || 'Neuer Chat');
    const conversation = getConversation(id);
    
    return json({ conversation, created: true });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return json({ error: 'Failed to create conversation' }, { status: 500 });
  }
};
