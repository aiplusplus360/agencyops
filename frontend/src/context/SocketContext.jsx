import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api/client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const s = io(import.meta.env.VITE_SOCKET_URL || '', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  const emit = useCallback((event, payload) => socket?.emit(event, payload), [socket]);
  const on = useCallback((event, handler) => {
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket]);

  return <SocketContext.Provider value={{ socket, emit, on }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
