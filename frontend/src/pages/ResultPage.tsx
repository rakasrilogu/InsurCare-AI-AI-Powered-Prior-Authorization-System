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
  // Insurer action state
  const [showInsurerDecision, setShowInsurerDecision] = useState(false);
  const [insurerDecision, setInsurerDecision] = useState('');
  const [insurerReason, setInsurerReason] = useState('');
  const [insurerAmount, setInsurerAmount] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [showRequestInfo, setShowRequestInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [infoDocuments, setInfoDocuments] = useState('');
  const [submittingInfo, setSubmittingInfo] = useState(false);
  // Hospital appeal state
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealExplanation, setAppealExplanation] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const data = await api.getRequest(id);
        setReq(data);
        if (['approved', 'rejected', 'denied', 'escalated', 'partially_approved', 'appeal_submitted', 'appeal_rejected', 'appeal_approved'].includes(data.status)) {
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

  const handleInsurerDecision = async () => {
    if (!insurerDecision) return;
    setSubmittingDecision(true);
    try {
      const amt = insurerAmount ? parseFloat(insurerAmount) : undefined;
      const updated = await api.insurerDecision(id!, insurerDecision, insurerReason, amt);
      setReq(updated);
      setShowInsurerDecision(false);
      setInsurerDecision('');
      setInsurerReason('');
      setInsurerAmount('');
      toast({ title: 'Decision submitted', description: `Request ${insurerDecision.replace('_', ' ')}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.body?.detail || e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!infoMessage.trim()) return;
    setSubmittingInfo(true);
    try {
      const docs = infoDocuments.split(',').map(d => d.trim()).filter(Boolean);
      const updated = await api.requestInfo(id!, infoMessage.trim(), docs);
      setReq(updated);
      setShowRequestInfo(false);
      setInfoMessage('');
      setInfoDocuments('');
      toast({ title: 'Information requested', description: 'Hospital has been notified.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.body?.detail || e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSubmittingInfo(false);
    }
  };

  const handleResubmit = async () => {
    setSubmittingDecision(true);
    try {
      const updated = await api.resubmitRequest(id!);
      setReq(updated);
      setShowResubmit(false);
      toast({ title: 'Resubmitted', description: 'Request is back in processing.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.body?.detail || e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleAppeal = async () => {
    if (!appealReason.trim()) return;
    setSubmittingAppeal(true);
    try {
      const updated = await api.submitAppeal(id!, appealReason.trim(), appealExplanation.trim());
      setReq(updated);
      setShowAppealForm(false);
      setAppealReason('');
      setAppealExplanation('');
      toast({ title: 'Appeal submitted', description: 'Insurer has been notified.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.body?.detail || e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleReviewAppeal = async (decision: string) => {
    setSubmittingDecision(true);
    try {
      const updated = await api.reviewAppeal(id!, decision, `Appeal ${decision.replace('appeal_', '')}`);
      setReq(updated);
      toast({ title: 'Appeal reviewed', description: `Appeal ${decision.replace('appeal_', '')}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.body?.detail || e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSubmittingDecision(false);
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
  const requiresInfo = req.status === 'requires_information';
  const partialApproval = req.status === 'partially_approved';

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
          <motion.div className="bg-card rounded-2xl p-10 shadow-card"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-center mb-6">
              <Loader2 className="w-12 h-12 animate-spin text-secondary mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">Processing Your Request</h2>
              <p className="text-muted-foreground text-sm">
                {isInsurer ? 'AI pipeline is analysing the PA request.' : 'Your request is being processed by our AI system.'}
              </p>
            </div>
            <div ref={agentListRef} className="space-y-3 max-w-md mx-auto">
              {[
                { id: 'intake', label: 'Intake Agent', desc: 'Validating request fields' },
                { id: 'eligibility', label: 'Eligibility Agent', desc: 'Checking policy coverage' },
                { id: 'policy', label: 'Policy Agent (RAG)', desc: 'Retrieving policy clauses' },
                { id: 'risk', label: 'Evidence/Risk Processing', desc: 'Assessing clinical evidence' },
                { id: 'decision', label: 'Decision Engine', desc: 'Deterministic rule-based evaluation' },
                { id: 'communication', label: 'Communication Agent', desc: 'Preparing authorization' },
                { id: 'payment', label: 'Payment Agent', desc: 'Processing payment workflow' },
              ].map(({ id, label, desc }) => {
                const run = req.agent_runs?.find((r: any) => r.agent_id === id);
                const done = run?.status === 'completed';
                const active = run?.status === 'active';
                const failed = run?.status === 'error';
                return (
                  <div key={id} data-agent={id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      active ? 'bg-secondary/10 ring-2 ring-secondary/30 scale-[1.02]' : ''
                    } ${failed ? 'bg-destructive/5' : ''}`}>
                    {done ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                          : failed ? <XCircle className="w-5 h-5 text-destructive shrink-0" />
                          : active ? <Loader2 className="w-5 h-5 text-secondary animate-spin shrink-0" />
                          : <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${done ? 'text-foreground' : active ? 'text-foreground font-semibold' : failed ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                      {isInsurer && <p className="text-xs text-muted-foreground">{desc}</p>}
                    </div>
                    {done && run?.duration_ms && <span className="text-xs text-muted-foreground ml-auto">{(run.duration_ms/1000).toFixed(1)}s</span>}
                    {active && <span className="text-xs text-secondary font-semibold ml-auto animate-pulse">RUNNING</span>}
                    {failed && <span className="text-xs text-destructive font-semibold ml-auto">FAILED</span>}
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

                {/* Policy Clauses — insurer only (audit trail) */}
                {isInsurer && (
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Policy Clauses Cited</h3>
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
                )}

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
                      <h3 className="font-bold text-foreground">Financial Assessment</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Requested / Procedure Cost</p>
                        <p className="text-lg font-bold text-foreground">₹{Number(req.sum_insured || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Approved Amount</p>
                        <p className="text-2xl font-black text-success">₹{Number(req.approved_amount_inr || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Coverage</p>
                        <p className="text-2xl font-black text-foreground">{req.coverage_percentage || 0}%</p>
                      </div>
                      <div className="bg-white/60 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Patient Responsibility</p>
                        <p className="text-lg font-bold text-warning">₹{Number((req.sum_insured || 0) - (req.approved_amount_inr || 0)).toLocaleString('en-IN')}</p>
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

              {/* ── Insurer Action Panel ── */}
              {isInsurer && !showDisputeForm && !req.disputed && (req.status === 'human_review' || req.status === 'escalated' || req.status === 'pending' || req.status === 'resubmitted' || req.status === 'processing') && (
                <div className="bg-card rounded-2xl p-6 shadow-card mt-6 border border-border/50">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Insurer Decision</h3>
                  </div>
                  {!showInsurerDecision ? (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" className="bg-success text-white hover:bg-success/90" onClick={() => { setShowInsurerDecision(true); setInsurerDecision('approved'); }}>Approve</Button>
                      <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { setShowInsurerDecision(true); setInsurerDecision('denied'); }}>Deny</Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowInsurerDecision(true); setInsurerDecision('partially_approved'); }}>Partial Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowRequestInfo(true)}><AlertCircle className="w-4 h-4 mr-1" />Request Info</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Decision: <span className={insurerDecision === 'approved' ? 'text-success' : insurerDecision === 'denied' ? 'text-destructive' : 'text-blue-600'}>{insurerDecision.replace('_', ' ').toUpperCase()}</span></p>
                      <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="Reason for decision..." value={insurerReason} onChange={e => setInsurerReason(e.target.value)} />
                      {insurerDecision === 'partially_approved' && (
                        <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" type="number" placeholder="Approved amount (INR)" value={insurerAmount} onChange={e => setInsurerAmount(e.target.value)} />
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleInsurerDecision} disabled={submittingDecision}>{submittingDecision ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Submit</Button>
                        <Button size="sm" variant="outline" onClick={() => { setShowInsurerDecision(false); setInsurerDecision(''); setInsurerReason(''); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Request More Information (Insurer) ── */}
              {isInsurer && showRequestInfo && (
                <div className="bg-card rounded-2xl p-6 shadow-card mt-6 border border-border/50">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 text-warning" />
                    <h3 className="font-bold text-foreground">Request More Information</h3>
                  </div>
                  <div className="space-y-3">
                    <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="What information is needed?" value={infoMessage} onChange={e => setInfoMessage(e.target.value)} />
                    <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Missing documents (comma-separated, e.g. Diagnostic Report, Lab Results)" value={infoDocuments} onChange={e => setInfoDocuments(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleRequestInfo} disabled={submittingInfo}>{submittingInfo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Send Request</Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowRequestInfo(false); setInfoMessage(''); setInfoDocuments(''); }}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Appeal Form (Hospital) ── */}
              {!isInsurer && (isDenied || req.status === 'rejected') && !req.appeal_status && (
                <div className="bg-card rounded-2xl p-6 shadow-card mt-6 border border-border/50">
                  <div className="flex items-center gap-2 mb-4">
                    <Phone className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Appeal Decision</h3>
                  </div>
                  {!showAppealForm ? (
                    <Button size="sm" variant="outline" onClick={() => setShowAppealForm(true)}>Submit Appeal</Button>
                  ) : (
                    <div className="space-y-3">
                      <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="Reason for appeal..." value={appealReason} onChange={e => setAppealReason(e.target.value)} />
                      <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[40px] resize-none" placeholder="Additional explanation (optional)..." value={appealExplanation} onChange={e => setAppealExplanation(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAppeal} disabled={submittingAppeal}>{submittingAppeal ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Submit Appeal</Button>
                        <Button size="sm" variant="outline" onClick={() => { setShowAppealForm(false); setAppealReason(''); setAppealExplanation(''); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Appeal Status (Hospital) ── */}
              {!isInsurer && req.appeal_status && (
                <div className="bg-card rounded-2xl p-6 shadow-card mt-6 border border-border/50">
                  <div className="flex items-center gap-2 mb-4">
                    <Phone className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Appeal Status</h3>
                    <StatusBadge status={`appeal_${req.appeal_status}`} />
                  </div>
                  {req.appeal_reason && <p className="text-sm text-muted-foreground"><strong>Reason:</strong> {req.appeal_reason}</p>}
                  {req.appeal_reviewer_notes && <p className="text-sm text-muted-foreground mt-2"><strong>Reviewer Notes:</strong> {req.appeal_reviewer_notes}</p>}
                </div>
              )}

              {/* ── Appeal Review (Insurer) ── */}
              {isInsurer && req.appeal_status === 'submitted' && (
                <div className="bg-card rounded-2xl p-6 shadow-card mt-6 border border-border/50">
                  <div className="flex items-center gap-2 mb-4">
                    <Phone className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Review Appeal</h3>
                    <StatusBadge status="appeal_submitted" />
                  </div>
                  {req.appeal_reason && <p className="text-sm text-muted-foreground mb-2"><strong>Reason:</strong> {req.appeal_reason}</p>}
                  {req.appeal_additional_explanation && <p className="text-sm text-muted-foreground mb-4"><strong>Explanation:</strong> {req.appeal_additional_explanation}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-success text-white hover:bg-success/90" onClick={() => handleReviewAppeal('appeal_approved')} disabled={submittingDecision}>Approve Appeal</Button>
                    <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => handleReviewAppeal('appeal_rejected')} disabled={submittingDecision}>Reject Appeal</Button>
                  </div>
                </div>
              )}

              {/* ── Resubmit Button (Hospital, requires_information) ── */}
              {!isInsurer && req.status === 'requires_information' && (
                <div className="mt-6">
                  <Button className="gradient-accent text-secondary-foreground border-0 gap-2" onClick={handleResubmit} disabled={submittingDecision}>
                    {submittingDecision ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Resubmit for Processing
                  </Button>
                </div>
              )}

              {/* Missing Information — when requires_information */}
              {req.status === 'requires_information' && req.missing_information?.length > 0 && (
                <div className="bg-warning/5 rounded-2xl p-6 border border-warning/20 mt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 text-warning" />
                    <h3 className="font-bold text-foreground">Missing Information</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Please upload the following documents and resubmit:</p>
                  <div className="space-y-2">
                    {req.missing_information.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10">
                        <XCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                  <Link to="/submit">
                    <Button className="mt-4 gradient-accent text-secondary-foreground border-0 gap-2" size="sm">
                      Upload Documents & Resubmit <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              )}

              {/* Human Review Status — when human review requested */}
              {req.human_review_requested && (
                <div className="bg-warning/5 rounded-2xl p-6 border border-warning/20 mt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-warning" />
                    <h3 className="font-bold text-foreground">Human Review Required</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">This request has been escalated for specialist review.</p>
                  {req.human_review_reasons?.length > 0 && (
                    <div className="space-y-2">
                      {req.human_review_reasons.map((reason: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10">
                          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground">{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {req.human_review_notes && (
                    <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Reviewer Notes</p>
                      <p className="text-sm text-foreground">{req.human_review_notes}</p>
                    </div>
                  )}
                </div>
              )}

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

              {/* Request Timeline — hospital only (user-friendly, no internal details) */}
              {!isInsurer && (
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Request Timeline</h3>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Request Submitted', done: true, time: req.created_at },
                      { label: 'Documents Uploaded', done: req.documents?.length > 0, time: req.created_at },
                      { label: 'Documents Verified', done: req.documents?.some((d: any) => d.verification?.status === 'verified'), time: req.updated_at },
                      { label: 'Processing Completed', done: ['approved','rejected','denied','escalated','partially_approved','appeal_submitted','appeal_rejected','appeal_approved','human_review','requires_information'].includes(req.status), time: req.updated_at },
                      { label: 'Additional Information Requested', done: req.status === 'requires_information' || req.status === 'resubmitted', time: req.info_request_submitted_at },
                      { label: 'Hospital Response Submitted', done: req.status === 'resubmitted', time: req.resubmitted_at },
                      { label: 'Insurer Review', done: req.human_reviewed_at || req.decision, time: req.human_reviewed_at || req.updated_at },
                      { label: 'Final Decision', done: ['approved','rejected','denied','partially_approved','appeal_rejected','appeal_approved'].includes(req.status), time: req.updated_at },
                      { label: 'Payment Status', done: req.payment_status === 'paid', time: req.paid_at },
                      { label: 'Appeal', done: !!req.appeal_status, time: req.appeal_submitted_at },
                    ].filter(step => step.done).map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{step.label}</p>
                          {step.time && <p className="text-xs text-muted-foreground">{new Date(step.time).toLocaleString()}</p>}
                        </div>
                      </div>
                    ))}
                    {!req.agent_runs?.length && !['approved','rejected','denied','escalated','partially_approved'].includes(req.status) && (
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                          <Loader2 className="w-4 h-4 text-secondary animate-spin" />
                        </div>
                        <p className="text-sm text-muted-foreground">Processing in progress...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Execution Trace — insurer only */}
              {isInsurer && req.agent_runs?.length > 0 && (
                <div className="bg-card rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold text-foreground">Execution Trace</h3>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Pipeline {req.status === 'processing' || req.status === 'pending' ? 'RUNNING' : 'COMPLETED'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { id: 'intake', label: 'Intake Agent', desc: 'Validating request fields' },
                      { id: 'eligibility', label: 'Eligibility Agent', desc: 'Checking policy coverage' },
                      { id: 'policy', label: 'Policy Agent (RAG)', desc: 'Retrieving policy clauses' },
                      { id: 'risk', label: 'Evidence/Risk Processing', desc: 'Assessing clinical evidence' },
                      { id: 'decision', label: 'Decision Engine', desc: 'Deterministic rule-based evaluation' },
                      { id: 'communication', label: 'Communication Agent', desc: 'Preparing authorization' },
                      { id: 'payment', label: 'Payment Agent', desc: 'Processing payment workflow' },
                    ].map(({ id, label, desc }) => {
                      const run = req.agent_runs?.find((r: any) => r.agent_id === id);
                      const done = run?.status === 'completed';
                      const active = run?.status === 'active';
                      const failed = run?.status === 'error';
                      const logs = run?.details?.logs || [];
                      const [expanded, setExpanded] = useState(false);
                      return (
                        <div key={id} className="border border-border/40 rounded-xl overflow-hidden">
                          <button onClick={() => setExpanded(!expanded)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              done ? 'bg-success/10 text-success' : failed ? 'bg-destructive/10 text-destructive' : active ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground'
                            }`}>
                              {done ? '✓' : failed ? '✗' : active ? '…' : '○'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium ${done ? 'text-foreground' : active ? 'text-foreground font-semibold' : failed ? 'text-destructive' : 'text-muted-foreground'}`}>{label}</span>
                              {isInsurer && <p className="text-xs text-muted-foreground">{desc}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {done && run?.duration_ms && <span className="text-xs text-muted-foreground">{(run.duration_ms/1000).toFixed(1)}s</span>}
                              {run?.confidence != null && <span className="text-xs text-muted-foreground">{Math.round(run.confidence * 100)}%</span>}
                              {active && <span className="text-xs text-secondary font-semibold animate-pulse">RUNNING</span>}
                              {failed && <span className="text-xs text-destructive font-semibold">FAILED</span>}
                              <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
                            </div>
                          </button>
                          {expanded && logs.length > 0 && (
                            <div className="px-4 pb-3 bg-muted/20 border-t border-border/30">
                              {logs.map((log: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 py-1.5 text-xs font-mono">
                                  <span className="text-muted-foreground shrink-0">{log.t ? new Date(log.t).toLocaleTimeString() : ''}</span>
                                  <span className="text-foreground">{log.msg}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {expanded && logs.length === 0 && run?.output && (
                            <div className="px-4 pb-3 bg-muted/20 border-t border-border/30">
                              <p className="text-xs text-muted-foreground font-mono">{run.output}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
