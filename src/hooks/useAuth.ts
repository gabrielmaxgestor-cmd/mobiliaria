import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { UserProfile, UserRole } from "../types/auth";
import { subscribeToAuthState, logoutUser } from "../lib/auth";

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isCorretor: boolean;
  isCliente: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((currentUser, currentProfile) => {
      setUser(currentUser);
      setProfile(currentProfile);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const role = profile?.role || null;
  const isCorretor = role === "corretor";
  const isCliente = role === "cliente";

  const handleLogout = async () => {
    await logoutUser();
  };

  return {
    user,
    profile,
    role,
    isCorretor,
    isCliente,
    loading,
    logout: handleLogout,
  };
}
