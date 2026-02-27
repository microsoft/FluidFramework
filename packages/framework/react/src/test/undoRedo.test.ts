/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Listenable } from "@fluidframework/core-interfaces";
import {
	CommitKind,
	type CommitMetadata,
	type Revertible,
	type RevertibleFactory,
	RevertibleStatus,
	type TreeViewEvents,
} from "@fluidframework/tree";

import { UndoRedoStacks } from "../undoRedo.js";

type CommitAppliedHandler = (
	commit: CommitMetadata,
	getRevertible?: RevertibleFactory,
) => void;

function createMockListenable(): {
	listenable: Listenable<TreeViewEvents>;
	fireCommit: (kind: CommitKind, revertible: Revertible) => void;
} {
	let handler: CommitAppliedHandler | undefined;
	const listenable = {
		on: (_event: string, cb: CommitAppliedHandler) => {
			handler = cb;
			return () => {};
		},
	} as unknown as Listenable<TreeViewEvents>;

	function fireCommit(kind: CommitKind, revertible: Revertible): void {
		assert(handler !== undefined, "handler should be registered");
		const commit: CommitMetadata = { kind, isLocal: true };
		handler(commit, () => revertible);
	}

	return { listenable, fireCommit };
}

function createMockRevertible(): Revertible {
	return {
		revert: () => {},
		dispose: () => {},
		status: RevertibleStatus.Valid,
	};
}

describe("UndoRedoStacks", () => {
	it("commit, undo, and redo notify listeners", () => {
		const { listenable, fireCommit } = createMockListenable();
		const stacks = new UndoRedoStacks(listenable);

		let notifyCount = 0;
		stacks.onStateChange(() => {
			notifyCount++;
		});

		// Adding a change notifies
		fireCommit(CommitKind.Default, createMockRevertible());
		assert.equal(notifyCount, 1);

		// Undo notifies
		stacks.undo();
		assert.equal(notifyCount, 2);

		// Set up redo stack (also notifies)
		fireCommit(CommitKind.Undo, createMockRevertible());
		assert.equal(notifyCount, 3);

		// Redo notifies
		stacks.redo();
		assert.equal(notifyCount, 4);
	});

	it("canUndo/canRedo reflect stack state", () => {
		const { listenable, fireCommit } = createMockListenable();
		const stacks = new UndoRedoStacks(listenable);

		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), false);

		fireCommit(CommitKind.Default, createMockRevertible());
		assert.equal(stacks.canUndo(), true);

		fireCommit(CommitKind.Undo, createMockRevertible());
		assert.equal(stacks.canRedo(), true);
	});
});
