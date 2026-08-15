// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/lib/utils", () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}));

import { useAuth } from "@/contexts/AuthContext";

function renderSidebar(role: string, can_submit: boolean, hospital?: string, company_name?: string) {
  (useAuth as any).mockReturnValue({
    user: { role, can_submit, hospital, company_name, full_name: "Test User", email: "test@test.com" },
    logout: vi.fn(),
    isHospital: role === "hospital",
    canSubmit: can_submit,
    isInsurer: role === "insurer",
  });
  return render(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>
  );
}

describe("AppSidebar — nav items by role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hospital_submitter sees New PA Request", () => {
    renderSidebar("hospital", true, "Test Hospital");
    expect(screen.getByText("New PA Request")).toBeInTheDocument();
    expect(screen.getByText("All Requests")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
  });

  it("hospital_viewer does NOT see New PA Request", () => {
    renderSidebar("hospital", false, "Test Hospital");
    expect(screen.queryByText("New PA Request")).not.toBeInTheDocument();
    expect(screen.getByText("Patient Results")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("insurer sees Claims instead of All Requests, no New PA Request", () => {
    renderSidebar("insurer", false, undefined, "Star Health");
    expect(screen.queryByText("New PA Request")).not.toBeInTheDocument();
    expect(screen.queryByText("All Requests")).not.toBeInTheDocument();
    expect(screen.getByText("Claims")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });
});
