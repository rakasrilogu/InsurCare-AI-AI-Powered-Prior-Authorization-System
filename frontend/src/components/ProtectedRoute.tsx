import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: JSX.Element;
  submitOnly?: boolean;
}

export default function ProtectedRoute({ children, submitOnly = false }: Props) {
  const { user, loading, isHospital, canSubmit } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-secondary" />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  if (submitOnly && (!isHospital || !canSubmit)) return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4 text-center p-8">
      <div className="text-5xl">🔒</div>
      <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        Only hospital users with submit permission can submit PA requests.
      </p>
      <a href="/dashboard" className="text-secondary text-sm font-medium hover:underline">← Back to Dashboard</a>
    </div>
  );

  return children;
}
