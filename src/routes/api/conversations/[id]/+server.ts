import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConversation, getMessages, deleteConversation, deleteMessages, archiveConversation } from '$lib/server/db';

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

// Archive/unarchive a conversation
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const archived = body.archived ?? true;
    
    const conversation = getConversation(params.id);
    if (!conversation) {
      return json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    archiveConversation(params.id, archived);
    return json({ success: true, archived });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    return json({ error: 'Failed to archive conversation' }, { status: 500 });
  }
};
