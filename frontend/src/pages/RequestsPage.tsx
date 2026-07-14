import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search, Loader2, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import StatusBadge from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const STATUSES = ['all', 'pending', 'processing', 'approved', 'rejected', 'escalated'];

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    setLoading(true);
    api.listRequests()
      .then(setRequests)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.patient_name?.toLowerCase().includes(q) ||
      r.request_code?.toLowerCase().includes(q) || r.procedure_name?.toLowerCase().includes(q);
    const matchS = statusFilter === 'all' || r.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">All PA Requests</h1>
            <p className="text-muted-foreground text-sm">All prior authorization requests processed by the AI pipeline.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, code, procedure..." className="pl-10" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all capitalize ${
                  statusFilter === s ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-7 h-7 animate-spin text-secondary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              {requests.length === 0
                ? <span>No requests yet. <Link to="/submit" className="text-secondary font-medium hover:underline">Submit your first PA →</Link></span>
                : 'No requests match your filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {['Code','Patient','Procedure','Insurer','Risk','Payment','Status','Submitted','Action'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((req: any) => (
                    <tr key={req.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-secondary">{req.request_code}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-foreground">{req.patient_name}</p>
                        <p className="text-xs text-muted-foreground">Age {req.patient_age} · {req.patient_gender}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-foreground">{req.procedure_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{req.procedure_code}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">{req.insurance_provider}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${req.risk_score ?? 0}%`,
                              backgroundColor: (req.risk_score??0)>70?'hsl(0,72%,51%)':(req.risk_score??0)>40?'hsl(38,92%,50%)':'hsl(142,71%,45%)'
                            }} />
                          </div>
                          <span className="text-xs font-medium">{req.risk_score ? Math.round(req.risk_score) : '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {req.payment_status === 'paid' ? (
                          <span className="text-xs font-semibold text-success">Paid</span>
                        ) : req.payment_status === 'pending_insurer_approval' ? (
                          <span className="text-xs font-semibold text-warning">Pending</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 flex gap-3 items-center">
                        <Link to={`/request/${req.id}`} className="inline-flex items-center gap-1 text-xs text-secondary font-medium hover:underline">
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                        {req.status === 'processing' && (
                          <Link to={`/pipeline/${req.id}`} className="inline-flex items-center gap-1 text-xs text-warning font-medium hover:underline">
                            Live
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
