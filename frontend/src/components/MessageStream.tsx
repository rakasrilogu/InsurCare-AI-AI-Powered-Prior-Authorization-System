import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Radio, AlertCircle, MessageCircle } from 'lucide-react';
import type { AgentMessage } from '@/lib/agentOrchestration';

const typeStyles = {
  request: { icon: ArrowRight, color: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/20' },
  response: { icon: MessageCircle, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  broadcast: { icon: Radio, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  escalation: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
};

const agentLabels: Record<string, string> = {
  orchestrator: 'Orchestrator',
  intake: 'Intake',
  eligibility: 'Eligibility',
  policy: 'Policy',
  decision: 'Decision',
  risk: 'Risk',
  communication: 'Communication',
};

interface Props {
  messages: AgentMessage[];
  maxVisible?: number;
}

const MessageStream = ({ messages, maxVisible = 8 }: Props) => {
  const visible = messages.slice(-maxVisible);

  return (
    <div className="space-y-2 overflow-hidden">
      <AnimatePresence initial={false}>
        {visible.map((msg) => {
          const style = typeStyles[msg.type];
          const Icon = style.icon;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-2 p-2.5 rounded-xl border ${style.border} ${style.bg}`}
            >
              <Icon className={`w-3.5 h-3.5 ${style.color} shrink-0`} />
              <span className={`text-[11px] font-semibold ${style.color} shrink-0`}>
                {agentLabels[msg.from]}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className={`text-[11px] font-semibold ${style.color} shrink-0`}>
                {agentLabels[msg.to]}
              </span>
              <span className="text-[11px] text-muted-foreground truncate ml-1">
                {msg.content}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default MessageStream;
