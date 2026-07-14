import { motion } from 'framer-motion';
import {
  FileInput, ShieldCheck, BookOpen, Brain, AlertTriangle, MessageSquare, Cpu,
  CheckCircle2, Loader2, Circle, Pause
} from 'lucide-react';
import type { AgentState } from '@/lib/agentOrchestration';

const iconMap: Record<string, React.ElementType> = {
  FileInput, ShieldCheck, BookOpen, Brain, AlertTriangle, MessageSquare, Cpu,
};

const statusConfig = {
  idle: { ring: 'border-border', bg: 'bg-muted/30', text: 'text-muted-foreground', icon: Circle, label: 'Idle' },
  waiting: { ring: 'border-warning/50', bg: 'bg-warning/10', text: 'text-warning', icon: Pause, label: 'Waiting' },
  active: { ring: 'border-secondary/70 shadow-glow', bg: 'bg-secondary/10', text: 'text-secondary', icon: Loader2, label: 'Processing' },
  completed: { ring: 'border-success/50', bg: 'bg-success/10', text: 'text-success', icon: CheckCircle2, label: 'Done' },
  error: { ring: 'border-destructive/50', bg: 'bg-destructive/10', text: 'text-destructive', icon: AlertTriangle, label: 'Error' },
};

interface Props {
  agent: AgentState;
  isOrchestrator?: boolean;
  onClick?: () => void;
  selected?: boolean;
}

const AgentNode = ({ agent, isOrchestrator, onClick, selected }: Props) => {
  const Icon = iconMap[agent.icon] || Brain;
  const config = statusConfig[agent.status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      layout
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      className={`
        relative cursor-pointer rounded-2xl border-2 p-4 transition-all duration-300
        ${config.ring} ${selected ? 'ring-2 ring-secondary ring-offset-2 ring-offset-background' : ''}
        ${isOrchestrator ? 'bg-card/90 backdrop-blur-sm col-span-full' : 'bg-card'}
        shadow-card hover:shadow-elevated
      `}
    >
      {/* Active pulse ring */}
      {agent.status === 'active' && (
        <div className="absolute -inset-1 rounded-2xl border-2 border-secondary/30 animate-pulse-ring pointer-events-none" />
      )}

      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center shrink-0 relative`}>
          <Icon className={`w-5 h-5 ${config.text}`} />
          {agent.confidence && agent.status === 'completed' && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success text-success-foreground text-[9px] font-bold flex items-center justify-center">
              {agent.confidence}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-foreground text-sm truncate">{agent.name}</h4>
            <StatusIcon className={`w-3.5 h-3.5 ${config.text} shrink-0 ${agent.status === 'active' ? 'animate-spin' : ''}`} />
          </div>
          <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
        </div>
        {/* Message counter badges */}
        <div className="flex flex-col gap-1 text-[10px] font-mono">
          {agent.messagesSent > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-secondary/10 text-secondary">↑{agent.messagesSent}</span>
          )}
          {agent.messagesReceived > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent">↓{agent.messagesReceived}</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {agent.status !== 'idle' && (
        <div className="mt-3 w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${agent.progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ backgroundColor: agent.status === 'completed' ? 'hsl(var(--success))' : agent.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--secondary))' }}
          />
        </div>
      )}

      {/* Output preview */}
      {agent.output && (
        <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">{agent.output}</p>
      )}
    </motion.div>
  );
};

export default AgentNode;
