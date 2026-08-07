import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, AlertTriangle, IndianRupee, ShieldCheck,
  FileText, ArrowLeft, Loader2, TrendingUp, AlertCircle, ArrowRight,
  ClipboardList, Phone, Clock, ShieldAlert, ThumbsUp
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const RISK_COLOR: Record<string, string> = {
  low: 'text-success', moderate: 'text-warning',
  elevated: 'text-orange-500', high: 'text-destructive',
};

function RiskBar({ score }: { score: number }) {
  const color = score > 70 ? '#ef4444' : score > 50 ? '#f97316' : score > 30 ? '#eab308' : '#22c55e';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
          initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 1, delay: 0.3 }} />
      </div>
      <span className="text-sm font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  );
}

function ReasonItem({ text, type }: { text: string; type: 'good' | 'bad' | 'info' }) {
  const icons = { good: <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />, bad: <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />, info: <AlertCircle className="w-4 h-4 text-secondary shrink-0 mt-0.5" /> };
  return (
    <motion.div className="flex items-start gap-2.5 py-1.5"
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
      {icons[type]}
      <span className="text-sm text-foreground leading-relaxed">{text}</span>
    </motion.div>
  );
}

export default function ResultPage() {
  const { id } = useParams();
  const [req, setReq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const agentListRef = useRef<HTMLDivElement>(null);
  const { isInsurer } = useAuth();
  const { toast } = useToast();
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [disputing, setDisputing] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const data = await api.getRequest(id);
        setReq(data);
        if (['approved', 'rejected', 'escalated'].includes(data.status)) {
          setPolling(false);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
    const interval = setInterval(() => { if (polling) fetch(); }, 3000);
    return () => clearInterval(interval);
  }, [id, polling]);

  /* auto-scroll processing list to the currently active agent */
  const activeAgentId = (req?.agent_runs || [])
    .filter((r: any) => r.status === 'active')
    .sort((a: any, b: any) => b.id - a.id)[0]?.agent_id;

  useEffect(() => {
    if (!activeAgentId) return;
    const el = agentListRef.current?.querySelector(`[data-agent="${activeAgentId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeAgentId]);

  const handleApprovePayment = async () => {
    setApproving(true);
    setApproveError(null);
    try {
      const updated = await api.approvePayment(id!);
      setReq(updated);
      toast({ title: 'Payment approved', description: `Transaction: ${updated.transaction_id}` });
    } catch (e: any) {
      const msg = e?.body?.detail || e?.message || 'Failed to approve payment';
      setApproveError(msg);
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!disputeText.trim()) return;
    setDisputing(true);
    setDisputeError(null);
    try {
      const updated = await api.disputeRequest(id!, disputeText.trim());
      setReq(updated);
      setShowDisputeForm(false);
      setDisputeText('');
      toast({ title: 'Claim disputed', description: 'The insurer has marked this claim as disputed.' });
    } catch (e: any) {
      const msg = e?.body?.detail || e?.message || 'Failed to submit dispute';
      setDisputeError(msg);
    } finally {
      setDisputing(false);
    }
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-muted-foreground text-sm">Loading result...</p>
      </div>
    </DashboardLayout>
  );

  if (!req) return (
    <DashboardLayout>
      <div className="text-center py-20">
        <p className="text-muted-foreground">Request not found.</p>
        <Link to="/requests"><Button variant="outline" className="mt-4">Back to Requests</Button></Link>
      </div>
    </DashboardLayout>
  );

  const isApproved  = req.status === 'approved';
  const isDenied    = req.status === 'rejected' || req.status === 'denied';
  const isEscalated = req.status === 'escalated';
  const isProcessing = req.status === 'processing' || req.status === 'pending';

  const riskRun = req.agent_runs?.find((r: any) => r.agent_id === 'risk');
  const riskDetails = riskRun?.details || {};

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-slide-up pb-10">
        <Link to="/requests" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to All Requests
        </Link>
        {!isProcessing && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              isInsurer
                ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
            }`}>
              {isInsurer ? 'Insurer View — Full Detail' : 'Hospital View — Summary'}
            </span>
          </div>
        )}

        {/* ── Processing State ── */}
        {isProcessing && (
          <motion.div className="bg-card rounded-2xl p-10 shadow-card text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Loader2 className="w-12 h-12 animate-spin text-secondary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Processing Your Request</h2>
            <p className="text-muted-foreground text-sm mb-6">6 AI agents are analysing your PA request. This takes ~60–90 seconds.</p>
            <div ref={agentListRef} className="space-y-3 max-w-sm mx-auto text-left">
              {['intake', 'eligibility', 'policy', 'risk', 'decision', 'communication', 'payment'].map((agentId) => {
                const labels: Record<string, string> = {
                  intake: 'Intake Agent (Haiku)', eligibility: 'Eligibility Agent (Sonnet)',
                  policy: 'Policy Agent (Sonnet)', risk: 'Risk Agent (Sonnet)',
                  decision: 'Decision Agent (Sonnet)', communication: 'Communication Agent (Haiku)',
                  payment: 'Payment Agent',
                };
                const run = req.agent_runs?.find((r: any) => r.agent_id === agentId);
                const done = run?.status === 'completed';
                const active = run?.status === 'active';
                return (
                  <div key={agentId} data-agent={agentId}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                      active ? 'bg-secondary/10 ring-2 ring-secondary/30 scale-[1.02]' : ''
                    }`}>
                    {done ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                          : active ? <Loader2 className="w-5 h-5 text-secondary animate-spin shrink-0" />
                          : <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />}
                    <span className={`text-sm ${done ? 'text-foreground' : active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{labels[agentId]}</span>
                    {done && run?.duration_ms && <span className="text-xs text-muted-foreground ml-auto">{(run.duration_ms/1000).toFixed(1)}s</span>}
                    {active && <span className="text-xs text-secondary font-semibold ml-auto animate-pulse">RUNNING</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Final Result ── */}
        <AnimatePresence>
          {!isProcessing && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

              {/* Hero Banner */}
              <div className={`rounded-2xl p-8 mb-6 ${
                isApproved  ? 'bg-gradient-to-br from-success/10 to-success/5 border-2 border-success/30' :
                isDenied    ? 'bg-gradient-to-br from-destructive/10 to-destructive/5 border-2 border-destructive/30' :
                              'bg-gradient-to-br from-warning/10 to-warning/5 border-2 border-warning/30'
              }`}>
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    {isApproved  ? <CheckCircle2 className="w-14 h-14 text-success" /> :
                     isDenied    ? <XCircle className="w-14 h-14 text-destructive" /> :
                                   <AlertTriangle className="w-14 h-14 text-warning" />}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Insurance Claim</p>
                      <h1 className={`text-4xl font-black ${isApproved ? 'text-success' : isDenied ? 'text-destructive' : 'text-warning'}`}>
                        {isApproved ? 'APPROVED' : isDenied ? 'DENIED' : 'ESCALATED'}
                      </h1>
                      <p className="text-muted-foreground text-sm mt-1">
                        {req.request_code} · {req.patient_name} · {req.procedure_name}
                      </p>
                    </div>
                  </div>
                  {isApproved && req.approved_amount_inr > 0 && (
                    <div className="bg-success/10 border border-success/20 rounded-2xl px-6 py-4 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Approved Amount</p>
                      <p className="text-3xl font-black text-success flex items-center gap-1">
                        <IndianRupee className="w-6 h-6" />
                        {Number(req.approved_amount_inr).toLocaleString('en-IN')}
                      </p>
                      {req.coverage_percentage > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{req.coverage_percentage}% of admissible claim</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Plain English Summary */}
                {req.plain_english_summary && (
                  <div className="mt-6 bg-white/60 rounded-xl p-4">
                    <p className="text-sm text-foreground leading-relaxed font-medium">{req.plain_english_summary}</p>
                  </div>
                )}

                {/* Key metrics row */}
                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div className="bg-white/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">AI Confidence</p>
                    <p className="text-xl font-bold text-foreground">{req.confidence_score ? Math.round(req.confidence_score * 100) : '—'}%</p>
                  </div>
                  <div className="bg-white/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                    <p className={`text-xl font-bold ${RISK_COLOR[riskDetails?.risk_level || 'moderate'] || 'text-foreground'}`}>
                      {req.risk_score ? Math.round(req.risk_score) : '—'} <span className="text-xs font-normal capitalize">({riskDetails?.risk_level || '—'})</span>
                    </p>
                  </div>
                  <div className="bg-white/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">Insurer</p>
                    <p className="text-sm font-bold text-foreground">{req.insurance_provider}</p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">

                {/* Patient & Procedure Summary — both roles */}
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Patient & Procedure</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-muted-foreground">Patient</p><p className="font-medium text-foreground">{req.patient_name}</p></div>
                    <div><p className="text-muted-foreground">Age / Gender</p><p className="font-medium text-foreground">{req.patient_age} · {req.patient_gender}</p></div>
                    <div><p className="text-muted-foreground">Procedure</p><p className="font-medium text-foreground">{req.procedure_name}</p></div>
                    <div><p className="text-muted-foreground">CPT Code</p><p className="font-mono font-medium text-foreground">{req.procedure_code}</p></div>
                    <div><p className="text-muted-foreground">Diagnosis</p><p className="font-medium text-foreground">{req.diagnosis || '—'}</p></div>
                    <div><p className="text-muted-foreground">Policy</p><p className="font-medium text-foreground">{req.policy_number}</p></div>
                  </div>
                  {req.clinical_justification && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Clinical Justification</p>
                      <p className="text-sm text-foreground leading-relaxed">{req.clinical_justification}</p>
                    </div>
                  )}
                </div>

                {/* WHY APPROVED / WHY DENIED — both roles */}
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    {isApproved ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-destructive" />}
                    <h3 className="font-bold text-foreground">{isApproved ? 'Why Approved' : isDenied ? 'Why Denied' : 'Why Escalated'}</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {isApproved && (req.approval_reasons || []).map((r: string, i: number) => (
                      <ReasonItem key={i} text={r} type="good" />
                    ))}
                    {(isDenied || isEscalated) && (req.denial_reasons || []).map((r: string, i: number) => (
                      <ReasonItem key={i} text={r} type="bad" />
                    ))}
                    {(req.approval_reasons?.length === 0 && req.denial_reasons?.length === 0) && (
                      <p className="text-sm text-muted-foreground py-2">No detailed reasons available.</p>
                    )}
                  </div>
                </div>

                {/* Policy Clauses — both roles see this (insurer label differs) */}
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Policy Clauses Cited</h3>
                    {!isInsurer && (
                      <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Reference</span>
                    )}
                  </div>
                  {(req.policy_clauses_cited || []).length > 0 ? (
                    <div className="space-y-2">
                      {req.policy_clauses_cited.map((c: string, i: number) => (
                        <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                          className="flex items-start gap-2 p-3 rounded-xl bg-secondary/5 border border-secondary/10">
                          <ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground">{c}</span>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No specific clauses cited.</p>
                  )}
                </div>

                {/* Risk Assessment — both roles (insurer sees full breakdown, hospital sees summary) */}
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Risk Assessment</h3>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-1">Overall Risk Score (0–100)</p>
                    <RiskBar score={req.risk_score || 0} />
                  </div>
                  {/* Full breakdown — insurer only */}
                  {isInsurer && (
                    <div className="space-y-3">
                      {[
                        { label: 'Severity Score', value: riskDetails?.severity_score, weight: '40%' },
                        { label: 'Delay Factor', value: riskDetails?.delay_factor_score, weight: '35%' },
                        { label: 'Age Factor', value: riskDetails?.age_factor_score, weight: '25%' },
                      ].map(({ label, value, weight }) => (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{label} <span className="opacity-60">({weight})</span></span>
                            <span className="font-medium text-foreground">{value ?? '—'}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-secondary rounded-full" style={{ width: `${value ?? 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Risk level badge — hospital sees this */}
                  {!isInsurer && riskDetails?.risk_level && (
                    <div className="flex items-center gap-2 mt-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        riskDetails.risk_level === 'low' ? 'bg-success/10 text-success' :
                        riskDetails.risk_level === 'moderate' ? 'bg-warning/10 text-warning' :
                        riskDetails.risk_level === 'high' ? 'bg-destructive/10 text-destructive' :
                        'bg-orange-500/10 text-orange-500'
                      }`}>
                        {riskDetails.risk_level.toUpperCase()} RISK
                      </span>
                      <span className="text-xs text-muted-foreground">Based on severity, delay, and age factors</span>
                    </div>
                  )}
                  {riskDetails?.comorbidity_flags?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Comorbidity Flags</p>
                      <div className="flex flex-wrap gap-2">
                        {riskDetails.comorbidity_flags.map((f: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-warning/10 text-warning rounded-lg text-xs">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Next Steps — both roles */}
                <div className="bg-card rounded-2xl p-6 shadow-card md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Next Steps</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      {(req.next_steps || []).map((s: string, i: number) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                          className="flex items-start gap-2.5">
                          <ArrowRight className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground">{s}</span>
                        </motion.div>
                      ))}
                      {(req.next_steps || []).length === 0 && (
                        <p className="text-sm text-muted-foreground">No specific next steps.</p>
                      )}
                    </div>
                    {req.doctor_recommendation && (
                      <div className="bg-secondary/5 rounded-xl p-4 border border-secondary/10">
                        <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-1">Doctor Recommendation</p>
                        <p className="text-sm text-foreground">{req.doctor_recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Appeal Pathway — both roles if denied */}
                {(isDenied || isEscalated) && req.appeal_pathway && (
                  <div className="md:col-span-2 bg-warning/5 rounded-2xl p-6 border border-warning/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="w-5 h-5 text-warning" />
                      <h3 className="font-bold text-foreground">How to Appeal</h3>
                    </div>
                    <p className="text-sm text-foreground">{req.appeal_pathway}</p>
                  </div>
                )}

                {/* Coverage breakdown — only if approved */}
                {isApproved && req.approved_amount_inr > 0 && (
                  <div className="md:col-span-2 bg-success/5 rounded-2xl p-6 border border-success/20">
                    <div className="flex items-center gap-2 mb-4">
                      <IndianRupee className="w-5 h-5 text-success" />
                      <h3 className="font-bold text-foreground">Coverage Breakdown</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Approved Amount</p>
                        <p className="text-2xl font-black text-success">₹{Number(req.approved_amount_inr).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Coverage</p>
                        <p className="text-2xl font-black text-foreground">{req.coverage_percentage}%</p>
                      </div>
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Insurer</p>
                        <p className="text-lg font-bold text-foreground">{req.insurance_provider}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Status */}
                {req.payment_status && req.payment_status !== 'not_applicable' && (
                  <div className="md:col-span-2 bg-card rounded-2xl p-6 shadow-card border border-border/50">
                    <div className="flex items-center gap-2 mb-4">
                      <IndianRupee className="w-5 h-5 text-secondary" />
                      <h3 className="font-bold text-foreground">Payment Status</h3>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-white/60 rounded-xl p-4 text-center col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">Status</p>
                        {req.payment_status === 'paid' ? (
                          <div>
                            <p className="text-xl font-black text-success">PAID</p>
                            {req.transaction_id && <p className="text-xs font-mono text-muted-foreground mt-1">TXN: {req.transaction_id}</p>}
                            {req.paid_at && <p className="text-xs text-muted-foreground">{new Date(req.paid_at).toLocaleString()}</p>}
                          </div>
                        ) : req.payment_status === 'pending_insurer_approval' ? (
                          <div>
                            <p className="text-xl font-black text-warning">PENDING INSURER APPROVAL</p>
                            <p className="text-xs text-muted-foreground mt-1">Insurer needs to approve disbursement</p>
                            {isInsurer && (
                              <div className="mt-3 space-y-2">
                                {req.disputed && (
                                  <p className="text-xs text-destructive font-medium">Resolve the dispute before approving payment</p>
                                )}
                                <Button
                                  onClick={handleApprovePayment}
                                  disabled={approving || req.disputed}
                                  size="sm"
                                  className="gradient-accent text-secondary-foreground border-0"
                                >
                                  {approving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ThumbsUp className="w-4 h-4 mr-1" />}
                                  Approve & Pay
                                </Button>
                                {approveError && <p className="text-xs text-destructive">{approveError}</p>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{req.payment_status}</p>
                        )}
                      </div>
                      {req.disputed && (
                        <div className="bg-destructive/5 rounded-xl p-4 text-center border border-destructive/20">
                          <p className="text-xs text-muted-foreground mb-1">Disputed</p>
                          <p className="text-sm font-semibold text-destructive">Yes</p>
                          {req.dispute_reason && <p className="text-xs text-muted-foreground mt-1">{req.dispute_reason}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Dispute — insurer only */}
                {isInsurer && !req.disputed && (isApproved || isDenied) && (
                  <div className="md:col-span-2 bg-card rounded-2xl p-6 shadow-card border border-border/50">
                    <div className="flex items-center gap-2 mb-4">
                      <ShieldAlert className="w-5 h-5 text-destructive" />
                      <h3 className="font-bold text-foreground">Dispute Decision</h3>
                    </div>
                    {!showDisputeForm ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => setShowDisputeForm(true)}
                      >
                        <ShieldAlert className="w-4 h-4 mr-1" />
                        Dispute Decision
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-destructive/30"
                          placeholder="Explain why you are disputing this decision..."
                          value={disputeText}
                          onChange={e => setDisputeText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSubmitDispute}
                            disabled={disputing || !disputeText.trim()}
                            size="sm"
                            variant="destructive"
                          >
                            {disputing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                            Submit Dispute
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setShowDisputeForm(false); setDisputeText(''); setDisputeError(null); }}
                            disabled={disputing}
                          >
                            Cancel
                          </Button>
                        </div>
                        {disputeError && <p className="text-xs text-destructive">{disputeError}</p>}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Agent Timeline — insurer only (full audit trail) */}
              {isInsurer && req.agent_runs?.length > 0 && (
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Agent Pipeline Timeline</h3>
                  </div>
                  <div className="space-y-3">
                    {req.agent_runs.sort((a: any, b: any) => a.id - b.id).map((run: any) => (
                      <div key={run.id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                          run.status==='completed'?'bg-success/10 text-success':
                          run.status==='error'?'bg-destructive/10 text-destructive':'bg-muted text-muted-foreground'
                        }`}>{run.status==='completed'?'✓':run.status==='error'?'✗':'…'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground capitalize">{run.agent_id}</span>
                            {run.confidence!=null && <span className="text-xs text-muted-foreground">{Math.round(run.confidence*100)}%</span>}
                            {run.duration_ms!=null && <span className="text-xs text-muted-foreground">{(run.duration_ms/1000).toFixed(1)}s</span>}
                          </div>
                          {run.output && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{run.output}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Simplified Agent Pipeline — hospital only */}
              {!isInsurer && req.agent_runs?.length > 0 && (
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Agent Pipeline Status</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {req.agent_runs.sort((a: any, b: any) => a.id - b.id).map((run: any) => (
                      <div key={run.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                        run.status==='completed'?'bg-success/10 text-success border border-success/20':
                        run.status==='error'?'bg-destructive/10 text-destructive border border-destructive/20':
                        'bg-muted text-muted-foreground border border-border'
                      }`}>
                        {run.status==='completed' ? '✓' : run.status==='error' ? '✗' : '…'}
                        <span className="capitalize">{run.agent_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Link to="/submit"><Button className="gradient-accent text-secondary-foreground border-0">New PA Request</Button></Link>
                <Link to="/requests"><Button variant="outline">All Requests</Button></Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
