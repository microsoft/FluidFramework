/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';
import { FinalCompressedId, MinimalUuidString, SessionId } from '..';
import { assert, fail } from '../Common';
import {
	defaultClusterCapacity,
	IdCompressor,
	isFinalId,
	FinalIdGenerator,
	SerializedIdCompressorBase,
} from '../id-compressor/IdCompressor';
import { minimizeUuidString } from '../id-compressor/NumericUuid';
import { CompressedId, LocalCompressedId, StableId, UuidString } from '../Identifiers';
import {
	Client,
	createCompressor,
	makeLargeFuzzTest,
	sessionIds,
	useCompressor,
} from './utilities/IdCompressorTestUtilities';

describe('IdCompressor Perf', () => {
	const type = BenchmarkType.Measurement;
	const localClient = Client.Client1;
	const localSessionId = sessionIds[localClient];
	let compressor: IdCompressor;

	function setupCompressor(clusterSize: number, allowLocal: boolean, includeExplicitIds: boolean): CompressedId[] {
		const [perfCompressor, ids] = createPerfCompressor(clusterSize, allowLocal, includeExplicitIds, localClient);
		compressor = perfCompressor;
		return ids;
	}

	function createPerfCompressor(
		clusterSize: number,
		allowLocal: boolean,
		includeExplicitIds: boolean,
		localClient: Client
	): [IdCompressor, CompressedId[]] {
		const compressor = createCompressor(localClient, clusterSize);
		return [
			compressor,
			useCompressor(
				compressor,
				makeLargeFuzzTest(clusterSize, includeExplicitIds, allowLocal ? localClient : undefined, Math.E)
			),
		];
	}

	function setupCompressorWithId(local: boolean, explicit: boolean, clusterHasOtherExplicits: boolean): CompressedId {
		const clusterCapacity = defaultClusterCapacity;
		setupCompressor(clusterCapacity, true, true);
		const client = local ? Client.Local : localClient;
		if (!clusterHasOtherExplicits) {
			useCompressor(compressor, [
				{
					client,
					numIds: clusterCapacity,
				},
			]);
		} else {
			useCompressor(compressor, [
				{
					client,
					numIds: 2,
					explicitIds: {
						0: 'd3157abcbe514f2897e102bc8beb5a22' as StableId,
						1: '74be5c8609ef4408b08e6de4741242fb' as StableId,
					},
				},
			]);
		}
		const createdId = useCompressor(compressor, [
			{
				client,
				numIds: 1,
				explicitIds: explicit ? { 0: '1003797e4c474cb1a83d266f10872687' as StableId } : undefined,
			},
		]);
		assert(createdId.length === 1 && isFinalId(createdId[0]) === !local);
		return createdId[0];
	}

	function benchmarkWithIdTypes(creator: (local: boolean, explicit: boolean, titleSuffix: string) => void) {
		for (const local of [true, false]) {
			for (const explicit of [true, false]) {
				const titleSuffix = ` (${explicit ? 'explicit' : 'sequential'})`;
				creator(local, explicit, titleSuffix);
			}
		}
	}

	benchmarkWithIdTypes((local, explicit, titleSuffix) => {
		if (local) {
			benchmark({
				type,
				title: `allocate local ID${titleSuffix}`,
				before: () => {
					setupCompressor(defaultClusterCapacity, true, false);
				},
				benchmarkFn: () => {
					compressor.generateCompressedId(explicit ? minimizeUuidString(v4() as UuidString) : undefined);
				},
			});
		} else {
			for (const clusterSize of [1, 10, 500, 1000]) {
				let generator!: FinalIdGenerator;
				benchmark({
					type,
					title: `allocate final ID in clusters of size ${clusterSize}${titleSuffix}`,
					before: () => {
						setupCompressor(clusterSize, true, false);
						generator = compressor.getFinalIdGenerator(localSessionId);
					},
					benchmarkFn: () => {
						generator.generateFinalId(explicit ? minimizeUuidString(v4() as UuidString) : undefined);
					},
				});
			}
		}
	});

	const batchSize = 5;
	let generator!: FinalIdGenerator;
	benchmark({
		type,
		title: `allocate a final ID batch`,
		before: () => {
			setupCompressor(defaultClusterCapacity, true, true);
			assert(compressor !== undefined);
			generator = compressor.getFinalIdGenerator(compressor.localSessionId);
		},
		benchmarkFn: () => {
			generator.generateFinalIdBatch(batchSize);
		},
	});

	const explicitCollision = 'c45f3d4362da4ad99648dbd8ecc24a07' as StableId;
	benchmark({
		type,
		title: `allocate final ID that collides with an existing explicit ID`,
		before: () => {
			setupCompressor(defaultClusterCapacity, true, true);
			assert(compressor !== undefined);
			generator = compressor.getFinalIdGenerator(compressor.localSessionId);
			generator.generateFinalId(explicitCollision);
		},
		benchmarkFn: () => {
			generator.generateFinalId(explicitCollision);
		},
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
				stableToCompress = compressor.decompress(idAdded) ?? fail('Invalid compressed ID');
			},
			benchmarkFn: () => {
				compressor.compress(stableToCompress);
			},
		});
	});

	let final!: FinalCompressedId;
	benchmark({
		type,
		title: `normalize a final ID from the local session to a local ID`,
		before: () => {
			setupCompressor(defaultClusterCapacity, true, true);
			const ids = useCompressor(compressor, [
				{
					client: Client.Local,
					numIds: 1,
				},
				{
					client: localClient,
					numIds: 1,
				},
			]);
			const id = ids[1];
			final = isFinalId(id) ? id : fail('not a final ID');
		},
		benchmarkFn: () => {
			compressor.normalizeToLocal(final);
		},
	});

	let local!: LocalCompressedId;
	benchmark({
		type,
		title: `normalize a local ID from the local session to a final ID`,
		before: () => {
			setupCompressor(defaultClusterCapacity, true, true);
			const ids = useCompressor(compressor, [
				{
					client: Client.Local,
					numIds: 1,
				},
				{
					client: localClient,
					numIds: 1,
				},
			]);
			const id = ids[0];
			local = !isFinalId(id) ? id : fail('not a local ID');
		},
		benchmarkFn: () => {
			compressor.normalizeToFinal(local);
		},
	});

	let remoteSessionId: SessionId | undefined;
	benchmark({
		type,
		title: `normalize a local ID from a remote session to a final ID`,
		before: () => {
			setupCompressor(defaultClusterCapacity, true, true);
			const [remoteCompressor] = createPerfCompressor(defaultClusterCapacity, true, true, Client.Client2);
			const remoteIds = useCompressor(remoteCompressor, [
				{
					client: Client.Local,
					numIds: 1,
				},
				{
					client: Client.Client2,
					numIds: 1,
				},
			]);
			useCompressor(compressor, [
				{
					client: Client.Client2,
					numIds: 1,
				},
			]);
			const id = remoteIds[0];
			local = !isFinalId(id) ? id : fail('not a local ID');
			remoteSessionId = sessionIds[Client.Client2];
		},
		benchmarkFn: () => {
			compressor.normalizeToFinal(local, remoteSessionId);
		},
	});

	for (const explicitInClusters of [true, false]) {
		const titleSuffix = ` (${explicitInClusters ? 'with' : 'without'} explicit IDs)`;
		benchmark({
			type,
			title: `serialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressor(defaultClusterCapacity, false, explicitInClusters);
			},
			benchmarkFn: () => {
				compressor.serialize();
			},
		});

		let serialized!: SerializedIdCompressorBase;
		benchmark({
			type,
			title: `deserialize an IdCompressor${titleSuffix}`,
			before: () => {
				setupCompressor(defaultClusterCapacity, false, explicitInClusters);
				serialized = compressor.serialize();
			},
			benchmarkFn: () => {
				IdCompressor.deserialize(serialized, localSessionId);
			},
		});
	}
});
