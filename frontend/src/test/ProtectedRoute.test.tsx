// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/contexts/AuthContext";

function renderWithAuth(props: { user?: any; loading?: boolean; isHospital?: boolean; canSubmit?: boolean }, submitOnly = false) {
  (useAuth as any).mockReturnValue({
    user: props.user ?? null,
    loading: props.loading ?? false,
    isHospital: props.isHospital ?? false,
    canSubmit: props.canSubmit ?? false,
  });
  return render(
    <MemoryRouter>
      <ProtectedRoute submitOnly={submitOnly}>
        <div>Protected Content</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /login when not authenticated", () => {
    renderWithAuth({ user: null });
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows children when authenticated and submitOnly=false", () => {
    renderWithAuth({ user: { role: "hospital", can_submit: false } }, false);
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("shows children when hospital + can_submit=true + submitOnly=true", () => {
    renderWithAuth({ user: { role: "hospital", can_submit: true }, isHospital: true, canSubmit: true }, true);
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("blocks non-hospital user when submitOnly=true", () => {
    renderWithAuth({ user: { role: "insurer", can_submit: false }, isHospital: false, canSubmit: false }, true);
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
  });

  it("blocks hospital user without can_submit when submitOnly=true", () => {
    renderWithAuth({ user: { role: "hospital", can_submit: false }, isHospital: true, canSubmit: false }, true);
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
  });
});
