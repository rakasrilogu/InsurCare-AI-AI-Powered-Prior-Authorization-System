import { motion, AnimatePresence } from 'framer-motion';
import { Info, CheckCircle2, AlertTriangle, XCircle, Bug } from 'lucide-react';
import type { AgentLog } from '@/lib/agentOrchestration';
import { useRef, useEffect } from 'react';

const levelConfig = {
  info: { icon: Info, color: 'text-secondary', bg: 'bg-secondary/5' },
  success: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/5' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/5' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/5' },
  debug: { icon: Bug, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

const agentColors: Record<string, string> = {
  orchestrator: 'text-accent',
  intake: 'text-secondary',
  eligibility: 'text-success',
  policy: 'text-warning',
  risk: 'text-destructive',
  decision: 'text-accent',
  communication: 'text-success',
};

interface Props {
  logs: AgentLog[];
  filter?: string;
}

const AgentLogs = ({ logs, filter }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const filteredLogs = filter && filter !== 'all'
    ? logs.filter(l => l.agentId === filter)
    : logs;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto font-mono text-xs space-y-0.5 scrollbar-thin">
      <AnimatePresence initial={false}>
        {filteredLogs.map((log) => {
          const config = levelConfig[log.level];
          const Icon = config.icon;
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`px-3 py-2 rounded-lg ${config.bg} flex items-start gap-2 group`}
            >
              <Icon className={`w-3.5 h-3.5 mt-0.5 ${config.color} shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-bold uppercase text-[10px] ${agentColors[log.agentId] || 'text-foreground'}`}>
                    {log.agentId}
                  </span>
                  <span className="text-muted-foreground">{log.message}</span>
                  {log.duration && (
                    <span className="ml-auto text-muted-foreground/60 shrink-0">{(log.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
                {log.details && (
                  <p className="text-muted-foreground/60 mt-0.5 leading-relaxed">{log.details}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default AgentLogs;
