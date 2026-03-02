import { writable, derived, get } from 'svelte/store';

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

// All team members
export const teamMembers = writable<TeamMember[]>([]);

// Currently selected agent ID
export const selectedAgentId = writable<string>('main');

// Derived: Currently selected agent (full object)
export const selectedAgent = derived(
  [selectedAgentId, teamMembers],
  ([$selectedAgentId, $teamMembers]) => 
    $teamMembers.find(m => m.id === $selectedAgentId) || null
);

// Derived: Is team loading
export const isTeamLoading = writable(false);

// Load team members from API
export async function loadTeam(): Promise<void> {
  isTeamLoading.set(true);
  
  try {
    const response = await fetch('/api/team/status');
    const data = await response.json();
    
    if (data.ok && data.members) {
      teamMembers.set(data.members);
      console.log('[Team] Loaded', data.members.length, 'team members');
    }
  } catch (e) {
    console.error('[Team] Failed to load team:', e);
    // Set default team on error
    teamMembers.set([
      { id: 'main', name: 'Donki', emoji: '🐧', role: 'Chef', sessionKey: 'agent:main:main', status: 'idle', isDefault: true, conversationId: 'conv_main' },
      { id: 'nabu', name: 'Nabu', emoji: '🦉', role: 'Home Assistant', sessionKey: 'agent:nabu:main', status: 'offline', isDefault: false, conversationId: 'conv_nabu' },
      { id: 'forge', name: 'Forge', emoji: '🔧', role: 'Infrastructure', sessionKey: 'agent:forge:main', status: 'offline', isDefault: false, conversationId: 'conv_forge' },
      { id: 'claude', name: 'Claude', emoji: '💻', role: 'Coding', sessionKey: 'agent:claude:main', status: 'offline', isDefault: false, conversationId: 'conv_claude' },
      { id: 'archie', name: 'Archie', emoji: '🐹', role: 'Archivar', sessionKey: 'agent:archie:main', status: 'offline', isDefault: false, conversationId: 'conv_archie' }
    ]);
  } finally {
    isTeamLoading.set(false);
  }
}

// Update a team member's status
export function updateMemberStatus(agentId: string, status: TeamMember['status']): void {
  teamMembers.update(members => 
    members.map(m => m.id === agentId ? { ...m, status } : m)
  );
}

// Get current selected agent synchronously
export function getCurrentAgent(): TeamMember | null {
  const members = get(teamMembers);
  const id = get(selectedAgentId);
  return members.find(m => m.id === id) || null;
}
