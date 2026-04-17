/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	independentView,
	type TreeViewAlpha,
	SchemaFactory,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";

import { LabeledUndoRedoStacks, UndoRedoStacks } from "../undoRedo.js";

// ---------------------------------------------------------------------------
// Shared test schema and tree factory
// ---------------------------------------------------------------------------

const sf = new SchemaFactory("undo-redo-test");
class TestRoot extends sf.object("TestRoot", { value: sf.number }) {}
const config = new TreeViewConfiguration({ schema: TestRoot });

function createTree(): TreeViewAlpha<typeof TestRoot> {
	const view = independentView(config);
	view.initialize({ value: 0 });
	return view;
}

// ---------------------------------------------------------------------------

describe("UndoRedoStacks", () => {
	it("undo reverts the most recent change", () => {
		const view = createTree();
		const stacks = new UndoRedoStacks(view.events);

		view.runTransaction(() => {
			view.root.value = 1;
		});
		assert.equal(view.root.value, 1);

		stacks.undo();
		assert.equal(view.root.value, 0);
		stacks.dispose();
	});

	it("redo re-applies an undone change", () => {
		const view = createTree();
		const stacks = new UndoRedoStacks(view.events);

		view.runTransaction(() => {
			view.root.value = 1;
		});
		stacks.undo();
		stacks.redo();
		assert.equal(view.root.value, 1);
		stacks.dispose();
	});

	it("commit, undo, and redo notify listeners", () => {
		const view = createTree();
		const stacks = new UndoRedoStacks(view.events);
		let notifyCount = 0;
		stacks.onStateChange(() => {
			notifyCount++;
		});

		view.runTransaction(() => {
			view.root.value = 1;
		});
		assert.equal(notifyCount, 1);

		// undo() notifies via commitApplied handler + directly from undo()
		stacks.undo();
		assert.equal(notifyCount, 3);

		// redo() similarly notifies twice
		stacks.redo();
		assert.equal(notifyCount, 5);
		stacks.dispose();
	});

	it("canUndo/canRedo reflect stack state", () => {
		const view = createTree();
		const stacks = new UndoRedoStacks(view.events);

		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), false);

		view.runTransaction(() => {
			view.root.value = 1;
		});
		assert.equal(stacks.canUndo(), true);
		assert.equal(stacks.canRedo(), false);

		stacks.undo();
		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), true);
		stacks.dispose();
	});
});

describe("LabeledUndoRedoStacks", () => {
	const label = Symbol("test-label");
	const otherLabel = Symbol("other-label");

	it("ignores commits with no label", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(() => {
			view.root.value = 1;
		});
		assert.equal(stacks.canUndo(), false);
		stacks.dispose();
	});

	it("ignores commits tagged with a different label", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label: otherLabel },
		);
		assert.equal(stacks.canUndo(), false);
		stacks.dispose();
	});

	it("tracks commits tagged with the matching label", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		assert.equal(stacks.canUndo(), true);
		assert.equal(stacks.canRedo(), false);
		stacks.dispose();
	});

	it("undo reverts the change and makes it available to redo", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		stacks.undo();
		assert.equal(view.root.value, 0);
		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), true);
		stacks.dispose();
	});

	it("redo re-applies an undone change", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		stacks.undo();
		stacks.redo();
		assert.equal(view.root.value, 1);
		assert.equal(stacks.canUndo(), true);
		assert.equal(stacks.canRedo(), false);
		stacks.dispose();
	});

	it("multiple undo/redo preserves stack order", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		view.runTransaction(
			() => {
				view.root.value = 2;
			},
			{ label },
		);

		stacks.undo();
		assert.equal(view.root.value, 1);
		stacks.undo();
		assert.equal(view.root.value, 0);
		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), true);

		stacks.redo();
		assert.equal(view.root.value, 1);
		stacks.redo();
		assert.equal(view.root.value, 2);
		assert.equal(stacks.canRedo(), false);
		stacks.dispose();
	});

	it("new labeled edit after undo clears the redo stack", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		stacks.undo();
		assert.equal(stacks.canRedo(), true);

		view.runTransaction(
			() => {
				view.root.value = 2;
			},
			{ label },
		);
		assert.equal(stacks.canRedo(), false);
		stacks.dispose();
	});

	it("two stacks with different labels do not interfere", () => {
		const view = createTree();
		const stackA = new LabeledUndoRedoStacks(view, label);
		const stackB = new LabeledUndoRedoStacks(view, otherLabel);

		view.runTransaction(
			() => {
				view.root.value = 10;
			},
			{ label },
		);
		view.runTransaction(
			() => {
				view.root.value = 20;
			},
			{ label: otherLabel },
		);

		assert.equal(stackA.canUndo(), true);
		assert.equal(stackB.canUndo(), true);

		stackA.undo();
		assert.equal(stackA.canRedo(), true);
		assert.equal(stackB.canRedo(), false);

		stackA.dispose();
		stackB.dispose();
	});

	it("commit, undo, and redo notify listeners", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);
		let notifyCount = 0;
		stacks.onStateChange(() => {
			notifyCount++;
		});

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		assert.equal(notifyCount, 1);

		// Unlabeled commit should not notify
		view.runTransaction(() => {
			view.root.value = 2;
		});
		assert.equal(notifyCount, 1);

		stacks.undo(); // notifies once from undo(), once from the undo commit arriving
		assert.equal(notifyCount, 3);

		stacks.redo(); // notifies once from redo(), once from the redo commit arriving
		assert.equal(notifyCount, 5);
		stacks.dispose();
	});

	it("onStateChange returns an unsubscribe function", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);
		let notifyCount = 0;
		const unsubscribe = stacks.onStateChange(() => {
			notifyCount++;
		});

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		assert.equal(notifyCount, 1);

		unsubscribe();
		view.runTransaction(
			() => {
				view.root.value = 2;
			},
			{ label },
		);
		assert.equal(notifyCount, 1);
		stacks.dispose();
	});

	it("throws when undo stack is empty", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);
		assert.throws(() => stacks.undo(), /undo stack is empty/);
		stacks.dispose();
	});

	it("throws when redo stack is empty", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);
		assert.throws(() => stacks.redo(), /redo stack is empty/);
		stacks.dispose();
	});

	it("dispose clears both stacks", () => {
		const view = createTree();
		const stacks = new LabeledUndoRedoStacks(view, label);

		view.runTransaction(
			() => {
				view.root.value = 1;
			},
			{ label },
		);
		stacks.dispose();

		assert.equal(stacks.canUndo(), false);
		assert.equal(stacks.canRedo(), false);
	});
});
