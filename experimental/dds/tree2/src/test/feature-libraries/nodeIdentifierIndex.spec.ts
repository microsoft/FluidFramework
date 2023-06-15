/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generateStableId } from "@fluidframework/container-runtime";
import {
	MockFluidDataStoreRuntime,
	MockEmptyDeltaConnection,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { ISharedTreeView, SharedTreeFactory } from "../../shared-tree";
import { brand, compareSets } from "../../util";
import { TestTreeProviderLite, initializeTestTree } from "../utils";
import {
	FieldKinds,
	NodeIdentifierIndex,
	SchemaBuilder,
	NodeIdentifier,
} from "../../feature-libraries";
import { symbolFromKey } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { nodeIdentifierSchema } from "../../domains";

const {
	schema: nodeIdentifierSchemaLibrary,
	field: nodeIdentifierField,
	type: nodeIdentifierType,
} = nodeIdentifierSchema();
assert.equal(nodeIdentifierField.key, nodeIdentifierField.key);

const builder = new SchemaBuilder("identifier index tests", nodeIdentifierSchemaLibrary);
export const nodeSchema = builder.objectRecursive("node", {
	local: { child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema) },
	global: [nodeIdentifierField],
});
export const nodeSchemaData = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(nodeSchema));

describe("Node Identifier Index", () => {
	// All tests should use this function to make their IDs - this makes it easier to change the
	// type of `NodeIdentifier` when the IdCompressor is hooked up later, or as the design evolves
	function makeId(): NodeIdentifier {
		return brand(generateStableId());
	}

	function assertIds(tree: ISharedTreeView, ids: NodeIdentifier[]): void {
		assert.equal(tree.identifiedNodes.size, ids.length);
		for (const id of ids) {
			assert(tree.identifiedNodes.has(id));
			const node = tree.identifiedNodes.get(id);
			assert(node !== undefined);
			assert.equal(node[symbolFromKey(nodeIdentifierField.key)], id);
		}
		assert(compareSets({ a: new Set(tree.identifiedNodes.keys()), b: new Set(ids) }));
	}

	it("can look up a node that was inserted", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
				},
			},
			nodeSchemaData,
		);
		assertIds(tree, [id]);
	});

	it("can look up a deep node that was inserted", () => {
		const provider = new TestTreeProviderLite();
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
											[nodeIdentifierField.key]: [
												{ type: nodeIdentifierType, value: id },
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

	it("can look up multiple nodes that were inserted at once", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const ids = [makeId(), makeId(), makeId()];
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: ids[0] }],
				},
				fields: {
					child: [
						{
							type: nodeSchema.name,
							globalFields: {
								[nodeIdentifierField.key]: [
									{ type: nodeIdentifierType, value: ids[1] },
								],
							},
							fields: {
								child: [
									{
										type: nodeSchema.name,
										globalFields: {
											[nodeIdentifierField.key]: [
												{ type: nodeIdentifierType, value: ids[2] },
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

	it("can look up multiple nodes that were inserted over time", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const idA = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: idA }],
				},
			},
			nodeSchemaData,
		);

		const node = tree.identifiedNodes.get(idA);
		assert(node !== undefined);
		const idB = makeId();
		node.child = { [symbolFromKey(nodeIdentifierField.key)]: idB };
		assertIds(tree, [idA, idB]);
	});

	it("forgets about nodes that are deleted", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: makeId() }],
				},
			},
			nodeSchemaData,
		);

		tree.root = undefined;
		assertIds(tree, []);
	});

	it("fails if multiple nodes have the same ID", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const id = makeId();
		assert.throws(
			() =>
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
						},
						fields: {
							child: [
								{
									type: nodeSchema.name,
									globalFields: {
										[nodeIdentifierField.key]: [
											{ type: nodeIdentifierType, value: id },
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
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
				},
			},
			nodeSchemaData,
		);
		provider.processMessages();
		const summary = await tree.summarize();

		const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });
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

	// TODO: this test makes a tree which is out of schema. This should error.
	it("skips nodes which have identifiers, but are not in schema", () => {
		// This is missing the global identifier field on the node
		const builder2 = new SchemaBuilder("identifier index test", nodeIdentifierSchemaLibrary);
		const nodeSchemaNoIdentifier = builder2.objectRecursive("node", {
			local: {
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => nodeSchemaNoIdentifier,
				),
			},
		});
		const nodeSchemaDataNoIdentifier = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoIdentifier),
		);

		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: makeId() }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, []);
	});

	it("errors nodes which have identifiers of the wrong type", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		assert.throws(
			() =>
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: {} }],
						},
					},
					nodeSchemaData,
				),
			(e) => validateAssertionError(e, "Malformed value encountered in identifier field"),
		);
	});

	it("errors on nodes which should have identifiers, but do not", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		assert.throws(
			() =>
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[nodeIdentifierField.key]: [{ type: nodeIdentifierType }],
						},
					},
					nodeSchemaData,
				),
			(e) => validateAssertionError(e, "Malformed value encountered in identifier field"),
		);
	});

	it("is disabled if identifier field is not in the global schema", () => {
		const builder2 = new SchemaBuilder("identifier index test");
		const nodeSchemaNoIdentifier = builder2.objectRecursive("node", {
			local: {
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => nodeSchemaNoIdentifier,
				),
			},
		});
		// This is missing the global identifier field
		const nodeSchemaDataNoIdentifier = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoIdentifier),
		);
		assert(!nodeSchemaDataNoIdentifier.globalFieldSchema.has(nodeIdentifierField.key));

		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: makeId() }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, []);
		const index = tree.identifiedNodes as NodeIdentifierIndex<typeof nodeIdentifierField.key>;
		assert(
			!NodeIdentifierIndex.identifiersAreInSchema(
				tree.context.schema,
				index.identifierFieldKey,
			),
		);
	});

	it("respects extra global fields", () => {
		// This is missing the global identifier field on the node, but has "extra global fields" enabled
		const builder2 = new SchemaBuilder("identifier index test", nodeIdentifierSchemaLibrary);
		const nodeSchemaNoIdentifier = builder2.objectRecursive("node", {
			local: {
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => nodeSchemaNoIdentifier,
				),
			},
			extraGlobalFields: true,
		});
		const nodeSchemaDataNoIdentifier = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoIdentifier),
		);

		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
				},
			},
			nodeSchemaDataNoIdentifier,
		);
		assertIds(tree, [id]);
	});

	it("is synchronized after each batch update", () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;

		const id = makeId();
		let expectedIds: NodeIdentifier[] = [id];
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
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
				},
			},
			nodeSchemaData,
		);

		expectedIds = [];
		tree.root = undefined;
		assert.equal(batches, 2);
	});

	// TODO: Schema changes are not yet fully hooked up to eventing. A schema change should probably trigger
	it.skip("reacts to schema changes", () => {
		// This is missing the global identifier field on the node
		const builder2 = new SchemaBuilder("identifier index test", nodeIdentifierSchemaLibrary);
		const nodeSchemaNoIdentifier = builder2.objectRecursive("node", {
			local: {
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => nodeSchemaNoIdentifier,
				),
			},
		});
		const nodeSchemaDataNoIdentifier = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoIdentifier),
		);

		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const id = makeId();
		initializeTestTree(
			tree,
			{
				type: nodeSchema.name,
				globalFields: {
					[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
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
		function getTree(): ISharedTreeView {
			const provider = new TestTreeProviderLite();
			const [tree] = provider.trees;
			return prefork ? tree.fork() : tree;
		}
		describe(`forking from ${prefork ? "a fork" : "the root"}`, () => {
			it("does not mutate the base when mutating a fork", () => {
				const tree = getTree();
				const id = makeId();
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
						},
					},
					nodeSchemaData,
				);

				const fork = tree.fork();
				fork.root = undefined;
				assertIds(tree, [id]);
				assertIds(fork, []);
				tree.merge(fork);
				assertIds(tree, []);
			});

			it("does not mutate the fork when mutating a base", () => {
				const tree = getTree();
				const id = makeId();
				initializeTestTree(
					tree,
					{
						type: nodeSchema.name,
						globalFields: {
							[nodeIdentifierField.key]: [{ type: nodeIdentifierType, value: id }],
						},
					},
					nodeSchemaData,
				);

				const fork = tree.fork();
				tree.root = undefined;
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
