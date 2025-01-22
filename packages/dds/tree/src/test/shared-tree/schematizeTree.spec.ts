/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	AllowedUpdateType,
	type Anchor,
	type AnchorNode,
	type IForestSubscription,
	type JsonableTree,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type AnchorSetRootEvents,
} from "../../core/index.js";
import { JsonUnion, singleJsonCursor } from "../json/index.js";
import {
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
} from "../../feature-libraries/index.js";
import type {
	ITreeCheckout,
	ITreeCheckoutFork,
	CheckoutEvents,
	ISharedTreeEditor,
} from "../../shared-tree/index.js";
import {
	type TreeStoredContent,
	UpdateType,
	canInitialize,
	ensureSchema,
	evaluateUpdate,
	initializeContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizeTree.js";
import { checkoutWithContent, validateViewConsistency } from "../utils.js";
import type { Listenable } from "@fluidframework/core-interfaces";
import {
	SchemaFactory,
	ViewSchema,
	type ImplicitFieldSchema,
	type TreeView,
	type TreeViewConfiguration,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../simple-tree/toStoredSchema.js";
import type { Transactor } from "../../shared-tree-core/index.js";

const builder = new SchemaFactory("test");
const root = builder.number;
const schema = root;

const schemaGeneralized = builder.optional([root, builder.string]);
const schemaValueRoot = [root, builder.string];

// Schema for tree that must always be empty.
const emptySchema = builder.optional([]);

function expectSchema(actual: TreeStoredSchema, expected: TreeStoredSchema): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, actual, expected));
	assert(allowsRepoSuperset(defaultSchemaPolicy, expected, actual));
}

function makeSchemaRepository(repository: TreeStoredSchemaRepository): {
	storedSchema: ITreeCheckout["storedSchema"];
	updateSchema: ITreeCheckout["updateSchema"];
} {
	return {
		storedSchema: repository,
		updateSchema: (newSchema: TreeStoredSchema) => {
			// This test repository applies the schema immediately.
			repository.apply(newSchema);
		},
	};
}

describe("schematizeTree", () => {
	describe("initializeContent", () => {
		function testInitialize(name: string, content: TreeStoredContent): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					let count = 0;
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () => {
						count++;
					});
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
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () => {
						// TODO: check currentData is compatible with current schema.
						// TODO: check data in cursors is compatible with current schema.
						currentData = content.initialTree;
					});

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
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () =>
						log.push("content"),
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
			schema: toStoredSchema(schema),
			initialTree: undefined,
		});
		testInitialize("optional-full", {
			schema: toStoredSchema(schema),
			initialTree: singleJsonCursor(5),
		});
		testInitialize("value", {
			schema: toStoredSchema(schemaValueRoot),
			initialTree: singleJsonCursor(6),
		});

		// TODO: Test schema validation of initial tree (once we have a utility for it)
	});

	function mockCheckout(InputSchema: ImplicitFieldSchema, isEmpty: boolean): ITreeCheckout {
		const storedSchema = new TreeStoredSchemaRepository(toStoredSchema(InputSchema));
		const checkout: ITreeCheckout = {
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

	describe("evaluateUpdate", () => {
		describe("test cases", () => {
			const testCases: [string, ImplicitFieldSchema, boolean][] = [
				["empty", emptySchema, true],
				["basic-optional-empty", schema, true],
				["basic-optional", schema, false],
				["basic-value", schemaValueRoot, false],
				["complex-empty", JsonUnion, true],
				["complex", builder.arrayRecursive("root", JsonUnion), false],
			];
			for (const [name, data, isEmpty] of testCases) {
				it(name, () => {
					const checkout = mockCheckout(data, isEmpty);
					const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, data);
					const result = evaluateUpdate(viewSchema, AllowedUpdateType.None, checkout);
					assert.equal(result, UpdateType.None);
				});

				it(`${name} initialize`, () => {
					const checkout = mockCheckout(emptySchema, isEmpty);
					const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, data);
					const result = evaluateUpdate(viewSchema, AllowedUpdateType.Initialize, checkout);
					if (data === emptySchema) {
						assert.equal(result, UpdateType.None);
					} else {
						assert.equal(result, isEmpty ? UpdateType.Initialize : UpdateType.Incompatible);
					}
				});
			}
		});

		it("AllowedUpdateType works", () => {
			const checkout = mockCheckout(schema, false);
			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schemaGeneralized);
			{
				const result = evaluateUpdate(
					viewSchema,
					AllowedUpdateType.SchemaCompatible,
					checkout,
				);
				assert.equal(result, UpdateType.SchemaCompatible);
			}
			{
				const result = evaluateUpdate(viewSchema, AllowedUpdateType.Initialize, checkout);
				assert.equal(result, UpdateType.Incompatible);
			}
			{
				const result = evaluateUpdate(viewSchema, AllowedUpdateType.None, checkout);
				assert.equal(result, UpdateType.Incompatible);
			}
		});
	});

	describe("canInitialize", () => {
		it("incompatible upgrade errors and does not modify schema", () => {
			assert(canInitialize(mockCheckout(emptySchema, true)));
			assert(!canInitialize(mockCheckout(emptySchema, false)));
			assert(!canInitialize(mockCheckout(schema, true)));
			assert(!canInitialize(mockCheckout(schema, false)));
		});
	});

	describe("ensureSchema", () => {
		it("compatible empty schema", () => {
			const checkout = checkoutWithContent({
				schema: toStoredSchema(emptySchema),
				initialTree: undefined,
			});
			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, emptySchema);
			assert(ensureSchema(viewSchema, AllowedUpdateType.None, checkout, undefined));
		});

		it("initialize optional root", () => {
			const emptyContent: TreeStoredContent = {
				schema: toStoredSchema(emptySchema),
				initialTree: undefined,
			};
			const emptyCheckout = checkoutWithContent(emptyContent);
			const content: TreeStoredContent = {
				schema: toStoredSchema(schemaGeneralized),
				initialTree: singleJsonCursor(5),
			};
			const initializedCheckout = checkoutWithContent(content);
			// Schema upgraded, but content not initialized
			const upgradedCheckout = checkoutWithContent({
				schema: toStoredSchema(schemaGeneralized),
				initialTree: undefined,
			});
			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schemaGeneralized);

			// Non updating cases
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.None, checkout, undefined));
				validateViewConsistency(checkout, emptyCheckout);
			}
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.None, checkout, content));
				validateViewConsistency(checkout, emptyCheckout);
			}
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, undefined));
				validateViewConsistency(checkout, emptyCheckout);
			}

			// Initialize
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, content));
				validateViewConsistency(checkout, initializedCheckout);
			}

			// Schema upgrade but not initialize
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(
					ensureSchema(viewSchema, AllowedUpdateType.SchemaCompatible, checkout, content),
				);
				validateViewConsistency(checkout, upgradedCheckout);
			}

			// Prefer initialize over schema upgrade when both are allowed
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(
					ensureSchema(
						viewSchema,
						// eslint-disable-next-line no-bitwise
						AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
						checkout,
						content,
					),
				);
				validateViewConsistency(checkout, initializedCheckout);
			}

			//  Schema upgrade when no content is provided
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(
					ensureSchema(
						viewSchema,
						// eslint-disable-next-line no-bitwise
						AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
						checkout,
						undefined,
					),
				);
				validateViewConsistency(checkout, upgradedCheckout);
			}
		});

		it("initialize required root", () => {
			const emptyContent: TreeStoredContent = {
				schema: toStoredSchema(emptySchema),
				initialTree: undefined,
			};
			const emptyCheckout = checkoutWithContent(emptyContent);
			const content: TreeStoredContent = {
				schema: toStoredSchema(schemaValueRoot),
				initialTree: singleJsonCursor(5),
			};
			const initializedCheckout = checkoutWithContent(content);

			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schemaValueRoot);

			// Non updating cases
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.None, checkout, undefined));
				validateViewConsistency(checkout, emptyCheckout);
			}
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.None, checkout, content));
				validateViewConsistency(checkout, emptyCheckout);
			}
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, undefined));
				validateViewConsistency(checkout, emptyCheckout);
			}
			// Cases which don't update due to root being required
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(
					!ensureSchema(
						viewSchema,
						// eslint-disable-next-line no-bitwise
						AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
						checkout,
						undefined,
					),
				);
				validateViewConsistency(checkout, emptyCheckout);
			}
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(
					!ensureSchema(viewSchema, AllowedUpdateType.SchemaCompatible, checkout, content),
				);
				validateViewConsistency(checkout, emptyCheckout);
			}

			// Initialize
			{
				const checkout = checkoutWithContent(emptyContent);
				assert(ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, content));
				validateViewConsistency(checkout, initializedCheckout);
			}
		});

		it("update non-empty", () => {
			const initialContent: TreeStoredContent = {
				schema: toStoredSchema(schema),
				get initialTree() {
					return singleJsonCursor(5);
				},
			};
			const initialCheckout = checkoutWithContent(initialContent);
			const content: TreeStoredContent = {
				schema: toStoredSchema(schemaGeneralized),
				initialTree: singleJsonCursor("Should not be used"),
			};
			const updatedCheckout = checkoutWithContent({
				schema: toStoredSchema(schemaGeneralized),
				initialTree: initialContent.initialTree,
			});

			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schemaGeneralized);

			// Non updating case
			{
				const checkout = checkoutWithContent(initialContent);
				assert(!ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, content));
				validateViewConsistency(checkout, initialCheckout);
			}
			// Updating case
			{
				const checkout = checkoutWithContent(initialContent);
				assert(
					ensureSchema(viewSchema, AllowedUpdateType.SchemaCompatible, checkout, undefined),
				);
				validateViewConsistency(checkout, updatedCheckout);
			}
		});
	});
});
