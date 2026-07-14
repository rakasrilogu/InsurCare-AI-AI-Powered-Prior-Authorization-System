import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, FileText, ArrowRight, Loader2, Shield, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Role-specific welcome messages
const WELCOME: Record<string, { title: string; subtitle: (u: any) => string; icon: any; color: string }> = {
  hospital: {
    title: 'Hospital Dashboard',
    subtitle: u => `Welcome, ${u?.full_name}. ${u?.can_submit ? 'Submit and manage' : 'View'} PA requests for ${u?.hospital || 'your hospital'}.`,
    icon: Building2, color: 'text-blue-500',
  },
  insurer: {
    title: 'Insurer Dashboard',
    subtitle: u => `Welcome, ${u?.full_name}. Review PA claims submitted to ${u?.company_name || 'your company'}.`,
    icon: Shield, color: 'text-purple-500',
  },
};

export default function DashboardPage() {
  const { user, isHospital, canSubmit, isInsurer } = useAuth();
  const [requests,  setRequests]  = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([api.listRequests(), api.analytics(), api.analyticsWeekly()])
      .then(([reqs, stats, weekly]) => {
        setRequests(reqs);
        setAnalytics(stats);
        setWeeklyData(weekly);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const role        = user?.role || 'hospital';
  const welcome     = WELCOME[role] || WELCOME.hospital;
  const WelcomeIcon = welcome.icon;
  const recent      = requests.slice(0, 5);
  const total       = analytics?.total_requests ?? 0;
  const approved    = analytics?.by_status?.approved ?? 0;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-slide-up">

        {/* Header — role-aware */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center`}>
              <WelcomeIcon className={`w-5 h-5 ${welcome.color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{welcome.title}</h1>
              <p className="text-muted-foreground text-sm">{welcome.subtitle(user)}</p>
            </div>
          </div>
          {/* Hospital users with submit permission can create */}
          {isHospital && canSubmit && (
            <Link to="/submit">
              <Button className="gradient-accent text-secondary-foreground border-0 gap-2">
                <FileText className="w-4 h-4" /> New PA Request
              </Button>
            </Link>
          )}
          {isInsurer && (
            <div className="px-4 py-2 rounded-xl bg-purple-50 border border-purple-200 text-xs font-semibold text-purple-700">
              Viewing claims for: {user?.company_name}
            </div>
          )}
          {isHospital && !canSubmit && (
            <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
              {user?.hospital} · {user?.specialization || 'Staff'}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-7 h-7 animate-spin text-secondary" />
          </div>
        ) : (
          <>
            {/* Stats — all roles see these */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Requests"   value={total}              icon={FileText}    trend={{ value: 12, positive: true }} />
              <StatCard title="Processing Time"  value="~90s"               icon={Clock}       variant="accent" subtitle="6 AI agents" />
              <StatCard title="Approval Rate"    value={`${approvalRate}%`} icon={CheckCircle2} variant="success" />
              <StatCard title="Avg Risk Score"   value={analytics?.avg_risk ? Math.round(analytics.avg_risk) : '—'} icon={TrendingUp} />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Chart */}
              <div className="lg:col-span-2 bg-card rounded-2xl p-6 shadow-card">
                <h3 className="font-semibold text-foreground mb-4">Weekly PA Decisions</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weeklyData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)' }} />
                    <Bar dataKey="approved" fill="hsl(142,71%,45%)" radius={[4,4,0,0]} name="Approved" />
                    <Bar dataKey="denied"   fill="hsl(0,72%,51%)"   radius={[4,4,0,0]} name="Denied" />
                    <Bar dataKey="review"   fill="hsl(38,92%,50%)"  radius={[4,4,0,0]} name="Review" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Live counts */}
              <div className="bg-card rounded-2xl p-6 shadow-card space-y-4">
                <h3 className="font-semibold text-foreground">Live Summary</h3>
                {[
                  { label: 'Approved',   count: analytics?.by_status?.approved   ?? 0, icon: CheckCircle2, cls: 'text-success bg-success/5' },
                  { label: 'Rejected',   count: (analytics?.by_status?.rejected  ?? 0) + (analytics?.by_status?.denied ?? 0), icon: XCircle, cls: 'text-destructive bg-destructive/5' },
                  { label: 'Escalated',  count: analytics?.by_status?.escalated  ?? 0, icon: AlertTriangle, cls: 'text-warning bg-warning/5' },
                  { label: 'Processing', count: analytics?.by_status?.processing ?? 0, icon: Loader2, cls: 'text-secondary bg-secondary/5' },
                ].map(({ label, count, icon: Icon, cls }) => (
                  <div key={label} className={`flex items-center justify-between p-3 rounded-xl ${cls}`}>
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                    </div>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-foreground">{total}</p>
                </div>
              </div>
            </div>

            {/* Recent Requests table */}
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="p-6 flex items-center justify-between border-b border-border">
                <h3 className="font-semibold text-foreground">
                  {isInsurer ? 'Recent Claims' : 'Recent Requests'}
                </h3>
                <Link to="/requests" className="text-sm text-secondary font-medium flex items-center gap-1 hover:underline">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {recent.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  {isHospital && canSubmit
                    ? <span>No requests yet. <Link to="/submit" className="text-secondary font-medium hover:underline">Submit your first PA →</Link></span>
                    : isInsurer
                    ? 'No claims submitted to your company yet.'
                    : 'No PA requests for your hospital yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {['Code','Patient','Procedure','Insurer','Risk','Status'].map(h => (
                          <th key={h} className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((req: any) => (
                        <tr key={req.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => window.location.href = `/result/${req.id}`}>
                          <td className="px-6 py-4 text-sm font-mono font-medium text-secondary">{req.request_code}</td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-foreground">{req.patient_name}</p>
                            <p className="text-xs text-muted-foreground">Age {req.patient_age} · {req.patient_gender}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground">{req.procedure_name}</td>
                          <td className="px-6 py-4 text-sm text-foreground">{req.insurance_provider}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{
                                  width: `${req.risk_score ?? 0}%`,
                                  backgroundColor: (req.risk_score??0)>70?'#ef4444':(req.risk_score??0)>40?'#eab308':'#22c55e'
                                }} />
                              </div>
                              <span className="text-xs font-medium">{req.risk_score ? Math.round(req.risk_score) : '—'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
