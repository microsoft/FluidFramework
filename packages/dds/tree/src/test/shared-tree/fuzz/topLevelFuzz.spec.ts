/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AsyncGenerator,
	makeRandom,
	performFuzzActionsAsync,
	SaveInfo,
} from "@fluid-internal/stochastic-test-utils";
import { JsonableTree, fieldSchema, SchemaData, rootFieldKey } from "../../../core";
import { FieldKinds, namedTreeSchema } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TestTreeProvider, SummarizeType, initializeTestTree } from "../../utils";
import { FuzzTestState, makeOpGenerator, Operation } from "./fuzzEditGenerators";
import { checkTreesAreSynchronized, fuzzReducer } from "./fuzzEditReducers";
import { runFuzzBatch } from "./fuzzUtils";

const initialTreeState: JsonableTree = {
	type: brand("Node"),
	fields: {
		foo: [
			{ type: brand("Number"), value: 0 },
			{ type: brand("Number"), value: 1 },
			{ type: brand("Number"), value: 2 },
		],
		foo2: [
			{ type: brand("Number"), value: 0 },
			{ type: brand("Number"), value: 1 },
			{ type: brand("Number"), value: 2 },
		],
	},
};

const rootFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: brand("TestValue"),
	extraLocalFields: fieldSchema(FieldKinds.sequence),
});
const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	globalFieldSchema: new Map([[rootFieldKey, rootFieldSchema]]),
};

export async function performFuzzActions(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	saveInfo?: SaveInfo,
): Promise<FuzzTestState> {
	const random = makeRandom(seed);
	const provider = await TestTreeProvider.create(4, SummarizeType.onDemand);
	initializeTestTree(provider.trees[0], initialTreeState, testSchema);
	await provider.ensureSynchronized();

	const initialState: FuzzTestState = {
		random,
		testTreeProvider: provider,
		numberOfEdits: 0,
	};
	await initialState.testTreeProvider.ensureSynchronized();

	const finalState = await performFuzzActionsAsync(
		generator,
		fuzzReducer,
		initialState,
		saveInfo,
	);
	await finalState.testTreeProvider.ensureSynchronized();
	checkTreesAreSynchronized(finalState.testTreeProvider);
	return finalState;
}

/**
 * Fuzz tests in this suite are meant to exercise as much of the SharedTree code as possible and do so in the most
 * production-like manner possible. For example, these fuzz tests should not utilize branching APIs to emulate
 * multiple clients working on the same document. Instead, they should use multiple SharedTree instances, tied together
 * by a sequencing service. The tests may still use branching APIs because that's part of the normal usage of
 * SharedTree, but not as way to avoid using multiple SharedTree instances.
 *
 * The fuzz tests should validate that the clients do not crash and that their document states do not diverge.
 * See the "Fuzz - Targeted" test suite for tests that validate more specific code paths or invariants.
 */
describe("Fuzz - Top-Level", () => {
	const random = makeRandom(0);
	const runsPerBatch = 20;
	const opsPerRun = 20;
	/**
	 * This test suite is meant exercise all public APIs of SharedTree together, as well as all service-oriented
	 * operations (such as summarization and stashed ops).
	 */
	describe.skip("Everything", () => {
		runFuzzBatch(makeOpGenerator, performFuzzActions, opsPerRun, runsPerBatch, random);
	});
});
