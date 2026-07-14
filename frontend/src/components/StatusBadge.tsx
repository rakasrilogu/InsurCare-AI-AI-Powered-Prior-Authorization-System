type Status = 'pending' | 'processing' | 'approved' | 'denied' | 'rejected' | 'escalated' | 'review' | string;

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  pending:    { label: 'Pending',     className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  processing: { label: 'Processing',  className: 'bg-secondary/10 text-secondary border-secondary/20 animate-pulse', dot: 'bg-secondary' },
  approved:   { label: 'Approved',    className: 'bg-success/10 text-success border-success/20',            dot: 'bg-success' },
  denied:     { label: 'Denied',      className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
  rejected:   { label: 'Rejected',    className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
  escalated:  { label: 'Escalated',   className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  review:     { label: 'Needs Review',className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
};

const StatusBadge = ({ status }: { status: Status }) => {
  const cfg = statusConfig[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
