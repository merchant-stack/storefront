export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SessionUser {
  id: string;
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  tradeUrl: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export const fetchMe = async (): Promise<SessionUser | null> => {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser };
    return data.user;
  } catch {
    return null;
  }
};

export const logout = async (): Promise<void> => {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
};

export const steamLoginUrl = (): string => `${API_URL}/auth/steam/login`;
