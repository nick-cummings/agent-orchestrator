import IORedis from "ioredis";

import { createInMemoryBus, type EventBus } from "@/lib/realtime/bus";
import { createRedisBus, type RedisPubSub } from "@/lib/realtime/redisBus";

/**
 * Bus selection (server-only): Redis when `REDIS_URL` is set (multi-instance
 * prod), else the in-memory bus (single-process dev/tests — no infra). `getBus`
 * memoizes one instance per process so the poller and SSE endpoint share it.
 * Clients import event *types* from `events.ts`, never this module (which pulls
 * in ioredis).
 */
export const selectBus = (
    url: string | undefined,
    makeRedis: (url: string) => RedisPubSub,
): EventBus => (url ? createRedisBus(makeRedis(url)) : createInMemoryBus());

let memo: EventBus | undefined;

export const getBus = (): EventBus =>
    (memo ??= selectBus(process.env.REDIS_URL, (url) => new IORedis(url)));
