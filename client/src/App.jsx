/*
 * App routes for the web UI (landing, login, admin, mahasiswa, pendaftaran, admin_pendaftaran).
 * Uses role-based protected routes.
 */
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import MahasiswaDashboard from "./pages/MahasiswaDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import PendaftaranPage from "./pages/PendaftaranPage";
import AdminPendaftaranPage from "./pages/AdminPendaftaranPage";
import MentorDashboard from "./pages/MentorDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import MentorLoginPage from "./pages/MentorLoginPage";

const MentorPortal = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (user?.role === "mahasiswa" || user?.role === "anak_smk") {
    return <MahasiswaDashboard portalMode="mentor" />;
  }
  return <MentorDashboard />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/absen" element={<LoginPage />} />
        <Route path="/mentor-login" element={<MentorLoginPage />} />
        <Route path="/pendaftaran" element={<PendaftaranPage />} />
        <Route path="/admin_pendaftaran" element={<AdminPendaftaranPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["mahasiswa", "anak_smk"]}>
              <MahasiswaDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mentor"
          element={
            <ProtectedRoute
              allowedRoles={["mentor", "admin", "mahasiswa", "anak_smk"]}
              redirectTo="/mentor-login"
            >
              <MentorPortal />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
