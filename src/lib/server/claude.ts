import { env } from '$env/dynamic/private';

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface StreamEvent {
  type: 'start' | 'delta' | 'done' | 'error';
  messageId?: string;
  content?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

const OPENCLAW_API_URL = env.OPENCLAW_API_URL || 'https://192.168.0.155:18789';
const OPENCLAW_API_KEY = env.OPENCLAW_API_KEY || '5239a6586070529b6e4973bcd58c3de5';

export async function* streamChat(
  messages: Message[],
  systemPrompt?: string
): AsyncGenerator<StreamEvent> {
  const messageId = crypto.randomUUID();
  
  try {
    yield { type: 'start', messageId };
    
    // Use OpenAI-compatible chat completions endpoint
    const response = await fetch(`${OPENCLAW_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${OPENCLAW_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || 'anthropic/claude-sonnet-4',
        max_tokens: parseInt(env.MAX_TOKENS || '4096'),
        stream: true,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }))
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            yield { 
              type: 'done', 
              messageId,
              usage: { input_tokens: inputTokens, output_tokens: outputTokens }
            };
            return;
          }
          
          try {
            const event = JSON.parse(data);
            
            // Handle OpenAI-compatible SSE format
            if (event.choices?.[0]?.delta?.content) {
              yield { type: 'delta', content: event.choices[0].delta.content };
            } else if (event.usage) {
              inputTokens = event.usage.prompt_tokens || 0;
              outputTokens = event.usage.completion_tokens || 0;
            }
            // Also handle Anthropic format for compatibility
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield { type: 'delta', content: event.delta.text };
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }
    
    yield { 
      type: 'done', 
      messageId,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens }
    };
    
  } catch (error) {
    yield { 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Non-streaming version for simple requests
export async function chat(messages: Message[], systemPrompt?: string): Promise<string> {
  const response = await fetch(`${OPENCLAW_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'anthropic/claude-sonnet-4',
      max_tokens: parseInt(env.MAX_TOKENS || '4096'),
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }))
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
