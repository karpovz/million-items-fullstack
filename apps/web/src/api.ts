import { PAGE_SIZE } from "@million/shared";
import type {
  ItemId,
  PageResponse,
  MutationResponse,
  StateResponse,
} from "@million/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as unknown;
  if (!response.ok)
    throw new Error(
      (body as { error?: string }).error ??
        `Request failed (${response.status})`,
    );
  return body as T;
}
export function getPage(
  kind: "available" | "selected",
  search: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ search, limit: String(PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  return request<PageResponse>(`/api/items/${kind}?${params}`, {
    signal: signal ?? null,
  });
}
export const getState = () => request<StateResponse>("/api/state");
function createOperationId() {
  // getRandomValues доступен и по HTTP, в отличие от randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
const post = (url: string, body: unknown) =>
  request<MutationResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const selectId = (id: ItemId, selected: boolean) =>
  post("/api/selection", { operationId: createOperationId(), id, selected });
export const addIds = (ids: ItemId[]) =>
  post("/api/items", { operationId: createOperationId(), ids });
export const reorderIds = (search: string, activeId: ItemId, overId: ItemId) =>
  post("/api/reorder", {
    operationId: createOperationId(),
    search,
    activeId,
    overId,
  });
