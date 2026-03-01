import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMessages, deleteMessages, deleteConversation, getAllConversations } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const conversationId = url.searchParams.get('conversationId');
  
  if (conversationId) {
    const messages = getMessages(conversationId);
    return json({ messages });
  }
  
  // Return all conversations if no specific ID
  const conversations = getAllConversations();
  return json({ conversations });
};

export const DELETE: RequestHandler = async ({ url }) => {
  const conversationId = url.searchParams.get('conversationId');
  
  if (!conversationId) {
    return json({ error: 'conversationId required' }, { status: 400 });
  }
  
  deleteMessages(conversationId);
  deleteConversation(conversationId);
  
  return json({ success: true });
};
