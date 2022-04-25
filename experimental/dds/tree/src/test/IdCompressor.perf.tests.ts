/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';
import { fail, Mutable } from '../Common';
import {
	defaultClusterCapacity,
	IdCompressor,
	IdRangeDescriptor,
	isFinalId,
	isLocalId,
} from '../id-compressor/IdCompressor';
import { IdCreationRange, UnackedLocalId, SerializedIdCompressorWithNoSession } from '../id-compressor';
import { createSessionId, numericUuidFromStableId, stableIdFromNumericUuid } from '../id-compressor/NumericUuid';
import {
	CompressedId,
	FinalCompressedId,
	LocalCompressedId,
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from '../Identifiers';
import {
	Client,
	IdCompressorTestNetwork,
	performFuzzActions,
	sessionIds,
	TestIdData,
} from './utilities/IdCompressorTestUtilities';

describe('IdCompressor Perf', () => {
	const type = BenchmarkType.Measurement;
	const localClient = Client.Client1;
	const remoteClient = Client.Client2;
	let compressor: IdCompressor;
	let remoteCompressor: IdCompressor;

	function setupCompressors(
		clusterSize: number,
		allowLocal: boolean,
		includeOverrides: boolean
	): IdCompressorTestNetwork {
		const network = new IdCompressorTestNetwork(clusterSize);
		[compressor] = createPerfCompressor(network, allowLocal, includeOverrides, localClient);
		[remoteCompressor] = createPerfCompressor(network, allowLocal, includeOverrides, remoteClient);
		return network;
	}

	function createPerfCompressor(
		network: IdCompressorTestNetwork,
		allowLocal: boolean,
		includeOverrides: boolean,
		client: Client
	): [IdCompressor, readonly TestIdData[]] {
		performFuzzActions(network, Math.E, includeOverrides, client, allowLocal ? false : true);
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

	[true, false].forEach((isLocal) => {
		let range: IdRangeDescriptor<SessionSpaceCompressedId>;
		let sessionId: SessionId;
		const numIds = 100;
		const clusterSize = Math.round(numIds / 2);
		const setupRange = (isLocal: boolean) => {
			setupCompressors(clusterSize, true, false);
			const originCompressor = isLocal ? compressor : remoteCompressor;
			sessionId = originCompressor.localSessionId;
			range = originCompressor.generateCompressedIdRange(numIds);
			const creationRange = originCompressor.takeNextCreationRange();
			compressor.finalizeCreationRange(creationRange);
		};
		const beforeLocal = () => setupRange(false);
		const beforeRemote = () => setupRange(true);
		benchmark({
			type,
			title: `get ${numIds} sequential IDs for a ${isLocal ? 'local' : 'remote'} range`,
			before: isLocal ? beforeLocal : beforeRemote,
			benchmarkFn: () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const ids = compressor.getIdsFromRange(range!, sessionId!);
				for (let i = 0; i < numIds; i++) {
					ids.get(i); // get a sequential ID
				}
			},
		});
	});

	[true, false].forEach((override) => {
		const numericSource = numericUuidFromStableId(createSessionId());
		let overrideIndex = 0;
		benchmark({
			type,
			title: `allocate local ID (${override ? 'override' : 'sequential'})`,
			before: () => {
				setupCompressors(defaultClusterCapacity, true, false);
			},
			benchmarkFn: () => {
				compressor.generateCompressedId(
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

					compressor.finalizeCreationRange(range);

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

	[true, false].forEach((override) => {
		const idCount = 5;
		benchmark({
			type,
			title: `creates an ID range (${override ? 'with overrides' : ''})`,
			before: () => {
				setupCompressors(defaultClusterCapacity, true, false);
			},
			benchmarkFn: () => {
				if (override) {
					compressor.generateCompressedId(v4());
				}
				compressor.generateCompressedIdRange(idCount);
				compressor.takeNextCreationRange();
			},
		});
	});

	benchmarkWithIdTypes((local, override, titleSuffix) => {
		let idToDecompress!: CompressedId;
		const before = () => {
			idToDecompress = setupCompressorWithId(local, override, true);
		};
		const benchmarkFn = () => {
			compressor.decompress(idToDecompress);
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
			},
			benchmarkFn: () => {
				compressor.recompress(stableToCompress);
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
		},
		benchmarkFn: () => {
			compressor.normalizeToSessionSpace(final, compressor.localSessionId);
		},
	});

	let localId!: LocalCompressedId;
	benchmark({
		type,
		title: `normalize a local ID from the local session to session space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			network.allocateAndSendIds(localClient, 1);
			network.deliverOperations(localClient);
			const log = network.getIdLog(localClient);
			const id = log[log.length - 1].id;
			localId = isLocalId(id) ? id : fail('not a local ID');
		},
		benchmarkFn: () => {
			compressor.normalizeToOpSpace(localId);
		},
	});

	const remoteSessionId = sessionIds.get(remoteClient);
	let opSpaceId: OpSpaceCompressedId | undefined;
	benchmark({
		type,
		title: `normalize a local ID from a remote session to session space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			network.allocateAndSendIds(remoteClient, 1);
			const log = network.getIdLog(remoteClient);
			const id = remoteCompressor.normalizeToOpSpace(log[log.length - 1].id);
			opSpaceId = isLocalId(id) ? id : fail('not a local ID');
			// Ensure id is finalized on local compressor
			network.deliverOperations(localClient);
		},
		benchmarkFn: () => {
			compressor.normalizeToSessionSpace(opSpaceId ?? fail(), remoteSessionId);
		},
	});

	for (const overrideInClusters of [true, false]) {
		const titleSuffix = ` (${overrideInClusters ? 'with' : 'without'} overrides)`;
		benchmark({
			type,
			title: `serialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressors(defaultClusterCapacity, false, overrideInClusters);
			},
			benchmarkFn: () => {
				compressor.serialize(false);
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
