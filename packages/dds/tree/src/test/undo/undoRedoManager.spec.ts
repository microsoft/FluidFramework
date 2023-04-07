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
	SessionId,
	UndoRedoManager,
	UpPath,
	Value,
	mintRevisionTag,
} from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { UndoableCommit } from "../../core/undo/undoRedoManager";
import { TestChange, testChangeFamilyFactory } from "../testChange";

const localSessionId: SessionId = "0";

describe.only("UndoRedoManager", () => {
	describe("trackCommit", () => {
		it("should create an undoable commit with the provided commit as the child", () => {
			const parent = {
				commit: createTestGraphCommit([], 0, localSessionId),
				repairData: new MockRepairDataStore(),
			};
			const childCommit = createTestGraphCommit([0], 1, localSessionId);
			const manager = undoRedoManagerFactory({ headUndoCommit: parent });
			manager.trackCommit(childCommit);

			assert.equal(manager.getHeadUndoCommit(), {
				commit: childCommit,
				parent,
				repairData: assert.ok(Object),
			});
		});

		// it('should not create an undoable commit if the pending commit type is "Undo"', () => {
		// 	const manager = undoRedoManagerFactory({});
		// 	const undoCommit = { revision: 0, change: "undo" };
		// 	manager.pendingCommit = "undo";
		// 	manager.trackCommit(undoCommit);

		// 	expect(manager.getHeadUndoCommit()).toBeUndefined();
		// });
	});

	// describe("undo", () => {
	// 	it("should undo the head undo commit", () => {
	// 		const manager = undoRedoManagerFactory({});
	// 		const undoCommit = { revision: 0, change: "undo" };
	// 		const parentCommit = { revision: 1, change: "parent" };
	// 		const childCommit = { revision: 2, change: "child" };
	// 		const repairData = { get: jest.fn() };
	// 		const invertedChange = "inverted";
	// 		manager.getHeadUndoCommit() = {
	// 			commit: undoCommit,
	// 			parent: {
	// 				commit: parentCommit,
	// 				parent: undefined,
	// 				repairData,
	// 			},
	// 			repairData: { get: jest.fn() },
	// 		};
	// 		manager.pendingCommit = undefined;
	// 		(manager.changeFamily.rebaser.invert as jest.Mock).mockReturnValue(
	// 			invertedChange,
	// 		);
	// 		(repairData.get as jest.Mock).mockReturnValue(childCommit.change);

	// 		manager.undo();

	// 		expect(manager.getHeadUndoCommit()?.commit).toEqual(parentCommit);
	// 		expect(applyChange).toHaveBeenCalledWith(invertedChange);
	// 	});

	// 	it("should do nothing if there is no head undo commit", () => {
	// 		const manager = undoRedoManagerFactory({});
	// 		manager.undo();

	// 		expect(manager.getHeadUndoCommit()).toBeUndefined();
	// 		expect(applyChange).not.toHaveBeenCalled();
	// 	});
	// });

	// describe("clone", () => {
	// 	it("should return a new instance of UndoRedoManager with the same head undo commit and the provided applyChange callback", () => {
	// 		const manager = undoRedoManagerFactory({});
	// 		const applyChange2 = jest.fn();
	// 		const headUndoCommit = { commit: { revision: 0, change: "head" } };
	// 		manager.getHeadUndoCommit() = headUndoCommit;
	// 		const clonedUndoRedoManager = manager.clone(applyChange2);

	// 		expect(clonedUndoRedoManager).toBeInstanceOf(UndoRedoManager);
	// 		expect(clonedUndoRedoManager.getHeadUndoCommit()).toBe(headUndoCommit);
	// 	});
	// });
});

class TestUndoRedoManager extends UndoRedoManager<TestChange, ChangeFamilyEditor> {
	public getHeadUndoCommit(): UndoableCommit<TestChange> {
		return this.getHeadUndoCommit();
	}
}

class MockRepairDataStore implements RepairDataStore {
	public capturedData: ITreeCursorSynchronous | Value[][] = [];

	public capture(change: Delta.Root, revision: unknown): void {
		throw new Error("Method not implemented.");
	}

	public getNodes(
		revision: unknown,
		path: UpPath | undefined,
		key: FieldKey,
		index: number,
		count: number,
	): ITreeCursorSynchronous[] {
		throw new Error("Method not implemented.");
	}

	public getValue(revision: unknown, path: UpPath): Value {
		throw new Error("Method not implemented.");
	}
}

function undoRedoManagerFactory(options: {
	rebaser?: ChangeRebaser<TestChange>;
	headUndoCommit?: UndoableCommit<TestChange>;
}): TestUndoRedoManager {
	const family = testChangeFamilyFactory(options.rebaser);
	const manager = new TestUndoRedoManager(
		() => new MockRepairDataStore(),
		family,
		() => {},
		options.headUndoCommit,
	);
	return manager;
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
