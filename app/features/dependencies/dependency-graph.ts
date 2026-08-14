import type { Dependency } from "../workspace/model";

export function hasDependencyPath(dependencies: readonly Dependency[], startId: string, goalId: string): boolean {
  const targetsBySource = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const targets = targetsBySource.get(dependency.sourceId) ?? [];
    targets.push(dependency.targetId);
    targetsBySource.set(dependency.sourceId, targets);
  }

  const queue = [startId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (id === goalId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(targetsBySource.get(id) ?? []));
  }
  return false;
}

export function wouldCreateDependencyCycle(
  dependencies: readonly Dependency[],
  sourceId: string,
  targetId: string,
): boolean {
  return sourceId === targetId || hasDependencyPath(dependencies, targetId, sourceId);
}

