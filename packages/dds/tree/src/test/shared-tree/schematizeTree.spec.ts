/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Any,
	FlexTreeSchema,
	FlexFieldSchema,
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	NewFieldContent,
	intoStoredSchema,
	ViewSchema,
	SchemaBuilderBase,
} from "../../feature-libraries/index.js";
import { ITreeCheckout, ITreeCheckoutFork } from "../../shared-tree/index.js";
import {
	AllowedUpdateType,
	Anchor,
	AnchorNode,
	IForestSubscription,
	JsonableTree,
	TreeStoredSchema,
	TreeStoredSchemaRepository,
} from "../../core/index.js";
import { checkoutWithContent, jsonSequenceRootSchema, validateViewConsistency } from "../utils.js";

import {
	TreeContent,
	UpdateType,
	canInitialize,
	ensureSchema,
	evaluateUpdate,
	initializeContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizeTree.js";
import { SchemaBuilder, leaf } from "../../domains/index.js";

const builder = new SchemaBuilder({ scope: "test", name: "Schematize Tree Tests" });
const root = leaf.number;
const schema = builder.intoSchema(SchemaBuilder.optional(root));

const builderGeneralized = new SchemaBuilder({
	scope: "test",
	name: "Schematize Tree Tests Generalized",
});

const schemaGeneralized = builderGeneralized.intoSchema(SchemaBuilder.optional(Any));

const builderValue = new SchemaBuilder({ scope: "test", name: "Schematize Tree Tests2" });

const schemaValueRoot = builderValue.intoSchema(SchemaBuilder.required(Any));

// Schema for tree that must always be empty.
const emptySchema = new SchemaBuilderBase(FieldKinds.required, {
	scope: "Empty",
	lint: {
		rejectEmpty: false,
		rejectForbidden: false,
	},
}).intoSchema(FlexFieldSchema.empty);

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
		function testInitialize<TRoot extends FlexFieldSchema>(
			name: string,
			content: TreeContent<TRoot>,
		): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					let count = 0;
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () => {
						count++;
					});
					assert.equal(count, 1);
					expectSchema(storedSchema, intoStoredSchema(content.schema));
				});

				it("is compatible", () => {
					// TODO:
					// Currently we do not have a function which tests that data is compatible with a given schema. When such a function is available
					// this test should be updated to use it to greatly increase its validation.

					const storedSchema = new TreeStoredSchemaRepository();
					let previousSchema: TreeStoredSchema = new TreeStoredSchemaRepository(
						storedSchema,
					);
					expectSchema(storedSchema, previousSchema);

					storedSchema.on("afterSchemaChange", () => {
						previousSchema = new TreeStoredSchemaRepository(storedSchema);
					});

					let currentData: NewFieldContent;
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

					storedSchema.on("afterSchemaChange", () => {
						log.push("schema");
					});
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () =>
						log.push("content"),
					);

					assert.deepEqual(
						log,
						content.schema.rootFieldSchema.kind === FieldKinds.required
							? ["schema", "content", "schema"]
							: ["schema", "content"],
					);
				});
			});
		}

		testInitialize("optional-empty", { schema, initialTree: undefined });
		testInitialize("optional-full", { schema, initialTree: 5 });
		testInitialize("value", { schema: schemaValueRoot, initialTree: 6 });

		// TODO: Test schema validation of initial tree (once we have a utility for it)
	});

	function mockCheckout(InputSchema: FlexTreeSchema, isEmpty: boolean): ITreeCheckout {
		const storedSchema = new TreeStoredSchemaRepository(intoStoredSchema(InputSchema));
		const checkout: ITreeCheckout = {
			storedSchema,
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			forest: { isEmpty } as IForestSubscription,
			editor: undefined as any,
			transaction: undefined as any,
			fork(): ITreeCheckoutFork {
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
			events: undefined as any,
			rootEvents: undefined as any,
			getRemovedRoots(): [string | number | undefined, number, JsonableTree][] {
				throw new Error("Function not implemented.");
			},
			locate(anchor: Anchor): AnchorNode | undefined {
				throw new Error("Function not implemented.");
			},
		};
		return checkout;
	}

	describe("evaluateUpdate", () => {
		describe("test cases", () => {
			const testCases: [string, FlexTreeSchema, boolean][] = [
				["empty", emptySchema, true],
				["basic-optional-empty", schema, true],
				["basic-optional", schema, false],
				["basic-value", schemaValueRoot, false],
				["complex-empty", jsonSequenceRootSchema, true],
				["complex", jsonSequenceRootSchema, false],
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
					const result = evaluateUpdate(
						viewSchema,
						AllowedUpdateType.Initialize,
						checkout,
					);
					if (data === emptySchema) {
						assert.equal(result, UpdateType.None);
					} else {
						assert.equal(
							result,
							isEmpty ? UpdateType.Initialize : UpdateType.Incompatible,
						);
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
				schema: emptySchema,
				initialTree: undefined,
			});
			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, emptySchema);
			assert(ensureSchema(viewSchema, AllowedUpdateType.None, checkout, undefined));
		});

		it("initialize optional root", () => {
			const emptyContent = {
				schema: emptySchema,
				initialTree: undefined,
			};
			const emptyCheckout = checkoutWithContent(emptyContent);
			const content: TreeContent<typeof schemaGeneralized.rootFieldSchema> = {
				schema: schemaGeneralized,
				initialTree: 5,
			};
			const initializedCheckout = checkoutWithContent(content);
			// Schema upgraded, but content not initialized
			const upgradedCheckout = checkoutWithContent({
				schema: schemaGeneralized,
				initialTree: undefined,
			});
			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, content.schema);

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
				assert(
					!ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, undefined),
				);
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
			const emptyContent = {
				schema: emptySchema,
				initialTree: undefined,
			};
			const emptyCheckout = checkoutWithContent(emptyContent);
			const content: TreeContent<typeof schemaValueRoot.rootFieldSchema> = {
				schema: schemaValueRoot,
				initialTree: 5,
			};
			const initializedCheckout = checkoutWithContent(content);

			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, content.schema);

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
				assert(
					!ensureSchema(viewSchema, AllowedUpdateType.Initialize, checkout, undefined),
				);
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
					!ensureSchema(
						viewSchema,
						AllowedUpdateType.SchemaCompatible,
						checkout,
						content,
					),
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
			const initialContent = {
				schema,
				initialTree: 5,
			};
			const initialCheckout = checkoutWithContent(initialContent);
			const content: TreeContent<typeof schemaGeneralized.rootFieldSchema> = {
				schema: schemaGeneralized,
				initialTree: "Should not be used",
			};
			const updatedCheckout = checkoutWithContent({
				schema: schemaGeneralized,
				initialTree: initialContent.initialTree,
			});

			const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, content.schema);

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
					ensureSchema(
						viewSchema,
						AllowedUpdateType.SchemaCompatible,
						checkout,
						undefined,
					),
				);
				validateViewConsistency(checkout, updatedCheckout);
			}
		});
	});
});
