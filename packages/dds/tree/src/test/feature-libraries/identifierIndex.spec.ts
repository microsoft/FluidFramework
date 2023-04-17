/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockEmptyDeltaConnection,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import {
	ISharedTreeView,
	identifierKeySymbol,
	identifierKey,
	SharedTreeFactory,
} from "../../shared-tree";
import { brand, compareSets } from "../../util";
import { TestTreeProvider, initializeTestTree } from "../utils";
import {
	createField,
	FieldKinds,
	Identifier,
	identifierFieldSchema,
	IdentifierIndex,
	identifierSchema,
	SchemaAware,
	singleTextCursor,
	TypedSchema,
} from "../../feature-libraries";
import { rootFieldKey } from "../../core";

const nodeFieldSchema = TypedSchema.field(FieldKinds.optional, "node");
const nodeSchema = TypedSchema.tree("node", {
	local: { child: nodeFieldSchema },
	global: [identifierKeySymbol],
});
const nodeSchemaData = SchemaAware.typedSchemaData(
	[
		[rootFieldKey, nodeFieldSchema],
		[identifierKey, identifierFieldSchema],
	],
	nodeSchema,
	identifierSchema,
);

describe("Node Identifier Index", () => {
	let nextId: Identifier = 42;
	beforeEach(() => {
		nextId = 42;
	});
	// All tests should use this function to make their IDs - this makes it easier to change the
	// type of `Identifier` when the IdCompressor is hooked up later, or as the design evolves
	function makeId(): Identifier {
		return nextId++;
	}

	function assertIds(tree: ISharedTreeView, ids: Identifier[]): void {
		assert.equal(tree.identifiedNodes.size, ids.length);
		for (const id of ids) {
			assert(tree.identifiedNodes.has(id));
			const node = tree.identifiedNodes.get(id);
			assert(node !== undefined);
			assert.equal(node[identifierKeySymbol], id);
		}
		assert(compareSets({ a: new Set(tree.identifiedNodes.keys()), b: new Set(ids) }));
	}

	it("can look up a node that was inserted", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: id }],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, [id]);
	});

	it("can look up a deep node that was inserted", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				fields: {
					child: [
						{
							type: nodeSchema.name,
							fields: {
								child: [
									{
										type: nodeSchema.name,
										globalFields: {
											[identifierKey]: [
												{ type: identifierSchema.name, value: id },
											],
										},
									},
								],
							},
						},
					],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, [id]);
	});

	it("can look up multiple nodes that were inserted at once", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const ids = [makeId(), makeId(), makeId()];
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: ids[0] }],
				},
				fields: {
					child: [
						{
							type: nodeSchema.name,
							globalFields: {
								[identifierKey]: [{ type: identifierSchema.name, value: ids[1] }],
							},
							fields: {
								child: [
									{
										type: nodeSchema.name,
										globalFields: {
											[identifierKey]: [
												{ type: identifierSchema.name, value: ids[2] },
											],
										},
									},
								],
							},
						},
					],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, ids);
	});

	it("can look up multiple nodes that were inserted over time", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const idA = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: idA }],
				},
			},
			nodeSchemaData,
		);

		const node = tree.identifiedNodes.get(idA);
		assert(node !== undefined);
		const idB = makeId();
		node[createField](
			brand("child"),
			singleTextCursor({
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: idB }],
				},
			}),
		);

		assertIds(tree, [idA, idB]);
	});

	it("forgets about nodes that are deleted", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: makeId() }],
				},
			},
			nodeSchemaData,
		);

		tree.context.root.deleteNodes(0, 1);
		assertIds(tree, []);
	});

	it("fails if multiple nodes have the same ID", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		assert.throws(
			() =>
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[identifierKey]: [{ type: identifierSchema.name, value: id }],
						},
						fields: {
							child: [
								{
									type: nodeSchema.name,
									globalFields: {
										[identifierKey]: [
											{ type: identifierSchema.name, value: id },
										],
									},
								},
							],
						},
					},
					nodeSchemaData,
				),
			(e) => validateAssertionError(e, "Encountered duplicate node identifier"),
		);
	});

	it("can look up a node that was loaded from summary", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: id }],
				},
			},
			nodeSchemaData,
		);
		await provider.ensureSynchronized();
		const summary = await tree.summarize();

		const factory = new SharedTreeFactory();
		const tree2 = await factory.load(
			new MockFluidDataStoreRuntime(),
			factory.type,
			{
				deltaConnection: new MockEmptyDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary.summary),
			},
			factory.attributes,
		);

		assertIds(tree2, [id]);
	});

	it("skips nodes which have identifiers, but are not in schema", async () => {
		// This is missing the global identifier field on the node
		const nodeSchemaNoIdentifier = TypedSchema.tree("node", {
			local: { child: nodeFieldSchema },
		});
		const nodeSchemaDataNoIdentifier = SchemaAware.typedSchemaData(
			[
				[rootFieldKey, nodeFieldSchema],
				[identifierKey, identifierFieldSchema],
			],
			nodeSchemaNoIdentifier,
			identifierSchema,
		);

		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: makeId() }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, []);
	});

	it("skips nodes which have identifiers of the wrong type", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: {} }],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, []);
	});

	it("skips nodes which should have identifiers, but do not", async () => {
		// This is policy choice rather than correctness. It could also fail.
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name }],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, []);
	});

	it("is disabled if identifier field is not in the global schema", async () => {
		// This is missing the global identifier field
		const nodeSchemaDataNoIdentifier = SchemaAware.typedSchemaData(
			[[rootFieldKey, nodeFieldSchema]],
			nodeSchema,
			identifierSchema,
		);

		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: makeId() }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, []);
		const index = tree.identifiedNodes as IdentifierIndex<typeof identifierKey>;
		assert(!index.identifiersAreInSchema(tree.context.schema));
	});

	it("respects extra global fields", async () => {
		// This is missing the global identifier field on the node, but has "extra global fields" enabled
		const nodeSchemaNoIdentifier = TypedSchema.tree("node", {
			local: { child: nodeFieldSchema },
			extraGlobalFields: true,
		});
		const nodeSchemaDataNoIdentifier = SchemaAware.typedSchemaData(
			[
				[rootFieldKey, nodeFieldSchema],
				[identifierKey, identifierFieldSchema],
			],
			nodeSchemaNoIdentifier,
			identifierSchema,
		);

		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: id }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, [id]);
	});

	it("is synchronized after each batch update", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;

		const id = makeId();
		let expectedIds: Identifier[] = [id];
		let batches = 0;
		tree.events.on("afterBatch", () => {
			assertIds(tree, expectedIds);
			batches += 1;
		});

		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: id }],
				},
			},
			nodeSchemaData,
		);

		expectedIds = [];
		tree.context.root.deleteNodes(0, 1);
		assert.equal(batches, 2);
	});

	// TODO: Schema changes are not yet fully hooked up to eventing. A schema change should probably trigger
	it.skip("reacts to schema changes", async () => {
		// This is missing the global identifier field on the node
		const nodeSchemaNoIdentifier = TypedSchema.tree("node", {
			local: { child: nodeFieldSchema },
		});
		const nodeSchemaDataNoIdentifier = SchemaAware.typedSchemaData(
			[
				[rootFieldKey, nodeFieldSchema],
				[identifierKey, identifierFieldSchema],
			],
			nodeSchemaNoIdentifier,
			identifierSchema,
		);

		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[identifierKey]: [{ type: identifierSchema.name, value: id }],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, [id]);
		tree.storedSchema.update(nodeSchemaDataNoIdentifier);
		assertIds(tree, []);
		tree.storedSchema.update(nodeSchemaData);
		assertIds(tree, [id]);
	});

	function describeForkingTests(prefork: boolean): void {
		async function getTree(): Promise<ISharedTreeView> {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			return prefork ? tree.fork() : tree;
		}
		describe(`forking from ${prefork ? "a fork" : "the root"}`, () => {
			it("does not mutate the base when mutating a fork", async () => {
				const tree = await getTree();
				const id = makeId();
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[identifierKey]: [{ type: identifierSchema.name, value: id }],
						},
					},
					nodeSchemaData,
				);

				const fork = tree.fork();
				fork.context.root.deleteNodes(0, 1);
				assertIds(tree, [id]);
				assertIds(fork, []);
				tree.merge(fork);
				assertIds(tree, []);
			});

			it("does not mutate the fork when mutating a base", async () => {
				const tree = await getTree();
				const id = makeId();
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[identifierKey]: [{ type: identifierSchema.name, value: id }],
						},
					},
					nodeSchemaData,
				);

				const fork = tree.fork();
				tree.context.root.deleteNodes(0, 1);
				assertIds(tree, []);
				assertIds(fork, [id]);
				tree.merge(fork);
				assertIds(tree, []);
			});
		});
	}

	describeForkingTests(false);
	describeForkingTests(true);
});
