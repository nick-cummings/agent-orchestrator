import { describe, expect, it } from "vitest";

import type { Activity } from "@/lib/db/activities";

import { activityRowToEvent, sseChunk, sseComment } from "./sse";

describe("sseChunk", () => {
    it("emits an id line (the seq) for activity events", () => {
        const chunk = sseChunk({
            type: "activity",
            executionId: "e1",
            id: "a1",
            seq: 5,
            at: "t",
            source: "agent",
            kind: "progress",
            cursor: "c",
        });
        expect(chunk).toContain("id: 5\n");
        expect(chunk).toContain("event: activity\n");
        expect(chunk.endsWith("\n\n")).toBe(true);
    });

    it("omits the id line for state events", () => {
        const chunk = sseChunk({
            type: "state",
            executionId: "e1",
            state: "succeeded",
        });
        expect(chunk).not.toContain("id:");
        expect(chunk).toContain("event: state\n");
    });
});

describe("sseComment", () => {
    it("formats a comment line", () => {
        expect(sseComment()).toBe(": keepalive\n\n");
        expect(sseComment("connected")).toBe(": connected\n\n");
    });
});

describe("activityRowToEvent", () => {
    it("maps a persisted activity row to an activity event", () => {
        const row: Activity = {
            id: "a1",
            executionId: "e1",
            seq: 3,
            at: "2026-06-01T00:00:00Z",
            source: "agent",
            kind: "code_change",
            text: "edited",
            data: { foo: 1 },
            cursor: "c3",
        };
        expect(activityRowToEvent(row)).toEqual({
            type: "activity",
            executionId: "e1",
            id: "a1",
            seq: 3,
            at: "2026-06-01T00:00:00Z",
            source: "agent",
            kind: "code_change",
            text: "edited",
            data: { foo: 1 },
            cursor: "c3",
        });
    });
});
