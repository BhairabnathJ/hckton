/**
 * Monaco editor, bundled locally (no CDN) with only the Python grammar.
 * Lazy-loaded from the workspace page so Monaco stays out of the main bundle.
 */
import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

const THEME = "sidequest-light";
monaco.editor.defineTheme(THEME, {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "64748B", fontStyle: "italic" },
    { token: "keyword", foreground: "1D4ED8" },
    { token: "string", foreground: "047857" },
    { token: "number", foreground: "C2410C" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#0F172A",
    "editorLineNumber.foreground": "#94A3B8",
    "editorLineNumber.activeForeground": "#1D4ED8",
    "editor.lineHighlightBackground": "#F4F8FF",
    "editor.selectionBackground": "#BCD2FA",
    "editor.inactiveSelectionBackground": "#EAF2FF",
    "editorCursor.foreground": "#2563EB",
    "editorIndentGuide.background1": "#E3ECFA",
    "editorGutter.background": "#FFFFFF",
  },
});

export function languageFor(path: string): string {
  return path.endsWith(".py") ? "python" : "plaintext";
}

export default function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  readOnly,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  readOnly?: boolean;
}) {
  const save = useRef(onSave);
  save.current = onSave;
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  return (
    <Editor
      path={path}
      value={value}
      language={languageFor(path)}
      theme={THEME}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        editorRef.current = editor;
        // Cmd+S on macOS, Ctrl+S elsewhere.
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save.current());
        editor.focus();
      }}
      loading={<div className="p-4 font-mono text-[12.5px] text-ink-3">Loading editor…</div>}
      options={{
        readOnly,
        fontFamily: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
        fontSize: 13.5,
        lineHeight: 21,
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        tabSize: 4,
        insertSpaces: true,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        smoothScrolling: true,
      }}
    />
  );
}
