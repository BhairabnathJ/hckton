import { useMemo, useState } from "react";
import type { WorkspaceFile } from "../../lib/workspace";
import { cx } from "../ui";

interface Node {
  name: string;
  path: string;
  dir: boolean;
  children: Node[];
}

function buildTree(files: WorkspaceFile[]): Node[] {
  const root: Node = { name: "", path: "", dir: true, children: [] };
  const byPath = new Map<string, Node>([["", root]]);
  const ensure = (path: string, dir: boolean): Node => {
    const existing = byPath.get(path);
    if (existing) {
      existing.dir = existing.dir || dir;
      return existing;
    }
    const slash = path.lastIndexOf("/");
    const parent = ensure(slash === -1 ? "" : path.slice(0, slash), true);
    const node: Node = { name: path.slice(slash + 1), path, dir, children: [] };
    parent.children.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const f of files) ensure(f.path, f.type === "dir");
  const sort = (n: Node) => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

const isPython = (p: string) => p.endsWith(".py");

export function FileTree({
  files,
  activePath,
  dirty,
  onOpen,
}: {
  files: WorkspaceFile[];
  activePath: string | null;
  dirty: Set<string>;
  onOpen: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set(["tests"]));

  const toggle = (path: string) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const render = (nodes: Node[], depth: number) =>
    nodes.map((n) => {
      const pad = { paddingLeft: 8 + depth * 14 };
      if (n.dir) {
        const open = !closed.has(n.path);
        return (
          <li key={n.path}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(n.path)}
              style={pad}
              className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[13px] text-ink-2 hover:bg-tint"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className={cx("transition-transform duration-150", open && "rotate-90")}>
                <path d="m9 18 6-6-6-6" />
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-ink-3">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span className="truncate font-medium">{n.name}</span>
            </button>
            {open && <ul className="m-0 list-none p-0">{render(n.children, depth + 1)}</ul>}
          </li>
        );
      }
      const active = n.path === activePath;
      const py = isPython(n.path);
      return (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => onOpen(n.path)}
            aria-current={active ? "true" : undefined}
            style={{ paddingLeft: 8 + depth * 14 + 18 }}
            className={cx(
              "flex w-full items-center gap-1.5 py-1 pr-2 text-left font-mono text-[12.5px]",
              active ? "bg-xp-soft text-xp-text" : "text-ink hover:bg-tint",
            )}
          >
            <span
              aria-hidden
              className={cx(
                "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] text-[8px] font-bold",
                py ? "bg-xp text-white" : "bg-overlay text-ink-3",
              )}
            >
              {py ? "py" : ""}
            </span>
            <span className={cx("truncate", py && !active && "font-medium text-xp-text")}>{n.name}</span>
            {dirty.has(n.path) && <span aria-label="unsaved" className="ml-auto size-1.5 shrink-0 rounded-full bg-warn" />}
          </button>
        </li>
      );
    });

  return (
    <nav aria-label="Files" className="h-full overflow-auto py-1.5">
      <ul className="m-0 list-none p-0">{render(tree, 0)}</ul>
    </nav>
  );
}
