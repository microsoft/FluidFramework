/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockFluidDataStoreRuntime,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { asAlpha, asBeta } from "../../../api.js";
import type { Revertible } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { Tree, TreeAlpha, TreeCheckout } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { UnhydratedFlexTreeNode } from "../../../simple-tree/core/index.js";
import {
	createFieldSchema,
	FieldKind,
	getDefaultProvider,
	type ConstantFieldProvider,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/fieldSchema.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	unhydratedFlexTreeFromInsertable,
	type ImplicitFieldSchema,
	type TreeView,
	type TreeViewAlpha,
	type TreeViewBeta,
	type TreeContextAlpha,
	type TreeContextBeta,
	type UntypedTreeView,
	type UntypedTreeViewAlpha,
	type TransactionCallbackStatusAlpha,
	type TransactionCallbackStatusBeta,
	type TransactionValueResult,
	type TransactionVoidResult,
	type VoidTransactionCallbackStatusBeta,
	type WithValue,
} from "../../../simple-tree/index.js";
import { SharedTree } from "../../../treeFactory.js";
import type {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../../util/index.js";
import { expectSchemaEqual, getView, StringArray, TestTreeProviderLite } from "../../utils.js";
import { getViewForForkedBranch } from "../utils.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const factory = SharedTree.getFactory();

// Type tests
{
	// TreeViewBeta should be assignable to TreeView
	type _checkBetaAssignableToPublic = requireAssignableTo<
		TreeViewBeta<ImplicitFieldSchema>,
		TreeView<ImplicitFieldSchema>
	>;

	// TreeViewAlpha should be assignable to TreeViewBeta
	type _checkAlphaAssignableToBeta = requireAssignableTo<
		TreeViewAlpha<ImplicitFieldSchema>,
		TreeViewBeta<ImplicitFieldSchema>
	>;

	// UntypedTreeViewAlpha should be assignable to UntypedTreeView
	type _checkAlphaUntypedViewAssignableToBeta = requireAssignableTo<
		UntypedTreeViewAlpha,
		UntypedTreeView
	>;

	// TreeContextAlpha should be assignable to TreeContextBeta
	type _checkAlphaContextAssignableToBeta = requireAssignableTo<
		TreeContextAlpha,
		TreeContextBeta
	>;
}

describe("simple-tree tree", () => {
	describe("alpha transaction overloads", () => {
		// Whole-interface assignability does not guarantee that every explicit-generic call remains valid.
		// These tests exercise call sites as well as checking inferred types and runtime results.
		it("preserves single-value calls on views and after context narrowing", async () => {
			const view = getView(new TreeViewConfiguration({ schema: NodeList }));
			view.initialize([]);
			// These are different static views of the same object, not separate trees.
			const beta = asBeta(view);
			const alpha = asAlpha(beta);
			const untyped: UntypedTreeViewAlpha = alpha;
			const context = TreeAlpha.context(view.root);
			// Restoring beta-compatible call shapes must not restrict callers to beta transaction options.
			const options = { customMetadata: { test: "transaction overloads" } };

			const beforeNarrowing = context.runTransaction<number>(() => ({ value: 42 }), options);
			const asyncBeforeNarrowing = await context.runTransactionAsync<number>(
				async () => ({ value: 42 }),
				options,
			);
			// Narrowing used to hide the context's single-type-argument overload.
			assert(context.isView());

			// Keep the explicit <number>: inference alone would not catch the original missing call shape.
			// Await each asynchronous transaction separately because transactions on this view cannot overlap.
			const results = [
				beforeNarrowing,
				asyncBeforeNarrowing,
				beta.runTransaction<number>(() => ({ value: 42 })),
				await beta.runTransactionAsync<number>(async () => ({ value: 42 })),
				alpha.runTransaction<number>(() => ({ value: 42 }), options),
				await alpha.runTransactionAsync<number>(async () => ({ value: 42 }), options),
				untyped.runTransaction<number>(() => ({ value: 42 }), options),
				await untyped.runTransactionAsync<number>(async () => ({ value: 42 }), options),
				context.runTransaction<number>(() => ({ value: 42 }), options),
				await context.runTransactionAsync<number>(async () => ({ value: 42 }), options),
				// Check concrete implementation signatures too, rather than only the public interfaces.
				view.runTransaction<number>(() => ({ value: 42 }), options),
				await view.runTransactionAsync<number>(async () => ({ value: 42 }), options),
				view.checkout.runTransaction<number>(() => ({ value: 42 }), options),
				await view.checkout.runTransactionAsync<number>(async () => ({ value: 42 }), options),
			];
			type _check = requireTrue<
				areSafelyAssignable<typeof results, TransactionValueResult<number, number>[]>
			>;
			assert.deepEqual(
				results,
				results.map(() => ({ success: true, value: 42 })),
			);
			view.dispose();
		});

		it("accepts synchronous callbacks with incidental return values", () => {
			const view = getView(new TreeViewConfiguration({ schema: NodeList }));
			view.initialize([]);
			const beta = asBeta(view);
			const alpha = asAlpha(beta);
			const untyped: UntypedTreeViewAlpha = alpha;
			const context = TreeAlpha.context(view.root);
			const options = { customMetadata: { test: "incidental return values" } };
			const appended: string[] = [];
			const callback = (): number => {
				view.root.insertAtEnd("item");
				// Native push returns a number; callers need not wrap it in a value-less callback.
				return appended.push("item");
			};

			const beforeNarrowing = context.runTransaction(callback, options);
			assert(context.isView());
			const results = [
				beforeNarrowing,
				beta.runTransaction(callback),
				alpha.runTransaction(callback, options),
				untyped.runTransaction(callback, options),
				context.runTransaction(callback, options),
				view.runTransaction(callback, options),
				view.checkout.runTransaction(callback, options),
			];
			type _check = requireTrue<areSafelyAssignable<typeof results, TransactionVoidResult[]>>;
			assert.deepEqual(
				results,
				results.map(() => ({ success: true })),
			);
			assert.equal(appended.length, results.length);
			assert.deepEqual([...view.root], appended);

			// The return-discarding rule for () => void does not apply inside Promise<void>.
			async function _rejectAsyncIncidentalReturn(): Promise<void> {
				// @ts-expect-error Beta does not accept a Promise<number> callback.
				await beta.runTransactionAsync(async () => appended.push("item"));
				// @ts-expect-error Alpha must not expand the asynchronous contract.
				await alpha.runTransactionAsync(async () => appended.push("item"));
			}
			view.dispose();
		});

		for (const rollback of [false, true]) {
			it(`accepts value callbacks with unknown rollback types (rollback: ${rollback})`, async () => {
				const view = getView(new TreeViewConfiguration({ schema: NodeList }));
				view.initialize([]);
				const beta = asBeta(view);
				const alpha = asAlpha(beta);
				const untyped: UntypedTreeViewAlpha = alpha;
				const context = TreeAlpha.context(view.root);
				const options = { customMetadata: { test: "WithValue compatibility" } };
				// Structural typing permits additional properties on WithValue.
				// Keep rollback typed as unknown so the alpha status overload cannot accept this callback.
				const callback = (): WithValue<number> & { rollback: unknown } => {
					view.root.insertAtEnd("item");
					return { value: 42, rollback };
				};
				const asyncCallback = async (): Promise<WithValue<number> & { rollback: unknown }> =>
					callback();
				const beforeNarrowing = context.runTransaction<number>(callback, options);
				const asyncBeforeNarrowing = await context.runTransactionAsync<number>(
					asyncCallback,
					options,
				);
				assert(context.isView());
				// Explicit <number> selects the value-type convention, not the callback-return-type convention.
				const results = [
					beforeNarrowing,
					asyncBeforeNarrowing,
					beta.runTransaction<number>(callback),
					await beta.runTransactionAsync<number>(asyncCallback),
					alpha.runTransaction<number>(callback, options),
					await alpha.runTransactionAsync<number>(asyncCallback, options),
					untyped.runTransaction<number>(callback, options),
					await untyped.runTransactionAsync<number>(asyncCallback, options),
					context.runTransaction<number>(callback, options),
					await context.runTransactionAsync<number>(asyncCallback, options),
					view.runTransaction<number>(callback, options),
					await view.runTransactionAsync<number>(asyncCallback, options),
					view.checkout.runTransaction<number>(callback, options),
					await view.checkout.runTransactionAsync<number>(asyncCallback, options),
				];
				type _check = requireTrue<
					areSafelyAssignable<typeof results, TransactionValueResult<number, number>[]>
				>;
				assert.deepEqual(
					results,
					results.map(() => ({ success: !rollback, value: 42 })),
				);
				assert.deepEqual([...view.root], rollback ? [] : results.map(() => "item"));
				view.dispose();
			});
		}

		it("preserves generic callback forwarding and beta result types", async () => {
			const view: TreeViewAlpha<typeof NodeList> = getView(
				new TreeViewConfiguration({ schema: NodeList }),
			);
			view.initialize([]);
			const beta: UntypedTreeView = view;

			// TOut describes the entire callback result, not just its value.
			// Keeping it unresolved inside these helpers checks generic forwarding, not only concrete calls.
			// Each helper invokes the callback twice on the same view, so the cases below make no edits.
			function forward<
				TOut extends
					| TransactionCallbackStatusBeta<unknown, unknown>
					| VoidTransactionCallbackStatusBeta
					| void,
			>(callback: () => TOut) {
				const expected = beta.runTransaction<TOut>(callback);
				const actual = view.runTransaction<TOut>(callback, { customMetadata: {} });
				// Equal runtime results cannot detect type widening or narrowing; check both directions.
				type _check = requireAssignableTo<typeof actual, typeof expected>;
				type _checkReverse = requireAssignableTo<typeof expected, typeof actual>;
				assert.deepEqual(actual, expected);
				return actual;
			}

			async function forwardAsync<
				TOut extends
					| TransactionCallbackStatusBeta<unknown, unknown>
					| VoidTransactionCallbackStatusBeta
					| void,
			>(callback: () => Promise<TOut>) {
				const expected = await beta.runTransactionAsync<TOut>(callback);
				const actual = await view.runTransactionAsync<TOut>(callback, {
					customMetadata: {},
				});
				// The awaited conditional result must retain the same generic relationship as the sync API.
				type _check = requireAssignableTo<typeof actual, typeof expected>;
				type _checkReverse = requireAssignableTo<typeof expected, typeof actual>;
				assert.deepEqual(actual, expected);
				return actual;
			}

			assert.deepEqual(
				forward(() => ({ value: 42 })),
				{ success: true, value: 42 },
			);
			assert.deepEqual(await forwardAsync(async () => ({ value: 42 })), {
				success: true,
				value: 42,
			});
			assert.deepEqual(
				forward<TransactionCallbackStatusBeta<number, string>>(() => ({
					rollback: true,
					value: "cancelled",
				})),
				{ success: false, value: "cancelled" },
			);
			assert.deepEqual(
				await forwardAsync<TransactionCallbackStatusBeta<number, string>>(async () => ({
					rollback: true,
					value: "cancelled",
				})),
				{ success: false, value: "cancelled" },
			);
			assert.deepEqual(
				forward(() => {}),
				{ success: true },
			);
			assert.deepEqual(await forwardAsync(async () => {}), { success: true });
			assert.deepEqual(
				forward<VoidTransactionCallbackStatusBeta>(() => ({ rollback: true })),
				{ success: false },
			);
			assert.deepEqual(
				await forwardAsync<VoidTransactionCallbackStatusBeta>(async () => ({
					rollback: true,
				})),
				{ success: false },
			);
			view.dispose();
		});

		it("preserves existing alpha inference, explicit success/failure types, and rollback", async () => {
			const view: TreeViewAlpha<typeof NodeList> = getView(
				new TreeViewConfiguration({ schema: NodeList }),
			);
			view.initialize([]);
			// Declare different success and failure types even though this invocation always rolls back.
			// Inserting content makes the runtime assertion verify rollback, not merely the returned status.
			const callback = (): TransactionCallbackStatusAlpha<number, string> => {
				view.root.insertAtEnd("rolled back");
				return { rollback: true, value: "cancelled" };
			};
			const results = [
				view.runTransaction(callback),
				view.runTransaction<number, string>(callback),
				await view.runTransactionAsync(async () => callback()),
				await view.runTransactionAsync<number, string>(async () => callback()),
			];
			type _check = requireTrue<
				areSafelyAssignable<typeof results, TransactionValueResult<number, string>[]>
			>;
			assert.deepEqual(
				results,
				results.map(() => ({ success: false, value: "cancelled" })),
			);
			assert.deepEqual([...view.root], []);

			// A value-only callback should still infer number for both outcomes, without explicit type arguments.
			const inferred = view.runTransaction(() => ({ value: 42 }));
			const inferredAsync = await view.runTransactionAsync(async () => ({ value: 42 }));
			type _checkInferred = requireTrue<
				areSafelyAssignable<typeof inferred, TransactionValueResult<number, number>>
			>;
			type _checkInferredAsync = requireTrue<
				areSafelyAssignable<typeof inferredAsync, typeof inferred>
			>;
			assert.deepEqual(inferred, { success: true, value: 42 });
			assert.deepEqual(inferredAsync, inferred);

			// Value-less callbacks still produce valueless result types.
			const voidResults = [
				view.runTransaction(() => {}),
				view.runTransaction(() => ({ rollback: true })),
				await view.runTransactionAsync(async () => {}),
				await view.runTransactionAsync(async () => ({ rollback: true })),
			];
			type _checkVoid = requireTrue<
				areSafelyAssignable<typeof voidResults, TransactionVoidResult[]>
			>;
			assert.deepEqual(voidResults, [
				{ success: true },
				{ success: false },
				{ success: true },
				{ success: false },
			]);
			view.dispose();
		});

		it("derives value-bearing results from explicit callback-return types", async () => {
			const view: TreeViewAlpha<typeof NodeList> = getView(
				new TreeViewConfiguration({ schema: NodeList }),
			);
			view.initialize([]);

			// Explicitly select the callback-return-type overload. Structurally equivalent alpha and beta
			// callback aliases can affect overload inference, which is not what this test needs to exercise.
			async function run(callback: () => TransactionCallbackStatusBeta<number, string>) {
				const result =
					view.runTransaction<TransactionCallbackStatusBeta<number, string>>(callback);
				const asyncResult = await view.runTransactionAsync<
					TransactionCallbackStatusBeta<number, string>
				>(async () => callback());
				// The fallback conditional distributes over the callback union. With these callback types,
				// each arm infers its value type for both outcomes, yielding a union of two result types.
				// The former void overload hid the returned value instead.
				type _check = requireTrue<
					areSafelyAssignable<
						typeof result,
						TransactionValueResult<number, number> | TransactionValueResult<string, string>
					>
				>;
				type _checkAsync = requireTrue<areSafelyAssignable<typeof asyncResult, typeof result>>;
				assert.deepEqual(asyncResult, result);
				return result;
			}

			assert.deepEqual(await run(() => ({ value: 42 })), { success: true, value: 42 });
			assert.deepEqual(await run(() => ({ rollback: true, value: "cancelled" })), {
				success: false,
				value: "cancelled",
			});
			view.dispose();
		});
	});

	it("ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: SchemaFactory.required(NodeList) });
		const view = getView(config);
		view.initialize(new NodeList(["a", "b"]));
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("Implicit ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const view = getView(config);
		view.initialize(["a", "b"]);
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("ObjectRoot - Data", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: ["a", "b"] });
	});

	// This tests the two main cases for schema validation, initial trees and inserted content.
	it("default identifier with schema validation", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const view = getView(config);
		// Initialize case
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		// unhydratedFlexTreeFromInsertable skips schema validation when creating the unhydrated node since it does not have a context to opt in.
		const newNode = new HasId({});
		// This should validate the inserted content (this test is attempting to check validation is done after defaults are provided).
		view.root = newNode;
		const idFromHydration = Tree.shortId(view.root);
		assert(typeof idFromHydration === "number");
		assert(idFromInitialize !== idFromHydration);
	});

	describe("invalid default", () => {
		// Field providers are assumed to validate their content:
		// These tests use internal APIs to construct an intentionally invalid one to slip out of schema data into the flex tree.
		const numberProvider: ConstantFieldProvider = (): UnhydratedFlexTreeNode[] => [
			// The schema listed here is intentionally incorrect,
			// it should be a string given how this field is used below.
			unhydratedFlexTreeFromInsertable(5, schema.number),
		];

		class InvalidDefault extends schema.object("hasID", {
			id: createFieldSchema(FieldKind.Identifier, schema.string, {
				defaultProvider: getDefaultProvider(numberProvider),
			}),
		}) {}

		const config = new TreeViewConfiguration({
			schema: InvalidDefault,
			enableSchemaValidation: true,
		});

		it("invalid default - initialize", () => {
			const view = getView(config);
			assert.throws(
				() => view.initialize({}),
				validateUsageError(/A node type is not allowed in its field/),
			);
		});

		it("invalid default - insert", () => {
			const view = getView(config);
			view.initialize({ id: "x" });

			const newNode = new InvalidDefault({});
			// This should validate the inserted content (this test is attempting to check validation is done after defaults are provided).
			assert.throws(
				() => {
					view.root = newNode;
				},
				validateUsageError(/A node type is not allowed in its field/),
			);
		});
	});

	it("custom identifier copied from tree", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const treeSrc = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const view = treeSrc.viewWith(config);
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		const treeDst = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const viewDst = treeDst.viewWith(config);
		viewDst.initialize({});
		const newNode = new HasId({ id: view.root.id });
		const idFromUnhydrated = Tree.shortId(newNode);
		viewDst.root = newNode;
		const idFromHydrated = Tree.shortId(newNode);
		assert.equal(idFromUnhydrated, idFromHydrated);
	});

	it("viewWith twice errors", () => {
		class Empty extends schema.object("Empty", {}) {}
		const config = new TreeViewConfiguration({ schema: Empty });
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const view = tree.viewWith(config);
		assert.throws(
			() => {
				const view2 = tree.viewWith(config);
			},
			validateUsageError(/second tree view/),
		);
	});

	it("accessing view.root does not leak LazyEntities", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: [] });
		const _unused = view.root;
		const context = view.getFlexTreeContext();
		const countBefore = context.withAnchors.size;
		for (let index = 0; index < 10; index++) {
			const _unused2 = view.root;
		}
		const countAfter = context.withAnchors.size;

		assert.equal(countBefore, countAfter);
	});

	it("accessing root via Tree.parent does not leak LazyEntities", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: [] });
		const child = view.root.stuff;
		Tree.parent(child);
		const context = view.getFlexTreeContext();
		const countBefore = context.withAnchors.size;
		for (let index = 0; index < 10; index++) {
			Tree.parent(child);
		}
		const countAfter = context.withAnchors.size;

		assert.equal(countBefore, countAfter);
	});

	it("ObjectRoot - unhydrated", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize(new Canvas({ stuff: ["a", "b"] }));
	});

	it("Union Root", () => {
		const config = new TreeViewConfiguration({ schema: [schema.string, schema.number] });
		const view = getView(config);
		view.initialize("a");
		assert.equal(view.root, "a");
	});

	it("optional Root - initialized to undefined", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		// Note: the tree's schema hasn't been initialized at this point, so even though the view schema
		// allows an optional field, explicit initialization must occur.
		assert.throws(
			() => view.root,
			/TreeView\.root is unavailable because the view schema is incompatible with the stored schema\. The document is uninitialized; call TreeView\.initialize\(\)/,
		);
		view.initialize(undefined);
		assert.equal(view.root, undefined);
	});

	it("optional Root - initializing only schema", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		view.upgradeSchema();
		assert.equal(view.root, undefined);
	});

	it("optional Root - full", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		view.initialize("x");
		assert.equal(view.root, "x");
	});

	it("Nested list", () => {
		const nestedList = schema.array(schema.array(schema.string));
		const config = new TreeViewConfiguration({ schema: nestedList });
		const view = getView(config);
		view.initialize([["a"]]);
		assert.equal(view.root?.length, 1);
		const child = view.root[0];
		assert.equal(child.length, 1);
		const child2 = child[0];
		assert.equal(child2, "a");
	});

	describe("field defaults", () => {
		it("initialize with identifier to unpopulated identifier fields.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ identifier: undefined });
			assert.equal(view.root.identifier, "beefbeef-beef-4000-8000-000000000001");
		});

		it("adds identifier to unpopulated identifier fields.", () => {
			class SchemaWithIdentifier extends schema.object("parent", {
				identifier: schema.identifier,
			}) {}
			const config = new TreeViewConfiguration({
				schema: SchemaFactory.optional(SchemaWithIdentifier),
			});
			const view = getView(config);
			view.initialize(undefined);
			const toHydrate = new SchemaWithIdentifier({ identifier: undefined });

			view.root = toHydrate;
			assert.equal(toHydrate, view.root);
			assert.equal(toHydrate.identifier, "beefbeef-beef-4000-8000-000000000002");

			view.root = { identifier: undefined };
			assert.equal(view.root?.identifier, "beefbeef-beef-4000-8000-000000000004");
		});

		it("populates field when no field defaulter is provided.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				testOptionalField: schema.optional(schema.string),
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ testOptionalField: undefined });
			assert.equal(view.root.testOptionalField, undefined);
		});

		// TODO: Identifier roots should be able to be defaulted, but currently throw a usage error.
		it.skip("adds identifier to unpopulated root", () => {
			const config = new TreeViewConfiguration({ schema: schema.identifier });
			const view = getView(config);
			view.initialize(undefined);
			assert.equal(view.root, "beefbeef-beef-4000-8000-000000000001");
		});
	});

	describe("Serialized changes", () => {
		it("can be applied to a different branch", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			assert(change !== undefined);
			viewA.applyChange(change);
			assert.equal(viewA.root, 4);
		});

		it("fail to apply to a branch in another session", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = getView(config);
			viewB.initialize(3);

			let change: JsonCompatibleReadOnly | undefined;
			viewA.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});
			viewA.root = 4;

			const c = change ?? assert.fail("change not captured");
			assert.throws(() => {
				viewB.applyChange(c);
			}, /cannot apply change.*same sharedtree/i);
		});

		it("error if malformed", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config, { jsonValidator: FormatValidatorBasic });
			viewA.initialize(3);
			let change: JsonCompatibleReadOnly | undefined;
			viewA.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});
			viewA.root = 4;

			const valid = change ?? assert.fail("change not captured");
			assert(
				typeof valid === "object" && valid !== null && !Array.isArray(valid),
				"Expected serialized change to be an object",
			);
			const serialized = valid as JsonCompatibleReadOnlyObject;
			const malformed: JsonCompatibleReadOnly[] = [
				// The value does not use the serialized change envelope.
				{ invalid: "bogus" },
				// The version is not supported.
				{ ...serialized, version: 3 },
				// The revision is neither a local revision number nor the root revision.
				{ ...serialized, revision: "invalid" },
				// The encoded change does not match the change-family schema.
				{ ...serialized, change: "invalid" },
				// Custom metadata must be an encoded metadata tree.
				{ ...serialized, customMetadata: [] },
				// The envelope does not permit additional properties.
				{ ...serialized, extra: true },
			];

			for (const invalid of malformed) {
				const target = viewA.fork();
				assert.throws(
					() => target.applyChange(invalid),
					validateUsageError(/Encoded data does not match the expected schema/),
				);
			}

			const semanticTarget = viewA.fork();
			// The originator ID is not a stable ID.
			assert.throws(
				() => semanticTarget.applyChange({ ...serialized, originatorId: "invalid" }),
				validateUsageError(/Invalid serialized change format/),
			);
		});

		it("can be undone", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let revertible: Revertible | undefined;
			viewA.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				revertible = metadata.getRevertible();
			});
			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			assert(change !== undefined);
			viewA.applyChange(change);
			assert(revertible !== undefined);
			revertible.revert();
			assert.equal(viewA.root, 3);
		});

		it("can apply alongside a transaction", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			viewA.runTransaction(() => {
				assert(change !== undefined);
				viewA.applyChange(change);
			});
			assert.equal(viewA.root, 4);
		});

		it("apply before transactions", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			viewA.runTransaction(() => {
				viewA.root = 5;
				assert(change !== undefined);
				// Even though the serialized change (= 4) is applied _after_ the transaction change (= 5),
				// it is considered a change external to the transaction and so will be applied before the transaction changes,
				// as is the general policy for external changes applied during a transaction.
				viewA.applyChange(change);
			});
			assert.equal(viewA.root, 5);
		});
	});

	describe("computeNetChangeIfRebasedOnto", () => {
		const scenarios = [
			{ editSource: false, editTarget: false },
			{ editSource: true, editTarget: false },
			{ editSource: false, editTarget: true },
			{ editSource: true, editTarget: true },
		];
		for (const { editSource, editTarget } of scenarios) {
			it(`when source branch is ${editSource ? "edited" : "not edited"} and target branch is ${
				editTarget ? "edited" : "not edited"
			}`, () => {
				const config = new TreeViewConfiguration({ schema: StringArray });
				const targetView = getView(config);
				targetView.initialize([]);
				const sourceView = targetView.fork();

				if (editSource) {
					sourceView.root.insertAtEnd("source edit");
				}
				if (editTarget) {
					targetView.root.insertAtEnd("target edit");
				}
				const rebasedView = getViewForForkedBranch(sourceView).forkView;
				const appliedView = getViewForForkedBranch(sourceView).forkView;

				rebasedView.rebaseOnto(targetView);

				// Validating the output of `computeNetChangeIfRebasedOnto` directly would make the test brittle since the internals of the format are implementation details.
				// Instead, we apply the net change to the applied view and then compare the resulting state to the rebased view to ensure they are equivalent.
				const netChange = appliedView.computeNetChangeIfRebasedOnto(targetView);
				if (netChange !== undefined) {
					appliedView.applyChange(netChange);
				}

				assert.deepEqual([...appliedView.root], [...rebasedView.root]);
			});
		}
	});

	describe("isMissingEditsFrom", () => {
		it("returns false when the branches are equivalent", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			assert.equal(viewA.isMissingEditsFrom(viewB), false);
			assert.equal(viewB.isMissingEditsFrom(viewA), false);
		});

		it("returns false when only 'this' branch is ahead", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewB.root = 4;
			assert.equal(viewB.isMissingEditsFrom(viewA), false);
		});

		it("returns true when only the other branch is ahead", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewB.root = 4;
			assert.equal(viewA.isMissingEditsFrom(viewB), true);
		});

		it("returns true when both branches are diverged", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewA.root = 4;
			viewB.root = 4;
			assert.equal(viewA.isMissingEditsFrom(viewB), true);
			assert.equal(viewB.isMissingEditsFrom(viewA), true);
		});
	});

	describe("rewindTo", () => {
		it("is not allowed on a shared branch", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");

			assert.throws(
				() => view.rewindTo(revision1),
				/Cannot switch a view away from a shared branch/,
			);
		});

		it("rewinds the view", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			view.root = 2;

			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;

			const revision2 = fork.branchHistory.getHead()?.revision;
			assert(revision2 !== undefined, "revision should be defined");
			fork.root = 3;
			fork.root = 4;

			// Consistency check
			assert.equal(fork.branchHistory.length, 4);

			// Act
			fork.rewindTo(revision2);

			// Verify
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 2);

			// Act
			fork.rewindTo(revision1);

			// Verify
			assert.equal(fork.branchHistory.length, 1);
			assert.equal(fork.root, 1);
		});

		it("new edits can be made after rewinding", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;

			const revision1 = fork.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			fork.root = 2;

			fork.rewindTo(revision1);
			assert.equal(fork.branchHistory.length, 1);

			// Act
			fork.root = 42;

			// Verify
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 42);
		});

		it("new edits made after rewinding do not affect the original branch", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;
			const revision1 = fork.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			fork.root = 2;

			const branchBeforeRewind = fork.checkout.mainBranch;

			fork.rewindTo(revision1);

			// Act
			fork.root = 42;
			fork.root = 43;
			fork.root = 44;

			// Verify
			assert(fork.checkout instanceof TreeCheckout);
			fork.checkout.switchBranch(branchBeforeRewind);
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 2);
		});
	});

	describe("revertTo", () => {
		it("restores the state of the given revision with a new commit", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: StringArray });
			const view = getView(config);
			view.initialize([]);

			const commit1 = view.branchHistory.getHead();
			assert(commit1 !== undefined, "commit should be defined");
			// Test with some changes made outside of a transaction
			view.root.insertAtEnd("A");
			const commit2 = view.branchHistory.getHead();
			assert(commit2 !== undefined, "commit should be defined");
			// Test with some changes made in a transaction
			view.runTransaction(() => {
				view.root.insertAtEnd("B");
			});
			view.runTransaction(() => {
				view.root.insertAtEnd("C");
			});
			const commit4 = view.branchHistory.getHead();
			assert(commit4 !== undefined, "commit should be defined");

			// Consistency check
			assert.equal(view.branchHistory.length, 4);

			// Act
			assert(commit2.revertTo !== undefined);
			commit2.revertTo();

			const commit5 = view.branchHistory.getHead();
			assert(commit5 !== undefined, "commit should be defined");

			// Verify
			assert.deepEqual([...view.root], ["A"]);
			assert.equal(view.branchHistory.length, 5);

			// Act
			assert(commit1.revertTo !== undefined);
			commit1.revertTo();

			// Verify
			assert.deepEqual([...view.root], []);
			assert.equal(view.branchHistory.length, 6);

			// Act
			assert(commit5.revertTo !== undefined);
			commit5.revertTo();

			// Verify
			assert.deepEqual([...view.root], ["A"]);
			assert.equal(view.branchHistory.length, 7);

			// Act
			assert(commit4.revertTo !== undefined);
			commit4.revertTo();

			// Verify
			assert.deepEqual([...view.root], ["A", "B", "C"]);
			assert.equal(view.branchHistory.length, 8);
		});

		it("rejects reverting a transaction containing schema and data changes on a local branch", () => {
			const originalConfig = new TreeViewConfiguration({ schema: schema.number });
			const originalView = getView(originalConfig);
			originalView.initialize(1);
			const revision = originalView.branchHistory.getHead()?.revision;
			assert(revision !== undefined, "revision should be defined");

			const upgradedView = originalView.checkout.fork().viewWith(
				new TreeViewConfiguration({
					schema: [schema.number, schema.string],
				}),
			);
			const commit = upgradedView.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);
			upgradedView.runTransaction(() => {
				upgradedView.upgradeSchema();
				upgradedView.root = "upgraded";
			});
			const schemaRevision = upgradedView.branchHistory.getHead()?.revision;
			assert(schemaRevision !== undefined, "revision should be defined");

			assert.equal(commit.revertTo, undefined);
			assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
			assert.throws(
				() => upgradedView.revertTo(revision),
				validateUsageError(
					`Cannot revert to revision ${revision} because the schema changed at intermediate commit ${schemaRevision}.`,
				),
			);
		});

		it("rejects reverting across a schema upgrade on a shared branch", () => {
			const originalConfig = new TreeViewConfiguration({ schema: schema.number });
			const upgradedConfig = new TreeViewConfiguration({
				schema: [schema.number, schema.string],
			});
			const provider = new TestTreeProviderLite(2);
			const [treeA, treeB] = provider.trees;
			const originalViewA = treeA.kernel.viewWith(originalConfig);
			const viewB = treeB.kernel.viewWith(upgradedConfig);
			originalViewA.initialize(1);
			provider.synchronizeMessages();

			const commit = originalViewA.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);
			originalViewA.dispose();

			const upgradedViewA = treeA.kernel.viewWith(upgradedConfig);
			upgradedViewA.upgradeSchema();
			const schemaRevision = upgradedViewA.branchHistory.getHead()?.revision;
			assert(schemaRevision !== undefined, "revision should be defined");
			assert.equal(upgradedViewA.compatibility.isEquivalent, true);
			upgradedViewA.root = "upgraded";
			provider.synchronizeMessages();
			assert.equal(upgradedViewA.root, "upgraded");
			assert.equal(viewB.compatibility.isEquivalent, true);
			assert.equal(viewB.root, "upgraded");
			assert.equal(commit.revertTo, undefined);
			assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
			assert.throws(
				() => upgradedViewA.revertTo(commit.revision),
				validateUsageError(
					`Cannot revert to revision ${commit.revision} because the schema changed at intermediate commit ${schemaRevision}.`,
				),
			);
			provider.synchronizeMessages();
			assert.equal(viewB.compatibility.isEquivalent, true);
			assert.equal(viewB.root, "upgraded");
		});

		it("can revert all data changes back to the most recent schema-changing commit", () => {
			const originalView = getView(new TreeViewConfiguration({ schema: schema.number }));
			originalView.initialize(1);
			const upgradedView = originalView.checkout
				.fork()
				.viewWith(new TreeViewConfiguration({ schema: [schema.number, schema.string] }));
			upgradedView.runTransaction(() => {
				upgradedView.upgradeSchema();
				upgradedView.root = "upgraded";
			});
			const schemaCommit = upgradedView.branchHistory.getHead();
			assert(schemaCommit !== undefined);
			const upgradedSchema = upgradedView.checkout.storedSchema.clone();
			upgradedView.root = "edited";

			assert(schemaCommit.revertTo !== undefined);
			schemaCommit.revertTo();

			assert.equal(upgradedView.root, "upgraded");
			expectSchemaEqual(upgradedView.checkout.storedSchema, upgradedSchema);
		});

		it("is a no-op when given the revision of the head commit, even if it contains schema changes", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const commit = view.branchHistory.getHead();
			assert(commit !== undefined);

			// Act
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);
			revertTo();
			assert.throws(() => revertTo(), validateUsageError(/more than once/));
			assert(commit.revertTo !== undefined);
			commit.revertTo();

			// Verify
			assert.equal(view.root, 1);
			assert.equal(view.branchHistory.length, 1);
		});

		it("produces a commit which can be reverted", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const commit1 = view.branchHistory.getHead();
			assert(commit1 !== undefined);
			view.root = 2;
			view.root = 3;
			const revertTo = commit1.revertTo;
			assert(revertTo !== undefined);

			const revertibles: Revertible[] = [];
			const unsubscribe = view.events.on("changed", (_, getRevertible) => {
				assert.equal(commit1.revertTo, undefined);
				assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
				if (getRevertible !== undefined) {
					revertibles.push(getRevertible());
				}
			});

			assert(commit1.revertTo !== undefined);
			commit1.revertTo();
			unsubscribe();
			assert(commit1.revertTo !== undefined);

			assert.equal(view.root, 1);
			assert.equal(revertibles.length, 1);
			assert.equal(view.branchHistory.length, 4);

			// Act
			revertibles[0]?.revert();

			// Verify
			assert.equal(view.root, 3);
			assert.equal(view.branchHistory.length, 5);
		});

		it("throws when the revision is not on the current branch", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			const fork = view.fork();
			fork.initialize(1);
			const forkRevision = fork.branchHistory.getHead()?.revision;
			assert(forkRevision !== undefined, "revision should be defined");

			assert.throws(
				() => view.revertTo(forkRevision),
				validateUsageError(/No commit found with revision/),
			);
		});

		it("rejects a missing revision as soon as a schema change is encountered", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const revision = view.branchHistory.getHead()?.revision;
			assert(revision !== undefined, "revision should be defined");
			const fork = view.fork();
			fork.root = 2;
			const forkRevision = fork.branchHistory.getHead()?.revision;
			assert(forkRevision !== undefined, "revision should be defined");

			assert.throws(
				() => view.revertTo(forkRevision),
				validateUsageError(
					`Cannot revert to revision ${forkRevision} because the schema changed at intermediate commit ${revision}.`,
				),
			);
		});

		it("reverts on the originating branch after a rebase", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const fork = view.fork();
			fork.root = 2;
			const commit = fork.branchHistory.getHead();
			fork.root = 4;
			view.root = 3;

			fork.rebaseOnto(view);
			assert(commit?.revertTo !== undefined);
			commit.revertTo();

			assert.equal(fork.root, 2);
			assert.equal(view.root, 3);
		});

		it("rejects a commit obtained from a branch that has been replaced", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const fork = view.fork();
			const commit = fork.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);
			fork.rewindTo(commit.revision);

			assert.equal(commit.revertTo, undefined);
			assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
		});

		it("rejects a saved revert method after an ordinary edit while allowing a fresh method", () => {
			const view = getView(new TreeViewConfiguration({ schema: schema.number }));
			view.initialize(1);
			const commit = view.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);

			view.root = 2;

			const freshRevertTo = commit.revertTo;
			assert(freshRevertTo !== undefined);
			assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
			assert.equal(view.root, 2);
			assert.equal(view.branchHistory.length, 2);

			freshRevertTo();
			assert.equal(view.root, 1);
			assert.equal(view.branchHistory.length, 3);
		});

		it("temporarily disallows reverting during a transaction", () => {
			const view = getView(new TreeViewConfiguration({ schema: schema.number }));
			view.initialize(1);
			const commit = view.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);

			view.runTransaction(() => {
				assert.equal(commit.revertTo, undefined);
				assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
			});

			assert(commit.revertTo !== undefined);
		});

		it("disallows reverting after the branch is disposed", () => {
			const view = getView(new TreeViewConfiguration({ schema: schema.number }));
			view.initialize(1);
			const fork = view.fork();
			const commit = fork.branchHistory.getHead();
			assert(commit !== undefined);
			const revertTo = commit.revertTo;
			assert(revertTo !== undefined);

			fork.dispose();

			assert.equal(commit.revertTo, undefined);
			assert.throws(() => revertTo(), validateUsageError(/branch has changed/));
		});

		it("overwrites concurrent changes that are sequenced before it when they affect the same part of the tree", () => {
			// Setup: two clients viewing the same tree.
			const config = new TreeViewConfiguration({ schema: schema.number });
			const provider = new TestTreeProviderLite(2);
			const [treeA, treeB] = provider.trees;
			const viewA = treeA.kernel.viewWith(config);
			const viewB = treeB.kernel.viewWith(config);
			viewA.initialize(1);
			provider.synchronizeMessages();

			const commit1 = viewA.branchHistory.getHead();
			assert(commit1 !== undefined);
			viewA.root = 2;
			provider.synchronizeMessages();

			// Consistency check
			assert.equal(viewA.root, 2);
			assert.equal(viewB.root, 2);

			// Act:
			// Client B edits the root, and client A reverts back to revision1.
			// The provider sequences ops in the order of submission, so B's edit is sequenced before A's revert.
			viewB.root = 3;
			assert(commit1.revertTo !== undefined);
			commit1.revertTo();

			// Both clients optimistically see their own change before sequencing.
			assert.equal(viewA.root, 1);
			assert.equal(viewB.root, 3);

			provider.synchronizeMessages();

			// Verify:
			// Because the revert affects the same part of the tree as the concurrent change,
			// and because it is sequenced after it, the revert overwrites the concurrent change.
			assert.equal(viewA.root, 1);
			assert.equal(viewB.root, 1);
		});

		it("does not overwrite concurrent changes that are sequenced before it when they affect a different part of the tree", () => {
			// Setup: two clients viewing the same tree.
			// Unlike the test above, this schema has two independent fields, which allows the
			// concurrent change to target a different part of the tree than the revert does.
			class Pair extends schema.object("Pair", {
				foo: schema.number,
				bar: schema.number,
			}) {}
			const config = new TreeViewConfiguration({ schema: Pair });
			const provider = new TestTreeProviderLite(2);
			const [treeA, treeB] = provider.trees;
			const viewA = treeA.kernel.viewWith(config);
			const viewB = treeB.kernel.viewWith(config);
			viewA.initialize({ foo: 1, bar: 1 });
			provider.synchronizeMessages();

			const commit1 = viewA.branchHistory.getHead();
			assert(commit1 !== undefined);
			viewA.root.foo = 2;
			provider.synchronizeMessages();

			// Consistency check
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [2, 1]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [2, 1]);

			// Act:
			// Client B edits `bar`, and client A reverts back to revision1 (which only affects `foo`).
			// The provider sequences ops in the order of submission, so B's edit is sequenced before A's revert.
			viewB.root.bar = 3;
			assert(commit1.revertTo !== undefined);
			commit1.revertTo();

			// Both clients optimistically see their own change before sequencing.
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [1, 1]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [2, 3]);

			provider.synchronizeMessages();

			// Verify:
			// The revert only affects `foo`, so the concurrent change to `bar` is preserved.
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [1, 3]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [1, 3]);
		});
	});
});
