/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { v5 } from 'uuid';
import Prando from 'prando';
import { assert, assertNotUndefined, Mutable, noop } from '../../Common';
import { IdCompressor, FinalIdGenerator } from '../../id-compressor/IdCompressor';
import { CompressedId, StableId } from '../../Identifiers';
import { minimizeUuidString, NumericUuid, numericUuidFromUuidString } from '../../id-compressor/NumericUuid';
import { MinimalUuidString, SessionId, UuidString } from '../..';

/**
 * Used to attribute operations to clients in a distributed collaboration session.
 * `Local` implies a local and unsequenced operation. All others imply sequenced operations.
 */
export enum Client {
	Client1 = 0,
	Client2 = 1,
	Client3 = 2,
	Local = 3,
}

/**
 * A test operation on an ID compressor.
 */
export type TestUsage = IdAllocationUsage | CapacityChangeUsage | FinalIdBatchAllocationUsage;

/**
 * A test allocation operation on an ID compressor.
 */
export interface IdAllocationUsage {
	readonly client: Client;
	readonly numIds: number;
	readonly explicitIds?: { [index: number]: MinimalUuidString | undefined };
}

/**
 * A test operation to change cluster capacity on an ID compressor.
 */
export interface CapacityChangeUsage {
	readonly newClusterCapacity: number;
}

/**
 * A test operation to batch allocate final IDs on an ID compressor.
 */
export interface FinalIdBatchAllocationUsage {
	readonly client: Client;
	readonly batchSize: number;
}

/**
 * Creates a new compressor with the supplied cluster capacity.
 */
export function createCompressor(client: Client, clusterCapacity = 5): IdCompressor {
	assert(client !== Client.Local, 'Use a numbered client.');
	const compressor = new IdCompressor(sessionIds[client]);
	compressor.clusterCapacity = clusterCapacity;
	return compressor;
}

function makeSessionIds(): readonly SessionId[] {
	const stableIds: SessionId[] = [];
	for (let i = 0; i <= Client.Client3; i++) {
		// Place session uuids roughly in the middle of uuid space to increase odds of encountering interesting
		// orderings in sorted collections
		const sessionUuid = `8888888888884888b${i.toString(16)}88888888888888` as SessionId;
		stableIds.push(sessionUuid);
	}
	return stableIds;
}

/**
 * An array of session ID strings corresponding to all non-local `Client` entries.
 */
export const sessionIds = makeSessionIds();

/**
 * An array of session uuids corresponding to all non-local `Client` entries.
 */
export const sessionNumericUuids: readonly NumericUuid[] = sessionIds.map((sessionStableId) => {
	return assertNotUndefined(numericUuidFromUuidString(sessionStableId), 'Session UUID creation bug');
});

/**
 * Applies the supplied operations to the compressor.
 * @param compressor the ID compressor to perform operations on
 * @param usages the operations to perform
 * @param asserts a callback that can be used to assert invariants after the operations are applied
 * @returns the compressed IDs created by the operations
 */
export function useCompressor(
	compressor: IdCompressor,
	usages: TestUsage[],
	asserts: (usage: IdAllocationUsage, ids: readonly CompressedId[]) => void = noop
): CompressedId[] {
	const ids: CompressedId[] = [];
	for (const usage of usages) {
		if (isCapacityChange(usage)) {
			compressor.clusterCapacity = usage.newClusterCapacity;
		} else if (isBatchAllocation(usage)) {
			assert(usage.client !== Client.Local);
			compressor.getFinalIdGenerator(sessionIds[usage.client]).generateFinalIdBatch(usage.batchSize);
		} else {
			const { client, numIds, explicitIds } = usage;
			const sessionUuid = sessionIds[client];
			const generator: FinalIdGenerator | undefined =
				client === Client.Local ? undefined : compressor.getFinalIdGenerator(sessionUuid);
			for (let i = 0; i < numIds; i++) {
				const explicitId = explicitIds === undefined ? undefined : explicitIds[i];
				if (client === Client.Local) {
					ids.push(compressor.generateCompressedId(explicitId));
				} else {
					assert(generator !== undefined);
					ids.push(generator.generateFinalId(explicitId));
				}
				asserts(usage, ids);
			}
		}
	}
	return ids;
}

/**
 * @returns whether the supplied TestUsage assigns a new cluster capacity.
 */
export function isCapacityChange(usage: TestUsage): usage is CapacityChangeUsage {
	return (usage as CapacityChangeUsage).newClusterCapacity !== undefined;
}

/**
 * @returns whether the supplied TestUsage assigns a new cluster capacity.
 */
export function isBatchAllocation(usage: TestUsage): usage is FinalIdBatchAllocationUsage {
	return (usage as FinalIdBatchAllocationUsage).batchSize !== undefined;
}

/**
 * Generates a large fuzz scenario of usages.
 * Multiple calls to this method with different `localClient`s but identical seed and configuration parameters will return usages
 * that generate the same `FinalCompressedIds`. This is useful for testing invariants between two different clients that process
 * the same total order broadcast.
 * @param initialClusterSize the size of newly created clusters in the compressor these usages will be performed upon
 * @param includeExplicitIds whether or not the returned usages will generate explicit IDs
 * @param localClient whether or not the returned usages will generate local IDs
 * @param seed the seed for the random generation of the fuzz usages
 */
export function makeLargeFuzzTest(
	initialClusterSize: number,
	includeExplicitIds: boolean,
	localClient: Client | undefined,
	seed: number,
	numUsages = 350
): TestUsage[] {
	const rand = new Prando(seed);
	const selectableClients: Client[] = [Client.Client1, Client.Client2, Client.Client3];
	let clusterSize = initialClusterSize;

	// First generate usages for the final IDs, so that the partial ordering of these usages does not differ between calls to this
	// method with the same seed and params
	const localFinalUsages: [usage: TestUsage, usageIndex: number][] = [];
	const usages: TestUsage[] = [];
	// Ensure that the same UUIDs are generated for the same seed across different calls
	let uuidNum = 0;
	const uuidNamespace = 'ece2be2e-f374-4ca8-b034-a0bac2da69da';

	function getClient(): Client {
		return selectableClients[rand.nextInt(0, selectableClients.length - 1)];
	}

	for (let i = 0; i < numUsages; i++) {
		if (rand.nextInt(0, Math.round(numUsages / 20)) === 0) {
			clusterSize = rand.nextInt(initialClusterSize, initialClusterSize * 3);
			usages.push({ newClusterCapacity: clusterSize });
		} else {
			const allocationClient = getClient();
			const maxIdsPerUsage = clusterSize * 2;
			const numIds = rand.nextInt(1, maxIdsPerUsage);

			let batchExtra: number | undefined;
			if (rand.nextInt(0, Math.round(numUsages / 20)) === 0) {
				const batchClient = getClient();
				const batchSize = rand.nextInt(1, maxIdsPerUsage);
				if (batchClient === localClient) {
					if (batchClient === allocationClient) {
						batchExtra = batchSize;
					} else {
						localFinalUsages.push([{ client: Client.Local, numIds: batchSize }, usages.length]);
					}
				}
				usages.push({ client: batchClient, batchSize });
			}

			const usage: Mutable<TestUsage> = {
				client: allocationClient,
				numIds,
			};

			if (includeExplicitIds && rand.nextInt(0, 3) === 0) {
				usage.explicitIds = {};
				for (let j = 0; j < numIds; j++) {
					if (rand.nextInt(0, 2) === 0) {
						usage.explicitIds[j] = minimizeUuidString(
							v5((uuidNum++).toString(), uuidNamespace) as UuidString
						);
					}
				}
			}

			if (allocationClient === localClient) {
				const localUsage: Mutable<TestUsage> = { ...usage, client: Client.Local };
				let finalizeIndex: number;
				if (batchExtra !== undefined) {
					localUsage.numIds += batchExtra;
					finalizeIndex = usages.length - 1;
				} else {
					finalizeIndex = usages.length;
				}
				localFinalUsages.push([localUsage, finalizeIndex]);
			}

			usages.push(usage);
		}
	}

	// Next, generate usages for local ID creation (if requested), ensuring that the number generated is paired correctly with the matching
	// generation of final IDs for the local session. For example, if a client generates 5 `CompressedFinalId`s in the 8th usage, then
	// there should be a usage that generates 8 `CompressedLocalId`s somewhere in the first 7 usages.
	if (localClient !== undefined) {
		const usagesWithLocal: TestUsage[] = [];
		let i = 0;
		let numLocals = 0;
		for (const [usage, usageIndex] of localFinalUsages) {
			let added = false;
			while (i <= usageIndex) {
				if (!added && rand.nextInt(0, usageIndex - i) === 0) {
					numLocals++;
					usagesWithLocal.push(usage);
					added = true;
				}
				usagesWithLocal.push(usages[i]);
				i++;
			}
		}
		assert(i === localFinalUsages[localFinalUsages.length - 1][1] + 1);
		usagesWithLocal.push(...usages.slice(i));
		assert(
			numLocals === localFinalUsages.length,
			'Fuzz generation must match local generation and finalizing locals.'
		);
		return usagesWithLocal;
	}

	return usages;
}

/**
 * Converts the supplied integer to a uuid.
 */
export function integerToStableId(num: number | bigint): StableId {
	const bigintNum = BigInt(num);
	const upper = bigintNum >> BigInt(74);
	const middle = (bigintNum & (BigInt(0xfff) << BigInt(62))) >> BigInt(62);
	const lower = bigintNum & BigInt('0x3fffffffffffffff');
	const upperString = padToLength(upper.toString(16), '0', 12);
	const middleString = `4${padToLength(middle.toString(16), '0', 3)}`;
	const lowerString = padToLength((BigInt('0x8000000000000000') | BigInt(lower)).toString(16), '0', 16);
	const uuid = upperString + middleString + lowerString;
	assert(uuid.length === 32);
	return uuid as StableId;
}

/**
 * Pads the strings to a length of 32 with zeroes.
 */
export function padToUuidLength(str: string): string {
	return padToLength(str, '0', 32);
}

function padToLength(str: string, char: string, length: number): string {
	return char.repeat(length - str.length) + str;
}
