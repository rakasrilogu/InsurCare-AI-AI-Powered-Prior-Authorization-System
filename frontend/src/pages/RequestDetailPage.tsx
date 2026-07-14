import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, FileText, Shield, Brain, Clock, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const AGENT_LABELS: Record<string, string> = {
  intake: '1. Intake',
  eligibility: '2. Eligibility',
  policy: '3. Policy (RAG)',
  risk: '4. Risk',
  decision: '5. Decision',
  communication: '6. Communication',
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const [req, setReq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getRequest(id)
      .then(setReq)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
    </DashboardLayout>
  );

  if (error || !req) return (
    <DashboardLayout>
      <div className="text-center py-20">
        <p className="text-muted-foreground">{error || 'Request not found.'}</p>
        <Link to="/requests"><Button variant="outline" className="mt-4">Back to Requests</Button></Link>
      </div>
    </DashboardLayout>
  );

  const decision = req.agent_runs?.find((r: any) => r.agent_id === 'decision')?.details;
  const isApproved = req.status === 'approved';
  const isDenied = req.status === 'rejected' || req.status === 'denied';

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
        <Link to="/requests" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to All Requests
        </Link>

        {/* Header */}
        <div className="bg-card rounded-2xl p-6 shadow-card flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-foreground font-mono">{req.request_code}</h1>
              <StatusBadge status={req.status} />
            </div>
            <p className="text-muted-foreground text-sm">Submitted {new Date(req.created_at).toLocaleString()}</p>
            {req.confidence_score && (
              <p className="text-muted-foreground text-sm">AI Confidence: {Math.round(req.confidence_score * 100)}%</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Risk Score</p>
            <p className={`text-3xl font-bold ${(req.risk_score??0)>70?'text-destructive':(req.risk_score??0)>40?'text-warning':'text-success'}`}>
              {req.risk_score ? Math.round(req.risk_score) : '—'}
            </p>
          </div>
        </div>

        {/* Patient & Insurance */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-secondary" /><h3 className="font-semibold text-foreground">Patient Details</h3></div>
            <dl className="space-y-3 text-sm">
              {[['Name', req.patient_name],['Patient ID', req.patient_id],['Age', req.patient_age],['Gender', req.patient_gender],['Diagnosis', req.diagnosis || '—']].map(([k,v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground text-right max-w-48">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-2 mb-4"><Shield className="w-5 h-5 text-secondary" /><h3 className="font-semibold text-foreground">Insurance & Procedure</h3></div>
            <dl className="space-y-3 text-sm">
              {[['Insurer', req.insurance_provider],['Policy #', req.policy_number],['Procedure', req.procedure_name],['CPT Code', req.procedure_code]].map(([k,v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground text-right max-w-48">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Clinical Justification */}
        <div className="bg-card rounded-2xl p-6 shadow-card">
          <h3 className="font-semibold text-foreground mb-2">Clinical Justification</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{req.clinical_justification}</p>
        </div>

        {/* AI Decision */}
        {decision && (
          <div className={`rounded-2xl p-6 shadow-card border-2 ${
            isApproved ? 'bg-success/5 border-success/20' : isDenied ? 'bg-destructive/5 border-destructive/20' : 'bg-warning/5 border-warning/20'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-6 h-6 text-secondary" />
              <h3 className="font-semibold text-foreground text-lg">AI Decision</h3>
            </div>
            <div className="flex items-center gap-4 mb-5">
              {isApproved ? <CheckCircle2 className="w-8 h-8 text-success" /> :
               isDenied   ? <XCircle className="w-8 h-8 text-destructive" /> :
               <AlertTriangle className="w-8 h-8 text-warning" />}
              <div>
                <p className={`text-2xl font-bold ${isApproved?'text-success':isDenied?'text-destructive':'text-warning'}`}>
                  {(decision?.decision || req.status || '').toUpperCase()}
                </p>
                <p className="text-sm text-muted-foreground">Confidence: {decision?.confidence}%</p>
              </div>
            </div>
            {decision?.clinical_reasoning && (
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-1">Clinical Reasoning</p>
                <p className="text-sm text-muted-foreground">{decision.clinical_reasoning}</p>
              </div>
            )}
            {decision?.policy_basis?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-2">Policy Clauses Cited</p>
                <div className="flex flex-wrap gap-2">
                  {decision.policy_basis.map((c: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-medium">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {decision?.physician_recommendation && (
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-1">Physician Recommendation</p>
                <p className="text-sm text-muted-foreground">{decision.physician_recommendation}</p>
              </div>
            )}
            {decision?.appeal_pathway && isDenied && (
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Appeal Pathway</p>
                <p className="text-sm text-foreground">{decision.appeal_pathway}</p>
              </div>
            )}
          </div>
        )}

        {/* Agent Run Timeline */}
        {req.agent_runs?.length > 0 && (
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-2 mb-5"><Clock className="w-5 h-5 text-secondary" /><h3 className="font-semibold text-foreground">Agent Pipeline Timeline</h3></div>
            <div className="space-y-4">
              {req.agent_runs.sort((a: any, b: any) => a.id - b.id).map((run: any) => (
                <div key={run.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      run.status === 'completed' ? 'bg-success/10 text-success' :
                      run.status === 'error'     ? 'bg-destructive/10 text-destructive' :
                      run.status === 'active'    ? 'bg-secondary/10 text-secondary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {run.status === 'completed' ? '✓' : run.status === 'error' ? '✗' : '…'}
                    </div>
                    <div className="flex-1 w-px bg-border mt-2" />
                  </div>
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{AGENT_LABELS[run.agent_id] || run.agent_id}</span>
                      {run.confidence != null && (
                        <span className="text-xs text-muted-foreground">· {Math.round(run.confidence * 100)}% confidence</span>
                      )}
                      {run.duration_ms != null && (
                        <span className="text-xs text-muted-foreground">· {(run.duration_ms/1000).toFixed(1)}s</span>
                      )}
                    </div>
                    {run.output && <p className="text-sm text-muted-foreground leading-relaxed">{run.output}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {req.final_summary && (
          <div className="bg-muted/30 rounded-2xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pipeline Summary</p>
            <p className="text-sm text-foreground">{req.final_summary}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Link to="/submit"><Button className="gradient-accent text-secondary-foreground border-0">New PA Request</Button></Link>
          <Link to="/requests"><Button variant="outline">All Requests</Button></Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
