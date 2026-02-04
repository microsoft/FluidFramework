/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type BaseFuzzTestState,
	type Generator,
	createWeightedGenerator,
	interleave,
	makeRandom,
	performFuzzActions as performFuzzActionsBase,
	repeat,
	take,
} from "@fluid-private/stochastic-test-utils";

import { IdCompressor } from "../idCompressor.js";
import type { SessionSpaceCompressedId, StableId } from "../index.js";
import { SerializationVersion } from "../types/index.js";
import { createSessionId } from "../utilities.js";

/**
 * State for sharding fuzz tests.
 * Tracks a tree of compressors and all generated IDs for collision detection and validation.
 */
interface ShardingFuzzTestState extends BaseFuzzTestState {
	/** The root compressor that started the tree */
	rootCompressor: IdCompressor;
	/** Map from compressor to its parent (undefined for root) */
	parentMap: Map<IdCompressor, IdCompressor | undefined>;
	/** Map from compressor to its children */
	childrenMap: Map<IdCompressor, Set<IdCompressor>>;
	/** All active compressors (not disposed) */
	activeCompressors: Set<IdCompressor>;
	/** Leaf compressors that can be unsharded */
	leafCompressors: Set<IdCompressor>;
	/** Map from compressor to all local IDs it has generated */
	compressorGeneratedIds: Map<IdCompressor, SessionSpaceCompressedId[]>;
	/** Global set of all generated local IDs for collision detection */
	globalLocalIds: Set<SessionSpaceCompressedId>;
	/** Global set of all decompressed stable IDs for collision detection */
	globalStableIds: Set<StableId>;
}

/**
 * Operation to shard a compressor into multiple child shards.
 */
interface ShardOperation {
	type: "shard";
	compressor: IdCompressor;
	numShards: number;
}

/**
 * Operation to unshard a leaf compressor back into its parent.
 */
interface UnshardOperation {
	type: "unshard";
	leaf: IdCompressor;
}

/**
 * Operation to generate a new compressed ID.
 */
interface GenerateIdOperation {
	type: "generateId";
	compressor: IdCompressor;
}

/**
 * Operation to validate the current state of all compressors.
 */
interface ValidateShardingOperation {
	type: "validateSharding";
}

type ShardingOperation =
	| ShardOperation
	| UnshardOperation
	| GenerateIdOperation
	| ValidateShardingOperation;

/**
 * Generates a shard operation targeting a random active compressor.
 */
function shardGenerator(state: ShardingFuzzTestState): ShardOperation {
	const compressor = state.random.pick([...state.activeCompressors]);
	const numShards = state.random.integer(1, 3);
	return {
		type: "shard",
		compressor,
		numShards,
	};
}

/**
 * Generates an unshard operation targeting a random leaf compressor.
 * If there are no leaves (only root), returns a no-op operation.
 */
function unshardGenerator(state: ShardingFuzzTestState): UnshardOperation {
	const leaves = [...state.leafCompressors];
	// Filter out root - it can't be unsharded
	const unshardableLeaves = leaves.filter((l) => l !== state.rootCompressor);

	if (unshardableLeaves.length === 0) {
		// No-op: target root which will be filtered out in handler
		return {
			type: "unshard",
			leaf: state.rootCompressor,
		};
	}

	const leaf = state.random.pick(unshardableLeaves);
	return {
		type: "unshard",
		leaf,
	};
}

/**
 * Generates an operation to generate a new ID from a random compressor.
 */
function generateIdGenerator(state: ShardingFuzzTestState): GenerateIdOperation {
	const compressor = state.random.pick([...state.activeCompressors]);
	return {
		type: "generateId",
		compressor,
	};
}

/**
 * Generates a validation operation.
 */
function validateGenerator(): ValidateShardingOperation {
	return { type: "validateSharding" };
}

/**
 * Configuration for the sharding operation generator.
 */
interface ShardingOpGeneratorConfig {
	/** Weight for shard operations (default: 3) */
	shardWeight?: number;
	/** Weight for unshard operations (default: 3) */
	unshardWeight?: number;
	/** Weight for ID generation operations (default: 20) */
	generateIdWeight?: number;
	/** How often to inject validation operations (default: every 100 ops) */
	validateInterval?: number;
}

/**
 * Creates a weighted generator for sharding fuzz test operations.
 */
function makeShardingOpGenerator(
	config: ShardingOpGeneratorConfig,
): Generator<ShardingOperation, ShardingFuzzTestState> {
	const {
		shardWeight = 3,
		unshardWeight = 3,
		generateIdWeight = 20,
		validateInterval = 100,
	} = config;

	return interleave(
		createWeightedGenerator<ShardingOperation, ShardingFuzzTestState>([
			[shardGenerator, shardWeight],
			[unshardGenerator, unshardWeight],
			[generateIdGenerator, generateIdWeight],
		]),
		take(1, repeat<ShardingOperation, ShardingFuzzTestState>(validateGenerator())),
		validateInterval,
	);
}

/**
 * Handles a shard operation by creating new child shards and updating the tree structure.
 */
function handleShard(state: ShardingFuzzTestState, op: ShardOperation): ShardingFuzzTestState {
	const { compressor, numShards } = op;

	const serializedShards = compressor.shard(numShards);

	for (const serialized of serializedShards) {
		const shard = IdCompressor.deserialize({
			serialized,
			requestedWriteVersion: SerializationVersion.V3,
		});

		// Update tree structure
		state.parentMap.set(shard, compressor);

		let children = state.childrenMap.get(compressor);
		if (children === undefined) {
			children = new Set();
			state.childrenMap.set(compressor, children);
		}
		children.add(shard);

		state.childrenMap.set(shard, new Set());
		state.activeCompressors.add(shard);
		state.leafCompressors.add(shard);
		state.compressorGeneratedIds.set(shard, []);
	}

	// Parent is no longer a leaf after sharding
	state.leafCompressors.delete(compressor);

	return state;
}

/**
 * Handles an unshard operation by disposing a leaf and merging it back into its parent.
 * No-op if the target is the root or not a leaf.
 */
function handleUnshard(
	state: ShardingFuzzTestState,
	op: UnshardOperation,
): ShardingFuzzTestState {
	const { leaf } = op;

	// Can't unshard root or non-leaves
	if (leaf === state.rootCompressor || !state.leafCompressors.has(leaf)) {
		return state;
	}

	const parent = state.parentMap.get(leaf);
	if (parent === undefined) {
		return state;
	}

	const shardId = leaf.disposeShard();
	if (shardId === undefined) {
		return state;
	}

	parent.unshard(shardId);

	// Update tree structure
	const siblings = state.childrenMap.get(parent);
	if (siblings !== undefined) {
		siblings.delete(leaf);

		// If parent has no more children, it becomes a leaf
		if (siblings.size === 0) {
			state.leafCompressors.add(parent);
		}
	}

	state.parentMap.delete(leaf);
	state.childrenMap.delete(leaf);
	state.activeCompressors.delete(leaf);
	state.leafCompressors.delete(leaf);
	state.compressorGeneratedIds.delete(leaf);

	return state;
}

/**
 * Handles an ID generation operation.
 * Generates a new ID and checks for collisions in both local ID space and stable ID space.
 * Fails immediately if a collision is detected.
 */
function handleGenerateId(
	state: ShardingFuzzTestState,
	op: GenerateIdOperation,
): ShardingFuzzTestState {
	const { compressor } = op;

	if (!state.activeCompressors.has(compressor)) {
		throw new Error("Attempting to generate ID from disposed/inactive compressor");
	}

	const localId = compressor.generateCompressedId();

	if (state.globalLocalIds.has(localId)) {
		throw new Error(
			`Local ID collision detected! ID ${localId} was already generated by another compressor.`,
		);
	}
	state.globalLocalIds.add(localId);

	const stableId = compressor.decompress(localId);
	if (state.globalStableIds.has(stableId)) {
		throw new Error(
			`Stable ID collision detected! Stable ID ${stableId} (from local ID ${localId}) was already generated.`,
		);
	}
	state.globalStableIds.add(stableId);

	// Track this ID for this compressor (compressor is always in the map when active)
	state.compressorGeneratedIds.get(compressor)?.push(localId);

	return state;
}

/**
 * Handles a validation operation.
 * For each compressor, verifies it can decompress all IDs in the range from -1 to its last generated ID.
 */
function handleValidate(state: ShardingFuzzTestState): ShardingFuzzTestState {
	for (const compressor of state.activeCompressors) {
		const idsGenerated = state.compressorGeneratedIds.get(compressor);
		const lastId = idsGenerated?.at(-1);
		if (lastId === undefined) {
			continue;
		}

		// Local IDs are negative, so we iterate from -1 down to lastId (e.g., -20)
		for (let id = -1; id >= lastId; id--) {
			const localId = id as SessionSpaceCompressedId;

			if (!state.globalLocalIds.has(localId)) {
				continue;
			}

			try {
				const stableId = compressor.decompress(localId);
				if (!state.globalStableIds.has(stableId)) {
					throw new Error(
						`Validation failed: Compressor decompressed ID ${localId} to unknown stable ID ${stableId}`,
					);
				}
			} catch (error) {
				throw new Error(
					`Validation failed: Compressor could not decompress ID ${localId} (last generated: ${lastId}): ${error}`,
				);
			}
		}
	}

	return state;
}

/**
 * Performs fuzz testing of sharding operations on an ID compressor.
 * @param generator - The operation generator
 * @param rootCompressor - The initial compressor to start the tree
 * @param seed - Random seed for reproducibility
 */
function performShardingFuzzActions(
	generator: Generator<ShardingOperation, ShardingFuzzTestState>,
	rootCompressor: IdCompressor,
	seed: number,
): void {
	const random = makeRandom(seed);

	const initialState: ShardingFuzzTestState = {
		random,
		rootCompressor,
		parentMap: new Map([[rootCompressor, undefined]]),
		childrenMap: new Map([[rootCompressor, new Set()]]),
		activeCompressors: new Set([rootCompressor]),
		leafCompressors: new Set([rootCompressor]),
		compressorGeneratedIds: new Map([[rootCompressor, []]]),
		globalLocalIds: new Set(),
		globalStableIds: new Set(),
	};

	const handlers = {
		shard: handleShard,
		unshard: handleUnshard,
		generateId: handleGenerateId,
		validateSharding: handleValidate,
	};

	performFuzzActionsBase(generator, handlers, initialState);
}

describe("IdCompressor Sharding Fuzz Tests", () => {
	it("small fuzz test - basic correctness", () => {
		const sessionId = createSessionId();
		const root = new IdCompressor(sessionId, undefined, SerializationVersion.V3);
		const generator = take(
			200,
			makeShardingOpGenerator({
				shardWeight: 2,
				unshardWeight: 2,
				generateIdWeight: 10,
				validateInterval: 50,
			}),
		);
		performShardingFuzzActions(generator, root, 42);
	});

	it("balanced fuzz test - equal sharding and unsharding", () => {
		const sessionId = createSessionId();
		const root = new IdCompressor(sessionId, undefined, SerializationVersion.V3);
		const generator = take(
			1000,
			makeShardingOpGenerator({
				shardWeight: 3,
				unshardWeight: 3,
				generateIdWeight: 20,
				validateInterval: 100,
			}),
		);
		performShardingFuzzActions(generator, root, 123);
	});

	it("large and deep fuzz test - heavy ID generation with deep sharding", () => {
		const sessionId = createSessionId();
		const root = new IdCompressor(sessionId, undefined, SerializationVersion.V3);
		const generator = take(
			5000,
			makeShardingOpGenerator({
				shardWeight: 2,
				unshardWeight: 10,
				generateIdWeight: 20,
				validateInterval: 200,
			}),
		);
		performShardingFuzzActions(generator, root, 456);
	});
});
