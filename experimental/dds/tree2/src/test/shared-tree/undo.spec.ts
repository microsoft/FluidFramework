/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { singleTextCursor } from "../../feature-libraries";
import { jsonString, singleJsonCursor } from "../../domains";
import { rootFieldKey, UpPath } from "../../core";
import { ISharedTreeView } from "../../shared-tree";
import { brand, JsonCompatible } from "../../util";
import { expectJsonTree, makeTreeFromJson } from "../utils";

const rootPath: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

const testCases: {
	name: string;
	edit: (undoRedoBranch: ISharedTreeView, otherBranch: ISharedTreeView) => void;
	initialState: JsonCompatible[];
	editedState: JsonCompatible[];
	parentUndoState?: JsonCompatible[];
	forkUndoState?: JsonCompatible[];
}[] = [
	{
		name: "the insert of a node",
		edit: (undoRedoBranch) => {
			insert(undoRedoBranch, 1, "x");
		},
		initialState: ["A"],
		editedState: ["A", "x"],
	},
	{
		name: "the delete of a node",
		edit: (undoRedoBranch) => {
			remove(undoRedoBranch, 0, 2);
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["C", "D"],
	},
	{
		name: "the move of a node",
		edit: (undoRedoBranch) => {
			const field = undoRedoBranch.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			field.move(0, 2, 2);
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["C", "D", "A", "B"],
	},
	{
		name: "a move that has been rebased",
		edit: (undoRedoBranch, otherBranch) => {
			insert(otherBranch, 1, "x");
			const field = undoRedoBranch.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			field.move(1, 1, 3);
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["A", "x", "C", "D", "B"],
		forkUndoState: ["A", "x", "B", "C", "D"],
		parentUndoState: ["A", "C", "D", "B"],
	},
	{
		name: "an insert from a fork on its parent",
		edit: (undoRedoBranch, otherBranch) => {
			insert(undoRedoBranch, 1, "x");
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["A", "x", "B", "C", "D"],
	},
	{
		name: "a delete of content that is concurrently edited",
		edit: (undoRedoBranch, otherBranch) => {
			otherBranch.editor
				.valueField({ parent: rootPath, field: brand("child") })
				.set(singleTextCursor({ type: jsonString.name, value: "y" }));
			undoRedoBranch.editor
				.sequenceField({ parent: undefined, field: rootFieldKey })
				.delete(0, 1);
		},
		initialState: [{ child: "x" }],
		editedState: [],
		// Undoing the insertion of A on the parent branch is a no-op because the node was deleted
		parentUndoState: [],
		forkUndoState: [{ child: "y" }],
	},
];

describe("Undo and redo", () => {
	for (const {
		name,
		edit,
		initialState,
		editedState,
		parentUndoState,
		forkUndoState,
	} of testCases) {
		itView(`${name} from a fork`, initialState, (view) => {
			const fork = view.fork();

			// Perform the edits where the last edit is the one to undo
			edit(fork, view);

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);

			fork.undo();

			fork.rebaseOnto(view);
			expectJsonTree(fork, forkUndoState ?? initialState);

			fork.redo();

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);
		});

		itView(`${name} from the parent branch`, initialState, (view) => {
			const fork = view.fork();

			// Perform the edits where the last edit is the one to undo
			edit(view, fork);

			view.merge(fork, false);
			expectJsonTree(view, editedState);

			view.undo();

			view.merge(fork, false);
			expectJsonTree(view, parentUndoState ?? initialState);

			view.redo();

			view.merge(fork);
			expectJsonTree(view, editedState);
		});
	}

	it("can undo before and after rebasing a branch", () => {
		const tree1 = makeTreeFromJson([0, 0, 0]);
		const tree2 = tree1.fork();

		tree1.editor
			.sequenceField({ parent: undefined, field: rootFieldKey })
			.insert(3, singleJsonCursor(1));
		tree2.editor
			.sequenceField({ parent: undefined, field: rootFieldKey })
			.insert(0, singleJsonCursor(2));
		tree2.editor
			.sequenceField({ parent: undefined, field: rootFieldKey })
			.insert(0, singleJsonCursor(3));
		tree2.undo();
		expectJsonTree(tree2, [2, 0, 0, 0]);
		tree2.rebaseOnto(tree1);
		expectJsonTree(tree2, [2, 0, 0, 0, 1]);
		tree2.undo();
		expectJsonTree(tree2, [0, 0, 0, 1]);
	});

	// TODO move these tests to `testCases` as the bugs are resolved
	describe.skip("tests that are being skipped due to bugs", () => {
		// TODO: See bug 4104
		itView("the move of a node on a fork", ["A", "B", "C", "D"], (view) => {
			const fork2 = view.fork();

			const field = fork2.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			field.move(0, 2, 2);

			expectJsonTree(fork2, ["C", "D", "A", "B"]);

			view.merge(fork2);

			expectJsonTree(view, ["C", "D", "A", "B"]);

			fork2.undo();
			view.merge(fork2);

			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip when undo can handle rebasing
		itView("the insert of two separate nodes", ["A", "B", "C", "D"], (view) => {
			const addX = view.fork();
			const addY = view.fork();

			insert(addX, 1, "x");
			insert(addY, 3, "y");

			view.merge(addX);
			view.merge(addY);

			expectJsonTree(view, ["A", "x", "B", "C", "y", "D"]);

			addX.undo();
			addY.undo();
			view.merge(addX);
			view.merge(addY);

			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip when undo can handle rebasing
		itView("an insert from a parent branch on its fork", ["A", "B", "C", "D"], (view) => {
			const fork = view.fork();

			insert(view, 1, "x");
			expectJsonTree(view, ["A", "x", "B", "C", "D"]);

			fork.rebaseOnto(view);
			expectJsonTree(fork, ["A", "x", "B", "C", "D"]);

			fork.undo();
			expectJsonTree(fork, ["A", "B", "C", "D"]);

			view.merge(fork);
			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip this test once the bug that causes rebasing the undo commit to be empty is fixed.
		itView(
			"an insert that needs to be rebased over an insert on the base branch",
			["A", "B", "C", "D"],
			(view) => {
				const fork = view.fork();

				insert(view, 1, "x");
				insert(fork, 3, "y");
				view.merge(fork);

				fork.undo();
				view.merge(fork);

				expectJsonTree(view, ["A", "x", "B", "C", "D"]);
			},
		);
	});
});

// TODO: Dedupe with the helpers in editing.spec.ts

/**
 * Helper function to insert node at a given index.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: ISharedTreeView, index: number, ...values: string[]): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

function remove(tree: ISharedTreeView, index: number, count: number): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.delete(index, count);
}

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 */
function itView(
	title: string,
	initialData: JsonCompatible[],
	fn: (view: ISharedTreeView) => void,
): void {
	it(`${title} (root view)`, () => {
		const view = makeTreeFromJson(initialData);
		fn(view);
	});

	it(`${title} (forked view)`, () => {
		const view = makeTreeFromJson(initialData);
		fn(view.fork());
	});
}
