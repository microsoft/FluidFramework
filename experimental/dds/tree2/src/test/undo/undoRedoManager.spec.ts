/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangeFamilyEditor,
	ChangeRebaser,
	GraphCommit,
	SessionId,
	UndoRedoManager,
	mintRevisionTag,
} from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { UndoRedoManagerCommitType, ReversibleCommit } from "../../core/undo/undoRedoManager";
import { TestChange, testChangeFamilyFactory } from "../testChange";
import { MockRepairDataStore, MockRepairDataStoreProvider } from "../utils";

const localSessionId: SessionId = "0";

describe("UndoRedoManager", () => {
	describe("trackCommit", () => {
		it("should create an undoable commit with the previous head as the parent", () => {
			const parent = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const childCommit = createTestGraphCommit([0], 1, localSessionId);
			const manager = undoRedoManagerFactory(parent);
			manager.trackCommit(childCommit, UndoRedoManagerCommitType.Undoable);

			const headUndoableCommit = manager.headUndoable;
			assert.equal(headUndoableCommit?.commit, childCommit);
			assert.equal(headUndoableCommit?.parent, parent);
		});

		it("should create a redoable commit with the previous head as the parent", () => {
			const parent = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const childCommit = createTestGraphCommit([0], 1, localSessionId);
			const manager = undoRedoManagerFactory(undefined, parent);
			manager.trackCommit(childCommit, UndoRedoManagerCommitType.Redoable);

			const headRedoableCommit = manager.headRedoable;
			assert.equal(headRedoableCommit?.commit, childCommit);
			assert.equal(headRedoableCommit?.parent, parent);
		});

		it("pops the head undoable commit and pushes to the redoable commit tree when an undo commit is tracked", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Undo);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.headUndoable, undefined);
			// The fake undo commit will now be redoable
			assert.equal(manager.headRedoable?.commit, fakeInvertedCommit);
		});

		it("pops the head redoable commit and pushes to the undoable commit tree when a redo commit is tracked", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Redo);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.headRedoable, undefined);
			// The fake undo commit will now be redoable
			assert.equal(manager.headUndoable?.commit, fakeInvertedCommit);
		});

		it("should add undoable commits to the undoable commit tree without changing the redoable commit tree", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Undoable);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.headUndoable?.commit, fakeInvertedCommit);
			// The fake undo commit will now be redoable
			assert.equal(manager.headRedoable, undefined);
		});

		it("should add redoable commits to the redoable commit tree without changing the undoable commit tree", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Redoable);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.headUndoable, initialCommit);
			// The fake undo commit will now be redoable
			assert.equal(manager.headRedoable?.commit, fakeInvertedCommit);
		});
	});

	describe("undo", () => {
		it("should create an invert of the head undoable commit", () => {
			const commit = createTestGraphCommit([], 0, localSessionId);
			const initialCommit = {
				commit,
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const undoChange = manager.undo();
			const invertedTestChange = TestChange.invert(commit.change);
			assert.deepEqual(undoChange, invertedTestChange);
		});

		it("should return undefined if there is no head undoable commit", () => {
			const manager = undoRedoManagerFactory();
			const undoChange = manager.undo();

			assert.equal(undoChange, undefined);
		});
	});

	describe("redo", () => {
		it("should create an invert of the head redoable commit", () => {
			const commit = createTestGraphCommit([], 0, localSessionId);
			const initialCommit = {
				commit,
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(undefined, initialCommit);
			const redoChange = manager.redo();
			const invertedTestChange = TestChange.invert(commit.change);
			assert.deepEqual(redoChange, invertedTestChange);
		});

		it("should return undefined if there is no head redoble commit", () => {
			const manager = undoRedoManagerFactory();
			const redoChange = manager.redo();

			assert.equal(redoChange, undefined);
		});
	});
});

function undoRedoManagerFactory(
	headUndoableCommit?: ReversibleCommit<TestChange>,
	headRedoableCommit?: ReversibleCommit<TestChange>,
	rebaser?: ChangeRebaser<TestChange>,
): UndoRedoManager<TestChange, ChangeFamilyEditor> {
	return new UndoRedoManager(
		new MockRepairDataStoreProvider(),
		testChangeFamilyFactory(rebaser),
		undefined,
		headUndoableCommit,
		headRedoableCommit,
	);
}

function createTestGraphCommit(
	inputContext: readonly number[],
	intention: number | number[],
	sessionId: SessionId,
	revision = mintRevisionTag(),
): GraphCommit<TestChange> {
	return {
		revision,
		sessionId,
		change: TestChange.mint(inputContext, intention),
	};
}
