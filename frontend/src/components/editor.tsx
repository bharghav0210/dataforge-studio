"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
declare global {
  interface Window {
    DataForgeMonaco?: typeof Monaco;
  }
}
let editorReady: Promise<void> | undefined;
function prepare() {
  if (!editorReady)
    editorReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/editor-assets/editor.js";
      script.onload = () => {
        if (!window.DataForgeMonaco) {
          reject(new Error("Editor module did not load"));
          return;
        }
        loader.config({ monaco: window.DataForgeMonaco });
        resolve();
      };
      script.onerror = () => {
        editorReady = undefined;
        reject(
          new Error(
            "Local editor assets could not load. Run npm run postinstall and reload.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return editorReady;
}
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});
export function CodeEditor({
  value,
  onChange,
  language,
  height = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  language: "python" | "sql";
  height?: number;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    prepare()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="editor" aria-label={`${language} code editor`}>
      {error ? (
        <p role="alert">{error}</p>
      ) : ready ? (
        <MonacoEditor
          height={height}
          language={language}
          value={value}
          onChange={(v) => flushSync(() => onChange(v || ""))}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
          }}
          loading={<div className="editor-loading">Loading local editor…</div>}
        />
      ) : (
        <div className="editor-loading">Loading local editor…</div>
      )}
    </div>
  );
}
