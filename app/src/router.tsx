import { createBrowserRouter, Navigate } from "react-router-dom";

import { LandingPage } from "@/pages/LandingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { BuilderPage } from "@/pages/BuilderPage";
import { SubmitPage } from "@/pages/SubmitPage";
import { AdminPage } from "@/pages/AdminPage";
import { AllowlistsPage } from "@/pages/AllowlistsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/dashboard/templates", element: <TemplatesPage /> },
  { path: "/dashboard/allowlists", element: <AllowlistsPage /> },
  { path: "/dashboard/settings", element: <SettingsPage /> },
  { path: "/builder", element: <BuilderPage /> },
  { path: "/builder/:formId", element: <BuilderPage /> },
  { path: "/admin/:formId", element: <AdminPage /> },
  { path: "/f/:formId", element: <SubmitPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
