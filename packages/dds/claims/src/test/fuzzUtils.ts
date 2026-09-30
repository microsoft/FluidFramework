/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import type {
	AsyncGenerator as Generator,
	Reducer,
} from "@fluid-private/stochastic-test-utils";
import {
	combineReducers,
	createWeightedAsyncGenerator as createWeightedGenerator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import type {
	Client,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";

import { ClaimsFactory } from "../claimsFactory.js";

import { _dirname } from "./dirname.cjs";

type FuzzTestState = DDSFuzzTestState<ClaimsFactory>;

/**
 * Operation types for Claims fuzz testing.
 */
interface ClaimOperation {
	type: "claim";
	key: string;
	value: string;
}

interface ClaimHandleOperation {
	type: "claimHandle";
	key: string;
}

interface CasOperation {
	type: "cas";
	key: string;
	newValue: string;
}

interface CasHandleOperation {
	type: "casHandle";
	key: string;
}

interface GetClaimOperation {
	type: "get";
	key: string;
}

/**
 * All operations that can be generated during fuzz testing.
 */
export type ClaimsOperation =
	| ClaimOperation
	| ClaimHandleOperation
	| CasOperation
	| CasHandleOperation
	| GetClaimOperation;

/**
 * Pool of keys used by the fuzz generator. Using a small key space
 * increases contention between clients, which is the interesting case.
 */
const keyPool = ["alpha", "beta", "gamma", "delta"];

function randomKey(state: FuzzTestState): string {
	return keyPool[state.random.integer(0, keyPool.length - 1)] ?? "alpha";
}

function makeOperationGenerator(): Generator<ClaimsOperation, FuzzTestState> {
	async function claim(state: FuzzTestState): Promise<ClaimOperation> {
		return {
			type: "claim",
			key: randomKey(state),
			value: `v${state.random.integer(0, 100)}`,
		};
	}

	async function claimWithHandle(state: FuzzTestState): Promise<ClaimHandleOperation> {
		return {
			type: "claimHandle",
			key: randomKey(state),
		};
	}

	async function cas(state: FuzzTestState): Promise<CasOperation> {
		const key = randomKey(state);
		return {
			type: "cas",
			key,
			newValue: `v${state.random.integer(0, 100)}`,
		};
	}

	async function casHandle(state: FuzzTestState): Promise<CasHandleOperation> {
		return {
			type: "casHandle",
			key: randomKey(state),
		};
	}

	async function get(state: FuzzTestState): Promise<GetClaimOperation> {
		return {
			type: "get",
			key: randomKey(state),
		};
	}

	return createWeightedGenerator<ClaimsOperation, FuzzTestState>([
		[claim, 3],
		[claimWithHandle, 5],
		[cas, 3],
		[casHandle, 3],
		[get, 2],
	]);
}

function makeReducer(): Reducer<ClaimsOperation, FuzzTestState> {
	return combineReducers<ClaimsOperation, FuzzTestState>({
		claim: ({ client }, { key, value }) => {
			try {
				client.channel.trySetClaim(key, value);
			} catch {
				// Expected: may throw UsageError if a claim for this key is already pending locally.
			}
		},
		claimHandle: ({ client }, { key }) => {
			try {
				client.channel.trySetClaim(key, client.channel.handle);
			} catch {
				// Expected: may throw UsageError if a claim for this key is already pending locally.
			}
		},
		cas: ({ client }, { key, newValue }) => {
			try {
				client.channel.compareAndSetClaim(key, newValue);
			} catch {
				// Expected: may throw UsageError if an operation for this key is already pending locally.
			}
		},
		casHandle: ({ client }, { key }) => {
			try {
				client.channel.compareAndSetClaim(key, client.channel.handle);
			} catch {
				// Expected: may throw UsageError if an operation for this key is already pending locally.
			}
		},
		get: ({ client }, { key }) => {
			// Read-only operation — just exercises the read path.
			client.channel.get(key);
		},
	});
}

function assertConsistentClaims(a: Client<ClaimsFactory>, b: Client<ClaimsFactory>): void {
	for (const key of keyPool) {
		const valueA = a.channel.get(key);
		const valueB = b.channel.get(key);
		// For handles (objects with absolutePath), compare by path since
		// references differ across clients after deserialization.
		const resolvedA =
			typeof valueA === "object" && valueA !== null && "absolutePath" in valueA
				? (valueA as { absolutePath: string }).absolutePath
				: valueA;
		const resolvedB =
			typeof valueB === "object" && valueB !== null && "absolutePath" in valueB
				? (valueB as { absolutePath: string }).absolutePath
				: valueB;
		if (resolvedA !== resolvedB) {
			throw new Error(
				`Inconsistent claims for key "${key}": client A has "${String(resolvedA)}", client B has "${String(resolvedB)}"`,
			);
		}
	}
}

/**
 * Default options for Claims fuzz testing.
 */
export const defaultOptions: Partial<DDSFuzzSuiteOptions> = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	clientJoinOptions: {
		maxNumberOfClients: 4,
		clientAddProbability: 0.05,
		stashableClientProbability: 0.2,
	},
	defaultTestCount: 100,
	saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
};

/**
 * Base fuzz model for Claims.
 */
export const baseClaimsModel: DDSFuzzModel<ClaimsFactory, ClaimsOperation, FuzzTestState> = {
	workloadName: "default configuration",
	generatorFactory: () => take(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: assertConsistentClaims,
	factory: new ClaimsFactory(),
};
