type Status = 'pending' | 'processing' | 'approved' | 'denied' | 'rejected' | 'escalated' | 'review' | 'requires_information' | 'partially_approved' | 'human_review' | 'resubmitted' | 'appeal_submitted' | 'appeal_under_review' | 'appeal_approved' | 'appeal_rejected' | 'payment_pending' | 'paid' | 'disputed' | string;

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  pending:              { label: 'Pending',                className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  processing:           { label: 'Processing',             className: 'bg-secondary/10 text-secondary border-secondary/20 animate-pulse', dot: 'bg-secondary' },
  approved:             { label: 'Approved',               className: 'bg-success/10 text-success border-success/20',            dot: 'bg-success' },
  denied:               { label: 'Denied',                 className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
  rejected:             { label: 'Rejected',               className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
  escalated:            { label: 'Escalated',              className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  review:               { label: 'Needs Review',           className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  requires_information: { label: 'Info Required',          className: 'bg-orange-500/10 text-orange-600 border-orange-500/20',  dot: 'bg-orange-500' },
  partially_approved:   { label: 'Partially Approved',     className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',        dot: 'bg-blue-500' },
  human_review:         { label: 'Human Review',           className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  resubmitted:          { label: 'Resubmitted',            className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',        dot: 'bg-blue-500' },
  appeal_submitted:     { label: 'Appeal Submitted',       className: 'bg-purple-500/10 text-purple-600 border-purple-500/20',  dot: 'bg-purple-500' },
  appeal_under_review:  { label: 'Appeal Under Review',    className: 'bg-warning/10 text-warning border-warning/20',           dot: 'bg-warning' },
  appeal_approved:      { label: 'Appeal Approved',        className: 'bg-success/10 text-success border-success/20',            dot: 'bg-success' },
  appeal_rejected:      { label: 'Appeal Rejected',        className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
  payment_pending:      { label: 'Payment Pending',        className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',        dot: 'bg-blue-500' },
  paid:                 { label: 'Paid',                   className: 'bg-success/10 text-success border-success/20',            dot: 'bg-success' },
  disputed:             { label: 'Disputed',               className: 'bg-destructive/10 text-destructive border-destructive/20',dot: 'bg-destructive' },
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
