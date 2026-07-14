import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id:             number;
  email:          string;
  full_name:      string;
  role:           "hospital" | "insurer";
  can_submit?:    boolean;
  hospital?:      string;
  company_name?:  string;
  specialization?: string;
}

interface SignupData {
  email:            string;
  password:         string;
  confirm_password: string;
  full_name:        string;
  role?:            string;
  can_submit?:      boolean;
  hospital?:        string;
  company_name?:    string;
  specialization?:  string;
}

interface Ctx {
  user:    User | null;
  loading: boolean;
  login:   (email: string, password: string) => Promise<void>;
  signup:  (d: SignupData) => Promise<void>;
  logout:  () => void;
  isHospital:  boolean;
  canSubmit:   boolean;
  isInsurer:   boolean;
}

const AuthCtx = createContext<Ctx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { access_token } = await api.login({ email, password });
    localStorage.setItem("token", access_token);
    setUser(await api.me());
  };

  const signup = async (d: SignupData) => {
    const { access_token } = await api.signup(d);
    localStorage.setItem("token", access_token);
    setUser(await api.me());
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const isHospital = user?.role === "hospital";
  const canSubmit = user?.can_submit === true;

  return (
    <AuthCtx.Provider value={{
      user, loading, login, signup, logout,
      isHospital, canSubmit,
      isInsurer: user?.role === "insurer",
    }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
};
