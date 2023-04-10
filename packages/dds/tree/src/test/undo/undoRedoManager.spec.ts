/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangeFamilyEditor,
	ChangeRebaser,
	Delta,
	FieldKey,
	GraphCommit,
	ITreeCursorSynchronous,
	RepairDataStore,
	RevisionTag,
	SessionId,
	UndoRedoManager,
	UpPath,
	Value,
	mintRevisionTag,
} from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { UndoableCommit, UndoableCommitType } from "../../core/undo/undoRedoManager";
import { TestChange, testChangeFamilyFactory } from "../testChange";

const localSessionId: SessionId = "0";

describe("UndoRedoManager", () => {
	describe("trackCommit", () => {
		it("should create an undoable commit with the provided commit as the child", () => {
			const parent = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const childCommit = createTestGraphCommit([0], 1, localSessionId);
			const manager = new TestUndoRedoManager(parent);
			manager.trackCommit(childCommit);

			const headUndoCommit = manager.getHeadUndoCommit();
			assert.equal(headUndoCommit?.commit, childCommit);
			assert.equal(headUndoCommit?.parent, parent);
		});
	});

	describe("undo", () => {
		it("should undo the head undo commit", () => {
			const initialCommit = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const manager = new TestUndoRedoManager(initialCommit);
			const undoCommit = createTestGraphCommit([0], 1, localSessionId);
			manager.trackCommit(undoCommit);
			manager.undo();
			assert.equal(manager.getPendingCommitType(), UndoableCommitType.Undo);
			assert.equal(manager.getHeadUndoCommit(), initialCommit);
			assert.equal(manager.changesApplied, 1);

			const fakeInvertedCommit = createTestGraphCommit([0, 1], 2, localSessionId);
			manager.trackCommit(fakeInvertedCommit);
			// The head undo commit will not be the new inverted commit
			assert.equal(manager.getHeadUndoCommit(), initialCommit);
		});

		it("should do nothing if there is no head undo commit", () => {
			const manager = new TestUndoRedoManager();
			manager.undo();

			assert.equal(manager.getHeadUndoCommit(), undefined);
			assert.equal(manager.changesApplied, 0);
		});
	});

	it("clone should return a new instance of UndoRedoManager with the same head undo commit and the provided applyChange callback", () => {
		const initialCommit = {
			commit: createTestGraphCommit([], 0, localSessionId),
			repairData: new MockRepairDataStore(),
		};
		const manager = new TestUndoRedoManager(initialCommit);

		let clonedApplyChangesCount = 0;
		const clonedApplyChanges = () => {
			clonedApplyChangesCount++;
		};
		const clonedUndoRedoManager = manager.clone(clonedApplyChanges);

		const undoCommit = createTestGraphCommit([0], 1, localSessionId);
		clonedUndoRedoManager.trackCommit(undoCommit);
		clonedUndoRedoManager.undo();
		assert.equal(manager.changesApplied, 0);
		assert.equal(clonedApplyChangesCount, 1);
	});
});

class TestUndoRedoManager extends UndoRedoManager<TestChange, ChangeFamilyEditor> {
	public changesApplied = 0;

	public constructor(
		headUndoCommit?: UndoableCommit<TestChange>,
		applyChanges?: (changes: TestChange) => void,
		rebaser?: ChangeRebaser<TestChange>,
	) {
		super(
			() => new MockRepairDataStore(),
			testChangeFamilyFactory(rebaser),
			applyChanges !== undefined
				? applyChanges
				: () => {
						this.changesApplied++;
				  },
			headUndoCommit,
		);
	}

	public getHeadUndoCommit(): UndoableCommit<TestChange> | undefined {
		return this.headUndoCommit as UndoableCommit<TestChange>;
	}

	public getPendingCommitType(): UndoableCommitType | undefined {
		return this.pendingCommit;
	}
}

class MockRepairDataStore implements RepairDataStore {
	public capturedData = new Map<RevisionTag, (ITreeCursorSynchronous | Value)[]>();

	public capture(change: Delta.Root, revision: RevisionTag): void {
		const existing = this.capturedData.get(revision);

		if (existing === undefined) {
			this.capturedData.set(revision, [revision]);
		} else {
			existing.push(revision);
		}
	}

	public getNodes(
		revision: RevisionTag,
		path: UpPath | undefined,
		key: FieldKey,
		index: number,
		count: number,
	): ITreeCursorSynchronous[] {
		throw new Error("Method not implemented.");
	}

	public getValue(revision: RevisionTag, path: UpPath): Value {
		throw new Error("Method not implemented.");
	}
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
