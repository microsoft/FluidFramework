/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { take } from '@fluid-private/stochastic-test-utils';
import { BenchmarkType, benchmark } from '@fluid-tools/benchmark';

import { Mutable, fail } from '../Common.js';
import { CompressedId, FinalCompressedId, LocalCompressedId, OpSpaceCompressedId, SessionId } from '../Identifiers.js';
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

describe('IdCompressor Perf', () => {
	const type = BenchmarkType.Measurement;
	const localClient = Client.Client1;
	const remoteClient = Client.Client2;
	let perfCompressor: IdCompressor | undefined;
	let network: IdCompressorTestNetwork;
	let compressor: IdCompressor;

	function setupCompressors(
		clusterSize: number,
		allowLocal: boolean,
		includeOverrides: boolean
	): IdCompressorTestNetwork {
		network = new IdCompressorTestNetwork(clusterSize);
		[compressor] = createPerfCompressor(network, allowLocal, includeOverrides, localClient);
		perfCompressor = undefined;
		return network;
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

	function setupCompressorWithId(local: boolean, override: boolean, clusterHasOtherOverrides: boolean): CompressedId {
		const clusterCapacity = defaultClusterCapacity;
		const network = setupCompressors(clusterCapacity, true, true);
		if (!clusterHasOtherOverrides) {
			network.allocateAndSendIds(localClient, clusterCapacity);
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
		const lastId = ids[ids.length - 1].id;
		return lastId;
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
		benchmark({
			type,
			title: `allocate local ID (${override ? 'override' : 'sequential'})`,
			before: () => {
				setupCompressors(defaultClusterCapacity, true, false);
				perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			},
			benchmarkFn: () => {
				perfCompressor!.generateCompressedId(
					override ? stableIdFromNumericUuid(numericSource, overrideIndex++) : undefined
				);
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
			benchmark({
				type,
				title: `finalize a range of IDs (cluster size =${clusterSize}${override ? ', overrides present' : ''})`,
				before: () => {
					setupCompressors(clusterSize, false, false);
					perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
				},
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
							overrides.push([(first - i) as LocalCompressedId & OpSpaceCompressedId, `override${overrideIndex++}`]);
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

					perfCompressor!.finalizeCreationRange(range);

					if (isLocal) {
						lastFinalizedLocalId1 = last;
					} else {
						lastFinalizedLocalId2 = last;
					}
					// Alternate clients to sidestep optimization that packs them all into last cluster
					session = isLocal ? session1 : session2;
				},
			});
		}
	});

	benchmark({
		type,
		title: `takes a ID creation range'})`,
		before: () => {
			setupCompressors(defaultClusterCapacity, true, false);
			perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
		},
		benchmarkFn: () => {
			perfCompressor!.generateCompressedId();
			perfCompressor!.takeNextCreationRange();
		},
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		let idToDecompress!: CompressedId;
		const before = () => {
			idToDecompress = setupCompressorWithId(local, override, true);
			perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
		};
		const benchmarkFn = () => {
			perfCompressor!.decompress(idToDecompress);
		};
		if (local) {
			benchmark({
				type,
				title: `decompress local ID into stable IDs${titleSuffix}`,
				before,
				benchmarkFn,
			});
		} else {
			const titleBase = 'decompress final ID into stable IDs';
			if (override) {
				benchmark({
					type,
					title: titleBase + titleSuffix,
					before,
					benchmarkFn,
				});
			} else {
				for (const clusterHasOverride of [true, false]) {
					benchmark({
						type,
						title: `${titleBase} (sequential, overrides ${
							clusterHasOverride ? 'present' : 'not present'
						} in owning cluster)`,
						before: () => {
							idToDecompress = setupCompressorWithId(local, override, clusterHasOverride);
							perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
						},
						benchmarkFn,
					});
				}
			}
		}
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		let stableToCompress!: string;
		benchmark({
			type,
			title: `compress a stable ID to a ${local ? 'local' : 'final'} ID${titleSuffix}`,
			before: () => {
				const idAdded = setupCompressorWithId(local, override, true);
				stableToCompress = compressor.decompress(idAdded);
				perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			},
			benchmarkFn: () => {
				perfCompressor!.recompress(stableToCompress);
			},
		});
	});

	let final!: FinalCompressedId;
	benchmark({
		type,
		title: `normalize a final ID from the local session to session space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			network.allocateAndSendIds(localClient, 1);
			network.deliverOperations(localClient);
			const log = network.getSequencedIdLog(localClient);
			const id = compressor.normalizeToOpSpace(log[log.length - 1].id);
			final = isFinalId(id) ? id : fail('not a final ID');
			perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
		},
		benchmarkFn: () => {
			perfCompressor!.normalizeToSessionSpace(final, compressor.localSessionId);
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

	let localId!: LocalCompressedId;
	benchmark({
		type,
		title: `normalize a local ID from the local session to session space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			network.deliverOperations(localClient);
			localId = getLastLocalId(localClient, network);
			perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
		},
		benchmarkFn: () => {
			perfCompressor!.normalizeToOpSpace(localId);
		},
	});

	const remoteSessionId = sessionIds.get(remoteClient);
	let opSpaceId: OpSpaceCompressedId | undefined;
	benchmark({
		type,
		title: `normalize a local ID from a remote session to session space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			network.deliverOperations(localClient);
			opSpaceId = getLastLocalId(remoteClient, network) as OpSpaceCompressedId;
			perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
		},
		benchmarkFn: () => {
			perfCompressor!.normalizeToSessionSpace(opSpaceId ?? fail(), remoteSessionId);
		},
	});

	for (const overrideInClusters of [true, false]) {
		const titleSuffix = ` (${overrideInClusters ? 'with' : 'without'} overrides)`;
		benchmark({
			type,
			title: `serialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressors(defaultClusterCapacity, false, overrideInClusters);
				perfCompressor = network.getCompressorUnsafeNoProxy(localClient);
			},
			benchmarkFn: () => {
				perfCompressor!.serialize(false);
			},
		});

		let serialized!: SerializedIdCompressorWithNoSession;
		const remoteSessionId = createSessionId();
		benchmark({
			type,
			title: `deserialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressors(defaultClusterCapacity, false, overrideInClusters);
				serialized = compressor.serialize(false);
			},
			benchmarkFn: () => {
				IdCompressor.deserialize(serialized, remoteSessionId);
			},
		});
	}
});
