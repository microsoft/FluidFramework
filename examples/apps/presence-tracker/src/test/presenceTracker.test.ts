/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";

import type { FocusTracker, IFocusState, IFocusTrackerEvents } from "../FocusTracker.js";

class MockFocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
	private readonly presences: Map<{ readonly attendeeId: string }, boolean> = new Map();

	public getFocusPresences(): Map<{ readonly attendeeId: string }, boolean> {
		return new Map(this.presences);
	}

	public simulateFocusChange(attendeeId: string, hasFocus: boolean): void {
		// Add or update the presence entry
		for (const [key] of this.presences) {
			if (key.attendeeId === attendeeId) {
				this.presences.delete(key);
				break;
			}
		}
		this.presences.set({ attendeeId }, hasFocus);
		this.emit("focusChanged", { hasFocus });
	}
}

describe("presence-tracker", () => {
	describe("MockFocusTracker", () => {
		it("starts with no presences", () => {
			const tracker = new MockFocusTracker();
			assert.equal(tracker.getFocusPresences().size, 0, "Expected empty presences initially");
		});

		it("tracks focus presences", () => {
			const tracker = new MockFocusTracker();
			tracker.simulateFocusChange("session-1", true);
			tracker.simulateFocusChange("session-2", false);

			const presences = tracker.getFocusPresences();
			assert.equal(presences.size, 2, "Expected two presence entries");

			const entries = [...presences.entries()];
			const session1 = entries.find(([key]) => key.attendeeId === "session-1");
			assert.ok(session1, "Expected session-1 in presences");
			assert.equal(session1[1], true, "Expected session-1 to have focus");

			const session2 = entries.find(([key]) => key.attendeeId === "session-2");
			assert.ok(session2, "Expected session-2 in presences");
			assert.equal(session2[1], false, "Expected session-2 to not have focus");
		});

		it("emits focusChanged event when focus changes", () => {
			const tracker = new MockFocusTracker();
			let receivedState: IFocusState | undefined;

			tracker.on("focusChanged", (state: IFocusState) => {
				receivedState = state;
			});

			tracker.simulateFocusChange("session-1", true);
			assert.ok(receivedState !== undefined, "Expected focusChanged event to be emitted");
			assert.equal(receivedState.hasFocus, true, "Expected hasFocus to be true");
		});

		it("satisfies FocusTracker interface shape", () => {
			const tracker = new MockFocusTracker() as unknown as FocusTracker;
			assert.ok(tracker !== undefined, "Expected tracker to be defined");
			assert.strictEqual(typeof tracker.getFocusPresences, "function");
		});
	});
});
