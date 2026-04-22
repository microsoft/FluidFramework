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

import { UndoRedoManager } from "../undoRedo.js";

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

describe("UndoRedoManager", () => {
	describe("global undo/redo (no label)", () => {
		it("undo reverts the most recent change", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert.equal(view.root.value, 1);

			manager.undo();
			assert.equal(view.root.value, 0);
			manager.dispose();
		});

		it("redo re-applies an undone change", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			manager.undo();
			manager.redo();
			assert.equal(view.root.value, 1);
			manager.dispose();
		});

		it("canUndo/canRedo reflect stack state", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			assert.equal(manager.canUndo(), false);
			assert.equal(manager.canRedo(), false);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert.equal(manager.canUndo(), true);
			assert.equal(manager.canRedo(), false);

			manager.undo();
			assert.equal(manager.canUndo(), false);
			assert.equal(manager.canRedo(), true);
			manager.dispose();
		});

		it("new commit after undo clears redo stack", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			manager.undo();
			assert.equal(manager.canRedo(), true);

			view.runTransaction(() => {
				view.root.value = 2;
			});
			assert.equal(manager.canRedo(), false);
			manager.dispose();
		});

		it("undo and redo are silent no-ops when stack is empty", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			// Should not throw
			manager.undo();
			manager.redo();
			assert.equal(view.root.value, 0);
			manager.dispose();
		});

		it("multiple undo/redo preserves stack order", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			view.runTransaction(() => {
				view.root.value = 2;
			});

			manager.undo();
			assert.equal(view.root.value, 1);
			manager.undo();
			assert.equal(view.root.value, 0);

			manager.redo();
			assert.equal(view.root.value, 1);
			manager.redo();
			assert.equal(view.root.value, 2);
			manager.dispose();
		});
	});

	describe("labeled undo/redo", () => {
		const labelA = Symbol("label-a");
		const labelB = Symbol("label-b");

		it("canUndo(label) returns false when stack has no matching commit", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelB },
			);

			assert.equal(manager.canUndo(labelA), false);
			assert.equal(manager.canUndo(labelB), true);
			manager.dispose();
		});

		it("undo(label) undoes the most recent matching commit and leaves others in the stack", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelA },
			);
			view.runTransaction(
				() => {
					view.root.value = 2;
				},
				{ label: labelB },
			);

			// labelB is on top; undo(labelA) should skip labelB and undo labelA
			manager.undo(labelA);

			// labelB was skipped — it remains undoable
			assert.equal(manager.canUndo(labelB), true);
			// labelA moved to redo stack
			assert.equal(manager.canRedo(labelA), true);
			// labelB has nothing to redo
			assert.equal(manager.canRedo(labelB), false);

			manager.dispose();
		});

		it("undo(label) is a silent no-op when no matching commit exists", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelB },
			);

			// Should not throw, should not change value
			manager.undo(labelA);
			assert.equal(view.root.value, 1);
			manager.dispose();
		});

		it("labeled commit invalidates only redo entries with the same label", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelA },
			);
			view.runTransaction(
				() => {
					view.root.value = 2;
				},
				{ label: labelB },
			);

			manager.undo(labelA);
			manager.undo(labelB);
			assert.equal(manager.canRedo(labelA), true);
			assert.equal(manager.canRedo(labelB), true);

			// New labelA commit should clear only labelA redo entries
			view.runTransaction(
				() => {
					view.root.value = 3;
				},
				{ label: labelA },
			);
			assert.equal(manager.canRedo(labelA), false);
			assert.equal(manager.canRedo(labelB), true);
			manager.dispose();
		});

		it("anonymous commit clears only anonymous redo entries, preserving labeled redo entries", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelA },
			);
			view.runTransaction(() => {
				view.root.value = 2;
			});

			manager.undo(); // Global undo: pops anonymous commit → redo stack has {anonymous}
			manager.undo(labelA); // Labeled undo: pops labelA commit → redo stack has {anonymous, labelA}
			assert.equal(manager.canRedo(), true);
			assert.equal(manager.canRedo(labelA), true);

			// New anonymous commit — should clear only the anonymous redo entry
			view.runTransaction(() => {
				view.root.value = 3;
			});
			// labelA redo is preserved; global canRedo() is still true because labelA is there
			assert.equal(manager.canRedo(labelA), true);
			assert.equal(manager.canRedo(), true);

			// Consuming the labelA redo entry leaves nothing
			manager.redo(labelA);
			assert.equal(manager.canRedo(labelA), false);
			assert.equal(manager.canRedo(), false); // anonymous redo was already cleared

			manager.dispose();
		});

		it("two labels do not interfere with each other's undo stacks", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(
				() => {
					view.root.value = 10;
				},
				{ label: labelA },
			);
			view.runTransaction(
				() => {
					view.root.value = 20;
				},
				{ label: labelB },
			);

			assert.equal(manager.canUndo(labelA), true);
			assert.equal(manager.canUndo(labelB), true);

			manager.undo(labelA);
			assert.equal(manager.canRedo(labelA), true);
			assert.equal(manager.canRedo(labelB), false);
			manager.dispose();
		});
	});

	describe("onStateChange", () => {
		it("commit, undo, and redo notify listeners", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);
			let notifyCount = 0;
			manager.onStateChange(() => {
				notifyCount++;
			});

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert.equal(notifyCount, 1);

			manager.undo();
			assert.equal(notifyCount, 2);

			manager.redo();
			assert.equal(notifyCount, 3);
			manager.dispose();
		});

		it("onStateChange returns an unsubscribe function", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);
			let notifyCount = 0;
			const unsubscribe = manager.onStateChange(() => {
				notifyCount++;
			});

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert.equal(notifyCount, 1);

			unsubscribe();
			view.runTransaction(() => {
				view.root.value = 2;
			});
			assert.equal(notifyCount, 1);
			manager.dispose();
		});
	});

	describe("dispose", () => {
		it("dispose clears both stacks and unsubscribes", () => {
			const view = createTree();
			const manager = new UndoRedoManager(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert.equal(manager.canUndo(), true);

			manager.dispose();
			assert.equal(manager.canUndo(), false);
			assert.equal(manager.canRedo(), false);

			// New commits after dispose should not be tracked
			view.runTransaction(() => {
				view.root.value = 2;
			});
			assert.equal(manager.canUndo(), false);
		});
	});
});
