/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type Anchor,
	type AnchorNode,
	type IForestSubscription,
	type JsonableTree,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type AnchorSetRootEvents,
	type TaggedChange,
} from "../../core/index.js";
import { fieldJsonCursor } from "../json/index.js";
import {
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	type ModularChangeset,
} from "../../feature-libraries/index.js";
import type {
	ITreeCheckout,
	ITreeCheckoutFork,
	CheckoutEvents,
	ISharedTreeEditor,
} from "../../shared-tree/index.js";
import {
	canInitialize,
	initialize,
	initializerFromChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizeTree.js";
import type { Listenable } from "@fluidframework/core-interfaces";
import {
	SchemaFactory,
	type ImplicitFieldSchema,
	type TreeView,
	type TreeViewConfiguration,
} from "../../simple-tree/index.js";
import { toInitialSchema } from "../../simple-tree/index.js";
import type { Transactor } from "../../shared-tree-core/index.js";
import { Breakable } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeTestDefaultChangeFamily } from "../shared-tree-core/utils.js";
import {
	mintRevisionTag,
	type TreeStoredContentStrict,
	treeChunkFromCursor,
} from "../utils.js";

const builder = new SchemaFactory("test");
const root = builder.number;
const schema = root;

const schemaValueRoot = [root, builder.string];

// Schema for tree that must always be empty.
const emptySchema = builder.optional([]);

function expectSchema(actual: TreeStoredSchema, expected: TreeStoredSchema): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, actual, expected));
	assert(allowsRepoSuperset(defaultSchemaPolicy, expected, actual));
}

function makeCheckout(
	repository: TreeStoredSchemaRepository,
	onChange: (change: TaggedChange<ModularChangeset>) => void = () => {},
) {
	const editor = makeTestDefaultChangeFamily().buildEditor(mintRevisionTag, onChange);

	return {
		storedSchema: repository,
		updateSchema: (newSchema: TreeStoredSchema) => {
			// This test repository applies the schema immediately.
			repository.apply(newSchema);
		},
		editor,
	};
}

describe("schematizeTree", () => {
	describe("initialize", () => {
		function testInitialize(name: string, content: TreeStoredContentStrict): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					let count = 0;
					const checkout = makeCheckout(storedSchema, () => count++);
					initialize(
						checkout,
						content.schema,
						initializerFromChunk(checkout, () => treeChunkFromCursor(content.initialTree)),
					);
					assert.equal(count, 1);
					expectSchema(storedSchema, content.schema);
				});

				it("is compatible", () => {
					// TODO:
					// Currently we do not have a function which tests that data is compatible with a given schema. When such a function is available
					// this test should be updated to use it to greatly increase its validation.

					const storedSchema = new TreeStoredSchemaRepository();
					let previousSchema: TreeStoredSchema = new TreeStoredSchemaRepository(storedSchema);
					expectSchema(storedSchema, previousSchema);

					storedSchema.events.on("afterSchemaChange", () => {
						previousSchema = new TreeStoredSchemaRepository(storedSchema);
					});

					let currentData: typeof content.initialTree;
					const checkout = makeCheckout(storedSchema, () => {
						// TODO: check currentData is compatible with current schema.
						// TODO: check data in cursors is compatible with current schema.
						currentData = content.initialTree;
					});
					initialize(
						checkout,
						content.schema,
						initializerFromChunk(checkout, () => treeChunkFromCursor(content.initialTree)),
					);

					// Ensure final schema change was actually tested.
					// This would fail if event is triggered before schema update so last update is missed (and first update checks noop).
					expectSchema(storedSchema, previousSchema);
				});

				it("has expected steps", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					const log: string[] = [];

					storedSchema.events.on("afterSchemaChange", () => {
						log.push("schema");
					});
					const checkout = makeCheckout(storedSchema, () => log.push("content"));
					initialize(
						checkout,
						content.schema,
						initializerFromChunk(checkout, () => treeChunkFromCursor(content.initialTree)),
					);

					assert.deepEqual(
						log,
						content.schema.rootFieldSchema.kind === FieldKinds.required.identifier
							? ["schema", "content", "schema"]
							: ["schema", "content"],
					);
				});
			});
		}

		testInitialize("optional-empty", {
			schema: toInitialSchema(builder.optional(schema)),
			initialTree: fieldJsonCursor([]),
		});
		testInitialize("optional-full", {
			schema: toInitialSchema(builder.optional(schema)),
			initialTree: fieldJsonCursor([5]),
		});
		testInitialize("value", {
			schema: toInitialSchema(schemaValueRoot),
			initialTree: fieldJsonCursor([6]),
		});

		// TODO: Test schema validation of initial tree (once we have a utility for it)
	});

	function mockCheckout(InputSchema: ImplicitFieldSchema, isEmpty: boolean): ITreeCheckout {
		const storedSchema = new TreeStoredSchemaRepository(toInitialSchema(InputSchema));
		const checkout: ITreeCheckout = {
			breaker: new Breakable("mockCheckout"),
			storedSchema,
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			forest: { isEmpty } as IForestSubscription,
			editor: undefined as unknown as ISharedTreeEditor,
			transaction: undefined as unknown as Transactor,
			branch(): ITreeCheckoutFork {
				throw new Error("Function not implemented.");
			},
			merge(view: ITreeCheckoutFork): void {
				throw new Error("Function not implemented.");
			},
			rebase(view: ITreeCheckoutFork): void {
				throw new Error("Function not implemented.");
			},
			updateSchema(newSchema: TreeStoredSchema): void {
				throw new Error("Function not implemented.");
			},
			events: undefined as unknown as Listenable<CheckoutEvents>,
			rootEvents: undefined as unknown as Listenable<AnchorSetRootEvents>,
			getRemovedRoots(): [string | number | undefined, number, JsonableTree][] {
				throw new Error("Function not implemented.");
			},
			locate(anchor: Anchor): AnchorNode | undefined {
				throw new Error("Function not implemented.");
			},
			viewWith<TRoot extends ImplicitFieldSchema>(
				config: TreeViewConfiguration<TRoot>,
			): TreeView<TRoot> {
				throw new Error("Function not implemented.");
			},
		};
		return checkout;
	}

	describe("canInitialize", () => {
		it("incompatible upgrade errors and does not modify schema", () => {
			assert(canInitialize(mockCheckout(emptySchema, true)));
			assert(!canInitialize(mockCheckout(emptySchema, false)));
			assert(!canInitialize(mockCheckout(schema, true)));
			assert(!canInitialize(mockCheckout(schema, false)));
		});
	});
});
