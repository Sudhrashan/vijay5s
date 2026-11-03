import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { CycleProvider } from "./lib/cycle";
import { ToastProvider } from "./lib/toast";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Audits from "./pages/Audits";
import Issues from "./pages/Issues";
import Users from "./pages/Users";
import Zones from "./pages/Zones";
import Allocation from "./pages/Allocation";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import AuditorApp from "./auditor/AuditorApp";
import InchargeApp from "./incharge/InchargeApp";
import "./styles/app.css";

// Data stays cached; the WebSocket marks it stale whenever the server reports a change.
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } });

function Gate() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return <Login />;

  // Auditors get a separate, mobile-first route tree with its own layout and styling;
  // Super Admin and 5S Incharge keep the existing admin console untouched.
  if (user.role === "Auditor") {
    return (
      <Routes>
        <Route path="/*" element={<AuditorApp />} />
      </Routes>
    );
  }

  // 5S Incharge gets its own mobile-first "My Zone" route tree (close/verify issues in
  // their assigned zone). Super Admin keeps going to the admin console below.
  if (user.role === "5S Incharge") {
    return (
      <Routes>
        <Route path="/*" element={<InchargeApp />} />
      </Routes>
    );
  }

  return (
    <CycleProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="audits" element={<Audits />} />
          <Route path="issues" element={<Issues />} />
          <Route path="users" element={<Users />} />
          <Route path="zones" element={<Zones />} />
          <Route path="allocation" element={<Allocation />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CycleProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider><Gate /></AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
