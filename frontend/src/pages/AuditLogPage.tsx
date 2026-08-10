import { useEffect, useState } from 'react';
import { Shield, RefreshCw, Loader2, Filter, Clock, User, FileText, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { api, AuditLog } from '@/lib/api';

const ACTION_ICONS: Record<string, typeof Shield> = {
  create: FileText,
  approve_payment: Shield,
  dispute: AlertTriangle,
  verify_documents: Shield,
};

const ACTION_COLORS: Record<string, string> = {
  create: 'text-success',
  approve_payment: 'text-secondary',
  dispute: 'text-destructive',
  verify_documents: 'text-blue-500',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  const load = () => {
    setLoading(true);
    api.listAuditLogs({ action: filter || undefined, limit: 200 })
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
            <p className="text-muted-foreground text-sm">
              Compliance trail — who did what action on which record and when.
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {['', 'create', 'approve_payment', 'dispute', 'verify_documents'].map(action => (
            <button key={action} onClick={() => setFilter(action)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === action
                  ? 'bg-secondary text-secondary-foreground border-secondary'
                  : 'bg-card text-muted-foreground border-border hover:border-secondary/40'
              }`}>
              {action === '' ? 'All Actions' : action.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-7 h-7 animate-spin text-secondary" />
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-card rounded-2xl p-12 text-center shadow-card text-muted-foreground text-sm">
            No audit log entries yet. Actions will appear here as they happen.
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resource</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Detail</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const Icon = ACTION_ICONS[log.action] || Shield;
                    const color = ACTION_COLORS[log.action] || 'text-muted-foreground';
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className="text-sm font-medium text-foreground capitalize">
                              {log.action.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-foreground">{log.user_email || '—'}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{log.user_role || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className="text-sm text-foreground">
                            {log.resource_type}
                            {log.resource_id ? ` #${log.resource_id}` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-3 max-w-xs">
                          <p className="text-xs text-muted-foreground truncate">{log.detail || '—'}</p>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
              Showing {logs.length} entries
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
