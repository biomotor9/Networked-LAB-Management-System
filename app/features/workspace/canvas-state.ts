import type { ViewportState } from "./model";

export const ROOT_CANVAS_ID = "__root__";

export function resolveCanvasViewport({
  projectId,
  hydratedProjectId,
  focusId,
  viewStates,
}: {
  projectId: string | null;
  hydratedProjectId: string | null;
  focusId: string | null;
  viewStates: Record<string, ViewportState>;
}) {
  const canvasId = focusId ?? ROOT_CANVAS_ID;
  const ready = projectId !== null && hydratedProjectId === projectId;
  const viewport = ready ? viewStates[canvasId] : undefined;

  return {
    key: `${projectId ?? "no-project"}:${ready ? "ready" : "loading"}:${canvasId}`,
    viewport,
    fitView: viewport === undefined,
  };
}
