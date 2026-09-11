export type ItemId = number | string;

export const PAGE_SIZE = 20;
export const BATCH_INTERVAL_MS = 1_000;
export const ADD_BATCH_INTERVAL_MS = 10_000;
export const MAX_ID_LENGTH = 128;
export const MAX_ADD_IDS = 100;
export interface PageResponse {
  items: ItemId[];
  nextCursor: string | null;
}
export interface StateResponse {
  revision: number;
  pending: number;
}
export interface MutationResponse {
  operationId: string;
  status: "queued" | "duplicate";
  revision: number;
}
