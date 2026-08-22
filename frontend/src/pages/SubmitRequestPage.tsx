import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, User, Building2, Stethoscope, AlertCircle, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

const INSURERS = ['Star Health', 'HDFC Ergo', 'ICICI Lombard', 'Max Bupa', 'Bajaj Allianz', 'New India Assurance', 'United India Insurance', 'Oriental Insurance'];

const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
  <div className="flex items-center gap-2 pb-3 mb-1 border-b border-border">
    <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
      <Icon className="w-4 h-4 text-secondary" />
    </div>
    <h3 className="font-semibold text-foreground tracking-wide uppercase text-xs">{title}</h3>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
    {children}
  </div>
);

const inputCls = "bg-background border-border focus:ring-2 focus:ring-secondary/30 font-mono text-sm h-10";
const selectCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-2 focus:ring-secondary/30";

const SubmitRequestPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    patient_name: '',
    patient_id: '',
    patient_age: '',
    patient_gender: '',
    insurance_provider: '',
    policy_number: '',
    plan_name: '',
    sum_insured: '',
    deductible: '',
    coverage_pct: '',
    valid_until: '',
    procedure_name: '',
    procedure_code: '',
    diagnosis: '',
    clinical_justification: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const newFiles = Array.from(e.dataTransfer.files);
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (i: number) => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        patient_age: parseInt(form.patient_age, 10),
        sum_insured: form.sum_insured ? parseFloat(form.sum_insured) : undefined,
        deductible: form.deductible ? parseFloat(form.deductible) : undefined,
        coverage_pct: form.coverage_pct ? parseFloat(form.coverage_pct) : undefined,
        documents: uploadedFiles.map(f => f.name),
      };
      const created = await api.createRequest(payload);
      if (uploadedFiles.length > 0) {
        const verifyResult = await api.verifyDocuments(created.id, uploadedFiles);
        toast({
          title: 'PA Request Submitted!',
          description: `${verifyResult.verified}/${verifyResult.total} documents verified.`,
        });
      } else {
        toast({
          title: 'PA Request Submitted!',
          description: `${created.request_code} is now being processed by the 6-agent AI pipeline.`,
        });
      }
      navigate(`/result/${created.id}`);
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-up pb-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">New PA Request</h1>
          <p className="text-muted-foreground text-sm mt-1">Submit a prior authorization request for AI-powered processing by the 6-agent pipeline.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── PATIENT INFORMATION ── */}
          <div className="bg-card rounded-2xl p-6 shadow-card space-y-4">
            <SectionHeader icon={User} title="Patient Information" />
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Full Name">
                <Input className={inputCls} placeholder="e.g. Priya Sharma" value={form.patient_name} onChange={set('patient_name')} required />
              </Field>
              <Field label="Patient ID">
                <Input className={inputCls} placeholder="e.g. P-10042" value={form.patient_id} onChange={set('patient_id')} required />
              </Field>
              <Field label="Age">
                <Input className={inputCls} type="number" placeholder="e.g. 54" value={form.patient_age} onChange={set('patient_age')} required min={0} max={150} />
              </Field>
              <Field label="Gender">
                <select className={selectCls} value={form.patient_gender} onChange={set('patient_gender')} required>
                  <option value="">Select gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>
          </div>

          {/* ── INSURANCE POLICY DETAILS ── */}
          <div className="bg-card rounded-2xl p-6 shadow-card space-y-4">
            <SectionHeader icon={Building2} title="Insurance Policy Details" />
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Insurer">
                <select className={selectCls} value={form.insurance_provider} onChange={set('insurance_provider')} required>
                  <option value="">Select insurer</option>
                  {INSURERS.map(i => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Policy Number">
                <Input className={inputCls} placeholder="e.g. HE-2026-77123" value={form.policy_number} onChange={set('policy_number')} required />
              </Field>
              <Field label="Plan Name">
                <Input className={inputCls} placeholder="e.g. Comprehensive Gold" value={form.plan_name} onChange={set('plan_name')} />
              </Field>
              <Field label="Sum Insured (₹)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input className={`${inputCls} pl-7`} placeholder="e.g. 500000" value={form.sum_insured} onChange={set('sum_insured')} type="number" />
                </div>
              </Field>
              <Field label="Deductible (₹)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input className={`${inputCls} pl-7`} placeholder="e.g. 10000" value={form.deductible} onChange={set('deductible')} type="number" />
                </div>
              </Field>
              <Field label="Coverage %">
                <div className="relative">
                  <Input className={`${inputCls} pr-8`} placeholder="e.g. 80" value={form.coverage_pct} onChange={set('coverage_pct')} type="number" min={0} max={100} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </Field>
              <Field label="Valid Until">
                <Input className={inputCls} placeholder="e.g. 31/03/2027" value={form.valid_until} onChange={set('valid_until')} />
              </Field>
            </div>
          </div>

          {/* ── PROCEDURE DETAILS ── */}
          <div className="bg-card rounded-2xl p-6 shadow-card space-y-4">
            <SectionHeader icon={Stethoscope} title="Procedure Details" />
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Procedure Name">
                <Input className={inputCls} placeholder="e.g. Total Knee Replacement" value={form.procedure_name} onChange={set('procedure_name')} required />
              </Field>
              <Field label="CPT Code">
                <Input className={inputCls} placeholder="e.g. CPT-27447" value={form.procedure_code} onChange={set('procedure_code')} required />
              </Field>
            </div>
            <Field label="Diagnosis (ICD-10)">
              <Input className={inputCls} placeholder="e.g. M17.11 - Primary Osteoarthritis" value={form.diagnosis} onChange={set('diagnosis')} />
            </Field>
            <Field label="Clinical Justification">
              <Textarea
                className="bg-background border-border focus:ring-2 focus:ring-secondary/30 text-sm font-mono leading-relaxed resize-none"
                rows={5}
                placeholder="Describe why this procedure is medically necessary..."
                value={form.clinical_justification}
                onChange={set('clinical_justification')}
                required
              />
            </Field>
          </div>

          {/* ── DOCUMENTS ── */}
          <div className="bg-card rounded-2xl p-6 shadow-card space-y-4">
            <SectionHeader icon={FileText} title="Supporting Documents" />
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragActive ? 'border-secondary bg-secondary/5' : 'border-border hover:border-secondary/50'}`}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleFileDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input id="file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileInput} />
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">Drag & drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Medical reports, lab results, referral letters — PDF, JPG, PNG</p>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-secondary shrink-0" />
                      <span className="text-foreground font-mono text-xs">{f.name}</span>
                      <span className="text-muted-foreground text-xs">({(f.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── AI Notice ── */}
          <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">AI-Powered Processing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your request will be analyzed by 6 AI agents: Intake → Eligibility → Policy → Risk → Decision → Communication. Results in ~60 seconds.</p>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-3">
            <Button type="submit" className="gradient-accent text-secondary-foreground border-0 px-8 gap-2" disabled={loading}>
              {loading ? 'Submitting to AI Pipeline…' : (<><span>Submit PA Request</span><span>→</span></>)}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>Cancel</Button>
          </div>

        </form>
      </div>
    </DashboardLayout>
  );
};

export default SubmitRequestPage;
