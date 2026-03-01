import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConversation, getMessages, deleteConversation, deleteMessages } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const conversation = getConversation(params.id);
    if (!conversation) {
      return json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    const messages = getMessages(params.id);
    
    // Parse images JSON for each message
    const parsedMessages = messages.map((msg: any) => ({
      ...msg,
      images: msg.images ? JSON.parse(msg.images) : undefined
    }));
    
    return json({ 
      conversation,
      messages: parsedMessages
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    deleteMessages(params.id);
    deleteConversation(params.id);
    return json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
};
