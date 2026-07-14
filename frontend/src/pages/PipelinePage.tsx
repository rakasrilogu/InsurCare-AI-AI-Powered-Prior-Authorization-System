import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Cpu, FileInput,
  ShieldCheck, BookOpen, Brain, MessageSquare, Loader2, RotateCcw, Terminal, DollarSign,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const AGENTS = [
  { id: 'intake',         name: 'Intake',         icon: FileInput },
  { id: 'eligibility',    name: 'Eligibility',    icon: ShieldCheck },
  { id: 'policy',         name: 'Policy',         icon: BookOpen },
  { id: 'risk',           name: 'Risk',           icon: AlertTriangle },
  { id: 'decision',       name: 'Decision',       icon: Brain },
  { id: 'communication',  name: 'Communication',  icon: MessageSquare },
  { id: 'payment',        name: 'Payment',        icon: DollarSign },
];

const AGENT_META: Record<string, { name: string; tag: string; dot: string }> = {
  orchestrator:  { name: 'ORCHESTRATOR', tag: 'text-zinc-400',     dot: 'bg-zinc-400' },
  intake:        { name: 'INTAKE',       tag: 'text-emerald-400',  dot: 'bg-emerald-400' },
  eligibility:   { name: 'ELIGIBILITY',  tag: 'text-green-400',    dot: 'bg-green-400' },
  policy:        { name: 'POLICY',       tag: 'text-sky-400',      dot: 'bg-sky-400' },
  risk:          { name: 'RISK',         tag: 'text-amber-400',    dot: 'bg-amber-400' },
  decision:      { name: 'DECISION',     tag: 'text-purple-400',   dot: 'bg-purple-400' },
  communication: { name: 'COMMUNICATION', tag: 'text-pink-400',    dot: 'bg-pink-400' },
  payment:       { name: 'PAYMENT',      tag: 'text-green-400',    dot: 'bg-green-400' },
};

const STATUS_COLORS: Record<string, string> = {
  idle:      'border-zinc-200 bg-white',
  active:    'border-secondary bg-secondary/5 ring-2 ring-secondary/20',
  completed: 'border-emerald-300 bg-emerald-50',
  error:     'border-destructive bg-destructive/5',
};

/* ── Agent pill (top bar) ── */
function AgentPill({ agent, run }: { agent: typeof AGENTS[0]; run?: any }) {
  const status = run?.status || 'idle';
  const Icon = agent.icon;
  return (
    <div data-agent={agent.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${STATUS_COLORS[status] || STATUS_COLORS.idle}`}>
      {status === 'active'
        ? <Loader2 className="w-4 h-4 text-secondary animate-spin" />
        : status === 'completed'
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        : status === 'error'
        ? <XCircle className="w-4 h-4 text-destructive" />
        : <Icon className="w-4 h-4 text-muted-foreground" />
      }
      <span className="text-sm font-semibold text-foreground whitespace-nowrap">{agent.name}</span>
      {run?.duration_ms != null && status === 'completed' && (
        <span className="text-[10px] font-mono text-muted-foreground ml-1">{(run.duration_ms / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

/* ── Log filter tabs ── */
function LogTabs({ active, counts, onChange }: { active: string; counts: Record<string, number>; onChange: (tab: string) => void }) {
  const tabs = ['ALL', 'ORCHESTRATOR', 'INTAKE', 'ELIGIBILITY', 'POLICY', 'RISK', 'DECISION', 'COMMUNICATION', 'PAYMENT'];
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {tabs.map(tab => {
        const key = tab.toLowerCase();
        const n = key === 'all' ? (Object.values(counts).reduce((a, b) => a + b, 0)) : (counts[key] || 0);
        return (
          <button
            key={tab}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              active === key
                ? 'bg-foreground text-background'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab}{n > 0 ? ` (${n})` : ''}
          </button>
        );
      })}
    </div>
  );
}

/* ── Single log line ── */
function LogLine({ entry }: { entry: { t: string; msg: string; agent: string } }) {
  const meta = AGENT_META[entry.agent] || { name: entry.agent.toUpperCase(), tag: 'text-zinc-300', dot: 'bg-zinc-400' };
  return (
    <div className="flex gap-3 items-start py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
      <span className="text-zinc-500 shrink-0 tabular-nums mt-px">{entry.t.slice(11, 19)}</span>
      <span className={`shrink-0 font-bold text-xs mt-px ${meta.tag}`}>{meta.name}</span>
      <span className="text-zinc-200 text-xs leading-relaxed break-words">{entry.msg}</span>
    </div>
  );
}

/* ── Log stream ── */
function LogStream({ logs }: { logs: { t: string; msg: string; agent: string }[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs.length]);
  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 h-[calc(100vh-310px)] overflow-y-auto font-mono text-[11px] leading-relaxed">
      {logs.length === 0 && (
        <div className="flex items-center justify-center h-32 text-zinc-500 text-xs">
          Waiting for agents to start…
        </div>
      )}
      {logs.map((l, i) => <LogLine key={i} entry={l} />)}
      <div ref={endRef} />
    </div>
  );
}

/* ── Main page ── */
const PipelinePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const pillsRef = useRef<HTMLDivElement>(null);

  const fetchRequest = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getRequest(id);
      setRequest(data);
      if (['approved', 'rejected', 'escalated'].includes(data.status)) setDone(true);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchRequest(); }, [fetchRequest]);
  useEffect(() => {
    if (done) return;
    const iv = setInterval(fetchRequest, 3000);
    return () => clearInterval(iv);
  }, [done, fetchRequest]);

  /* auto-focus active agent: switch log tab + scroll pill into view */
  const activeAgentId = (request?.agent_runs || [])
    .filter((r: any) => r.status === 'active')
    .sort((a: any, b: any) => b.id - a.id)[0]?.agent_id;

  useEffect(() => {
    if (!activeAgentId || done) return;
    setActiveTab(activeAgentId);
    const pill = pillsRef.current?.querySelector(`[data-agent="${activeAgentId}"]`);
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeAgentId, done]);

  const getRun = (agentId: string) => request?.agent_runs?.find((r: any) => r.agent_id === agentId);

  /* flatten + sort all logs */
  const allLogs = (request?.agent_runs || [])
    .flatMap((r: any) => (r.details?.logs || []).map((l: any) => ({ ...l, agent: r.agent_id })))
    .sort((a: any, b: any) => a.t.localeCompare(b.t));

  /* counts per agent */
  const counts: Record<string, number> = {};
  allLogs.forEach(l => { counts[l.agent] = (counts[l.agent] || 0) + 1; });

  /* filtered logs */
  const filteredLogs = activeTab === 'all' ? allLogs : allLogs.filter(l => l.agent === activeTab);

  const completedCount = request?.agent_runs?.filter((r: any) => r.status === 'completed').length || 0;
  const progress = Math.round((completedCount / 7) * 100);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
    </DashboardLayout>
  );

  if (!request) return (
    <DashboardLayout>
      <div className="text-center py-20">
        <p className="text-muted-foreground">Request not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/requests')}>Back</Button>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Cpu className="w-5 h-5 text-secondary" />
              {request.request_code}
              {done && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                  request.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {request.status?.toUpperCase()}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              {request.patient_name} · {request.procedure_name} · {request.insurance_provider}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRequest}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>

        {/* Agent pills */}
        <div ref={pillsRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {AGENTS.map(a => <AgentPill key={a.id} agent={a} run={getRun(a.id)} />)}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6 }}
              style={{ background: done ? 'hsl(var(--success))' : 'linear-gradient(90deg, hsl(var(--secondary)), hsl(200, 95%, 55%))' }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{progress}%</span>
          {!done && <Loader2 className="w-4 h-4 animate-spin text-secondary" />}
        </div>

        {/* Log panel */}
        <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          {/* Tab bar */}
          <div className="px-4 pt-3 pb-2 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-secondary" />
              <span className="text-sm font-bold text-foreground">
                &gt;_ Logs ({allLogs.length})
              </span>
            </div>
            <LogTabs active={activeTab} counts={counts} onChange={setActiveTab} />
          </div>
          {/* Log stream */}
          <div className="p-2">
            <LogStream logs={filteredLogs} />
          </div>
        </div>

        {/* Final decision */}
        <AnimatePresence>
          {done && request.agent_runs?.find((r: any) => r.agent_id === 'decision')?.details && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-5 border-2 ${
                request.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
                request.status === 'rejected' ? 'bg-red-50 border-red-200' :
                'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                {request.status === 'approved'
                  ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  : request.status === 'rejected'
                  ? <XCircle className="w-6 h-6 text-red-500" />
                  : <AlertTriangle className="w-6 h-6 text-amber-500" />
                }
                <div>
                  <h3 className="font-bold text-foreground">
                    Decision: {(request.agent_runs.find((r: any) => r.agent_id === 'decision')?.details?.decision || request.status || '').toUpperCase()}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {request.agent_runs.find((r: any) => r.agent_id === 'decision')?.details?.confidence}%
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-3">
                <Button onClick={() => navigate(`/request/${request.id}`)} size="sm" className="gradient-accent text-secondary-foreground border-0">
                  View Full Report
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/submit')}>
                  New PA Request
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
};

export default PipelinePage;
