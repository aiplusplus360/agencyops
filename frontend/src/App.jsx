import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/Login';
import AdminLoginPage from './pages/AdminLogin';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminTasks from './pages/admin/Tasks';
import Roadmaps from './pages/admin/Roadmaps';
import CapabilityRegistry from './pages/admin/CapabilityRegistry';
import Products from './pages/admin/Products';
import Leaderboard from './pages/admin/Leaderboard';
import Utilization from './pages/admin/Utilization';
import Evaluations from './pages/admin/Evaluations';
import AIDecisionAudit from './pages/admin/AIDecisionAudit';
import AICostMonitor from './pages/admin/AICostMonitor';
import TaskTemplates from './pages/admin/TaskTemplates';
import DigestHistory from './pages/admin/DigestHistory';
import Settings from './pages/admin/Settings';
import DataExport from './pages/admin/DataExport';
import Memory from './pages/admin/Memory';

// Worker pages
import WorkerQueue from './pages/worker/WorkerQueue';
import TaskDetail from './pages/worker/TaskDetail';
import MyPerformance from './pages/worker/MyPerformance';

// Shared
import HomeDispatcher from './pages/Home';
import AiChat from './pages/ai/AiChat';
import GlobalSearch from './pages/shared/GlobalSearch';
import Profile from './pages/shared/Profile';
import ForgotPassword from './pages/shared/ForgotPassword';

// Admin extra
import VisionCanvas from './pages/admin/VisionCanvas';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Secret admin portal — unguessable path, strong credentials + 6-digit PIN */}
      <Route path="/90ui66p" element={<AdminLoginPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ForgotPassword />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<HomeDispatcher />} />
        {/* Admin */}
        <Route path="/ai" element={<RequireAuth role="ADMIN"><AiChat /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth role="ADMIN"><AdminDashboard /></RequireAuth>} />
        <Route path="/tasks" element={<RequireAuth role="ADMIN"><AdminTasks /></RequireAuth>} />
        <Route path="/visions" element={<RequireAuth role="ADMIN"><VisionCanvas /></RequireAuth>} />
        <Route path="/roadmaps" element={<RequireAuth role="ADMIN"><Roadmaps /></RequireAuth>} />
        <Route path="/capabilities" element={<RequireAuth role="ADMIN"><CapabilityRegistry /></RequireAuth>} />
        <Route path="/products" element={<RequireAuth role="ADMIN"><Products /></RequireAuth>} />
        <Route path="/leaderboard" element={<RequireAuth role="ADMIN"><Leaderboard /></RequireAuth>} />
        <Route path="/utilization" element={<RequireAuth role="ADMIN"><Utilization /></RequireAuth>} />
        <Route path="/evaluations" element={<RequireAuth role="ADMIN"><Evaluations /></RequireAuth>} />
        <Route path="/ai-audit" element={<RequireAuth role="ADMIN"><AIDecisionAudit /></RequireAuth>} />
        <Route path="/cost-monitor" element={<RequireAuth role="ADMIN"><AICostMonitor /></RequireAuth>} />
        <Route path="/templates" element={<RequireAuth role="ADMIN"><TaskTemplates /></RequireAuth>} />
        <Route path="/memory" element={<RequireAuth role="ADMIN"><Memory /></RequireAuth>} />
        <Route path="/digests" element={<RequireAuth role="ADMIN"><DigestHistory /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth role="ADMIN"><Settings /></RequireAuth>} />
        <Route path="/export" element={<RequireAuth role="ADMIN"><DataExport /></RequireAuth>} />

        {/* Worker */}
        <Route path="/worker" element={<RequireAuth role="WORKER"><WorkerQueue /></RequireAuth>} />
        <Route path="/worker/tasks/:id" element={<RequireAuth role="WORKER"><TaskDetail /></RequireAuth>} />
        <Route path="/my-performance" element={<RequireAuth role="WORKER"><MyPerformance /></RequireAuth>} />

        {/* Shared */}
        <Route path="/search" element={<RequireAuth role="ADMIN"><GlobalSearch /></RequireAuth>} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}
