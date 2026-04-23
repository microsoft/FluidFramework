/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert';

import { take } from '@fluid-private/stochastic-test-utils';
import { benchmarkDuration, benchmarkIt } from '@fluid-tools/benchmark';

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
		benchmarkIt({
			title: `allocate local ID (${override ? 'override' : 'sequential'})`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const { network } = setupCompressors(defaultClusterCapacity, true, false);
					const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
					const numericSource = numericUuidFromStableId(createSessionId());
					let overrideIndex = 0;
					state.timeAllBatches(() => {
						perfCompressor.generateCompressedId(
							override ? stableIdFromNumericUuid(numericSource, overrideIndex++) : undefined
						);
					});
				},
			}),
		});
	});

	[true, false].forEach((override) => {
		for (const clusterSize of [1, 10, 500, 1000]) {
			const overrideCount = 3;
			const numIds = 7;
			const session1 = '8150a099-5302-4672-b5f3-7a4492b59418' as SessionId;
			const session2 = 'f2ded886-92da-4248-967b-eb96ee04cf51' as SessionId;
			benchmarkIt({
				title: `finalize a range of IDs (cluster size =${clusterSize}${override ? ', overrides present' : ''})`,
				...benchmarkDuration({
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					benchmarkFnCustom: async (state) => {
						const { network } = setupCompressors(clusterSize, false, false);
						const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
						let session: SessionId = session1;
						let lastFinalizedLocalId1 = 0 as LocalCompressedId;
						let lastFinalizedLocalId2 = 0 as LocalCompressedId;
						let overrideIndex = 0;
						let duration: number;
						do {
							assert(state.iterationsPerBatch === 1);
							// Create a range with as minimal overhead as possible
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

							const start = state.timer.now();
							perfCompressor.finalizeCreationRange(range);
							const end = state.timer.now();
							duration = state.timer.toSeconds(start, end);

							if (isLocal) {
								lastFinalizedLocalId1 = last;
							} else {
								lastFinalizedLocalId2 = last;
							}
							// Alternate clients to sidestep optimization that packs them all into last cluster
							session = isLocal ? session1 : session2;
						} while (state.recordBatch(duration));
					},
				}),
			});
		}
	});

	benchmarkIt({
		title: `take an ID creation range`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { network } = setupCompressors(defaultClusterCapacity, true, false);
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				state.timeAllBatches(() => {
					perfCompressor.generateCompressedId();
					perfCompressor.takeNextCreationRange();
				});
			},
		}),
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		if (local) {
			benchmarkIt({
				title: `decompress local ID into stable IDs${titleSuffix}`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const { network, id: idToDecompress } = setupCompressorWithId(local, override, true);
						const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
						state.timeAllBatches(() => {
							perfCompressor.decompress(idToDecompress);
						});
					},
				}),
			});
		} else {
			const titleBase = 'decompress final ID into stable IDs';
			if (override) {
				benchmarkIt({
					title: titleBase + titleSuffix,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const { network, id: idToDecompress } = setupCompressorWithId(local, override, true);
							const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
							state.timeAllBatches(() => {
								perfCompressor.decompress(idToDecompress);
							});
						},
					}),
				});
			} else {
				for (const clusterHasOverride of [true, false]) {
					benchmarkIt({
						title: `${titleBase} (sequential, overrides ${
							clusterHasOverride ? 'present' : 'not present'
						} in owning cluster)`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const { network, id: idToDecompress } = setupCompressorWithId(local, override, clusterHasOverride);
								const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
								state.timeAllBatches(() => {
									perfCompressor.decompress(idToDecompress);
								});
							},
						}),
					});
				}
			}
		}
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		benchmarkIt({
			title: `compress a stable ID to a ${local ? 'local' : 'final'} ID${titleSuffix}`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const { network, compressor, id: idAdded } = setupCompressorWithId(local, override, true);
					const stableToCompress = compressor.decompress(idAdded);
					const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
					state.timeAllBatches(() => {
						perfCompressor.recompress(stableToCompress);
					});
				},
			}),
		});
	});

	benchmarkIt({
		title: `normalize a final ID from the local session to session space`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { network, compressor } = setupCompressors(defaultClusterCapacity, true, true);
				network.allocateAndSendIds(localClient, 1);
				network.deliverOperations(localClient);
				const log = network.getSequencedIdLog(localClient);
				const id = compressor.normalizeToOpSpace(log[log.length - 1].id);
				const final = isFinalId(id) ? id : fail('not a final ID');
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				state.timeAllBatches(() => {
					perfCompressor.normalizeToSessionSpace(final, compressor.localSessionId);
				});
			},
		}),
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
		title: `normalize a local ID from the local session to session space`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { network } = setupCompressors(defaultClusterCapacity, true, true);
				network.deliverOperations(localClient);
				const localId = getLastLocalId(localClient, network);
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				state.timeAllBatches(() => {
					perfCompressor.normalizeToOpSpace(localId);
				});
			},
		}),
	});

	const remoteSessionId = sessionIds.get(remoteClient);
	benchmarkIt({
		title: `normalize a local ID from a remote session to session space`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { network } = setupCompressors(defaultClusterCapacity, true, true);
				network.deliverOperations(localClient);
				const opSpaceId = getLastLocalId(remoteClient, network) as OpSpaceCompressedId;
				const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				state.timeAllBatches(() => {
					perfCompressor.normalizeToSessionSpace(opSpaceId, remoteSessionId);
				});
			},
		}),
	});

	for (const overrideInClusters of [true, false]) {
		const titleSuffix = ` (${overrideInClusters ? 'with' : 'without'} overrides)`;
		benchmarkIt({
			title: `serialize an IdCompressor${titleSuffix}`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const { network } = setupCompressors(defaultClusterCapacity, false, overrideInClusters);
					const perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
					state.timeAllBatches(() => {
						perfCompressor.serialize(false);
					});
				},
			}),
		});

		const overrideRemoteSessionId = createSessionId();
		benchmarkIt({
			title: `deserialize an IdCompressor${titleSuffix}`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const { compressor } = setupCompressors(defaultClusterCapacity, false, overrideInClusters);
					const serialized: SerializedIdCompressorWithNoSession = compressor.serialize(false);
					state.timeAllBatches(() => {
						IdCompressor.deserialize(serialized, overrideRemoteSessionId);
					});
				},
			}),
		});
	}
});
