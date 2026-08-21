import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AiChat from './ai/AiChat';

export default function HomeDispatcher() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN') return <AiChat />;
  return <Navigate to="/worker" replace />;
}
