import type { SessionEvent } from "@/lib/realtime/events";

/**
 * A single-consumer async queue of SessionEvents — the shared engine behind
 * both the in-memory and Redis buses. `push` delivers (or buffers) an event;
 * `close` ends the stream. Iterating drains buffered events, then awaits the
 * next `push`/`close`. `onClose` runs once on teardown (unsubscribe/cleanup).
 */
export type EventQueue = {
    iterable: AsyncIterable<SessionEvent>;
    push: (event: SessionEvent) => void;
    close: () => void;
};

export const createEventQueue = (onClose?: () => void): EventQueue => {
    const buffered: SessionEvent[] = [];
    let pending: ((r: IteratorResult<SessionEvent>) => void) | null = null;
    let closed = false;

    const push = (event: SessionEvent): void => {
        if (closed) return;
        if (pending) {
            pending({ value: event, done: false });
            pending = null;
        } else {
            buffered.push(event);
        }
    };

    const close = (): void => {
        if (closed) return;
        closed = true;
        onClose?.();
        if (pending) {
            pending({ value: undefined, done: true });
            pending = null;
        }
    };

    const iterable: AsyncIterable<SessionEvent> = {
        [Symbol.asyncIterator]: () => ({
            next: () => {
                const queued = buffered.shift();
                if (queued !== undefined) {
                    return Promise.resolve({ value: queued, done: false });
                }
                if (closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise<IteratorResult<SessionEvent>>((resolve) => {
                    pending = resolve;
                });
            },
            return: () => {
                close();
                return Promise.resolve({ value: undefined, done: true });
            },
        }),
    };

    return { iterable, push, close };
};
