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
import type { IClaims } from "../interfaces.js";

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

interface CasOperation {
	type: "cas";
	key: string;
	newValue: string;
	expectedValue: string;
}

interface GetClaimOperation {
	type: "getClaim";
	key: string;
}

/**
 * All operations that can be generated during fuzz testing.
 */
export type ClaimsOperation = ClaimOperation | CasOperation | GetClaimOperation;

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

	async function cas(state: FuzzTestState): Promise<CasOperation> {
		const key = randomKey(state);
		const currentValue = (state.client.channel as IClaims<string>).getClaim(key);
		return {
			type: "cas",
			key,
			newValue: `v${state.random.integer(0, 100)}`,
			expectedValue: currentValue ?? `v${state.random.integer(0, 100)}`,
		};
	}

	async function getClaim(state: FuzzTestState): Promise<GetClaimOperation> {
		return {
			type: "getClaim",
			key: randomKey(state),
		};
	}

	return createWeightedGenerator<ClaimsOperation, FuzzTestState>([
		[claim, 5],
		[cas, 3],
		[getClaim, 2],
	]);
}

function makeReducer(): Reducer<ClaimsOperation, FuzzTestState> {
	return combineReducers<ClaimsOperation, FuzzTestState>({
		claim: ({ client }, { key, value }) => {
			const channel = client.channel as IClaims<string>;
			try {
				channel.trySetClaim(key, value);
			} catch {
				// Expected: may throw UsageError if detached/disconnected or
				// if a claim for this key is already pending locally.
			}
		},
		cas: ({ client }, { key, newValue, expectedValue }) => {
			const channel = client.channel as IClaims<string>;
			try {
				channel.trySetClaim(key, newValue, expectedValue);
			} catch {
				// Expected: may throw UsageError if detached/disconnected or
				// if an operation for this key is already pending locally.
			}
		},
		getClaim: ({ client }, { key }) => {
			const channel = client.channel as IClaims<string>;
			// Read-only operation — just exercises the read path.
			channel.getClaim(key);
		},
	});
}

function assertConsistentClaims(a: Client<ClaimsFactory>, b: Client<ClaimsFactory>): void {
	const claimsA = a.channel as IClaims<string>;
	const claimsB = b.channel as IClaims<string>;

	for (const key of keyPool) {
		const valueA = claimsA.getClaim(key);
		const valueB = claimsB.getClaim(key);
		if (valueA !== valueB) {
			throw new Error(
				`Inconsistent claims for key "${key}": client A has "${valueA}", client B has "${valueB}"`,
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
