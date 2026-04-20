/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { take } from '@fluid-private/stochastic-test-utils';
import { BenchmarkType, TestType, benchmarkIt, collectDurationData } from '@fluid-tools/benchmark';

import { Mutable, fail } from '../Common.js';
import { CompressedId, LocalCompressedId, OpSpaceCompressedId, SessionId } from '../Identifiers.js';
import { IdCompressor, defaultClusterCapacity, isFinalId, isLocalId } from '../id-compressor/IdCompressor.js';
import { createSessionId, numericUuidFromStableId, stableIdFromNumericUuid } from '../id-compressor/NumericUuid.js';
import { IdCreationRange, SerializedIdCompressorWithNoSession, UnackedLocalId } from '../id-compressor/index.js';

import {
	Client,
	IdCompressorTestNetwork,
	TestIdData,
	makeOpGenerator,
	performFuzzActions,
	sessionIds,
} from './utilities/IdCompressorTestUtilities.js';

interface SetupResult {
	network: IdCompressorTestNetwork;
	compressor: IdCompressor;
}

interface SetupWithIdResult extends SetupResult {
	id: CompressedId;
}

describe('IdCompressor Perf', () => {
	const type = BenchmarkType.Measurement;
	const localClient = Client.Client1;
	const remoteClient = Client.Client2;

	function setupCompressors(clusterSize: number, allowLocal: boolean, includeOverrides: boolean): SetupResult {
		const network = new IdCompressorTestNetwork(clusterSize);
		const [compressor] = createPerfCompressor(network, allowLocal, includeOverrides, localClient);
		return { network, compressor };
	}

	function createPerfCompressor(
		network: IdCompressorTestNetwork,
		allowLocal: boolean,
		includeOverrides: boolean,
		client: Client
	): [IdCompressor, readonly TestIdData[]] {
		const maxClusterSize = 25;
		const generator = take(1000, makeOpGenerator({ includeOverrides, validateInterval: 2000, maxClusterSize }));
		if (network.initialClusterSize > maxClusterSize) {
			network.enqueueCapacityChange(maxClusterSize);
		}
		performFuzzActions(generator, network, Math.E, allowLocal ? undefined : client, !allowLocal);
		return [network.getCompressorUnsafe(client), network.getIdLog(client)];
	}

	function setupCompressorWithId(
		local: boolean,
		override: boolean,
		clusterHasOtherOverrides: boolean
	): SetupWithIdResult {
		const { network, compressor } = setupCompressors(defaultClusterCapacity, true, true);
		if (!clusterHasOtherOverrides) {
			network.allocateAndSendIds(localClient, defaultClusterCapacity);
		} else {
			network.allocateAndSendIds(localClient, 2, {
				0: 'override1',
				1: 'override2',
			});
		}
		if (override) {
			network.allocateAndSendIds(localClient, 1, { 0: 'override3' });
		} else {
			network.allocateAndSendIds(localClient, 1);
		}

		if (!local) {
			network.deliverOperations(localClient);
		}

		const ids = network.getIdLog(localClient);
		const id = ids[ids.length - 1].id;
		return { network, compressor, id };
	}

	function benchmarkWithIdTypes(creator: (local: boolean, override: boolean, titleSuffix: string) => void) {
		for (const local of [true, false]) {
			for (const override of [true, false]) {
				const titleSuffix = ` (${override ? 'override' : 'sequential'})`;
				creator(local, override, titleSuffix);
			}
		}
	}

	[true, false].forEach((override) => {
		const numericSource = numericUuidFromStableId(createSessionId());
		let overrideIndex = 0;
		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `allocate local ID (${override ? 'override' : 'sequential'})`,
			run: async () => {
				const { network } = setupCompressors(defaultClusterCapacity, true, false);
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				return collectDurationData({
					benchmarkFn: () => {
						perfCompressor.generateCompressedId(
							override ? stableIdFromNumericUuid(numericSource, overrideIndex++) : undefined
						);
					},
				});
			},
		});
	});

	[true, false].forEach((override) => {
		for (const clusterSize of [1, 10, 500, 1000]) {
			const overrideCount = 3;
			const numIds = 7;
			const session1 = '8150a099-5302-4672-b5f3-7a4492b59418' as SessionId;
			const session2 = 'f2ded886-92da-4248-967b-eb96ee04cf51' as SessionId;
			let session: SessionId = session1;
			let lastFinalizedLocalId1 = 0 as LocalCompressedId;
			let lastFinalizedLocalId2 = 0 as LocalCompressedId;
			let overrideIndex = 0;
			benchmarkIt({
				type,
				testType: TestType.ExecutionTime,
				title: `finalize a range of IDs (cluster size =${clusterSize}${override ? ', overrides present' : ''})`,
				run: async () => {
					const { network } = setupCompressors(clusterSize, false, false);
					const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
					return collectDurationData({
						benchmarkFn: () => {
							// Create a range with as minimal overhead as possible, as we'd like for this code to not exist
							// in the timing loop at all (but benchmark forces us to do so)
							const isLocal = session === session1;
							const first = ((isLocal ? lastFinalizedLocalId1 : lastFinalizedLocalId2) - 1) as LocalCompressedId &
								OpSpaceCompressedId;
							let overrides: Mutable<IdCreationRange.Overrides> | undefined;
							const actualOverrideCount = override ? overrideCount : 0;
							if (actualOverrideCount > 0) {
								overrides = [] as unknown as Mutable<IdCreationRange.Overrides>;
								for (let i = 0; i < actualOverrideCount; i++) {
									overrides.push([
										(first - i) as LocalCompressedId & OpSpaceCompressedId,
										`override${overrideIndex++}`,
									]);
								}
							}

							const last = (first - numIds) as UnackedLocalId;
							const range: IdCreationRange = {
								sessionId: session,
								ids: {
									first,
									last,
									overrides,
								},
							};

							perfCompressor.finalizeCreationRange(range);

							if (isLocal) {
								lastFinalizedLocalId1 = last;
							} else {
								lastFinalizedLocalId2 = last;
							}
							// Alternate clients to sidestep optimization that packs them all into last cluster
							session = isLocal ? session1 : session2;
						},
					});
				},
			});
		}
	});

	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `take an ID creation range`,
		run: async () => {
			const { network } = setupCompressors(defaultClusterCapacity, true, false);
			const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			return collectDurationData({
				benchmarkFn: () => {
					perfCompressor.generateCompressedId();
					perfCompressor.takeNextCreationRange();
				},
			});
		},
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		if (local) {
			benchmarkIt({
				type,
				testType: TestType.ExecutionTime,
				title: `decompress local ID into stable IDs${titleSuffix}`,
				run: async () => {
					const { network, id: idToDecompress } = setupCompressorWithId(local, override, true);
					const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
					return collectDurationData({
						benchmarkFn: () => {
							perfCompressor.decompress(idToDecompress);
						},
					});
				},
			});
		} else {
			const titleBase = 'decompress final ID into stable IDs';
			if (override) {
				benchmarkIt({
					type,
					testType: TestType.ExecutionTime,
					title: titleBase + titleSuffix,
					run: async () => {
						const { network, id: idToDecompress } = setupCompressorWithId(local, override, true);
						const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
						return collectDurationData({
							benchmarkFn: () => {
								perfCompressor.decompress(idToDecompress);
							},
						});
					},
				});
			} else {
				for (const clusterHasOverride of [true, false]) {
					benchmarkIt({
						type,
						testType: TestType.ExecutionTime,
						title: `${titleBase} (sequential, overrides ${
							clusterHasOverride ? 'present' : 'not present'
						} in owning cluster)`,
						run: async () => {
							const { network, id: idToDecompress } = setupCompressorWithId(local, override, clusterHasOverride);
							const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
							return collectDurationData({
								benchmarkFn: () => {
									perfCompressor.decompress(idToDecompress);
								},
							});
						},
					});
				}
			}
		}
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `compress a stable ID to a ${local ? 'local' : 'final'} ID${titleSuffix}`,
			run: async () => {
				const { network, compressor, id: idAdded } = setupCompressorWithId(local, override, true);
				const stableToCompress = compressor.decompress(idAdded);
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				return collectDurationData({
					benchmarkFn: () => {
						perfCompressor.recompress(stableToCompress);
					},
				});
			},
		});
	});

	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `normalize a final ID from the local session to session space`,
		run: async () => {
			const { network, compressor } = setupCompressors(defaultClusterCapacity, true, true);
			network.allocateAndSendIds(localClient, 1);
			network.deliverOperations(localClient);
			const log = network.getSequencedIdLog(localClient);
			const id = compressor.normalizeToOpSpace(log[log.length - 1].id);
			const final = isFinalId(id) ? id : fail('not a final ID');
			const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			return collectDurationData({
				benchmarkFn: () => {
					perfCompressor.normalizeToSessionSpace(final, compressor.localSessionId);
				},
			});
		},
	});

	function getLastLocalId(client: Client, network: IdCompressorTestNetwork): LocalCompressedId {
		const log = network.getIdLog(client);
		for (let i = log.length - 1; i > 0; i--) {
			const cur = log[i].id;
			if (isLocalId(cur)) {
				return cur;
			}
		}
		fail('no local ID found in log');
	}

	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `normalize a local ID from the local session to session space`,
		run: async () => {
			const { network } = setupCompressors(defaultClusterCapacity, true, true);
			network.deliverOperations(localClient);
			const localId = getLastLocalId(localClient, network);
			const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			return collectDurationData({
				benchmarkFn: () => {
					perfCompressor.normalizeToOpSpace(localId);
				},
			});
		},
	});

	const remoteSessionId = sessionIds.get(remoteClient);
	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `normalize a local ID from a remote session to session space`,
		run: async () => {
			const { network } = setupCompressors(defaultClusterCapacity, true, true);
			network.deliverOperations(localClient);
			const opSpaceId = getLastLocalId(remoteClient, network) as OpSpaceCompressedId;
			const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			return collectDurationData({
				benchmarkFn: () => {
					perfCompressor.normalizeToSessionSpace(opSpaceId, remoteSessionId);
				},
			});
		},
	});

	for (const overrideInClusters of [true, false]) {
		const titleSuffix = ` (${overrideInClusters ? 'with' : 'without'} overrides)`;
		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `serialize an IdCompressor${titleSuffix}`,
			run: async () => {
				const { network } = setupCompressors(defaultClusterCapacity, false, overrideInClusters);
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				return collectDurationData({
					benchmarkFn: () => {
						perfCompressor.serialize(false);
					},
				});
			},
		});

		const overrideRemoteSessionId = createSessionId();
		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `deserialize an IdCompressor${titleSuffix}`,
			run: async () => {
				const { compressor } = setupCompressors(defaultClusterCapacity, false, overrideInClusters);
				const serialized: SerializedIdCompressorWithNoSession = compressor.serialize(false);
				return collectDurationData({
					benchmarkFn: () => {
						IdCompressor.deserialize(serialized, overrideRemoteSessionId);
					},
				});
			},
		});
	}
});
