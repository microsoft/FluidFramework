/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CommitKind,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	rootFieldKey,
	type FieldKey,
	type JsonableTree,
	type NormalizedFieldUpPath,
	type RevisionTag,
	type TaggedChange,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
} from "../../../core/index.js";
import { FieldKinds, cursorForJsonableTreeField } from "../../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import { stringSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { checkoutWithContent, chunkFromJsonableTrees, validateTree } from "../../utils.js";

import { generateSharedTreeChanges } from "./changeGeneration.js";

const rootType = brand<TreeNodeSchemaIdentifier>("axiomatic.root");
const leafType = brand<TreeNodeSchemaIdentifier>(stringSchema.identifier);

function leaf(value: string): JsonableTree {
	return { type: leafType, value };
}

function content(left: string[], right: string[], optional?: string): JsonableTree[] {
	return [
		{
			type: rootType,
			fields: {
				...(left.length === 0 ? {} : { left: left.map(leaf) }),
				...(right.length === 0 ? {} : { right: right.map(leaf) }),
				required: [leaf("required")],
				...(optional === undefined ? {} : { optional: [leaf(optional)] }),
			},
		},
	];
}

function field(key: string): NormalizedFieldUpPath {
	return {
		parent: {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
			detachedNodeId: undefined,
		},
		field: brand(key),
	};
}

const leftField = field("left");
const rightField = field("right");
const optionalField = field("optional");
const initialContent = content(["A"], ["B"]);
const leafField = (kind: TreeFieldStoredSchema["kind"]): TreeFieldStoredSchema => ({
	kind,
	types: new Set([leafType]),
	persistedMetadata: undefined,
});
const schema = {
	rootFieldSchema: {
		kind: FieldKinds.required.identifier,
		types: new Set([rootType]),
		persistedMetadata: undefined,
	},
	nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
		[
			rootType,
			new ObjectNodeStoredSchema(
				new Map<FieldKey, TreeFieldStoredSchema>([
					[brand("left"), leafField(FieldKinds.sequence.identifier)],
					[brand("right"), leafField(FieldKinds.sequence.identifier)],
					[brand("optional"), leafField(FieldKinds.optional.identifier)],
					[brand("required"), leafField(FieldKinds.required.identifier)],
				]),
			),
		],
		[leafType, new LeafNodeStoredSchema(ValueSchema.String)],
	]),
};

describe("SharedTree axiom infrastructure: change generation", () => {
	for (const [name, forestType] of [
		["reference forest", ForestTypeReference],
		["optimized forest", ForestTypeOptimized],
	] as const) {
		describe(name, () => {
			let parent: TreeCheckout;
			beforeEach(() => {
				parent = checkoutWithContent(
					{ schema, initialTree: cursorForJsonableTreeField(initialContent) },
					{ forestType },
				);
			});
			afterEach(() => {
				parent.dispose();
			});

			it("initializes without authoring setup commits", () => {
				assert.equal(parent.mainBranch.getHead().parent, undefined);
				validateTree(parent, initialContent);
			});

			it("captures an atomic cross-field move without unwrapping its change", () => {
				const base = parent.mainBranch.getHead();
				for (const { checkout, change } of generateSharedTreeChanges(parent, [
					{
						description: "move left[0] to right[1]",
						apply: (child) => child.editor.move(leftField, 0, 1, rightField, 1),
					},
				])) {
					assert(change !== undefined);
					const head = checkout.mainBranch.getHead();
					assert.equal(head.parent, base);
					assert.equal(change.change, head.change);
					assert.equal(change.revision, head.revision);
					assert.equal(typeof change.revision, "number");
					assert.equal(change.change.changes.length, 1);
					assert.equal(change.change.changes[0].type, "data");
					validateTree(checkout, content([], ["B", "A"]));
					validateTree(parent, initialContent);
				}
				assert.equal(parent.mainBranch.getHead(), base);
			});

			it("isolates siblings and allocates distinct revisions", () => {
				const revisions = new Set<RevisionTag | undefined>();
				for (const { checkout, change } of generateSharedTreeChanges(
					parent,
					["X", "Y"].map((value) => ({
						description: value,
						apply: (child: TreeCheckout) => {
							validateTree(child, initialContent);
							const chunk = chunkFromJsonableTrees([leaf(value)]);
							try {
								child.editor.optionalField(optionalField).set(chunk, true);
							} finally {
								chunk.referenceRemoved();
							}
						},
					})),
				)) {
					assert(change !== undefined);
					revisions.add(change.revision);
					assert.notEqual(checkout, parent);
					validateTree(parent, initialContent);
				}
				assert.equal(revisions.size, 2);
			});

			it("distinguishes no submission from an explicit empty clear", () => {
				for (const { description, change, checkout } of generateSharedTreeChanges(parent, [
					{
						description: "zero-count move",
						apply: (child) => child.editor.move(leftField, 0, 0, rightField, 0),
					},
					{
						description: "empty clear",
						apply: (child) => child.editor.optionalField(optionalField).set(undefined, true),
					},
				])) {
					assert.equal(change === undefined, description === "zero-count move");
					validateTree(checkout, initialContent);
				}
			});

			it("captures a multi-call transaction as one commit", () => {
				for (const { checkout, change } of generateSharedTreeChanges(parent, [
					{
						description: "move and clear",
						apply: (child) => {
							child.transaction.start();
							child.editor.move(leftField, 0, 1, rightField, 1);
							child.editor.optionalField(optionalField).set(undefined, true);
							child.transaction.commit();
						},
					},
				])) {
					assert(change !== undefined);
					assert.equal(checkout.mainBranch.getHead().parent, parent.mainBranch.getHead());
					assert.equal(change.change.changes.length, 1);
					const inner = change.change.changes[0];
					assert(inner.type === "data");
					assert.deepEqual(inner.innerChange.revisions, [{ revision: change.revision }]);
					validateTree(checkout, content([], ["B", "A"]));
				}
			});

			it("disposes exploration forks on early termination", () => {
				let disposed = false;
				for (const { checkout } of generateSharedTreeChanges(parent, [
					{ description: "no edit", apply: () => {} },
				])) {
					checkout.events.on("dispose", () => {
						disposed = true;
					});
					break;
				}
				assert(disposed);
			});

			for (const failure of ["throws", "open transaction", "multiple commits"] as const) {
				it(`cleans up after an invalid operation: ${failure}`, () => {
					let disposed = false;
					const changes = generateSharedTreeChanges(parent, [
						{
							description: failure,
							apply: (child) => {
								child.events.on("dispose", () => {
									disposed = true;
								});
								if (failure !== "multiple commits") {
									child.transaction.start();
								}
								child.editor.move(leftField, 0, 1, rightField, 1);
								if (failure === "throws") {
									throw new Error("operation failed");
								}
								if (failure === "multiple commits") {
									child.editor.optionalField(optionalField).set(undefined, true);
								}
							},
						},
					]);
					const message = {
						throws: /operation failed/,
						"open transaction": /Operation left a transaction open/,
						"multiple commits": /Operation must submit at most one commit/,
					}[failure];
					assert.throws(() => changes.next(), message);
					assert(disposed);
					validateTree(parent, initialContent);
				});
			}

			it("replays a build-bearing complete change after its authoring fork is disposed", () => {
				let captured: TaggedChange<SharedTreeChange> | undefined;
				for (const { change } of generateSharedTreeChanges(parent, [
					{
						description: "insert X",
						apply: (child) => {
							const chunk = chunkFromJsonableTrees([leaf("X")]);
							try {
								child.editor.sequenceField(leftField).insert(1, chunk);
							} finally {
								chunk.referenceRemoved();
							}
						},
					},
				])) {
					captured = change;
				}
				assert(captured !== undefined);
				const replay = parent.fork();
				try {
					replay.mainBranch.apply(captured, CommitKind.Default, undefined);
					validateTree(replay, content(["A", "X"], ["B"]));
				} finally {
					replay.dispose();
				}
			});
		});
	}
});
