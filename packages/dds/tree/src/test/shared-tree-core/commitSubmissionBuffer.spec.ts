/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { GraphCommit } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests the internal submission queue.
import { CommitSubmissionBuffer } from "../../shared-tree-core/commitSubmissionBuffer.js";
import { mintRevisionTag } from "../utils.js";

describe("CommitSubmissionBuffer", () => {
	// Artificial change kinds keep these tests independent of schema and data encoding.
	function commit(change: "hold" | "flush"): GraphCommit<"hold" | "flush"> {
		return { revision: mintRevisionTag(), change, customMetadata: undefined };
	}

	it("holds commits until a trigger and leaves a later suffix buffered", () => {
		const buffer = new CommitSubmissionBuffer<"hold" | "flush">(
			(change) => change === "flush",
		);
		const first = commit("hold");
		const data = commit("flush");
		const later = commit("hold");
		buffer.enqueue([first]);
		assert.deepEqual(buffer.getReadyCommits([first]), []);
		// A single append can include both a trigger and a later commit that must stay held.
		// The trigger releases only the prefix through itself, not the whole append.
		buffer.enqueue([data, later]);
		assert.deepEqual(buffer.getReadyCommits([first, data, later]), [first, data]);
		buffer.remove(first.revision);
		buffer.remove(data.revision);
		assert.equal(buffer.has(later.revision), true);
		assert.deepEqual(buffer.getReadyCommits([later]), []);
	});

	it("uses the current rebased commit without re-evaluating its original flush policy", () => {
		let decisions = 0;
		const buffer = new CommitSubmissionBuffer<"hold" | "flush">((change) => {
			decisions++;
			return change === "flush";
		});
		const original = commit("hold");
		buffer.enqueue([original]);
		// Rebase can replace a change without changing its revision. Even if its new
		// contents would trigger a flush, rebase itself must not authorize submission.
		const rebased = { ...original, change: "flush" as const };
		assert.deepEqual(buffer.getReadyCommits([rebased]), []);
		const next = commit("flush");
		buffer.enqueue([next]);
		// A new local trigger releases the rebased object, not the object first queued.
		assert.deepEqual(buffer.getReadyCommits([rebased, next]), [rebased, next]);
		assert.equal(decisions, 2);
	});

	it("removes cancelled or acknowledged revisions without flushing the rest", () => {
		const buffer = new CommitSubmissionBuffer<"hold" | "flush">(
			(change) => change === "flush",
		);
		const first = commit("hold");
		const trigger = commit("flush");
		const later = commit("hold");
		buffer.enqueue([first, trigger, later]);
		// Removing the trigger must retain the earlier authorization without extending
		// it to the held suffix as the queue's indices shift.
		buffer.remove(trigger.revision);
		assert.deepEqual(buffer.getReadyCommits([first, later]), [first]);
		buffer.remove(first.revision);
		// Submission and synchronous detached acknowledgement can remove the same revision.
		buffer.remove(first.revision);
		assert.deepEqual(buffer.getReadyCommits([later]), []);
		assert.equal(buffer.hasPending, true);
		buffer.remove(later.revision);
		assert.equal(buffer.hasPending, false);
	});

	it("reports missing history instead of silently losing queued work", () => {
		const buffer = new CommitSubmissionBuffer<"hold" | "flush">(() => true);
		buffer.enqueue([commit("flush")]);
		// A ready revision must still resolve in local history. Returning an empty
		// result here would silently lose work that was authorized for submission.
		assert.throws(
			() => buffer.getReadyCommits([]),
			/Buffered commit must remain in local history/,
		);
	});

	it("marks all appended commits ready when the caller bypasses the buffer", () => {
		const buffer = new CommitSubmissionBuffer<"hold" | "flush">(() => {
			// This policy would hold every commit if its result controlled readiness.
			return false;
		});
		const commits = [commit("hold"), commit("hold")];
		// Detached commits and stashed-op replay use this bypass. All commits must
		// become ready, even when none would satisfy the application policy.
		buffer.enqueue(commits, /* bypassBuffer: */ true);
		assert.deepEqual(buffer.getReadyCommits(commits), commits);
	});
});
