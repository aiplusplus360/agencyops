import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';

export default function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
    if (!loading && user && role && user.role !== role) {
      navigate(role === 'ADMIN' ? '/' : '/login', { replace: true });
    }
  }, [loading, user, role, navigate]);

  if (loading) return <Spinner />;
  if (!user) return null;
  if (role && user.role !== role) return null;
  return children;
}
