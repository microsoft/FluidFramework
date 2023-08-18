/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AsyncGenerator, takeAsync } from "@fluid-internal/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { compareUpPaths, rootFieldKey, UpPath, Anchor, JsonableTree } from "../../../core";
import { brand } from "../../../util";
import {
	SharedTreeTestFactory,
	toJsonableTree,
	validateTree,
	validateTreeConsistency,
} from "../../utils";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { getFirstAnchor, onCreate } from "./fuzzUtils";
import { Operation } from "./operationTypes";

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface UndoRedoFuzzTestState extends FuzzTestState {
	initialTreeState?: JsonableTree[];
	firstAnchors?: Anchor[];
}

describe("Fuzz - undo/redo", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;

	const undoRedoWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
	};

	describe.skip("Inorder undo/redo matches the initial/final state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			initialState.initialTreeState = toJsonableTree(initialState.clients[0].channel);
			initialState.firstAnchors = [];
			// creates an initial anchor for each tree
			for (const client of initialState.clients) {
				initialState.firstAnchors.push(getFirstAnchor(client.channel));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const clients = finalState.clients;

			const finalTreeStates = [];
			// undo all of the changes and validate against initialTreeState for each tree
			for (const [i, client] of clients.entries()) {
				const tree = client.channel;

				// save final tree states to validate redo later
				finalTreeStates.push(toJsonableTree(tree));

				/**
				 * TODO: Currently this for loop is used to call undo() "opsPerRun" number of times.
				 * Once the undo stack exposed, remove this array and use the stack to keep track instead.
				 */
				for (let j = 0; j < opsPerRun; j++) {
					tree.undo();
				}
			}

			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			for (const [i, client] of clients.entries()) {
				assert(finalState.initialTreeState !== undefined);
				validateTree(client.channel, finalState.initialTreeState);
				// check anchor stability
				const expectedPath: UpPath = {
					parent: {
						parent: undefined,
						parentIndex: 0,
						parentField: rootFieldKey,
					},
					parentField: brand("foo"),
					parentIndex: 1,
				};
				assert(finalState.firstAnchors !== undefined);
				assert(finalState.firstAnchors[i] !== undefined);
				const anchorPath = client.channel.locate(finalState.firstAnchors[i]);
				assert(compareUpPaths(expectedPath, anchorPath));
			}

			// redo all of the undone changes and validate against the finalTreeState for each tree
			for (const [i, client] of clients.entries()) {
				for (let j = 0; j < opsPerRun; j++) {
					client.channel.redo();
				}
				validateTree(client.channel, finalTreeStates[i]);
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
		});
	});

	describe("out of order undo matches the initial state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			initialState.initialTreeState = toJsonableTree(initialState.clients[0].channel);
			initialState.firstAnchors = [];
			// creates an initial anchor for each tree
			for (const client of initialState.clients) {
				initialState.firstAnchors.push(getFirstAnchor(client.channel));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const clients = finalState.clients;

			/**
			 * TODO: Currently this array is used to track that undo() is called "opsPerRun" number of times.
			 * Once the undo stack exposed, remove this array and use the stack to keep track instead.
			 */
			const undoOrderByClientIndex = Array.from(
				{ length: opsPerRun * clients.length },
				(_, index) => Math.floor(index / opsPerRun),
			);
			finalState.random.shuffle(undoOrderByClientIndex);
			// call undo() until trees contain no more edits to undo
			for (const clientIndex of undoOrderByClientIndex) {
				clients[clientIndex].channel.undo();
			}
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			for (const [i, client] of clients.entries()) {
				assert(finalState.initialTreeState !== undefined);
				validateTree(client.channel, finalState.initialTreeState);
				// check anchor stability
				const expectedPath: UpPath = {
					parent: {
						parent: undefined,
						parentIndex: 0,
						parentField: rootFieldKey,
					},
					parentField: brand("foo"),
					parentIndex: 1,
				};
				assert(finalState.firstAnchors !== undefined);
				assert(finalState.firstAnchors[i] !== undefined);
				const anchorPath = client.channel.locate(finalState.firstAnchors[i]);
				assert(compareUpPaths(expectedPath, anchorPath));
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			// ADO:5083, assert 0x6a1 hit for 13 and 18
			skip: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
		});
	});

	const unSequencedUndoRedoWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
		undo: 1,
		redo: 1,
	};

	describe("synchronization after calling undo on unsequenced edits", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(unSequencedUndoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateTreeConsistency,
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();
			const expectedTree = toJsonableTree(finalState.summarizerClient.channel);
			for (const client of finalState.clients) {
				validateTree(client.channel, expectedTree);
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			validationStrategy: { type: "fixedInterval", interval: opsPerRun * 2 }, // interval set to prevent synchronization
			skip: [4, 8, 11, 13, 15, 18],
		});
	});
});
