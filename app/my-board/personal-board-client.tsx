"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  boardStatuses,
  filterBoardItems,
  sortBoardItems,
  type BoardFilters,
  type BoardItem,
  type BoardProject,
  type BoardStatus,
} from "../features/dashboard/model";
import { domains, statuses, type Status } from "../features/workspace/model";

const PREFERENCES_KEY = "atlas-personal-board-preferences-v1";
const defaultFilters: BoardFilters = { query: "", projectId: "", projectScope: "active", domain: "全部", tag: "", due: "全部" };

type BoardData = { projects: BoardProject[]; items: BoardItem[] };

function readPreferences(): BoardFilters {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null") as Partial<BoardFilters> | null;
    if (!parsed) return defaultFilters;
    return {
      query: "",
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : "",
      projectScope: parsed.projectScope === "planning" || parsed.projectScope === "all" ? parsed.projectScope : "active",
      domain: parsed.domain && (parsed.domain === "全部" || domains.includes(parsed.domain)) ? parsed.domain : "全部",
      tag: typeof parsed.tag === "string" ? parsed.tag : "",
      due: parsed.due === "已逾期" || parsed.due === "七天内" || parsed.due === "无日期" ? parsed.due : "全部",
    };
  } catch {
    return defaultFilters;
  }
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function dueKind(value?: string): "overdue" | "soon" | "normal" {
  if (!value) return "normal";
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(`${value}T00:00:00`).getTime();
  if (due < todayStart) return "overdue";
  return due <= todayStart + 7 * 24 * 60 * 60 * 1000 ? "soon" : "normal";
}

function statusDescription(status: BoardStatus): string {
  if (status === "紧急") return "需要优先处理";
  if (status === "进行中") return "正在执行的实验";
  if (status === "等待") return "等待资源、结果或前置实验";
  return "长周期观察与定期回看";
}

export default function PersonalBoardClient({ viewer }: { viewer: { displayName: string; role: "owner" | "member" } }) {
  const [data, setData] = useState<BoardData>({ projects: [], items: [] });
  const [filters, setFilters] = useState<BoardFilters>(defaultFilters);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/me/board", { cache: "no-store" });
      const result = await response.json() as BoardData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "个人看板读取失败。");
      setData({ projects: result.projects, items: result.items });
      setFilters((current) => ({
        ...current,
        projectId: current.projectId && !result.projects.some((project) => project.id === current.projectId) ? "" : current.projectId,
        tag: current.tag && !result.items.some((item) => item.tags.includes(current.tag)) ? "" : current.tag,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "个人看板读取失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFilters(readPreferences());
      setPreferencesReady(true);
      void loadBoard();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadBoard]);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ projectId: filters.projectId, projectScope: filters.projectScope, domain: filters.domain, tag: filters.tag, due: filters.due }));
  }, [filters, preferencesReady]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const availableProjects = useMemo(() => [...data.projects].sort((left, right) => left.name.localeCompare(right.name, "zh-CN")), [data.projects]);
  const availableTags = useMemo(() => Array.from(new Set(data.items.flatMap((item) => item.tags))).sort((left, right) => left.localeCompare(right, "zh-CN")), [data.items]);
  const visibleItems = useMemo(() => filterBoardItems(data.items, filters), [data.items, filters]);
  const columns = useMemo(() => Object.fromEntries(boardStatuses.map((status) => [status, sortBoardItems(visibleItems.filter((item) => item.status === status), status)])) as Record<BoardStatus, BoardItem[]>, [visibleItems]);
  const overdueCount = visibleItems.filter((item) => dueKind(item.plannedCompletionDate) === "overdue").length;
  const dueSoonCount = visibleItems.filter((item) => dueKind(item.plannedCompletionDate) === "soon").length;

  function patchFilters(patch: Partial<BoardFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  async function changeStatus(item: BoardItem, status: Status) {
    const key = `${item.projectId}:${item.id}`;
    setUpdating((current) => new Set(current).add(key));
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(item.projectId)}/plans/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, planVersion: item.version, projectVersion: item.projectVersion }),
      });
      const result = await response.json() as { plan?: { status: Status; planVersion: number; projectVersion: number; updatedAt: string }; error?: string; code?: string };
      if (!response.ok || !result.plan) {
        if (response.status === 409) await loadBoard();
        throw new Error(result.error ?? "状态更新失败。");
      }
      setData((current) => ({
        projects: current.projects.map((project) => project.id === item.projectId ? { ...project, version: result.plan!.projectVersion } : project),
        items: current.items.flatMap((candidate) => {
          if (candidate.projectId !== item.projectId) return [candidate];
          const nextProjectVersion = result.plan!.projectVersion;
          if (candidate.id !== item.id) return [{ ...candidate, projectVersion: nextProjectVersion }];
          if (!boardStatuses.includes(result.plan!.status as BoardStatus)) return [];
          return [{ ...candidate, status: result.plan!.status as BoardStatus, version: result.plan!.planVersion, projectVersion: nextProjectVersion, updatedAt: result.plan!.updatedAt }];
        }),
      }));
      setNotice(status === "已完成" || status === "终止" || status === "未开始" ? `“${item.title}”已移出个人看板。` : `“${item.title}”已更新为${status}。`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "状态更新失败。");
    } finally {
      setUpdating((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  }

  return <main className="personal-board-page">
    <header className="topbar board-topbar">
      <nav className="topnav" aria-label="主要导航">
        <Link className="active" href="/my-board">个人看板</Link>
        <Link href="/">计划管理</Link>
        <button type="button" disabled title="即将推出">项目记录</button>
        <button type="button" disabled title="即将推出">数据概览</button>
      </nav>
      <div className="top-actions"><span className="viewer-name">{viewer.displayName}</span>{viewer.role === "owner" && <Link href="/admin/users">账户管理</Link>}<form action="/api/auth/logout" method="post"><button type="submit" className="logout-button">退出</button></form></div>
    </header>

    <section className="board-content">
      <div className="board-heading">
        <div><p>MY EXPERIMENTS</p><h1>个人看板</h1><span>汇总您参与项目中的重点实验节点；状态修改会同步给项目成员。</span></div>
        <button type="button" className="board-refresh" onClick={() => void loadBoard()} disabled={loading}>↻ 刷新</button>
      </div>

      <section className="board-summary" aria-label="看板摘要">
        <article><strong>{visibleItems.length}</strong><span>当前显示</span></article>
        <article className="urgent"><strong>{visibleItems.filter((item) => item.status === "紧急").length}</strong><span>紧急节点</span></article>
        <article className="overdue"><strong>{overdueCount}</strong><span>已逾期</span></article>
        <article className="soon"><strong>{dueSoonCount}</strong><span>七天内到期</span></article>
      </section>

      <section className="board-filters" aria-label="个人看板筛选">
        <label className="board-search"><span>搜索</span><input value={filters.query} onChange={(event) => patchFilters({ query: event.target.value })} placeholder="实验、项目、标签或上级路径" /></label>
        <label><span>项目</span><select value={filters.projectId} onChange={(event) => patchFilters({ projectId: event.target.value })}><option value="">全部项目</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>项目状态</span><select value={filters.projectScope} onChange={(event) => patchFilters({ projectScope: event.target.value as BoardFilters["projectScope"] })}><option value="active">仅进行中</option><option value="planning">进行中与筹备中</option><option value="all">全部未完成</option></select></label>
        <label><span>领域</span><select value={filters.domain} onChange={(event) => patchFilters({ domain: event.target.value as BoardFilters["domain"] })}><option value="全部">全部领域</option>{domains.map((domain) => <option key={domain}>{domain}</option>)}</select></label>
        <label><span>标签</span><select value={filters.tag} onChange={(event) => patchFilters({ tag: event.target.value })}><option value="">全部标签</option>{availableTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
        <label><span>截止时间</span><select value={filters.due} onChange={(event) => patchFilters({ due: event.target.value as BoardFilters["due"] })}><option>全部</option><option>已逾期</option><option>七天内</option><option>无日期</option></select></label>
      </section>

      {error && <div className="board-message error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadBoard()}>重新读取</button></div>}
      {notice && <div className="board-message success" role="status">{notice}</div>}

      {loading ? <div className="board-loading" role="status">正在读取您参与项目中的实验节点…</div> : data.projects.length === 0 ? <div className="board-empty"><strong>还没有参与项目</strong><p>加入或创建项目后，相关实验节点会自动汇总到这里。</p><Link href="/">前往计划管理</Link></div> : <section className="board-columns" aria-label="实验节点关注区">
        {boardStatuses.map((status) => <section className={`board-column board-column-${status}`} key={status} aria-labelledby={`board-column-${status}`}>
          <header><div><h2 id={`board-column-${status}`}>{status}</h2><p>{statusDescription(status)}</p></div><span>{columns[status].length}</span></header>
          <div className="board-card-list">
            {columns[status].map((item) => {
              const key = `${item.projectId}:${item.id}`;
              const changing = updating.has(key);
              const due = item.plannedCompletionDate ? dueKind(item.plannedCompletionDate) : null;
              return <article className="board-card" key={key}>
                <div className="board-card-project"><span>{item.projectName}</span><small>{item.domain}</small></div>
                {item.path.length > 0 && <p className="board-card-path">{item.path.join(" / ")}</p>}
                <Link prefetch={false} className="board-card-title" href={`/?projectId=${encodeURIComponent(item.projectId)}&planId=${encodeURIComponent(item.id)}`}>{item.title}</Link>
                {item.summary && <p className="board-card-summary">{item.summary}</p>}
                <div className="board-card-tags">{item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{item.tags.length > 3 && <small>+{item.tags.length - 3}</small>}</div>
                <div className="board-card-meta">
                  {item.plannedCompletionDate ? <time className={due ?? "normal"} dateTime={item.plannedCompletionDate}>{due === "overdue" ? "已逾期 · " : due === "soon" ? "临近 · " : "截止 · "}{dateLabel(item.plannedCompletionDate)}</time> : <span>未设置截止日期</span>}
                  {item.blockingCount > 0 && <span className="board-blockers">{item.blockingCount} 个前置未完成</span>}
                </div>
                <div className="board-card-actions">
                  <Link prefetch={false} href={`/?projectId=${encodeURIComponent(item.projectId)}&planId=${encodeURIComponent(item.id)}`}>查看详情</Link>
                  {item.canEdit ? <label><span className="sr-only">修改“{item.title}”的状态</span><select aria-label={`修改“${item.title}”的状态`} value={item.status} disabled={changing} onChange={(event) => void changeStatus(item, event.target.value as Status)}>{statuses.map((candidate) => <option key={candidate}>{candidate}</option>)}</select></label> : <span className="board-readonly">只读</span>}
                </div>
              </article>;
            })}
            {columns[status].length === 0 && <div className="board-column-empty">当前筛选下暂无节点</div>}
          </div>
        </section>)}
      </section>}
    </section>
  </main>;
}
