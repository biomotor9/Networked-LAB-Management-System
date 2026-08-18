"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary } from "./model";

const RECENT_PROJECTS_KEY = "atlas-recent-projects-v1";

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export default function ProjectSidebar({
  projects,
  selectedId,
  onSelect,
  onCreate,
}: {
  projects: ProjectSummary[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]") as string[]; }
    catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const rememberProject = (projectId: string) => {
    setRecentIds((current) => {
      const next = [projectId, ...current.filter((id) => id !== projectId)].slice(0, 50);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const result = projects.filter((project) => {
      if (!normalized) return !project.archivedAt;
      const haystack = [project.name, project.description, project.lead.displayName, ...project.tags, project.archivedAt ? "已归档" : project.status]
        .join("\n").toLocaleLowerCase("zh-CN");
      return haystack.includes(normalized);
    });
    return result.sort((left, right) => {
      const leftIndex = recentIds.indexOf(left.id); const rightIndex = recentIds.indexOf(right.id);
      if (leftIndex < 0 && rightIndex < 0) return left.name.localeCompare(right.name, "zh-CN");
      if (leftIndex < 0) return 1; if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    });
  }, [projects, query, recentIds]);

  const closeSearch = () => { setQuery(""); setSearchOpen(false); };

  return <section className="project-sidebar-section" aria-label="项目列表">
    <div className={`project-sidebar-head ${searchOpen ? "searching" : ""}`}>
      {searchOpen ? <label className="project-search-field">
        <SearchIcon />
        <input ref={inputRef} value={query} placeholder="搜索项目" aria-label="搜索项目"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }}
          onBlur={() => { if (!query) setSearchOpen(false); }} />
        <button type="button" aria-label="清除项目搜索" onMouseDown={(event) => event.preventDefault()} onClick={closeSearch}>×</button>
      </label> : <>
        <h2>项目</h2>
        <button type="button" className="project-search-trigger" aria-label="搜索项目" onClick={() => setSearchOpen(true)}><SearchIcon /></button>
      </>}
      <button type="button" className="project-create-trigger" aria-label="创建项目" title="创建项目" onClick={onCreate}>＋</button>
    </div>
    <div className="project-list">
      {visibleProjects.map((project) => <button type="button" key={project.id}
        className={selectedId === project.id ? "active" : ""}
        onClick={() => { rememberProject(project.id); onSelect(project.id); }}
        title={`${project.archivedAt ? "已归档" : project.status} · ${project.lead.displayName}${project.description ? `\n${project.description}` : ""}`}>
        <i className={`project-status-dot project-status-${project.archivedAt ? "已归档" : project.status}`} aria-label={project.archivedAt ? "已归档" : project.status} />
        <span>{project.archivedAt ? `已归档 · ${project.name}` : project.name}</span>
      </button>)}
      {visibleProjects.length === 0 && <p className="project-list-empty">{query ? "未找到项目" : "暂无项目"}</p>}
    </div>
  </section>;
}
