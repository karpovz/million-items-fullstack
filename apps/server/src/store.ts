import type { ItemId } from "@million/shared";

export function normalizeId(value: ItemId): ItemId {
  const text = String(value).trim();
  const number = Number(text);
  return Number.isSafeInteger(number) && String(number) === text
    ? number
    : text;
}

export function reorderFiltered(
  order: ItemId[],
  query: string,
  active: ItemId,
  over: ItemId,
): ItemId[] {
  const matches = (id: ItemId) => String(id).includes(query);
  const slots = order
    .map((id, index) => (matches(id) ? index : -1))
    .filter((index) => index >= 0);
  const visible = slots.map((index) => order[index]!);
  const from = visible.indexOf(active);
  const to = visible.indexOf(over);
  if (from < 0 || to < 0 || from === to) return [...order];
  visible.splice(to, 0, visible.splice(from, 1)[0]!);
  const result = [...order];
  slots.forEach((slot, index) => {
    result[slot] = visible[index]!;
  });
  return result;
}

export function nextMatchingBaseId(
  start: number,
  maximum: number,
  query: string,
): number | undefined {
  if (start > maximum) return undefined;
  if (query === "") return Math.max(1, start);
  if (!/^\d+$/.test(query)) return undefined;

  // Например, для "23" подходят блоки 230–239, 1230–1239 и т.д.
  // Перебираем положение подстроки и находим ближайший блок без перебора ID.
  const firstLength = String(Math.max(1, start)).length;
  const lastLength = String(maximum).length;
  for (let length = firstLength; length <= lastLength; length++) {
    const lower = Math.max(start, 10 ** (length - 1));
    const upper = Math.min(maximum, 10 ** length - 1);
    let best: number | undefined;
    for (
      let suffixLength = 0;
      suffixLength <= length - query.length;
      suffixLength++
    ) {
      const blockSize = 10 ** suffixLength;
      const period = 10 ** (suffixLength + query.length);
      const blockStart =
        Math.floor(lower / period) * period + Number(query) * blockSize;
      const candidate =
        lower >= blockStart + blockSize
          ? blockStart + period
          : Math.max(lower, blockStart);
      if (candidate <= upper && (best === undefined || candidate < best)) {
        best = candidate;
      }
    }
    if (best !== undefined) return best;
  }
  return undefined;
}

export class ItemStore {
  readonly selected = new Set<ItemId>();
  readonly order: ItemId[] = [];
  readonly custom = new Set<ItemId>();
  private readonly customOrder: ItemId[] = [];
  revision = 0;
  constructor(readonly baseMax = 1_000_000) {}
  has(id: ItemId): boolean {
    id = normalizeId(id);
    return (
      (typeof id === "number" &&
        id >= 1 &&
        id <= this.baseMax &&
        Number.isInteger(id)) ||
      this.custom.has(id)
    );
  }
  addCustom(id: ItemId): boolean {
    id = normalizeId(id);
    if (this.has(id)) return false;
    this.custom.add(id);
    this.customOrder.push(id);
    this.revision++;
    return true;
  }
  select(id: ItemId): boolean {
    id = normalizeId(id);
    if (!this.has(id) || this.selected.has(id)) return false;
    this.selected.add(id);
    this.order.push(id);
    this.revision++;
    return true;
  }
  deselect(id: ItemId): boolean {
    id = normalizeId(id);
    if (!this.selected.delete(id)) return false;
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    this.revision++;
    return true;
  }
  reorder(query: string, active: ItemId, over: ItemId): boolean {
    const next = reorderFiltered(this.order, query, active, over);
    if (next.every((id, index) => id === this.order[index])) return false;
    for (let index = 0; index < next.length; index++)
      this.order[index] = next[index]!;
    this.revision++;
    return true;
  }
  pageAvailable(
    cursor: string | undefined,
    limit: number,
    query: string,
  ): {
    items: ItemId[];
    nextCursor: string | null;
  } {
    const matches: { id: ItemId; cursor: string }[] = [];
    const customCursor = cursor?.startsWith("c:") ?? false;
    if (!customCursor) {
      let candidate = nextMatchingBaseId(
        cursor === undefined ? 1 : Number(cursor) + 1,
        this.baseMax,
        query,
      );
      while (candidate !== undefined && matches.length <= limit) {
        if (!this.selected.has(candidate))
          matches.push({ id: candidate, cursor: String(candidate) });
        candidate = nextMatchingBaseId(candidate + 1, this.baseMax, query);
      }
    }
    for (
      let index = customCursor ? Number(cursor!.slice(2)) + 1 : 0;
      index < this.customOrder.length && matches.length <= limit;
      index++
    ) {
      const id = this.customOrder[index]!;
      if (!this.selected.has(id) && String(id).includes(query))
        matches.push({ id, cursor: `c:${index}` });
    }
    const hasMore = matches.length > limit;
    if (hasMore) matches.pop();
    return {
      items: matches.map(({ id }) => id),
      nextCursor: hasMore ? matches.at(-1)!.cursor : null,
    };
  }
  pageSelected(cursor: string | undefined, limit: number, query: string) {
    const startIndex = cursor === undefined ? 0 : Number(cursor) + 1;
    const matches: { id: ItemId; index: number }[] = [];
    for (let index = startIndex; index < this.order.length; index++) {
      const id = this.order[index]!;
      if (String(id).includes(query)) matches.push({ id, index });
      if (matches.length > limit) break;
    }
    const hasMore = matches.length > limit;
    if (hasMore) matches.pop();
    return {
      items: matches.map(({ id }) => id),
      nextCursor: hasMore ? String(matches.at(-1)!.index) : null,
    };
  }
}
