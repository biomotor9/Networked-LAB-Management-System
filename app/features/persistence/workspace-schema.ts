export { normalizeStatus } from "../workspace/model";
export type { WorkspaceData } from "../workspace/model";

import type { WorkspaceData } from "../workspace/model";

export type BackupFile = {
  format: "atlas-eln-backup";
  version: 2;
  exportedAt: string;
  data: WorkspaceData;
};
