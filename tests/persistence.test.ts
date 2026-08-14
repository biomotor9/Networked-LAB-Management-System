import assert from "node:assert/strict";
import test from "node:test";
import {
  createBackup,
  LocalWorkspaceRepository,
  readBackupFile,
  readWorkspaceData,
} from "../app/features/persistence/workspace-repository";
import type { WorkspaceData } from "../app/features/workspace/model";

const workspace: WorkspaceData = {
  plans: [{
    id: "p1",
    parentId: null,
    title: "测试计划",
    domain: "综合",
    status: "未开始",
    summary: "",
    objective: "",
    success: "",
    tags: [],
    updatedAt: "刚刚",
  }],
  entries: [],
  dependencies: [],
  graphExpanded: ["p1"],
  viewStates: { __root__: { x: 1, y: 2, zoom: 1 } },
  notebookDocs: { p1: "# 测试计划" },
};

test("creates and reads a versioned backup", () => {
  const backup = createBackup(workspace, "2026-08-13T00:00:00.000Z");
  assert.equal(backup.format, "atlas-eln-backup");
  assert.equal(backup.version, 1);
  assert.deepEqual(readBackupFile(backup), workspace);
});

test("rejects unsupported or malformed backups", () => {
  assert.throws(() => readBackupFile({ format: "atlas-eln-backup", version: 2, data: workspace }), /版本暂不受支持/);
  assert.throws(() => readWorkspaceData({ plans: "invalid", entries: [] }), /不是有效/);
});

test("normalizes legacy statuses while loading", () => {
  const legacy = structuredClone(workspace) as WorkspaceData;
  (legacy.plans[0] as unknown as { status: string }).status = "计划终止";
  assert.equal(readWorkspaceData(legacy).plans[0].status, "终止");
});

test("local repository saves and restores the complete workspace", async () => {
  const values = new Map<string, string>();
  const repository = new LocalWorkspaceRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  }, "test-workspace");

  assert.equal(await repository.load(), null);
  await repository.save(workspace);
  assert.deepEqual(await repository.load(), workspace);
});
