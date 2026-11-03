"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
interface LoadState<T> {
  path: string;
  data?: T;
  error: string;
  loading: boolean;
}
export function useLoad<T>(path: string) {
  const sequence = useRef(0);
  const [state, setState] = useState<LoadState<T>>({
    path,
    error: "",
    loading: true,
  });
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    // A response belongs to one path/request only. Never reuse rows under a new filter.
    setState({ path, loading: true, error: "" });
    try {
      const data = await api<T>(path);
      if (request === sequence.current)
        setState({ path, data, error: "", loading: false });
    } catch (error) {
      if (request === sequence.current)
        setState({
          path,
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        });
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    // Start asynchronously; path-keyed rendering hides the preceding result immediately.
    void Promise.resolve().then(() => {
      if (active) return reload();
    });
    return () => {
      active = false;
      sequence.current += 1;
    };
  }, [reload]);
  const current: LoadState<T> =
    state.path === path ? state : { path, error: "", loading: true };
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    reload,
  };
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(action: () => Promise<void | boolean>, success = "") {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await action();
      if (result !== false) setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, run };
}
