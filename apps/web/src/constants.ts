import { BATCH_INTERVAL_MS, ADD_BATCH_INTERVAL_MS } from "@million/shared";

export const ROW_HEIGHT = 56;
// Даём серверу небольшой запас после обработки пакета.
export const CHANGE_REFRESH_MS = BATCH_INTERVAL_MS + 100;
export const ADD_REFRESH_MS = ADD_BATCH_INTERVAL_MS + 100;
