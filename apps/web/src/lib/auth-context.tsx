"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthSession,
  CreateOrganizationRequest,
  LoginRequest,
  MembershipRole,
  MembershipSummary,
  OrganizationDto,
  RegisterRequest,
  UserDto,
} from "@ovozai/contracts";
import { setAuthClearedHandler } from "./api-client";
import {
  acceptInvitation as acceptInvitationRequest,
  createOrganization as createOrganizationRequest,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  switchOrganization as switchOrganizationRequest,
} from "./auth-api";
import { clearTokens, hasTokens, setTokens } from "./token-store";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  activeOrganization: OrganizationDto | null;
  memberships: MembershipSummary[];
  /** The caller's role in the active organization, or `null` when orgless. */
  activeRole: MembershipRole | null;
  register: (input: RegisterRequest) => Promise<void>;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (organizationId: string) => Promise<void>;
  createOrganization: (input: CreateOrganizationRequest) => Promise<void>;
  acceptInvitation: (token: string) => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function roleFor(
  memberships: MembershipSummary[],
  activeOrganization: OrganizationDto | null,
): MembershipRole | null {
  if (!activeOrganization) return null;
  const match = memberships.find((m) => m.organization.id === activeOrganization.id);
  return match?.role ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserDto | null>(null);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationDto | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);

  const resetToAnonymous = useCallback(() => {
    setUser(null);
    setActiveOrganization(null);
    setMemberships([]);
    setStatus("anonymous");
  }, []);

  const applySession = useCallback((session: AuthSession) => {
    setTokens(session.tokens);
    setUser(session.user);
    setActiveOrganization(session.activeOrganization);
    setMemberships(session.memberships);
    setStatus("authenticated");
  }, []);

  // Keep the latest reset handler in a ref so the apiFetch hook registered on
  // mount always calls the current closure.
  const resetRef = useRef(resetToAnonymous);
  resetRef.current = resetToAnonymous;

  useEffect(() => {
    // apiFetch calls this when a 401 cannot be refreshed.
    setAuthClearedHandler(() => {
      resetRef.current();
    });

    let cancelled = false;

    const hydrate = async () => {
      if (!hasTokens()) {
        if (!cancelled) resetToAnonymous();
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me.user);
        setActiveOrganization(me.activeOrganization);
        setMemberships(me.memberships);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        clearTokens();
        resetToAnonymous();
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
      setAuthClearedHandler(null);
    };
  }, [resetToAnonymous]);

  const register = useCallback(
    async (input: RegisterRequest) => {
      applySession(await registerRequest(input));
    },
    [applySession],
  );

  const login = useCallback(
    async (input: LoginRequest) => {
      applySession(await loginRequest(input));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the server call fails, drop the local session.
    }
    clearTokens();
    resetToAnonymous();
  }, [resetToAnonymous]);

  const switchOrg = useCallback(
    async (organizationId: string) => {
      applySession(await switchOrganizationRequest(organizationId));
    },
    [applySession],
  );

  const createOrganization = useCallback(
    async (input: CreateOrganizationRequest) => {
      applySession(await createOrganizationRequest(input));
    },
    [applySession],
  );

  const acceptInvitation = useCallback(
    async (token: string) => {
      applySession(await acceptInvitationRequest(token));
    },
    [applySession],
  );

  const refreshMe = useCallback(async () => {
    const me = await fetchMe();
    setUser(me.user);
    setActiveOrganization(me.activeOrganization);
    setMemberships(me.memberships);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      activeOrganization,
      memberships,
      activeRole: roleFor(memberships, activeOrganization),
      register,
      login,
      logout,
      switchOrg,
      createOrganization,
      acceptInvitation,
      refreshMe,
    }),
    [
      status,
      user,
      activeOrganization,
      memberships,
      register,
      login,
      logout,
      switchOrg,
      createOrganization,
      acceptInvitation,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Throws if used outside {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
