// Multi-Agent Orchestration Engine
// Simulates a real multi-agent system with message passing, orchestrator control, and agent collaboration

export type AgentId = 'orchestrator' | 'intake' | 'eligibility' | 'policy' | 'decision' | 'risk' | 'communication';

export interface AgentMessage {
  id: string;
  from: AgentId;
  to: AgentId;
  type: 'request' | 'response' | 'broadcast' | 'escalation';
  content: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentLog {
  id: string;
  agentId: AgentId;
  level: 'info' | 'success' | 'warning' | 'error' | 'debug';
  message: string;
  timestamp: number;
  details?: string;
  duration?: number;
}

export interface AgentState {
  id: AgentId;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'completed' | 'error' | 'waiting';
  progress: number;
  icon: string;
  confidence?: number;
  output?: string;
  processingTime?: number;
  messagesReceived: number;
  messagesSent: number;
}

export interface OrchestratorState {
  phase: string;
  currentAgent: AgentId | null;
  completedAgents: AgentId[];
  pendingAgents: AgentId[];
  totalProgress: number;
  decision: null | {
    outcome: 'approved' | 'denied' | 'review';
    confidence: number;
    reasoning: string;
    policyClauses: string[];
  };
}

