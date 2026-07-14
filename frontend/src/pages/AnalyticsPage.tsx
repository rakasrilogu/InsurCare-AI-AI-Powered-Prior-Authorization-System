import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import { Clock, TrendingDown, TrendingUp, DollarSign, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

const weeklyData = [
  { day: 'Mon', approved: 32, denied: 5, review: 3 },
  { day: 'Tue', approved: 28, denied: 7, review: 5 },
  { day: 'Wed', approved: 41, denied: 4, review: 2 },
  { day: 'Thu', approved: 35, denied: 6, review: 4 },
  { day: 'Fri', approved: 39, denied: 3, review: 6 },
  { day: 'Sat', approved: 18, denied: 2, review: 1 },
  { day: 'Sun', approved: 12, denied: 1, review: 1 },
];
const processingTimeData = [
  {hour:'8AM',time:1.2},{hour:'9AM',time:1.5},{hour:'10AM',time:2.1},
  {hour:'11AM',time:1.8},{hour:'12PM',time:1.4},{hour:'1PM',time:1.6},
  {hour:'2PM',time:2.0},{hour:'3PM',time:1.7},{hour:'4PM',time:1.3},{hour:'5PM',time:1.9},
];
const insurerDistribution = [
  {name:'Star Health',value:35,color:'hsl(217,91%,53%)'},
  {name:'HDFC Ergo',value:25,color:'hsl(142,71%,45%)'},
  {name:'ICICI Lombard',value:20,color:'hsl(38,92%,50%)'},
  {name:'Max Bupa',value:12,color:'hsl(280,67%,50%)'},
  {name:'Bajaj Allianz',value:8,color:'hsl(0,72%,51%)'},
];
const metrics = [
  {label:'Approval Rate',value:78},{label:'Auto-Decision Rate',value:92},
  {label:'Document Completeness',value:85},{label:'SLA Compliance',value:96},
];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analytics().then(setAnalytics).catch(console.error).finally(() => setLoading(false));
  }, []);

  const total = analytics?.total_requests ?? 0;
  const approved = analytics?.by_status?.approved ?? 0;
  const liveApprovalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const denied = (analytics?.by_status?.rejected ?? 0) + (analytics?.by_status?.denied ?? 0);
  const liveDenialRate = total > 0 ? Math.round((denied / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm">Performance metrics for your AI-powered PA pipeline.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Avg Processing Time" value="~90s" subtitle="6 AI agent calls" icon={Clock} variant="accent" />
            <StatCard title="Live Approval Rate" value={`${liveApprovalRate}%`} icon={TrendingUp} trend={{ value: 18, positive: true }} />
            <StatCard title="Live Denial Rate" value={`${liveDenialRate}%`} icon={TrendingDown} trend={{ value: 5, positive: true }} />
            <StatCard title="Total Processed" value={total} subtitle="Via AI pipeline" icon={DollarSign} variant="success" />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Weekly Decisions (Benchmark)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'hsl(220, 10%, 46%)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(220, 10%, 46%)' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="approved" fill="hsl(142, 71%, 45%)" radius={[4,4,0,0]} name="Approved" />
                <Bar dataKey="denied"   fill="hsl(0, 72%, 51%)"   radius={[4,4,0,0]} name="Denied" />
                <Bar dataKey="review"   fill="hsl(38, 92%, 50%)"  radius={[4,4,0,0]} name="Review" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Processing Time Trend (Hours)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={processingTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                <XAxis dataKey="hour" tick={{ fontSize: 12, fill: 'hsl(220, 10%, 46%)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(220, 10%, 46%)' }} domain={[0,3]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="time" stroke="hsl(217, 91%, 53%)" strokeWidth={3}
                  dot={{ fill: 'hsl(217, 91%, 53%)', r: 5 }} name="Avg Time (hrs)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Requests by Insurer</h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie data={insurerDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {insurerDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {insurerDistribution.map((e, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="text-sm text-foreground">{e.name}</span>
                    <span className="text-sm font-medium text-muted-foreground ml-auto">{e.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-foreground mb-6">AI Performance Metrics</h3>
            <div className="space-y-5">
              {metrics.map(m => (
                <div key={m.label}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">{m.label}</span>
                    <span className="text-sm font-bold text-foreground">{m.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-secondary rounded-full transition-all duration-700" style={{ width: `${m.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Status Breakdown */}
        {analytics && (
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Live Status Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(analytics.by_status || {}).map(([status, count]: [string, any]) => (
                <div key={status} className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">{status}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
