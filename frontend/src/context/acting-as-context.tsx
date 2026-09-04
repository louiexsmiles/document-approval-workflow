'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@/lib/api';

type ActingAsContextValue = {
  users: User[];
  activeUserId: string;
  setActiveUserId: (userId: string) => void;
  activeUser: User | null;
};

const ActingAsContext = createContext<ActingAsContextValue | null>(null);

export function ActingAsProvider({
  users,
  children,
}: {
  users: User[];
  children: ReactNode;
}) {
  const [activeUserId, setActiveUserId] = useState(users[0]?.id ?? '');

  const value = useMemo(() => {
    const activeUser = users.find((user) => user.id === activeUserId) ?? null;
    return {
      users,
      activeUserId,
      setActiveUserId,
      activeUser,
    };
  }, [users, activeUserId]);

  return (
    <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>
  );
}

export function useActingAs() {
  const context = useContext(ActingAsContext);
  if (!context) {
    throw new Error('useActingAs must be used within ActingAsProvider');
  }
  return context;
}
