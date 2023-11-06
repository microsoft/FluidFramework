/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import { runSynchronous } from "../../shared-tree";
import { leaf, SchemaBuilder } from "../../domains";
import {
	createTestUndoRedoStacks,
	jsonSequenceRootSchema,
	toJsonableTree,
	view2WithContent,
	viewWithContent,
} from "../utils";

describe("sharedTreeView", () => {
	it("reads only one node", () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const view = viewWithContent({ schema: jsonSequenceRootSchema, initialTree: [] });
		runSynchronous(view, (t) => {
			t.context.root.insertNodes(0, [5]);
		});

		assert.deepEqual(toJsonableTree(view), [{ type: leaf.number.name, value: 5 }]);
	});

	describe("Events", () => {
		const builder = new SchemaBuilder({ scope: "Events test schema" });
		const rootTreeNodeSchema = builder.object("root", {
			x: builder.number,
		});
		const schema = builder.intoSchema(builder.optional(rootTreeNodeSchema));

		it("triggers events for local and subtree changes", () => {
			const view = view2WithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const root = view.editableTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.on("changing", () => log.push("change"));
			const unsubscribeSubtree = root.on("subtreeChanging", () => {
				log.push("subtree");
			});
			const unsubscribeAfter = view.branch.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree",
				"subtree",
				"change",
				"after",
				"editStart",
				"subtree",
				"subtree",
				"change",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		it("propagates path args for local and subtree changes", () => {
			const view = view2WithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const root = view.editableTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.on("changing", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = root.on("subtreeChanging", (upPath) => {
				log.push(`subtree-${String(upPath.parentField)}-${upPath.parentIndex}`);
			});
			const unsubscribeAfter = view.branch.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"editStart",
				"subtree-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		// TODO: unskip once forking revertibles is supported
		it.skip("triggers a revertible event for a changes merged into the local branch", () => {
			const tree1 = viewWithContent({
				schema: jsonSequenceRootSchema,
				initialTree: [],
			});
			const branch = tree1.fork();

			const { undoStack: undoStack1, unsubscribe: unsubscribe1 } =
				createTestUndoRedoStacks(tree1);
			const { undoStack: undoStack2, unsubscribe: unsubscribe2 } =
				createTestUndoRedoStacks(branch);

			// Insert node
			branch.setContent(["42"]);

			assert.equal(undoStack1.length, 0);
			assert.equal(undoStack2.length, 1);

			tree1.merge(branch);
			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 1);

			unsubscribe1();
			unsubscribe2();
		});
	});
});
