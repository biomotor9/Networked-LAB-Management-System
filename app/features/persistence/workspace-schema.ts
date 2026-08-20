export { normalizeStatus } from "../workspace/model";
export type { WorkspaceData } from "../workspace/model";

import type { WorkspaceData } from "../workspace/model";

export type BackupFile = {
  format: "atlas-eln-backup";
  version: 3;
  exportedAt: string;
  data: WorkspaceData;
};
