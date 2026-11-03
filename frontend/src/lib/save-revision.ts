"use client";
import { useRef, useState } from "react";

export type SaveStatus = "SAVED" | "UNSAVED" | "SAVING" | "SAVE FAILED";
interface SaveToken {
  scope: number;
  revision: number;
  request: number;
}

/** Tracks the submitted revision, independently of edits made while its request is pending. */
export function useSaveRevision(initialSaved = true) {
  const revision = useRef(0);
  const scope = useRef(0);
  const request = useRef(0);
  const [dirty, setDirty] = useState(!initialSaved);
  const [status, setStatus] = useState<SaveStatus>(
    initialSaved ? "SAVED" : "UNSAVED",
  );
  function reset(saved = true) {
    scope.current += 1;
    request.current += 1;
    revision.current = 0;
    setDirty(!saved);
    setStatus(saved ? "SAVED" : "UNSAVED");
  }
  function edited() {
    revision.current += 1;
    setDirty(true);
    setStatus((previous) => (previous === "SAVING" ? previous : "UNSAVED"));
  }
  function begin(): SaveToken {
    const token = {
      scope: scope.current,
      revision: revision.current,
      request: ++request.current,
    };
    setStatus("SAVING");
    return token;
  }
  function active(token: SaveToken) {
    return token.scope === scope.current && token.request === request.current;
  }
  function complete(token: SaveToken) {
    if (!active(token)) return { active: false, current: false };
    const current = token.revision === revision.current;
    setDirty(!current);
    setStatus(current ? "SAVED" : "UNSAVED");
    return { active: true, current };
  }
  function failed(token: SaveToken) {
    if (active(token)) {
      setDirty(true);
      setStatus("SAVE FAILED");
    }
  }
  return { dirty, status, reset, edited, begin, complete, failed };
}
