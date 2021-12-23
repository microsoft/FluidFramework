/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';
import { CompressedId, FinalCompressedId, MinimalUuidString } from '..';
import { fail } from '../Common';
import {
	defaultClusterCapacity,
	IdCompressor,
	isFinalId,
	isLocalId,
	SerializedIdCompressorWithNoSession,
} from '../id-compressor/IdCompressor';
import { IdRange } from '../id-compressor/IdRange';
import {
	createSessionId,
	minimizeUuidString,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
} from '../id-compressor/NumericUuid';
import { LocalCompressedId, OpSpaceCompressedId } from '../Identifiers';
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
	const remoteClient2 = Client.Client3;
	let compressor: IdCompressor;
	let remoteCompressor: IdCompressor;

	function setupCompressors(
		clusterSize: number,
		allowLocal: boolean,
		includeExplicitIds: boolean
	): IdCompressorTestNetwork {
		const network = new IdCompressorTestNetwork(clusterSize);
		[compressor] = createPerfCompressor(network, allowLocal, includeExplicitIds, localClient);
		[remoteCompressor] = createPerfCompressor(network, allowLocal, includeExplicitIds, remoteClient);
		return network;
	}

	function createPerfCompressor(
		network: IdCompressorTestNetwork,
		allowLocal: boolean,
		includeExplicitIds: boolean,
		client: Client
	): [IdCompressor, readonly TestIdData[]] {
		performFuzzActions(network, Math.E, includeExplicitIds, client, allowLocal ? false : true);
		return [network.getCompressorUnsafe(client), network.getIdLog(client)];
	}

	function setupCompressorWithId(local: boolean, override: boolean, clusterHasOtherExplicits: boolean): CompressedId {
		const clusterCapacity = defaultClusterCapacity;
		const network = setupCompressors(clusterCapacity, true, true);
		if (!clusterHasOtherExplicits) {
			network.allocateAndSendIds(localClient, clusterCapacity);
		} else {
			network.allocateAndSendIds(localClient, 2, {
				0: minimizeUuidString('d3157abcbe514f2897e102bc8beb5a22'),
				1: minimizeUuidString('74be5c8609ef4408b08e6de4741242fb'),
			});
		}
		network.allocateAndSendIds(
			localClient,
			1,
			override ? { 0: minimizeUuidString('1003797e4c474cb1a83d266f10872687') } : undefined
		);

		if (!local) {
			network.deliverOperations(localClient);
		}

		const ids = network.getIdLog(localClient);
		const lastId = ids[ids.length - 1].id;
		return lastId;
	}

	function benchmarkWithIdTypes(creator: (local: boolean, explicit: boolean, titleSuffix: string) => void) {
		for (const local of [true, false]) {
			for (const explicit of [true, false]) {
				const titleSuffix = ` (${explicit ? 'explicit' : 'sequential'})`;
				creator(local, explicit, titleSuffix);
			}
		}
	}

	[true, false].forEach((isLocal) => {
		let range: IdRange | undefined;
		const numImplicits = 100;
		const clusterSize = Math.round(numImplicits / 2);
		const setupRange = (isLocal: boolean) => {
			setupCompressors(clusterSize, true, false);
			range = (isLocal ? compressor : remoteCompressor).takeNextRange(numImplicits);
			compressor.finalizeRange(range);
		};
		const beforeLocal = () => setupRange(false);
		const beforeRemote = () => setupRange(true);
		benchmark({
			type,
			title: `get ${numImplicits} implicit IDs for a ${isLocal ? 'local' : 'remote'} range`,
			before: isLocal ? beforeLocal : beforeRemote,
			benchmarkFn: () => {
				const ids = compressor.getImplicitIdsFromRange(range ?? fail());
				for (let i = 0; i < numImplicits; i++) {
					ids.get(i); // get an implicit ID
				}
			},
		});
	});

	[true, false].forEach((explicit) => {
		const numericSource = numericUuidFromStableId(createSessionId());
		let explicitIndex = 0;
		benchmark({
			type,
			title: `allocate local ID (${explicit ? 'explicit' : 'sequential'})`,
			before: () => {
				setupCompressors(defaultClusterCapacity, true, false);
			},
			benchmarkFn: () => {
				compressor.generateCompressedId(
					explicit ? stableIdFromNumericUuid(numericSource, explicitIndex++) : undefined
				);
			},
		});
	});

	[true, false].forEach((explicit) => {
		for (const clusterSize of [1, 10, 500, 1000]) {
			const implicitCount = 5;
			const explicitCount = 3;
			let client = remoteClient;
			let lastFinalizedLocalId1 = 0 as LocalCompressedId;
			let lastFinalizedLocalId2 = 0 as LocalCompressedId;
			const numericSource = numericUuidFromStableId(createSessionId());
			let explicitIndex = 0;
			benchmark({
				type,
				title: `finalize a range of IDs (cluster size =${clusterSize}${explicit ? ', explicits present' : ''})`,
				before: () => {
					setupCompressors(clusterSize, true, false);
				},
				benchmarkFn: () => {
					// Create a range with as minimal overhead as possible, as we'd like for this code to not exist
					// in the timing loop at all (but benchmark forces us to do so)
					let firstImplicitLocal = ((client === remoteClient
						? lastFinalizedLocalId1
						: lastFinalizedLocalId2) - 1) as LocalCompressedId & OpSpaceCompressedId;
					let explicits: [LocalCompressedId & OpSpaceCompressedId, MinimalUuidString][] | undefined;
					const actualExplicitCount = explicit ? explicitCount : 0;
					if (actualExplicitCount > 0) {
						explicits = [];
						for (let i = 0; i < actualExplicitCount; i++) {
							explicits.push([
								(firstImplicitLocal - i) as LocalCompressedId & OpSpaceCompressedId,
								stableIdFromNumericUuid(numericSource, explicitIndex++),
							]);
						}
						firstImplicitLocal = (firstImplicitLocal - actualExplicitCount) as LocalCompressedId &
							OpSpaceCompressedId;
					}

					const range = {
						sessionId: sessionIds.get(client),
						explicitIds: explicits,
						implicitIds: { firstImplicitLocal, implicitCount },
					};

					compressor.finalizeRange(range);

					const lastFinalizedLocalIdT = (firstImplicitLocal - implicitCount) as LocalCompressedId;
					if (client === remoteClient) {
						lastFinalizedLocalId1 = lastFinalizedLocalIdT;
					} else {
						lastFinalizedLocalId2 = lastFinalizedLocalIdT;
					}
					// Alternate clients to sidestep optimization that packs them all into last cluster
					client = client === remoteClient ? remoteClient2 : remoteClient;
				},
			});
		}
	});

	[true, false].forEach((explicit) => {
		const implicitCount = 5;
		benchmark({
			type,
			title: `creates an ID range (${explicit ? 'with explicits' : ''})`,
			before: () => {
				setupCompressors(defaultClusterCapacity, true, false);
			},
			benchmarkFn: () => {
				if (explicit) {
					compressor.generateCompressedId(minimizeUuidString(v4()));
				}
				compressor.takeNextRange(implicitCount);
			},
		});
	});

	benchmarkWithIdTypes((local, explicit, titleSuffix) => {
		let idToDecompress!: CompressedId;
		const before = () => {
			idToDecompress = setupCompressorWithId(local, explicit, true);
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
			if (explicit) {
				benchmark({
					type,
					title: titleBase + titleSuffix,
					before,
					benchmarkFn,
				});
			} else {
				for (const clusterHasExplicitId of [true, false]) {
					benchmark({
						type,
						title: `${titleBase} (sequential, explicit IDs ${
							clusterHasExplicitId ? 'present' : 'not present'
						} in owning cluster)`,
						before: () => {
							idToDecompress = setupCompressorWithId(local, explicit, clusterHasExplicitId);
						},
						benchmarkFn,
					});
				}
			}
		}
	});

	benchmarkWithIdTypes((local, explicit, titleSuffix) => {
		let stableToCompress!: MinimalUuidString;
		benchmark({
			type,
			title: `compress a stable ID to a ${local ? 'local' : 'final'} ID${titleSuffix}`,
			before: () => {
				const idAdded = setupCompressorWithId(local, explicit, true);
				stableToCompress = compressor.decompress(idAdded);
			},
			benchmarkFn: () => {
				compressor.compress(stableToCompress);
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

	for (const explicitInClusters of [true, false]) {
		const titleSuffix = ` (${explicitInClusters ? 'with' : 'without'} explicit IDs)`;
		benchmark({
			type,
			title: `serialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressors(defaultClusterCapacity, false, explicitInClusters);
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
				setupCompressors(defaultClusterCapacity, false, explicitInClusters);
				serialized = compressor.serialize(false);
			},
			benchmarkFn: () => {
				IdCompressor.deserialize(serialized, remoteSessionId);
			},
		});
	}
});
