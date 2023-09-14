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

const rootField = {
	parent: undefined,
	field: rootFieldKey,
};

const testCases: {
	name: string;
	edit: (undoRedoBranch: ISharedTreeView, otherBranch: ISharedTreeView) => void;
	undoCount?: number;
	initialState: JsonCompatible[];
	editedState: JsonCompatible[];
	parentUndoState?: JsonCompatible[];
	forkUndoState?: JsonCompatible[];
	skip?: true;
}[] = [
	{
		name: "inserts",
		edit: (actedOn) => {
			insert(actedOn, 0, "x");
			insert(actedOn, 2, "y");
		},
		undoCount: 2,
		initialState: ["A"],
		editedState: ["x", "A", "y"],
	},
	{
		name: "rebased inserts",
		edit: (actedOn, other) => {
			insert(other, 1, "y");
			insert(actedOn, 0, "x");
			insert(actedOn, 3, "z");
		},
		undoCount: 2,
		initialState: ["A", "B"],
		editedState: ["x", "A", "y", "B", "z"],
		forkUndoState: ["A", "y", "B"],
		parentUndoState: ["x", "A", "B"],
	},
	{
		name: "the delete of a node",
		edit: (actedOn) => {
			remove(actedOn, 0, 2);
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["C", "D"],
	},
	{
		skip: true, // Blocked on #5263
		name: "nested deletes",
		edit: (actedOn) => {
			const listNode: UpPath = {
				parent: rootPath,
				parentField: brand("foo"),
				parentIndex: 0,
			};

			actedOn.transaction.start();
			const listField = actedOn.editor.sequenceField({
				parent: listNode,
				field: brand(""),
			});
			listField.delete(0, 1);
			remove(actedOn, 0, 1);
			actedOn.transaction.commit();
		},
		initialState: [{ foo: ["A"] }],
		editedState: [],
	},
	{
		skip: true, // Blocked on #5263
		name: "move out under delete",
		edit: (actedOn) => {
			const listNode: UpPath = {
				parent: rootPath,
				parentField: brand("foo"),
				parentIndex: 0,
			};

			actedOn.transaction.start();
			actedOn.editor.move({ parent: listNode, field: brand("") }, 0, 1, rootField, 1);
			remove(actedOn, 0, 1);
			actedOn.transaction.commit();
		},
		initialState: [{ foo: ["A"] }],
		editedState: ["A"],
	},
	{
		name: "the move of a node",
		edit: (actedOn) => {
			const field = actedOn.editor.sequenceField(rootField);
			field.move(0, 2, 2);
		},
		initialState: ["A", "B", "C", "D"],
		editedState: ["C", "D", "A", "B"],
	},
	{
		name: "a move that has been rebased",
		edit: (actedOn, other) => {
			insert(other, 1, "x");
			const field = actedOn.editor.sequenceField({
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
		name: "a delete of content that is concurrently edited",
		edit: (actedOn, other) => {
			other.editor
				.valueField({ parent: rootPath, field: brand("child") })
				.set(singleTextCursor({ type: jsonString.name, value: "y" }));
			actedOn.editor.sequenceField(rootField).delete(0, 1);
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
		skip,
		edit,
		undoCount,
		initialState,
		editedState,
		parentUndoState,
		forkUndoState,
	} of testCases) {
		const count = undoCount ?? 1;
		const itFn = skip ? it.skip : it;
		itFn(`${name} (act on fork undo on fork)`, () => {
			const view = makeTreeFromJson(initialState);
			const fork = view.fork();

			edit(fork, view);

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);

			for (let i = 0; i < count; i++) {
				fork.undo();
			}

			fork.rebaseOnto(view);
			expectJsonTree(fork, forkUndoState ?? initialState);

			for (let i = 0; i < count; i++) {
				fork.redo();
			}

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);
		});

		itFn(`${name} (act on view undo on fork)`, () => {
			const view = makeTreeFromJson(initialState);
			const fork = view.fork();

			edit(view, fork);

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);

			for (let i = 0; i < count; i++) {
				fork.undo();
			}

			fork.rebaseOnto(view);
			expectJsonTree(fork, parentUndoState ?? initialState);

			for (let i = 0; i < count; i++) {
				fork.redo();
			}

			fork.rebaseOnto(view);
			expectJsonTree(fork, editedState);
		});

		itFn(`${name} (act on view undo on view)`, () => {
			const view = makeTreeFromJson(initialState);
			const fork = view.fork();

			edit(view, fork);

			view.merge(fork, false);
			expectJsonTree(view, editedState);

			for (let i = 0; i < count; i++) {
				view.undo();
			}

			view.merge(fork, false);
			expectJsonTree(view, parentUndoState ?? initialState);

			for (let i = 0; i < count; i++) {
				view.redo();
			}
			view.merge(fork);
			expectJsonTree(view, editedState);
		});

		itFn(`${name} (act on fork undo on view)`, () => {
			const view = makeTreeFromJson(initialState);
			const fork = view.fork();

			edit(fork, view);

			view.merge(fork, false);
			expectJsonTree(view, editedState);

			for (let i = 0; i < count; i++) {
				view.undo();
			}

			view.merge(fork, false);
			expectJsonTree(view, forkUndoState ?? initialState);

			for (let i = 0; i < count; i++) {
				view.redo();
			}
			view.merge(fork);
			expectJsonTree(view, editedState);
		});
	}

	it("can undo before and after rebasing a branch", () => {
		const tree1 = makeTreeFromJson([0, 0, 0]);
		const tree2 = tree1.fork();

		tree1.editor.sequenceField(rootField).insert(3, singleJsonCursor(1));
		tree2.editor.sequenceField(rootField).insert(0, singleJsonCursor(2));
		tree2.editor.sequenceField(rootField).insert(0, singleJsonCursor(3));
		tree2.undo();
		expectJsonTree(tree2, [2, 0, 0, 0]);
		tree2.rebaseOnto(tree1);
		expectJsonTree(tree2, [2, 0, 0, 0, 1]);
		tree2.undo();
		expectJsonTree(tree2, [0, 0, 0, 1]);
	});

	it("can undo after forking a branch", () => {
		const tree1 = makeTreeFromJson(["A", "B", "C"]);

		tree1.editor.sequenceField(rootField).delete(0, 1);
		tree1.editor.sequenceField(rootField).delete(1, 1);

		const tree2 = tree1.fork();
		expectJsonTree(tree2, ["B"]);
		tree2.undo();
		expectJsonTree(tree2, ["B", "C"]);
		tree2.undo();
		expectJsonTree(tree2, ["A", "B", "C"]);
	});

	it("can redo after forking a branch", () => {
		const tree1 = makeTreeFromJson(["B"]);

		tree1.editor.sequenceField(rootField).insert(0, singleJsonCursor("A"));
		tree1.editor.sequenceField(rootField).insert(2, singleJsonCursor("C"));
		tree1.undo();
		tree1.undo();

		const tree2 = tree1.fork();
		expectJsonTree(tree2, ["B"]);
		tree2.redo();
		expectJsonTree(tree2, ["A", "B"]);
		tree2.redo();
		expectJsonTree(tree2, ["A", "B", "C"]);
	});

	it("can undo/redo a transaction", () => {
		const tree = makeTreeFromJson(["A", "B"]);

		tree.transaction.start();
		tree.editor.sequenceField(rootField).insert(2, singleJsonCursor("C"));
		tree.editor.sequenceField(rootField).delete(0, 1);
		tree.transaction.commit();

		expectJsonTree(tree, ["B", "C"]);
		tree.undo();
		expectJsonTree(tree, ["A", "B"]);
		tree.redo();
		expectJsonTree(tree, ["B", "C"]);
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
	const field = tree.editor.sequenceField(rootField);
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

function remove(tree: ISharedTreeView, index: number, count: number): void {
	const field = tree.editor.sequenceField(rootField);
	field.delete(index, count);
}
