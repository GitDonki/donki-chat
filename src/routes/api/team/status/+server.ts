import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';
import { TEAM_AGENTS, getAgentConversation } from '$lib/server/db';

export interface TeamMember {
  id: string;
  name: string;
  emoji: string;
  role: string;
  sessionKey: string;
  status: 'active' | 'idle' | 'working' | 'offline';
  lastActivity?: string;
  isDefault: boolean;
  conversationId: string;
}

export const GET: RequestHandler = async () => {
  try {
    // Ensure gateway is connected
    if (!gateway.isConnected()) {
      await gateway.connect();
    }
    
    // Try to get status from gateway
    let gatewayStatus: any = null;
    try {
      gatewayStatus = await gateway.getStatus();
    } catch (e) {
      console.warn('[TeamStatus] Could not fetch gateway status:', e);
    }
    
    // Build team members list with status
    const members: TeamMember[] = TEAM_AGENTS.map(agent => {
      // Find agent status from gateway if available
      let status: TeamMember['status'] = 'idle';
      let lastActivity: string | undefined;
      
      if (gatewayStatus?.agents) {
        const gatewayAgent = gatewayStatus.agents.find((a: any) => a.agentId === agent.id);
        if (gatewayAgent) {
          // Determine status based on heartbeat/activity
          if (gatewayAgent.heartbeat?.enabled) {
            status = 'active';
          }
          lastActivity = gatewayAgent.heartbeat?.lastSeen;
        }
      }
      
      // Check for recent sessions
      if (gatewayStatus?.sessions?.recent) {
        const recentSession = gatewayStatus.sessions.recent.find((s: any) => 
          s.key?.startsWith(`agent:${agent.id}:`)
        );
        if (recentSession) {
          const ageMs = recentSession.age;
          // If active in last 5 minutes, mark as active
          if (ageMs && ageMs < 300000) {
            status = 'active';
          }
          lastActivity = recentSession.updatedAt;
        }
      }
      
      return {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        role: agent.role,
        sessionKey: agent.sessionKey,
        status,
        lastActivity,
        isDefault: agent.isDefault,
        conversationId: `conv_${agent.id}`
      };
    });
    
    return json({
      ok: true,
      members,
      gatewayConnected: gateway.isConnected()
    });
  } catch (error) {
    console.error('[TeamStatus] Error:', error);
    
    // Return basic team info even if gateway fails
    const members: TeamMember[] = TEAM_AGENTS.map(agent => ({
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      sessionKey: agent.sessionKey,
      status: 'offline' as const,
      isDefault: agent.isDefault,
      conversationId: `conv_${agent.id}`
    }));
    
    return json({
      ok: true,
      members,
      gatewayConnected: false,
      warning: 'Gateway not available'
    });
  }
};
