/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { done, takeAsync } from "@fluid-private/stochastic-test-utils";
import { type DDSFuzzHarnessEvents, createDDSFuzzSuite } from "@fluid-private/test-dds-utils";

import { TreeStoredSchemaRepository } from "../../../core/index.js";
import { SchemaFactory, toInitialSchema } from "../../../simple-tree/index.js";
import {
	createTestUndoRedoStacks,
	expectSchemaEqual,
	validateFuzzTreeConsistency,
} from "../../utils.js";

import { baseTreeModel } from "./baseModel.js";
import {
	type FuzzTestState,
	type FuzzView,
	makeTreeEditGenerator,
	simpleSchemaFromStoredSchema,
	viewFromState,
} from "./fuzzEditGenerators.js";
import {
	applyFieldEdit,
	applyForkMergeOperation,
	applySchemaOp,
	applyTransactionBoundary,
} from "./fuzzEditReducers.js";
import {
	createTreeViewSchema,
	deterministicIdCompressorFactory,
	generateGuidNodeSchemas,
} from "./fuzzUtils.js";
import { type GeneratedFuzzNode, GeneratedFuzzValueType } from "./operationTypes.js";

/**
 * This suite validates the behavior of schema upgrades in the fuzz test harness.
 *
 * The regression tests here protect against errors in test code.
 * This helps ensure that fuzz tests elsewhere provide appropriate coverage of schema upgrades.
 */
describe("Schema upgrade fuzz test harness correctness", () => {
	it("rejects node identifiers outside the supported namespaces", () => {
		for (const nodeType of ["upgrade", "otherNamespace.upgrade"]) {
			assert.throws(
				() => generateGuidNodeSchemas([nodeType]),
				/Expected a treeFuzz or built-in leaf schema identifier/,
			);
		}
	});

	it("rejects unsupported namespaces when reconstructing stored schemas", () => {
		for (const scope of ["otherNamespace", "treeFuzzUnexpected"]) {
			const schemaFactory = new SchemaFactory(scope);
			const schema = schemaFactory.object("upgrade", { value: schemaFactory.string });
			const storedSchema = new TreeStoredSchemaRepository(toInitialSchema(schema));
			assert.throws(
				() => simpleSchemaFromStoredSchema(storedSchema),
				/Expected a treeFuzz or built-in leaf schema identifier/,
			);
		}
	});

	it("deduplicates qualified node identifiers and excludes structural and built-in types", () => {
		const schemas = generateGuidNodeSchemas([
			"treeFuzz.upgrade",
			"treeFuzz.upgrade",
			"treeFuzz.node",
			"treeFuzz.arrayChildren",
			"com.fluidframework.leaf.string",
			"com.fluidframework.leaf.number",
			"com.fluidframework.leaf.handle",
		]);
		assert.deepEqual(
			schemas.map((schema) => schema.identifier),
			["treeFuzz.upgrade"],
		);
	});

	function setValue(view: FuzzView, value: GeneratedFuzzNode): void {
		applyFieldEdit(view, {
			type: "fieldEdit",
			parentNodePath: undefined,
			change: { type: "optional", edit: { type: "set", value } },
		});
	}

	function synchronizeAndCheckViews(state: FuzzTestState): void {
		state.containerRuntimeFactory.processAllMessages();
		for (const client of [...state.clients, state.summarizerClient]) {
			const view = viewFromState(state, client);
			assert.equal(view.compatibility.isEquivalent, true);
			expectSchemaEqual(toInitialSchema(view.config.schema), view.checkout.storedSchema);
			validateFuzzTreeConsistency(state.clients[0], client);
		}
	}

	function scenario(name: string, run: (state: FuzzTestState) => void): void {
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (state: FuzzTestState) => {
			state.client = state.clients[0];
			state.random.handle = () => state.client.channel.handle;
			run(state);
		});
		createDDSFuzzSuite(
			{
				...baseTreeModel,
				workloadName: name,
				generatorFactory: () =>
					takeAsync(1, async () => ({ type: "synchronizeTrees" as const })),
			},
			{
				defaultTestCount: 1,
				numberOfClients: 2,
				detachedStartOptions: { numOpsBeforeAttach: 0 },
				rollbackProbability: 0,
				emitter,
				idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
			},
		);
	}

	scenario(
		"schema upgrades retain the root checkout without creating a transaction",
		(state) => {
			const checkout = viewFromState(state).checkout;
			applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
			assert.equal(state.transactionViews?.has(state.client.channel) ?? false, false);
			assert.equal(viewFromState(state).checkout, checkout);
			assert.equal(viewFromState(state).compatibility.isEquivalent, true);
			applySchemaOp(state, { type: "schemaChange", contents: { type: "secondUpgrade" } });
			assert.equal(viewFromState(state).checkout, checkout);
		},
	);

	scenario("schema upgrades add only the requested node type", (state) => {
		const checkout = viewFromState(state).checkout;
		const originalTypes = [...checkout.storedSchema.nodeSchema.keys()];
		applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
		assert.deepEqual(
			[...checkout.storedSchema.nodeSchema.keys()].sort(),
			[...originalTypes, "treeFuzz.upgrade"].sort(),
		);
	});

	scenario("remote upgrades reconstruct string-valued GUID schemas", (state) => {
		const originalRemoteView = viewFromState(state, state.clients[1]);
		applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
		applyFieldEdit(viewFromState(state), {
			type: "fieldEdit",
			parentNodePath: undefined,
			change: {
				type: "optional",
				edit: {
					type: "set",
					value: {
						type: GeneratedFuzzValueType.GUIDNode,
						value: { guid: "treeFuzz.upgrade" },
					},
				},
			},
		});
		state.containerRuntimeFactory.processAllMessages();
		const remoteView = viewFromState(state, state.clients[1]);
		assert.notEqual(remoteView, originalRemoteView);
		assert.equal(originalRemoteView.disposed, true);
		assert.equal(remoteView.checkout, originalRemoteView.checkout);
		assert.equal(remoteView.checkout.disposed, false);
		assert.equal(remoteView.compatibility.isEquivalent, true);
		validateFuzzTreeConsistency(state.clients[0], state.clients[1]);
	});

	scenario("stored GUID schemas round-trip without changing their value type", (state) => {
		const checkout = viewFromState(state).checkout;
		const schemaFactory = new SchemaFactory("treeFuzz");
		// Construct the expected schema independently of the helper used during reconstruction.
		const expectedSchema = toInitialSchema(
			createTreeViewSchema(
				[
					"upgrade",
					"nodeUpgrade",
					"arrayChildrenUpgrade",
				].map((name) =>
					schemaFactory.object(name, {
						value: schemaFactory.required(schemaFactory.string),
					}),
				),
			),
		);
		checkout.updateSchema(expectedSchema);
		expectSchemaEqual(
			toInitialSchema(simpleSchemaFromStoredSchema(checkout.storedSchema)),
			expectedSchema,
		);
	});

	scenario(
		"incompatible fork views are rejected without replacing or disposing their checkout",
		(state) => {
			applyForkMergeOperation(state, {
				type: "forkMergeOperation",
				contents: { type: "fork", branchNumber: undefined },
			});
			const fork = viewFromState(state, state.client, 0);
			fork.checkout.updateSchema(
				toInitialSchema(
					createTreeViewSchema(generateGuidNodeSchemas(["treeFuzz.forkUpgrade"])),
				),
			);
			const head = fork.branchHistory.getHead()?.revision;
			assert.equal(fork.checkout.transaction.size, 0);
			assert.throws(
				() => viewFromState(state, state.client, 0),
				/Cannot replace a view on a non-shared checkout/,
			);
			assert.equal(state.forkedViews?.get(state.client.channel)?.[0], fork);
			assert.equal(fork.disposed, false);
			assert.equal(fork.checkout.disposed, false);
			assert.equal(fork.branchHistory.getHead()?.revision, head);
			assert.equal(viewFromState(state).compatibility.isEquivalent, true);
		},
	);

	scenario(
		"fork edits use the selected fork's schema rather than the client's schema",
		(state) => {
			applyForkMergeOperation(state, {
				type: "forkMergeOperation",
				contents: { type: "fork", branchNumber: undefined },
			});
			const fork = viewFromState(state, state.client, 0);
			applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
			assert.equal(viewFromState(state, state.client, 0), fork);
			assert.equal(fork.compatibility.isEquivalent, true);
			const generate = makeTreeEditGenerator({
				set: 1,
				fieldSelection: { optional: 1, required: 1, sequence: 0, recurse: 1 },
			});
			let forkEdits = 0;
			for (let i = 0; i < 100; i++) {
				const operation = generate(state);
				assert.notEqual(operation, done);
				assert(operation !== done);
				if (operation.forkedViewIndex !== undefined) {
					forkEdits++;
					applyFieldEdit(
						viewFromState(state, state.client, operation.forkedViewIndex),
						operation.edit,
					);
				}
			}
			assert(forkEdits > 0);
		},
	);

	scenario(
		"a transaction after a schema upgrade can abort without disposing the client",
		(state) => {
			applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
			const checkout = viewFromState(state).checkout;
			applyTransactionBoundary(state, "start");
			applyFieldEdit(viewFromState(state), {
				type: "fieldEdit",
				parentNodePath: undefined,
				change: {
					type: "optional",
					edit: { type: "set", value: { type: GeneratedFuzzValueType.Number, value: 42 } },
				},
			});
			applyTransactionBoundary(state, "abort");
			assert.equal(checkout.disposed, false);
			assert.equal(viewFromState(state).checkout, checkout);
			assert.equal(viewFromState(state).root, undefined);
			assert.equal(viewFromState(state).compatibility.isEquivalent, true);
		},
	);

	scenario(
		"mid-transaction schema operations fail before changing the harness state",
		(state) => {
			applyTransactionBoundary(state, "start");
			const view = viewFromState(state);
			const originalSchema = view.checkout.storedSchema.clone();
			assert.throws(
				() => applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } }),
				/Schema operations require a root view without a pending transaction/,
			);
			assert.equal(viewFromState(state), view);
			assert.equal(view.disposed, false);
			assert.equal(view.checkout.disposed, false);
			expectSchemaEqual(view.checkout.storedSchema, originalSchema);
			assert.equal(view.checkout.transaction.size, 1);
			applyTransactionBoundary(state, "abort");
		},
	);

	scenario("schema upgrades preserve existing detached content", (state) => {
		const checkout = viewFromState(state).checkout;
		setValue(viewFromState(state), { type: GeneratedFuzzValueType.Number, value: 42 });
		applyFieldEdit(viewFromState(state), {
			type: "fieldEdit",
			parentNodePath: undefined,
			change: { type: "optional", edit: { type: "clear" } },
		});
		const removed = checkout.getRemovedRoots();
		assert(removed.length > 0);
		applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
		assert.deepEqual(checkout.getRemovedRoots(), removed);
		synchronizeAndCheckViews(state);
	});

	scenario("legacy undo across a schema change drops the inverse data edit", (state) => {
		const { undoStack, unsubscribe } = createTestUndoRedoStacks(
			viewFromState(state).checkout.events,
		);
		setValue(viewFromState(state), { type: GeneratedFuzzValueType.Number, value: 42 });
		const undo = undoStack.pop();
		assert(undo !== undefined);
		applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
		undo.revert();
		synchronizeAndCheckViews(state);
		assert.equal(viewFromState(state).root, 42);
		unsubscribe();
	});

	for (const boundary of ["commit", "abort"] as const) {
		scenario(`remote schema changes while a data transaction later ${boundary}s`, (state) => {
			applyTransactionBoundary(state, "start");
			setValue(viewFromState(state), { type: GeneratedFuzzValueType.Number, value: 42 });
			state.client = state.clients[1];
			applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
			state.containerRuntimeFactory.processAllMessages();
			state.client = state.clients[0];
			applyTransactionBoundary(state, boundary);
			synchronizeAndCheckViews(state);
			// The rebasing policy drops concurrent data rebased over a schema change.
			assert.equal(viewFromState(state).root, undefined);
		});
	}

	scenario(
		"a schema upgrade dropped over concurrent data refreshes the client's view",
		(state) => {
			setValue(viewFromState(state), { type: GeneratedFuzzValueType.Number, value: 42 });
			state.client = state.clients[1];
			applySchemaOp(state, { type: "schemaChange", contents: { type: "upgrade" } });
			setValue(viewFromState(state), {
				type: GeneratedFuzzValueType.GUIDNode,
				value: { guid: "treeFuzz.upgrade" },
			});
			synchronizeAndCheckViews(state);
			assert.equal(viewFromState(state).root, 42);
			const nodeTypes: readonly string[] = [
				...viewFromState(state).checkout.storedSchema.nodeSchema.keys(),
			];
			assert.equal(nodeTypes.includes("treeFuzz.upgrade"), false);
		},
	);
});
