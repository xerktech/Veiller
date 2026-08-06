import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useVeillerAuth } from "@veiller/react";

import type { AppState, AppStateKey, RuntimeState, StateSnapshot, StateUpdate } from "../shared/state";

type ConnectionStatus = "connected" | "connecting" | "disconnected" | "no-session";

interface VeillerStateContextValue {
  connection: ConnectionStatus;
  lastError: string | null;
  runtime: RuntimeState;
  setVeillerState: <K extends AppStateKey>(key: K, value: AppState[K]) => Promise<void>;
  state: Partial<AppState>;
}

const DEFAULT_RUNTIME: RuntimeState = {
  lastReconnectAt: null,
  reconnectCount: 0,
  sessionId: null,
  status: "no-session",
  stopReason: null,
};

const VeillerStateContext = createContext<VeillerStateContextValue | null>(null);

const MAX_RECONNECT_DELAY_MS = 10000;
const STALE_STREAM_MS = 45000;

export function VeillerStateProvider({ children }: { children: React.ReactNode }) {
  const { frontendToken, isAuthenticated } = useVeillerAuth();
  const [connection, setConnection] = useState<ConnectionStatus>("no-session");
  const [lastError, setLastError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>(DEFAULT_RUNTIME);
  const [state, setState] = useState<Partial<AppState>>({});

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastMessageAtRef = useRef<number>(0);
  const retryDelayRef = useRef<number>(1000);

  useEffect(() => {
    if (!isAuthenticated) {
      closeSource(sourceRef);
      setConnection("no-session");
      setLastError(null);
      setRuntime(DEFAULT_RUNTIME);
      setState({});
      return;
    }

    let disposed = false;

    const scheduleReconnect = (delayMs: number) => {
      if (disposed) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      setConnection("disconnected");
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        openStream();
      }, delayMs);
    };

    const touchStream = () => {
      lastMessageAtRef.current = Date.now();
    };

    const handleSnapshot = (payload: StateSnapshot) => {
      touchStream();
      setState(payload.state);
      setRuntime(payload.runtime);
      setConnection(payload.runtime.status === "no-session" ? "no-session" : "connected");
      setLastError(null);
    };

    const openStream = () => {
      closeSource(sourceRef);
      setConnection("connecting");

      const source = new EventSource("/api/state/stream", {
        withCredentials: true,
      });

      sourceRef.current = source;

      source.onopen = () => {
        touchStream();
        retryDelayRef.current = 1000;
        setConnection("connected");
        setLastError(null);
      };

      source.onerror = () => {
        closeSource(sourceRef);
        const retryDelay = retryDelayRef.current;
        retryDelayRef.current = Math.min(retryDelay * 2, MAX_RECONNECT_DELAY_MS);
        setLastError("State stream disconnected; retrying");
        scheduleReconnect(retryDelay);
      };

      source.addEventListener("snapshot", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as StateSnapshot;
        handleSnapshot(payload);
      });

      source.addEventListener("state_update", (event) => {
        touchStream();
        const payload = JSON.parse((event as MessageEvent<string>).data) as StateUpdate;
        setState((currentState) => ({
          ...currentState,
          [payload.key]: payload.value,
          lastUpdatedAt: payload.timestamp,
        }));
      });

      source.addEventListener("runtime_update", (event) => {
        touchStream();
        const payload = JSON.parse((event as MessageEvent<string>).data) as { runtime: RuntimeState };
        setRuntime(payload.runtime);
      });

      source.addEventListener("ping", () => {
        touchStream();
      });
    };

    openStream();

    const watchdog = window.setInterval(() => {
      if (!sourceRef.current || lastMessageAtRef.current === 0) {
        return;
      }

      if (Date.now() - lastMessageAtRef.current > STALE_STREAM_MS) {
        setLastError("State stream went stale; reconnecting");
        closeSource(sourceRef);
        scheduleReconnect(0);
      }
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      closeSource(sourceRef);
    };
  }, [isAuthenticated]);

  const contextValue: VeillerStateContextValue = {
    connection,
    lastError,
    runtime,
    setVeillerState: async (key, value) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (frontendToken) {
        headers["Authorization"] = `Bearer ${frontendToken}`;
      }

      const response = await fetch("/api/state/set", {
        body: JSON.stringify({ key, value }),
        credentials: "include",
        headers,
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`State update failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { snapshot: StateSnapshot };
      setState(payload.snapshot.state);
      setRuntime(payload.snapshot.runtime);
    },
    state,
  };

  return <VeillerStateContext.Provider value={contextValue}>{children}</VeillerStateContext.Provider>;
}

export function useVeillerConnection(): ConnectionStatus {
  return useVeillerStateContext().connection;
}

export function useVeillerRuntime(): RuntimeState {
  return useVeillerStateContext().runtime;
}

export function useVeillerStateError(): string | null {
  return useVeillerStateContext().lastError;
}

export function useVeillerState<K extends AppStateKey>(key: K): AppState[K] | undefined {
  return useVeillerStateContext().state[key] as AppState[K] | undefined;
}

export function useVeillerActions() {
  const { setVeillerState } = useVeillerStateContext();
  return { setVeillerState };
}

function useVeillerStateContext(): VeillerStateContextValue {
  const context = useContext(VeillerStateContext);
  if (!context) {
    throw new Error("VeillerStateProvider is missing");
  }

  return context;
}

function closeSource(sourceRef: MutableRefObject<EventSource | null>) {
  if (sourceRef.current) {
    sourceRef.current.close();
    sourceRef.current = null;
  }
}
