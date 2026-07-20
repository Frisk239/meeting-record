import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  getMeta,
  login as apiLogin,
  logout as apiLogout,
  putLlmSettings,
  putProfile,
  register as apiRegister,
  type LlmSettings,
  type PublicUser,
} from "../api";

type AuthState = {
  loading: boolean;
  appName: string;
  registrationOpen: boolean;
  user: PublicUser | null;
  llm: LlmSettings | null;
  refresh: () => Promise<void>;
  login: (login: string, password: string) => Promise<string | null>;
  register: (input: {
    username: string;
    email: string;
    password: string;
  }) => Promise<string | null>;
  logout: () => Promise<void>;
  saveLlm: (input: {
    baseUrl: string;
    modelId: string;
    apiKey: string;
    clearApiKey?: boolean;
  }) => Promise<string | null>;
  saveProfile: (displayName: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState("Meeting Record");
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [llm, setLlm] = useState<LlmSettings | null>(null);

  const refresh = useCallback(async () => {
    const meta = await getMeta();
    if (meta.ok) {
      setAppName(meta.data.appName || "Meeting Record");
      setRegistrationOpen(Boolean(meta.data.registrationOpen));
      document.title = meta.data.appName || "Meeting Record";
    }
    const me = await getMe();
    if (me.ok) {
      setUser(me.data.user);
      setLlm(me.data.llm);
    } else {
      setUser(null);
      setLlm(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await apiLogin({ login: loginId, password });
      if (!res.ok) return res.data.message || "登录失败";
      setUser(res.data.user);
      await refresh();
      return null;
    },
    [refresh],
  );

  const register = useCallback(
    async (input: { username: string; email: string; password: string }) => {
      const res = await apiRegister(input);
      if (!res.ok) return res.data.message || "注册失败";
      setUser(res.data.user);
      await refresh();
      return null;
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setLlm(null);
  }, []);

  const saveLlm = useCallback(
    async (input: {
      baseUrl: string;
      modelId: string;
      apiKey: string;
      clearApiKey?: boolean;
    }) => {
      const body: {
        baseUrl: string;
        modelId: string;
        apiKey?: string;
        clearApiKey?: boolean;
      } = {
        baseUrl: input.baseUrl,
        modelId: input.modelId,
      };
      if (input.clearApiKey) body.clearApiKey = true;
      else if (input.apiKey && !input.apiKey.includes("•")) {
        body.apiKey = input.apiKey;
      }
      const res = await putLlmSettings(body);
      if (!res.ok) return res.data.message || "保存失败";
      setLlm(res.data.llm);
      return null;
    },
    [],
  );

  const saveProfile = useCallback(async (displayName: string) => {
    const res = await putProfile({ displayName });
    if (!res.ok) return res.data.message || "保存失败";
    setUser(res.data.user);
    return null;
  }, []);

  const value = useMemo(
    () => ({
      loading,
      appName,
      registrationOpen,
      user,
      llm,
      refresh,
      login,
      register,
      logout,
      saveLlm,
      saveProfile,
    }),
    [
      loading,
      appName,
      registrationOpen,
      user,
      llm,
      refresh,
      login,
      register,
      logout,
      saveLlm,
      saveProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
