/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createWeightedGenerator,
	done,
	takeAsync,
	type AsyncGenerator,
} from "@fluid-private/stochastic-test-utils";
import {
	type Client,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { TreeAlpha } from "../../../shared-tree/index.js";
import {
	type ArrayNodeDeltaOp,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "../../../simple-tree/index.js";
import { getOrCreate } from "../../../util/index.js";
import { SharedTreeTestFactory } from "../../utils.js";

import { deterministicIdCompressorFactory, failureDirectory } from "./fuzzUtils.js";

const sf = new SchemaFactory("arrayDeltaFuzz");
const NumArray = sf.array("NumArray", sf.number);
const Parent = sf.object("Parent", { arr1: NumArray, arr2: NumArray });
const viewConfig = new TreeViewConfiguration({ schema: Parent });

type ParentNode = InstanceType<typeof Parent>;

// One schematized view per SharedTree channel — SharedTree disallows multiple
// concurrent views on the same branch, so we cache rather than re-creating.
const viewCache = new WeakMap<object, TreeView<typeof Parent>>();

function getRoot(client: Client<SharedTreeTestFactory>): ParentNode {
	let view = viewCache.get(client.channel);
	if (view === undefined) {
		view = client.channel.viewWith(viewConfig);
		viewCache.set(client.channel, view);
	}
	const root = view.root;
	assert(root !== undefined, "Tree root must be initialized before accessing it");
	return root;
}

type ArrayField = "arr1" | "arr2";

/**
 * Custom op type for this suite rather than reusing the types in `operationTypes.ts`.
 *
 * The shared types are designed for the generic `FuzzNode` schema: fields are addressed via
 * `DownPath`, inserted content is `GeneratedFuzzNode[]`, and ranges use `NodeRange`.
 * This suite uses a fixed two-field schema of plain number arrays, so field identity and
 * inserted values can be expressed directly without path navigation or content descriptors.
 */
type Op =
	| {
			readonly type: "insert";
			readonly field: ArrayField;
			readonly index: number;
			readonly value: number;
	  }
	| { readonly type: "remove"; readonly field: ArrayField; readonly index: number }
	| {
			readonly type: "intraMove";
			readonly field: ArrayField;
			readonly dst: number;
			readonly src: number;
	  }
	| {
			readonly type: "crossMove";
			readonly dstField: ArrayField;
			readonly srcIndex: number;
			readonly dstIndex: number;
	  }
	| { readonly type: "synchronize" };

type FuzzState = DDSFuzzTestState<SharedTreeTestFactory>;

interface OpWeights {
	insert: number;
	remove: number;
	intraMove: number;
	crossMove: number;
}

const defaultOpWeights: OpWeights = {
	insert: 2,
	remove: 2,
	intraMove: 3,
	crossMove: 3,
};

/**
 * Advances a shadow copy of an array by one step using an {@link ArrayNodeDeltaOp} sequence.
 * `retain N` copies N elements from `shadow`; `remove N` discards N; `insert N` pulls N elements
 * from `after` at the current output position (insert ops carry only a count, so inserted values
 * must be read from the live post-op tree).  Trailing retains are implicit.
 */
function applyDeltaToArray(
	shadow: readonly number[],
	after: readonly number[],
	delta: readonly ArrayNodeDeltaOp[],
): number[] {
	const result: number[] = [];
	let srcIdx = 0;

	for (const op of delta) {
		switch (op.type) {
			case "retain": {
				result.push(...shadow.slice(srcIdx, srcIdx + op.count));
				srcIdx += op.count;
				break;
			}
			case "remove": {
				srcIdx += op.count;
				break;
			}
			case "insert": {
				// Insert ops carry only a count; the inserted values must be read from the
				// post-op tree.  We index `after` by the current output position rather
				// than the source position (`srcIdx`) because the new elements land at the
				// output cursor, not at any position in the original array.
				const outIdx = result.length;
				result.push(...after.slice(outIdx, outIdx + op.count));
				break;
			}
			default: {
				const _: never = op;
				throw new Error(`Unexpected op type: ${JSON.stringify(_)}`);
			}
		}
	}
	result.push(...shadow.slice(srcIdx)); // implicit trailing retain
	return result;
}

/**
 * Shadow copy of both array fields for one client.  Updated continuously via
 * `nodeChanged` delta events so that after every operation (local or remote)
 * `shadow.arr1` and `shadow.arr2` should equal the live tree arrays.
 */
interface ClientShadow {
	arr1: number[];
	arr2: number[];
}

// One shadow per SharedTree channel, initialised lazily on first access.
const shadowCache = new WeakMap<object, ClientShadow>();

/**
 * Returns the shadow for `client`, creating and subscribing it if this is the first access.
 * Must be called before any operations that could fire `nodeChanged` on this client.
 */
function getShadow(client: Client<SharedTreeTestFactory>): ClientShadow {
	return getOrCreate(shadowCache, client.channel, () => {
		const root = getRoot(client);
		const shadow: ClientShadow = { arr1: [...root.arr1], arr2: [...root.arr2] };
		TreeAlpha.on(root.arr1, "nodeChanged", ({ delta }) => {
			assert(
				delta !== undefined,
				"delta should always be defined without withBufferedTreeEvents",
			);
			shadow.arr1 = applyDeltaToArray(shadow.arr1, [...root.arr1], delta);
		});
		TreeAlpha.on(root.arr2, "nodeChanged", ({ delta }) => {
			assert(
				delta !== undefined,
				"delta should always be defined without withBufferedTreeEvents",
			);
			shadow.arr2 = applyDeltaToArray(shadow.arr2, [...root.arr2], delta);
		});
		return shadow;
	});
}

/** Asserts that the shadow for `client` matches the live tree state. */
function verifyShadow(client: Client<SharedTreeTestFactory>, label: string): void {
	const shadow = getShadow(client);
	const root = getRoot(client);
	assert.deepEqual(shadow.arr1, [...root.arr1], `${label} arr1 shadow diverged`);
	assert.deepEqual(shadow.arr2, [...root.arr2], `${label} arr2 shadow diverged`);
}

const fields = ["arr1", "arr2"] as const;

function makeOpGenerator(weights: OpWeights = defaultOpWeights) {
	return createWeightedGenerator<Op, FuzzState>([
		// insert: insert a random number at a random index in either field.
		[
			(state): Op => {
				const root = getRoot(state.client);
				const field = state.random.bool() ? "arr1" : "arr2";
				return {
					type: "insert",
					field,
					index: state.random.integer(0, root[field].length),
					value: state.random.integer(0, 99),
				};
			},
			weights.insert,
		],
		// remove: remove a random element from a non-empty field.
		[
			(state): Op => {
				const root = getRoot(state.client);
				const candidates = fields.filter((f) => root[f].length > 0);
				const field = state.random.pick(candidates);
				return {
					type: "remove",
					field,
					index: state.random.integer(0, root[field].length - 1),
				};
			},
			weights.remove,
			(state) => {
				const root = getRoot(state.client);
				return root.arr1.length > 0 || root.arr2.length > 0;
			},
		],
		// intraMove: move a single element within one field.
		// Maps a choice in [0, len-2] to a destination gap that skips the two no-op
		// gaps adjacent to `src` (gaps src and src+1 leave the element in place).
		[
			(state): Op => {
				const root = getRoot(state.client);
				const candidates = fields.filter((f) => root[f].length > 1);
				const field = state.random.pick(candidates);
				const len = root[field].length;
				const src = state.random.integer(0, len - 1);
				const c = state.random.integer(0, len - 2);
				const dst = c >= src ? c + 2 : c;
				return { type: "intraMove", field, dst, src };
			},
			weights.intraMove,
			(state) => {
				const root = getRoot(state.client);
				return root.arr1.length > 1 || root.arr2.length > 1;
			},
		],
		// crossMove: move a single element from one field to a random position in the other.
		// Picks the source as a non-empty field so the move is always valid.
		// dstIndex is in [0, dstArr.length] — covers mid-array as well as end-of-array destinations.
		[
			(state): Op => {
				const root = getRoot(state.client);
				const candidates = fields.filter((f) => root[f].length > 0);
				const srcField = state.random.pick(candidates);
				const dstField: ArrayField = srcField === "arr1" ? "arr2" : "arr1";
				return {
					type: "crossMove",
					dstField,
					srcIndex: state.random.integer(0, root[srcField].length - 1),
					dstIndex: state.random.integer(0, root[dstField].length),
				};
			},
			weights.crossMove,
			(state) => {
				const root = getRoot(state.client);
				return root.arr1.length > 0 || root.arr2.length > 0;
			},
		],
	]);
}

const opGenerator = makeOpGenerator();

async function generateOp(state: FuzzState): Promise<Op> {
	const result = opGenerator(state);
	assert(result !== done, "op generator unexpectedly exhausted");
	return result;
}

const reducer = (state: FuzzState, op: Op): void => {
	if (op.type === "synchronize") {
		// Ensure all clients have shadows subscribed before remote events fire.
		for (const client of state.clients) {
			getShadow(client);
		}
		state.containerRuntimeFactory.processAllMessages();
		// nodeChanged handlers have already advanced every shadow; just verify.
		for (const [i, client] of state.clients.entries()) {
			verifyShadow(client, `sync client[${i}]`);
		}
		return;
	}

	// Ensure this client's shadow is subscribed before applying the local edit.
	getShadow(state.client);
	const root = getRoot(state.client);

	switch (op.type) {
		case "insert": {
			root[op.field].insertAt(op.index, op.value);
			break;
		}
		case "remove": {
			const arr = root[op.field];
			if (op.index < arr.length) {
				arr.removeAt(op.index);
			}
			break;
		}
		case "intraMove": {
			const arr = root[op.field];
			if (op.src < arr.length && op.dst <= arr.length) {
				arr.moveToIndex(op.dst, op.src);
			}
			break;
		}
		case "crossMove": {
			const dstArr = root[op.dstField];
			const srcField: ArrayField = op.dstField === "arr1" ? "arr2" : "arr1";
			const srcArr = root[srcField];
			if (op.srcIndex < srcArr.length && op.dstIndex <= dstArr.length) {
				dstArr.moveToIndex(op.dstIndex, op.srcIndex, srcArr);
			}
			break;
		}
		default: {
			const _: never = op;
			throw new Error(`Unexpected op type: ${JSON.stringify(_)}`);
		}
	}

	verifyShadow(state.client, JSON.stringify(op));
};

describe("Fuzz - ArrayNodeDelta: delta events keep per-client shadow consistent after rebase", () => {
	const runsPerBatch = 10;
	const opsPerRun = 30;

	const model: DDSFuzzModel<SharedTreeTestFactory, Op, FuzzState> = {
		workloadName: "arrayNodeDelta",
		factory: new SharedTreeTestFactory((tree) => {
			const view = tree.viewWith(viewConfig);
			view.initialize({ arr1: [1, 2, 3, 4, 5], arr2: [10, 20, 30, 40, 50] });
			view.dispose();
		}),
		generatorFactory: (): AsyncGenerator<Op, FuzzState> => takeAsync(opsPerRun, generateOp),
		reducer,
		validateConsistency: (clientA, clientB) => {
			const rootA = getRoot(clientA);
			const rootB = getRoot(clientB);
			assert.deepEqual([...rootA.arr1], [...rootB.arr1], "arr1 diverged between clients");
			assert.deepEqual([...rootA.arr2], [...rootB.arr2], "arr2 diverged between clients");
		},
	};

	const options: Partial<DDSFuzzSuiteOptions> = {
		numberOfClients: 2,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 0.1,
		},
		defaultTestCount: runsPerBatch,
		saveFailures: { directory: failureDirectory },
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			attachingBeforeRehydrateDisable: true,
		},
		reconnectProbability: 0.1,
		idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
	};

	createDDSFuzzSuite(model, options);
});
