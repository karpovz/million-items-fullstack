import {
  PAGE_SIZE,
  BATCH_INTERVAL_MS,
  ADD_BATCH_INTERVAL_MS,
  MAX_ID_LENGTH,
  MAX_ADD_IDS,
} from "@million/shared";
import type { ItemId, PageResponse, StateResponse } from "@million/shared";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { join } from "node:path";
import { z } from "zod";
import {
  CapacityError,
  OperationRegistry,
  OperationQueue,
  ReadBatcher,
  type Operation,
} from "./queues.js";
import { ItemStore, normalizeId } from "./store.js";

const operationId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w:.-]+$/);
const safeId = z
  .union([
    z
      .number()
      .refine(
        (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
      ),
    z.string().trim().min(1).max(MAX_ID_LENGTH),
  ])
  .transform(normalizeId);
const safeIntegerCursor = z
  .string()
  .regex(/^-?(0|[1-9]\d*)$/)
  .refine((value) => Number.isSafeInteger(Number(value)));
const indexCursor = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => Number.isSafeInteger(Number(value)));
const listQueryBase = {
  search: z.string().max(MAX_ID_LENGTH).default(""),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE).default(PAGE_SIZE),
};
const availableListQuery = z.object({
  ...listQueryBase,
  cursor: z
    .union([
      safeIntegerCursor,
      z
        .string()
        .regex(/^c:(0|[1-9]\d*)$/)
        .refine((value) => Number.isSafeInteger(Number(value.slice(2)))),
    ])
    .optional(),
});
const selectedListQuery = z.object({
  ...listQueryBase,
  cursor: indexCursor.optional(),
});
const addBody = z.object({
  operationId,
  ids: z.array(safeId).min(1).max(MAX_ADD_IDS),
});
const selectionBody = z.object({
  operationId,
  id: safeId,
  selected: z.boolean(),
});
const reorderBody = z.object({
  operationId,
  search: z.string().max(MAX_ID_LENGTH).default(""),
  activeId: safeId,
  overId: safeId,
});

export function createService(staticDir?: string) {
  const store = new ItemStore();
  const claimedOperationIds = new OperationRegistry();
  const pendingCustom = new Set<ItemId>();
  const apply = (operation: Operation) => {
    if (operation.kind === "add") {
      for (const id of operation.value) {
        store.addCustom(id);
        pendingCustom.delete(id);
      }
    }
    if (operation.kind === "selection") {
      const { id, selected } = operation.value;
      if (selected) store.select(id);
      else store.deselect(id);
    }
    if (operation.kind === "reorder") {
      const value = operation.value;
      store.reorder(value.search, value.activeId, value.overId);
    }
    claimedOperationIds.complete(operation.id);
  };
  const additions = new OperationQueue(ADD_BATCH_INTERVAL_MS, apply);
  const fast = new OperationQueue(BATCH_INTERVAL_MS, apply);
  const enqueue = (queue: OperationQueue, operation: Operation) => {
    claimedOperationIds.claim(operation.id);
    try {
      return queue.enqueue(operation);
    } catch (error) {
      claimedOperationIds.release(operation.id);
      throw error;
    }
  };
  const reads = new ReadBatcher<PageResponse | StateResponse>(
    BATCH_INTERVAL_MS,
  );
  const app = express();
  let acceptingMutations = true;
  const rejectMutationDuringShutdown = (res: Response): boolean => {
    if (acceptingMutations && !additions.failed && !fast.failed) return false;
    res.status(503).json({ error: "Service is unavailable" });
    return true;
  };
  app.disable("x-powered-by");
  // Приложение доступно по HTTP на IP-адресе, без TLS перед Express.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: null },
      },
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      strictTransportSecurity: false,
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_req, res) => {
    const ok = !additions.failed && !fast.failed;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "error" });
  });
  app.get("/api/state", async (_req, res) => {
    res.json(
      await reads.get("state", () => ({
        revision: store.revision,
        pending: additions.pending + fast.pending,
      })),
    );
  });
  app.get("/api/items/available", async (req, res) => {
    const q = availableListQuery.parse(req.query);
    res.json(
      await reads.get(
        JSON.stringify(["available", q.search, q.cursor, q.limit]),
        () => store.pageAvailable(q.cursor, q.limit, q.search),
      ),
    );
  });
  app.get("/api/items/selected", async (req, res) => {
    const q = selectedListQuery.parse(req.query);
    res.json(
      await reads.get(
        JSON.stringify(["selected", q.search, q.cursor, q.limit]),
        () => store.pageSelected(q.cursor, q.limit, q.search),
      ),
    );
  });
  app.post("/api/items", (req, res) => {
    const body = addBody.parse(req.body);
    if (rejectMutationDuringShutdown(res)) return;
    if (claimedOperationIds.has(body.operationId))
      return res.status(202).json({
        operationId: body.operationId,
        status: "duplicate",
        revision: store.revision,
      });
    const ids = [...new Set(body.ids)].filter(
      (id) => !store.has(id) && !pendingCustom.has(id),
    );
    let status: "queued" | "duplicate" = "duplicate";
    if (ids.length) {
      status = enqueue(additions, {
        id: body.operationId,
        kind: "add",
        value: ids,
      });
      ids.forEach((id) => pendingCustom.add(id));
    } else {
      claimedOperationIds.claim(body.operationId);
      claimedOperationIds.complete(body.operationId);
    }
    return res.status(202).json({
      operationId: body.operationId,
      status,
      revision: store.revision,
    });
  });
  app.post("/api/selection", (req, res) => {
    const body = selectionBody.parse(req.body);
    if (rejectMutationDuringShutdown(res)) return;
    if (claimedOperationIds.has(body.operationId))
      return res.status(202).json({
        operationId: body.operationId,
        status: "duplicate",
        revision: store.revision,
      });
    if (body.selected && !store.has(body.id))
      return res.status(404).json({ error: "Unknown item ID" });
    const status = enqueue(fast, {
      id: body.operationId,
      kind: "selection",
      value: { id: body.id, selected: body.selected },
    });
    return res.status(202).json({
      operationId: body.operationId,
      status,
      revision: store.revision,
    });
  });
  app.post("/api/reorder", (req, res) => {
    const body = reorderBody.parse(req.body);
    if (rejectMutationDuringShutdown(res)) return;
    if (claimedOperationIds.has(body.operationId))
      return res.status(202).json({
        operationId: body.operationId,
        status: "duplicate",
        revision: store.revision,
      });
    if (!store.selected.has(body.activeId) || !store.selected.has(body.overId))
      return res
        .status(409)
        .json({ error: "Both IDs must be selected in canonical state" });
    const status = enqueue(fast, {
      id: body.operationId,
      kind: "reorder",
      value: body,
    });
    return res.status(202).json({
      operationId: body.operationId,
      status,
      revision: store.revision,
    });
  });
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("{*path}", (_req, res) =>
      res.sendFile(join(staticDir, "index.html")),
    );
  }
  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      void next;
      if (error instanceof z.ZodError)
        res
          .status(400)
          .json({ error: "Invalid request", issues: error.issues });
      else if (error instanceof CapacityError) {
        res.set("Retry-After", "1").status(503).json({ error: error.message });
      } else if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error.status === 400 || error.status === 413)
      ) {
        res.status(error.status).json({ error: "Invalid request body" });
      } else {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
  return {
    app,
    close: async () => {
      acceptingMutations = false;
      await Promise.all([additions.close(), fast.close(), reads.close()]);
    },
  };
}
