import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Mode = "signup" | "signin";
type Role = "hospital" | "insurer";

const ROLE_INFO: Record<Role, { label: string; description: string; color: string }> = {
  hospital: { label: "Hospital",        description: "Submit & view PA requests for your hospital", color: "blue"   },
  insurer:  { label: "Insurance Company", description: "Review claims sent to your company",        color: "purple" },
};

export default function LoginPage() {
  const [mode, setMode]               = useState<Mode>("signup");
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);

  // Signup fields
  const [fullName,       setFullName]       = useState("");
  const [role,           setRole]           = useState<Role>("hospital");
  const [canSubmit,      setCanSubmit]      = useState(false);
  const [hospital,       setHospital]       = useState("");
  const [companyName,    setCompanyName]    = useState("");
  const [specialization, setSpecialization] = useState("");
  const [confirmPass,    setConfirmPass]    = useState("");

  // Shared fields
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");

  const { login, signup } = useAuth();
  const nav               = useNavigate();
  const { toast }         = useToast();

  const passwordsMatch = !confirmPass || password === confirmPass;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && password !== confirmPass) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        await login(email, password);
        toast({ title: "Welcome back!" });
      } else {
        await signup({
          email,
          password,
          confirm_password: confirmPass,
          full_name: fullName,
          role,
          can_submit: role === "hospital" ? canSubmit : undefined,
          hospital:       role === "hospital" ? hospital       : undefined,
          company_name:   role === "insurer"  ? companyName    : undefined,
          specialization: role === "hospital" ? specialization : undefined,
        });
        toast({ title: "Account created! Welcome to InsurCare AI." });
      }
      nav("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center shadow-md">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">InsurCare AI</h1>
          <p className="text-sm text-muted-foreground">6-Agent Prior Authorization Platform</p>
        </div>

        {/* Mode tabs */}
        <div className="flex bg-muted rounded-xl p-1">
          {(["signup", "signin"] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === m ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {m === "signup" ? "Create Account" : "Sign In"}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-elevated p-8 space-y-5">

          <form onSubmit={submit} className="space-y-4">

            {/* ── SIGNUP FIELDS ── */}
            {mode === "signup" && (
              <>
                {/* Full name */}
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Name</Label>
                  <Input className="mt-1" placeholder="Dr. Ramesh Kumar" value={fullName}
                    onChange={e => setFullName(e.target.value)} required />
                </div>

                {/* Role selector */}
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(Object.entries(ROLE_INFO) as [Role, typeof ROLE_INFO[Role]][]).map(([r, info]) => (
                      <button key={r} type="button" onClick={() => setRole(r)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          role === r ? "border-secondary bg-secondary/5" : "border-border hover:border-secondary/40"
                        }`}>
                        <p className={`text-xs font-bold ${role === r ? "text-secondary" : "text-foreground"}`}>{info.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{info.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role-specific fields */}
                {role === "hospital" && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hospital Name</Label>
                      <Input className="mt-1" placeholder="Apollo Hospitals, Chennai" value={hospital}
                        onChange={e => setHospital(e.target.value)} required />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specialization (optional)</Label>
                      <Input className="mt-1" placeholder="Orthopaedics" value={specialization}
                        onChange={e => setSpecialization(e.target.value)} />
                    </div>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                      <input type="checkbox" checked={canSubmit} onChange={e => setCanSubmit(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary" />
                      <div>
                        <span className="text-sm font-medium text-foreground">Can submit PA requests</span>
                        <p className="text-xs text-muted-foreground">Only users with this permission can submit prior authorization requests to the AI pipeline.</p>
                      </div>
                    </label>
                  </div>
                )}
                {role === "insurer" && (
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Insurance Company Name</Label>
                    <Input className="mt-1" placeholder="Star Health" value={companyName}
                      onChange={e => setCompanyName(e.target.value)} required />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Must match exactly how it appears in PA requests (e.g. "Star Health", "HDFC Ergo")
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── EMAIL ── */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input className="mt-1" type="email" placeholder="you@hospital.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            {/* ── PASSWORD ── */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</Label>
              <div className="relative mt-1">
                <Input type={showPass ? "text" : "password"} placeholder="Min. 6 characters"
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* ── CONFIRM PASSWORD (signup only) ── */}
            {mode === "signup" && (
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirm Password</Label>
                <div className="relative mt-1">
                  <Input type={showConfirm ? "text" : "password"} placeholder="Re-enter password"
                    value={confirmPass} onChange={e => setConfirmPass(e.target.value)} required
                    className={confirmPass ? (passwordsMatch ? "border-success" : "border-destructive") : ""} />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {confirmPass && passwordsMatch && (
                    <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                  )}
                </div>
                {confirmPass && !passwordsMatch && (
                  <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full gradient-accent text-secondary-foreground border-0 h-11 font-semibold"
              disabled={loading || (mode === "signup" && !!confirmPass && !passwordsMatch)}>
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : mode === "signup" ? "Create Account →" : "Sign In →"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? (
              <>Already have an account?{" "}
                <button onClick={() => setMode("signin")} className="text-secondary font-semibold hover:underline">Sign in</button>
              </>
            ) : (
              <>Don't have an account?{" "}
                <button onClick={() => setMode("signup")} className="text-secondary font-semibold hover:underline">Sign up</button>
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
