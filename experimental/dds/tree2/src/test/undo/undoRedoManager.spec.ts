/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import {
	ChangeFamilyEditor,
	ChangeRebaser,
	GraphCommit,
	SessionId,
	UndoRedoManager,
	mintRevisionTag,
} from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { UndoRedoManagerCommitType, UndoableCommit } from "../../core/undo/undoRedoManager";
import { TestChange, testChangeFamilyFactory } from "../testChange";
import { MockRepairDataStore, MockRepairDataStoreProvider } from "../utils";

const localSessionId: SessionId = "0";

describe("UndoRedoManager", () => {
	describe("trackCommit", () => {
		it("should create an undoable commit with the provided commit as the child", () => {
			const parent = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const childCommit = createTestGraphCommit([0], 1, localSessionId);
			const manager = undoRedoManagerFactory(parent);
			manager.trackCommit(childCommit);

			const headUndoCommit = manager.headUndoable;
			assert.equal(headUndoCommit?.commit, childCommit);
			assert.equal(headUndoCommit?.parent, parent);
		});

		it("should create an redoable commit with the provided commit as the child", () => {
			fail();
		});

		it("pops the head undoable commit when an undo commit is tracked", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Undo);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.headUndoable, undefined);
		});

		it("pops the head undoable commit and pushes to the redoable commit tree when a redo commit is tracked", () => {
			fail();
		});

		it("should add undoable commits to the undoable commit tree without changing the redoable commit tree", () => {
			fail();
		});

		it("should add redoable commits to the redoable commit tree without changing the undoable commit tree", () => {
			fail();
		});
	});

	describe("undo", () => {
		it("should create an invert of the head undoable commit", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = undoRedoManagerFactory(initialCommit);
			const undoableCommit = createTestGraphCommit([0], 1, localSessionId);
			manager.trackCommit(undoableCommit);
			manager.undo();
			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit, UndoRedoManagerCommitType.Undo);
			assert.equal(manager.headUndoable, initialCommit);
		});

		it("should create an invert of the head redoable commit", () => {
			fail();
		});

		it("should return undefined if there is no head undoble commit", () => {
			const manager = undoRedoManagerFactory();
			manager.undo();

			assert.equal(manager.headUndoable, undefined);
		});

		it("should return undefined if there is no head redoble commit", () => {
			fail();
		});
	});
});

function undoRedoManagerFactory(
	headUndoCommit?: UndoableCommit<TestChange>,
	rebaser?: ChangeRebaser<TestChange>,
): UndoRedoManager<TestChange, ChangeFamilyEditor> {
	return new UndoRedoManager(
		new MockRepairDataStoreProvider(),
		testChangeFamilyFactory(rebaser),
		undefined,
		headUndoCommit,
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
