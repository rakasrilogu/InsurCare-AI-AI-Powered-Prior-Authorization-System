import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, FileText, ArrowRight, Loader2, Shield, Building2, AlertCircle, Upload, Eye, Bell, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

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
  const [requests, setRequests] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      api.listRequests(),
      api.analytics(),
      api.analyticsWeekly(),
      api.listNotifications(),
      api.unreadNotificationCount(),
    ])
      .then(([reqs, stats, weekly, notifs, unread]) => {
        setRequests(reqs);
        setAnalytics(stats);
        setWeeklyData(weekly);
        setNotifications(notifs);
        setUnreadCount(unread.count);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const role = user?.role || 'hospital';
  const welcome = WELCOME[role] || WELCOME.hospital;
  const WelcomeIcon = welcome.icon;

  // Computed stats from real data
  const total = requests.length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected' || r.status === 'denied').length;
  const processing = requests.filter(r => r.status === 'processing' || r.status === 'pending').length;
  const requiresInfo = requests.filter(r => r.status === 'requires_information').length;
  const escalated = requests.filter(r => r.status === 'escalated' || r.status === 'human_review').length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const pendingPayment = requests.filter(r => r.payment_status === 'pending_insurer_approval').length;
  const disputed = requests.filter(r => r.disputed).length;
  const appeals = requests.filter(r => r.appeal_status === 'submitted').length;
  const completedRequests = requests.filter(r => r.created_at && r.updated_at);
  const avgProcessingTime = completedRequests.length > 0
    ? Math.round(completedRequests.reduce((sum, r) => {
        const diff = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000;
        return sum + diff;
      }, 0) / completedRequests.length)
    : 0;

  // Hospital: Action Required items
  const actionRequired = requests.filter(r =>
    r.status === 'requires_information' ||
    r.status === 'appeal_submitted' ||
    (r.status === 'rejected' && !r.appeal_status)
  );

  // Insurer: Review Queue
  const reviewQueue = requests.filter(r =>
    r.status === 'human_review' ||
    r.status === 'escalated' ||
    r.status === 'pending' ||
    r.status === 'processing' ||
    r.status === 'resubmitted' ||
    r.status === 'appeal_submitted'
  );

  const filtered = requests.filter(r => {
    const matchS = statusFilter === 'all' || r.status === statusFilter;
    return matchS;
  }).slice(0, 20);

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <WelcomeIcon className={`w-5 h-5 ${welcome.color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{welcome.title}</h1>
              <p className="text-muted-foreground text-sm">{welcome.subtitle(user)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <div className="relative">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount}</span>
              </div>
            )}
            {isHospital && canSubmit && (
              <Link to="/submit">
                <Button className="gradient-accent text-secondary-foreground border-0 gap-2">
                  <FileText className="w-4 h-4" /> New PA Request
                </Button>
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-7 h-7 animate-spin text-secondary" />
          </div>
        ) : (
          <>
            {/* ── Hospital Dashboard ── */}
            {isHospital && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
                  <StatCard title="Total Requests" value={total} icon={FileText} />
                  <StatCard title="Processing" value={processing} icon={Clock} variant="accent" />
                  <StatCard title="Approved" value={approved} icon={CheckCircle2} variant="success" />
                  <StatCard title="Denied" value={rejected} icon={XCircle} />
                  {requiresInfo > 0 && <StatCard title="Info Required" value={requiresInfo} icon={AlertCircle} />}
                  {escalated > 0 && <StatCard title="In Review" value={escalated} icon={AlertTriangle} />}
                  <StatCard title="Approval Rate" value={`${approvalRate}%`} icon={TrendingUp} variant="success" />
                  <StatCard title="Avg Processing" value={avgProcessingTime > 0 ? `${avgProcessingTime}s` : '—'} icon={Clock} variant="accent" subtitle="from completed requests" />
                </div>

                {/* Action Required */}
                {actionRequired.length > 0 && (
                  <div className="bg-warning/5 rounded-2xl p-6 border border-warning/20">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle className="w-5 h-5 text-warning" />
                      <h3 className="font-bold text-foreground">Action Required</h3>
                      <span className="ml-auto text-xs font-semibold text-warning bg-warning/10 px-2 py-1 rounded-full">{actionRequired.length} items</span>
                    </div>
                    <div className="space-y-3">
                      {actionRequired.map((req: any) => (
                        <div key={req.id} className="flex items-center justify-between p-4 rounded-xl bg-white/60 border border-border/50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-mono font-medium text-secondary">{req.request_code}</span>
                              <StatusBadge status={req.status} />
                            </div>
                            <p className="text-sm text-foreground">{req.procedure_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {req.status === 'requires_information' && req.missing_information?.length > 0
                                ? `Missing: ${req.missing_information.join(', ')}`
                                : req.status === 'requires_information' && req.info_request_message
                                ? `Insurer: ${req.info_request_message}`
                                : req.status === 'appeal_submitted'
                                ? 'Appeal submitted — awaiting insurer review'
                                : 'Decision available — consider appeal'}
                            </p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            {req.status === 'requires_information' && (
                              <Link to={`/submit`}>
                                <Button size="sm" variant="outline" className="gap-1">
                                  <Upload className="w-3.5 h-3.5" /> Upload
                                </Button>
                              </Link>
                            )}
                            <Link to={`/result/${req.id}`}>
                              <Button size="sm" variant="outline" className="gap-1">
                                <Eye className="w-3.5 h-3.5" /> View
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chart + Notifications */}
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-card rounded-2xl p-6 shadow-card">
                    <h3 className="font-semibold text-foreground mb-4">Weekly PA Decisions</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={weeklyData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                        <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)' }} />
                        <Bar dataKey="approved" fill="hsl(142,71%,45%)" radius={[4,4,0,0]} name="Approved" />
                        <Bar dataKey="denied" fill="hsl(0,72%,51%)" radius={[4,4,0,0]} name="Denied" />
                        <Bar dataKey="review" fill="hsl(38,92%,50%)" radius={[4,4,0,0]} name="Review" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-card rounded-2xl p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-foreground">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs text-secondary hover:underline">Mark all read</button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No notifications yet.</p>
                      ) : (
                        notifications.slice(0, 10).map((n: any) => (
                          <Link key={n.id} to={n.request_id ? `/result/${n.request_id}` : '#'}
                            className={`block p-3 rounded-xl text-sm transition-colors ${n.is_read ? 'bg-muted/30' : 'bg-secondary/5 border border-secondary/10'}`}>
                            <p className="font-medium text-foreground">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Insurer Dashboard ── */}
            {isInsurer && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard title="Total Claims" value={total} icon={FileText} />
                  <StatCard title="Pending Review" value={reviewQueue.length} icon={Clock} variant="accent" />
                  <StatCard title="AI Approved" value={approved} icon={CheckCircle2} variant="success" />
                  <StatCard title="AI Denied" value={rejected} icon={XCircle} />
                  {escalated > 0 && <StatCard title="Human Review" value={escalated} icon={AlertTriangle} />}
                  {requiresInfo > 0 && <StatCard title="Info Required" value={requiresInfo} icon={AlertCircle} />}
                  {pendingPayment > 0 && <StatCard title="Pending Payment" value={pendingPayment} icon={TrendingUp} />}
                  {(disputed + appeals) > 0 && <StatCard title="Disputes/Appeals" value={disputed + appeals} icon={ShieldAlert} />}
                </div>

                {/* Review Queue */}
                {reviewQueue.length > 0 && (
                  <div className="bg-card rounded-2xl p-6 shadow-card">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="w-5 h-5 text-secondary" />
                      <h3 className="font-bold text-foreground">Review Queue</h3>
                      <span className="ml-auto text-xs font-semibold text-secondary bg-secondary/10 px-2 py-1 rounded-full">{reviewQueue.length} items</span>
                    </div>
                    <div className="space-y-3">
                      {reviewQueue.slice(0, 10).map((req: any) => (
                        <div key={req.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-mono font-medium text-secondary">{req.request_code}</span>
                              <StatusBadge status={req.status} />
                              {req.risk_score > 70 && <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">HIGH RISK</span>}
                            </div>
                            <p className="text-sm text-foreground">{req.procedure_name} — {req.patient_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Confidence: {req.confidence_score ? `${Math.round(req.confidence_score * 100)}%` : '—'}
                              {' · Risk: '}{req.risk_score ? Math.round(req.risk_score) : '—'}
                              {req.status === 'appeal_submitted' ? ' · APPEAL' : ''}
                            </p>
                          </div>
                          <Link to={`/result/${req.id}`}>
                            <Button size="sm" className="gradient-accent text-secondary-foreground border-0 gap-1 ml-4">
                              Review <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chart */}
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <h3 className="font-semibold text-foreground mb-4">Weekly Claims</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={weeklyData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'hsl(220,10%,46%)' }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)' }} />
                      <Bar dataKey="approved" fill="hsl(142,71%,45%)" radius={[4,4,0,0]} name="Approved" />
                      <Bar dataKey="denied" fill="hsl(0,72%,51%)" radius={[4,4,0,0]} name="Denied" />
                      <Bar dataKey="review" fill="hsl(38,92%,50%)" radius={[4,4,0,0]} name="Review" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* ── All Requests Table (both roles) ── */}
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="p-6 flex items-center justify-between border-b border-border">
                <h3 className="font-semibold text-foreground">
                  {isInsurer ? 'All Claims' : 'All Requests'}
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'processing', 'requires_information', 'approved', 'rejected', 'escalated', 'human_review'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        statusFilter === s ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                      }`}>
                      {s === 'all' ? 'All' : s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              {filtered.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  {total === 0
                    ? isHospital
                      ? <span>No requests yet. <Link to="/submit" className="text-secondary font-medium hover:underline">Submit your first PA →</Link></span>
                      : 'No claims submitted to your company yet.'
                    : 'No requests match your filter.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {['Code', 'Patient', 'Procedure', 'Status', 'Action'].map(h => (
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
                          <td className="px-6 py-4 text-sm text-foreground">{req.procedure_name}</td>
                          <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                          <td className="px-6 py-4">
                            <Link to={`/result/${req.id}`} className="inline-flex items-center gap-1 text-xs text-secondary font-medium hover:underline">
                              <Eye className="w-3.5 h-3.5" /> View
                            </Link>
                          </td>
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
