/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import {
	independentView,
	type TreeBranchAlpha,
	type TreeViewAlpha,
	SchemaFactory,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";

import { createUndoRedo } from "../undoRedo.js";

// #region Shared test schema and tree factory

const sf = new SchemaFactory("undo-redo-test");
class TestRoot extends sf.object("TestRoot", { value: sf.number }) {}
const config = new TreeViewConfiguration({ schema: TestRoot });

function createTree(): TreeViewAlpha<typeof TestRoot> {
	const view = independentView(config);
	view.initialize({ value: 0 });
	return view;
}

// #endregion Shared test schema and tree factory

describe("createUndoRedo", () => {
	describe("global undo/redo (no label)", () => {
		it("undo reverts the most recent change", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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
			const manager = createUndoRedo(view);

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
			const manager = createUndoRedo(view);

			assert(!manager.canUndo());
			assert(!manager.canRedo());

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert(manager.canUndo());
			assert(!manager.canRedo());

			manager.undo();
			assert(!manager.canUndo());
			assert(manager.canRedo());
			manager.dispose();
		});

		it("new commit after undo clears redo stack", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			manager.undo();
			assert(manager.canRedo());

			view.runTransaction(() => {
				view.root.value = 2;
			});
			assert(!manager.canRedo());
			manager.dispose();
		});

		it("undo and redo are silent no-ops when stack is empty", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			// Should not throw
			manager.undo();
			manager.redo();
			assert.equal(view.root.value, 0);
			manager.dispose();
		});

		it("multiple undo/redo preserves stack order", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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
		const labelA = "label-a";
		const labelB = "label-b";

		it("canUndo(label) returns false when stack has no matching commit", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			view.runTransaction(
				() => {
					view.root.value = 1;
				},
				{ label: labelB },
			);

			assert(!manager.canUndo(labelA));
			assert(manager.canUndo(labelB));
			manager.dispose();
		});

		it("undo(label) undoes the most recent matching commit and leaves others in the stack", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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
			assert(manager.canUndo(labelB));
			// labelA moved to redo stack
			assert(manager.canRedo(labelA));
			// labelB has nothing to redo
			assert(!manager.canRedo(labelB));

			manager.dispose();
		});

		it("undo(label) is a silent no-op when no matching commit exists", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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
			const manager = createUndoRedo(view);

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
			assert(manager.canRedo(labelA));
			assert(manager.canRedo(labelB));

			// New labelA commit should clear only labelA redo entries
			view.runTransaction(
				() => {
					view.root.value = 3;
				},
				{ label: labelA },
			);
			assert(!manager.canRedo(labelA));
			assert(manager.canRedo(labelB));
			manager.dispose();
		});

		it("anonymous commit clears only anonymous redo entries, preserving labeled redo entries", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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
			assert(manager.canRedo());
			assert(manager.canRedo(labelA));

			// New anonymous commit — should clear only the anonymous redo entry
			view.runTransaction(() => {
				view.root.value = 3;
			});
			// labelA redo is preserved; global canRedo() is still true because labelA is there
			assert(manager.canRedo(labelA));
			assert(manager.canRedo());

			// Consuming the labelA redo entry leaves nothing
			manager.redo(labelA);
			assert(!manager.canRedo(labelA));
			assert(!manager.canRedo()); // anonymous redo was already cleared

			manager.dispose();
		});

		it("two labels do not interfere with each other's undo stacks", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

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

			assert(manager.canUndo(labelA));
			assert(manager.canUndo(labelB));

			manager.undo(labelA);
			assert(manager.canRedo(labelA));
			assert(!manager.canRedo(labelB));
			manager.dispose();
		});
	});

	describe("error handling — revert() throws", () => {
		// Minimal branch mock that lets the test fire controlled changed events with
		// revertibles whose revert() behavior we control.
		function createMockBranch(): {
			branch: TreeBranchAlpha;
			fireChanged: (
				isLocal: boolean,
				getRevertible: (() => { revert(): void; dispose(): void }) | undefined,
			) => void;
		} {
			type Handler = (
				data: { isLocal: boolean; labels: unknown[] },
				getRevertible: (() => { revert(): void; dispose(): void }) | undefined,
			) => void;
			const handlers: Handler[] = [];
			const branch = {
				events: {
					on(_event: string, handler: Handler) {
						handlers.push(handler);
						return () => {
							const i = handlers.indexOf(handler);
							if (i >= 0) handlers.splice(i, 1);
						};
					},
				},
			} as unknown as TreeBranchAlpha;
			return {
				branch,
				fireChanged: (isLocal, getRevertible) => {
					for (const h of handlers) h({ isLocal, labels: [] }, getRevertible);
				},
			};
		}

		it("discards the undo entry when revert() throws", () => {
			const { branch, fireChanged } = createMockBranch();
			const manager = createUndoRedo(branch);

			fireChanged(true, () => ({
				revert() {
					throw new Error("revert failed");
				},
				dispose() {},
			}));
			assert(manager.canUndo());

			assert.throws(() => manager.undo());
			assert(!manager.canUndo(), "entry is discarded after failed revert");
			manager.dispose();
		});

		it("discards the redo entry when revert() throws during redo", () => {
			const { branch, fireChanged } = createMockBranch();
			const manager = createUndoRedo(branch);

			const redoRevertible = {
				revert() {
					throw new Error("revert failed");
				},
				dispose() {},
			};

			// The undo revertible fires a changed event during its revert (as real SharedTree does),
			// routing redoRevertible onto the redo stack.
			fireChanged(true, () => ({
				revert() {
					fireChanged(true, () => redoRevertible);
				},
				dispose() {},
			}));

			manager.undo();
			assert(manager.canRedo());

			assert.throws(() => manager.redo());
			assert(!manager.canRedo(), "entry is discarded after failed revert");
			manager.dispose();
		});

		it("clears pendingOperation after undo revert() throws so new commits land on undo stack (C1)", () => {
			const { branch, fireChanged } = createMockBranch();
			const manager = createUndoRedo(branch);

			fireChanged(true, () => ({
				revert() {
					throw new Error("revert failed");
				},
				dispose() {},
			}));
			assert.throws(() => manager.undo());

			// A new user commit arriving after the failed undo must go to the undo stack,
			// not the redo stack (which is what happens when #pendingOperation is stuck).
			fireChanged(true, () => ({ revert() {}, dispose() {} }));
			assert(!manager.canRedo(), "redo stack should be empty — pendingOperation was cleared");
			assert(manager.canUndo(), "new commit should be on the undo stack");
			manager.dispose();
		});

		it("clears pendingOperation after redo revert() throws so new commits land on undo stack (C1)", () => {
			const { branch, fireChanged } = createMockBranch();
			const manager = createUndoRedo(branch);

			let shouldThrow = false;
			const redoRevertible = {
				revert() {
					if (shouldThrow) throw new Error("revert failed");
				},
				dispose() {},
			};

			// The undo revertible fires a changed event during its revert (as real SharedTree does),
			// routing redoRevertible onto the redo stack.
			fireChanged(true, () => ({
				revert() {
					fireChanged(true, () => redoRevertible);
				},
				dispose() {},
			}));

			manager.undo();
			assert(manager.canRedo());

			shouldThrow = true;
			assert.throws(() => manager.redo());

			// New user commit must land on the undo stack, not the redo stack.
			fireChanged(true, () => ({ revert() {}, dispose() {} }));
			assert(!manager.canRedo(), "pendingOperation was cleared after redo failure");
			manager.dispose();
		});
	});

	describe("single-instance enforcement", () => {
		it("throws when a second manager is created for the same branch", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			assert.throws(() => createUndoRedo(view), validateUsageError(/already attached/));

			manager.dispose();
		});

		it("allows a new manager after the previous one is disposed", () => {
			const view = createTree();
			const manager = createUndoRedo(view);
			manager.dispose();

			// Should not throw
			const manager2 = createUndoRedo(view);
			manager2.dispose();
		});

		it("does not prevent managers on independent branches", () => {
			const view1 = createTree();
			const view2 = createTree();
			const manager1 = createUndoRedo(view1);
			const manager2 = createUndoRedo(view2);

			manager1.dispose();
			manager2.dispose();
		});
	});

	describe("dispose", () => {
		it("dispose clears both stacks and unsubscribes", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			assert(manager.canUndo());

			manager.dispose();
			assert(!manager.canRedo());

			// New commits after dispose should not be tracked
			view.runTransaction(() => {
				view.root.value = 2;
			});
			assert(!manager.canUndo());
		});

		it("successive calls to dispose do not throw", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});

			manager.dispose();
			// Should not throw
			manager.dispose();
		});

		it("undo and redo are no-ops after dispose", () => {
			const view = createTree();
			const manager = createUndoRedo(view);

			view.runTransaction(() => {
				view.root.value = 1;
			});
			manager.dispose();

			// Should not throw
			manager.undo();
			manager.redo();
			assert.equal(view.root.value, 1);
		});
	});
});
