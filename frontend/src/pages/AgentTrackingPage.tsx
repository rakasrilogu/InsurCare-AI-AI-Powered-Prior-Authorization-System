import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileInput, ShieldCheck, BookOpen, AlertTriangle, Brain, MessageSquare, DollarSign, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import PipelinePage from './PipelinePage';

const AGENT_DEFS = [
  { id: 'intake',        name: 'Intake Agent',        icon: FileInput,     color: 'green' },
  { id: 'eligibility',   name: 'Eligibility Agent',   icon: ShieldCheck,   color: 'green' },
  { id: 'policy',        name: 'Policy Agent (RAG)',   icon: BookOpen,      color: 'blue' },
  { id: 'risk',          name: 'Risk Agent',           icon: AlertTriangle, color: 'blue' },
  { id: 'decision',      name: 'Decision Agent',       icon: Brain,         color: 'blue' },
  { id: 'communication', name: 'Communication Agent',  icon: MessageSquare, color: 'green' },
  { id: 'payment',       name: 'Payment Agent',        icon: DollarSign,    color: 'green' },
];



export default function AgentTrackingPage() {
  const { id } = useParams<{ id?: string }>();
  const { isInsurer } = useAuth();

  // When opened for a specific request (e.g. right after submit), show the
  // live agent panel that streams each agent's logs as it runs.
  if (id) {
    return <PipelinePage />;
  }

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listRequests().then(setRequests).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const wsBase = (import.meta.env.VITE_API_URL || "http://localhost:8000")
      .replace("http://", "ws://")
      .replace("https://", "wss://");

    const socket = new WebSocket(`${wsBase}/ws/agent-runs?token=${encodeURIComponent(token)}`);

    socket.onmessage = () => {
      load();
    };

    return () => socket.close();
  }, []);


  // Compute per-agent stats from all agent_runs
  const agentStats: Record<string, { total: number; completed: number; errors: number; totalMs: number; totalConf: number; confCount: number }> = {};
  AGENT_DEFS.forEach(a => { agentStats[a.id] = { total: 0, completed: 0, errors: 0, totalMs: 0, totalConf: 0, confCount: 0 }; });
  requests.forEach(req => {
    (req.agent_runs || []).forEach((run: any) => {
      const s = agentStats[run.agent_id];
      if (!s) return;
      s.total++;
      if (run.status === 'completed') s.completed++;
      if (run.status === 'error') s.errors++;
      if (run.duration_ms) s.totalMs += run.duration_ms;
      if (run.confidence != null) { s.totalConf += run.confidence; s.confCount++; }
    });
  });

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agent Tracking</h1>
            <p className="text-muted-foreground text-sm">
              {isInsurer
                ? 'Detailed performance stats for all 6 AI agents. Full pipeline visibility.'
                : 'Live agent pipeline status. Simplified view — submit a PA to see real-time progress.'}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {isInsurer && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-secondary bg-secondary/10 px-3 py-1.5 rounded-full">
                <Eye className="w-3.5 h-3.5" /> Full Detail View
              </span>
            )}
            {!isInsurer && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <EyeOff className="w-3.5 h-3.5" /> Summary View
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {AGENT_DEFS.map(agent => {
                const s = agentStats[agent.id];
                const Icon = agent.icon;
                const successRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                const avgMs = s.completed > 0 ? Math.round(s.totalMs / s.completed) : 0;
                const avgConf = s.confCount > 0 ? Math.round((s.totalConf / s.confCount) * 100) : 0;
                return (
                  <div key={agent.id} className="bg-card rounded-2xl p-5 shadow-card border border-border hover:shadow-elevated transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50">
                          <Icon className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{agent.name}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="text-xl font-bold text-foreground">{s.total}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Processed</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="text-xl font-bold text-success">{s.completed}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="text-xl font-bold text-destructive">{s.errors}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between mb-1 text-xs">
                          <span className="text-muted-foreground">Success Rate</span>
                          <span className="font-semibold text-foreground">{successRate}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-success rounded-full" style={{ width: `${successRate}%` }} />
                        </div>
                      </div>
                      {isInsurer && (
                        <div>
                          <div className="flex justify-between mb-1 text-xs">
                            <span className="text-muted-foreground">Avg Confidence</span>
                            <span className="font-semibold text-foreground">{avgConf > 0 ? `${avgConf}%` : '—'}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-secondary rounded-full" style={{ width: `${avgConf}%` }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span>Avg Time</span>
                      <span className="font-mono font-medium text-foreground">{avgMs > 0 ? `${(avgMs/1000).toFixed(1)}s` : '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent agent runs table */}
            {requests.length > 0 && (
              <div className="bg-card rounded-2xl shadow-card overflow-hidden">
                <div className="p-5 border-b border-border">
                  <h3 className="font-semibold text-foreground">Recent Pipeline Runs</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {(isInsurer
                          ? ['Request','Patient','Decision','Risk','Confidence','Status']
                          : ['Request','Patient','Decision','Status']
                        ).map(h => (
                          <th key={h} className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requests.slice(0,10).map((req: any) => (
                        <tr key={req.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-6 py-3 text-sm font-mono text-secondary">{req.request_code}</td>
                          <td className="px-6 py-3 text-sm text-foreground">{req.patient_name}</td>
                          <td className="px-6 py-3 text-sm font-medium capitalize text-foreground">{req.decision ?? '—'}</td>
                          {isInsurer && (
                            <>
                              <td className="px-6 py-3 text-sm">{req.risk_score ? Math.round(req.risk_score) : '—'}</td>
                              <td className="px-6 py-3 text-sm">{req.confidence_score ? `${Math.round(req.confidence_score * 100)}%` : '—'}</td>
                            </>
                          )}
                          <td className="px-6 py-3 capitalize text-sm text-muted-foreground">{req.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {requests.length === 0 && (
              <div className="bg-card rounded-2xl p-12 text-center shadow-card text-muted-foreground text-sm">
                No pipeline runs yet. Submit a PA request to see agent stats.
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
