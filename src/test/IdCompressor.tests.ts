/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import {
	IdCompressor,
	isFinalId,
	SerializedIdCompressor,
	systemReservedIdCount,
	systemReservedUuidBase,
} from '../id-compressor/IdCompressor';
import { CompressedId, LocalCompressedId, FinalCompressedId, StableId } from '../Identifiers';
import { assert, assertNotUndefined, fail, Mutable, noop } from '../Common';
import {
	incrementUuid,
	NumericUuid,
	numericUuidFromUuidString,
	stableIdFromNumericUuid,
} from '../id-compressor/NumericUuid';
import { MinimalUuidString, SessionId } from '..';
import {
	Client,
	createCompressor,
	integerToStableId,
	isCapacityChange,
	makeLargeFuzzTest,
	sessionNumericUuids,
	sessionIds,
	TestUsage,
	useCompressor,
	IdAllocationUsage,
	isBatchAllocation,
} from './utilities/IdCompressorTestUtilities';

type IdCompressorScenario = readonly [
	description: string,
	clusterCapacity: number,
	localClient: Client,
	usages: TestUsage[],
	asserts: (compressor: IdCompressor, idData: readonly TestIdData[]) => void
];

interface TestIdData {
	readonly id: CompressedId;
	readonly clientIdNumber: number;
	readonly client: Client;
	readonly sessionStableId: StableId;
	readonly sessionUuid: NumericUuid;
	readonly explicitId?: MinimalUuidString;
}

describe('IdCompressor', () => {
	describe('Creation', () => {
		it('can decompress system IDs', () => {
			const systemSessionUuid = numericUuidFromUuidString(systemReservedUuidBase) ?? fail();
			const compressor = createCompressor(Client.Client1);
			for (let i = 0; i < systemReservedIdCount; i++) {
				const finalId = i as FinalCompressedId;
				const stable = compressor.decompress(finalId);
				expect(stable).to.not.be.undefined;
				expect(stable).to.equal(stableIdFromNumericUuid(incrementUuid(systemSessionUuid, i)));
				const finalIdForReserved = compressor.compress(assertNotUndefined(stable));
				if (finalIdForReserved === undefined) {
					expect.fail();
				}
				if (!isFinalId(finalIdForReserved)) {
					expect.fail();
				}
				expect(finalIdForReserved).to.equal(finalId);
			}
		});
		it('can detect invalid local session IDs', () => {
			expect(() => new IdCompressor('00000000000000000000000000000000' as SessionId)).to.throw(
				'Uuid provided is not a valid session ID.'
			);
		});
	});

	describe('ID generation and compression/decompression', () => {
		it('detects non-uuid explicit IDs', () => {
			const compressor = createCompressor(Client.Client1);
			expect(() =>
				useCompressor(compressor, [
					{
						client: Client.Client2,
						numIds: 1,
						explicitIds: {
							0: 'test' as StableId,
						},
					},
				])
			).to.throw('test is not a uuid');
		});

		it('rejects uuids that contain separators', () => {
			const compressor = createCompressor(Client.Client1);
			expect(() =>
				useCompressor(compressor, [
					{
						client: Client.Client2,
						numIds: 1,
						explicitIds: {
							0: '726197c4-d895-495e-bc2a-b7df9913200c' as StableId,
						},
					},
				])
			).to.throw('uuid must not contain separators');
		});

		it('detects invalid cluster sizes', () => {
			const compressor = createCompressor(Client.Client1, 1);
			expect(() => (compressor.clusterCapacity = 0)).to.throw('Clusters must have a positive capacity');
			expect(() => (compressor.clusterCapacity = Number.MAX_SAFE_INTEGER)).to.throw(
				'Clusters must not exceed max cluster size'
			);
		});

		it('detects invalid remote session IDs', () => {
			const compressor = createCompressor(Client.Client1, 1);
			expect(() => compressor.getFinalIdGenerator('00000000000000000000000000000000' as SessionId)).to.throw(
				'Uuid provided is not a valid session ID.'
			);
		});

		it('detects overflow in batch allocation of final IDs', () => {
			const localClient = Client.Client1;
			const localSessionId = sessionIds[localClient];
			const failure = 'The number of allocated final IDs must not exceed the JS maximum safe integer.';
			let compressor = createCompressor(localClient, 5);
			expect(() =>
				compressor.getFinalIdGenerator(localSessionId).generateFinalIdBatch(Number.MAX_SAFE_INTEGER)
			).to.throw(failure);
			// Allocate a new compressor, as the previous is left in a bad state
			compressor = createCompressor(localClient, 5);
			compressor.getFinalIdGenerator(localSessionId).generateFinalIdBatch(5);
			expect(() =>
				compressor.getFinalIdGenerator(localSessionId).generateFinalIdBatch(Number.MAX_SAFE_INTEGER)
			).to.throw(failure);
		});

		it('can allocate batches of final IDs', () => {
			const clusterSize = 5;
			const batchSize = 3;
			const localClient = Client.Client1;
			const compressor = createCompressor(localClient, clusterSize);
			const generator = compressor.getFinalIdGenerator(sessionIds[localClient]);

			const localIds = useCompressor(compressor, [{ client: Client.Local, numIds: 100 }]);
			const finalIdsBeforeBatch = useCompressor(compressor, [
				{ client: localClient, numIds: clusterSize - batchSize /* next batch will fill up the cluster */ },
			]);

			// Mix some remote final IDs in to avoid cluster expansion tricks
			useCompressor(compressor, [{ client: Client.Client2, numIds: 3 }]);

			generator.generateFinalIdBatch(batchSize);
			const finalIdsAfterFirstBatch = useCompressor(compressor, [
				{ client: localClient, numIds: clusterSize - batchSize + 1 /* next batch will overflow the cluster */ },
			]);

			// Mix some remote final IDs in to avoid cluster expansion tricks
			useCompressor(compressor, [{ client: Client.Client2, numIds: 3 }]);

			generator.generateFinalIdBatch(batchSize);
			const finalIdsAfterSecondBatch = useCompressor(compressor, [
				{ client: localClient, numIds: clusterSize - batchSize + 1 /* next batch will overflow the cluster */ },
			]);

			// No remote final IDs this time, test cluster expansion by a batch size
			generator.generateFinalIdBatch(batchSize);
			const finalIdsAfterThirdBatch = useCompressor(compressor, [
				{ client: localClient, numIds: clusterSize /* next batch will overflow the cluster */ },
			]);

			function expectMatches(localId: CompressedId, finalId: CompressedId): void {
				assert(!isFinalId(localId));
				expect(compressor.normalizeToFinal(localId)).to.equal(finalId);
				expect(localId).to.equal(compressor.normalizeToLocal(finalId));
			}

			for (let i = 0; i < finalIdsBeforeBatch.length; i++) {
				expectMatches(localIds[i], finalIdsBeforeBatch[i]);
			}

			for (let i = 0; i < finalIdsAfterFirstBatch.length; i++) {
				expectMatches(localIds[i + finalIdsBeforeBatch.length + batchSize], finalIdsAfterFirstBatch[i]);
			}

			for (let i = 0; i < finalIdsAfterSecondBatch.length; i++) {
				expectMatches(
					localIds[i + finalIdsBeforeBatch.length + finalIdsAfterFirstBatch.length + batchSize * 2],
					finalIdsAfterSecondBatch[i]
				);
			}

			for (let i = 0; i < finalIdsAfterThirdBatch.length; i++) {
				expectMatches(
					localIds[
						i +
							finalIdsBeforeBatch.length +
							finalIdsAfterFirstBatch.length +
							finalIdsAfterSecondBatch.length +
							batchSize * 3
					],
					finalIdsAfterThirdBatch[i]
				);
			}

			const finalizedCount =
				finalIdsBeforeBatch.length +
				finalIdsAfterFirstBatch.length +
				finalIdsAfterSecondBatch.length +
				finalIdsAfterThirdBatch.length +
				batchSize * 3;
			// Finalize the remainder of the local IDs
			generator.generateFinalIdBatch(localIds.length - finalizedCount);

			for (const localId of localIds) {
				if (isFinalId(localId)) {
					fail('Local IDs are final.');
				}
				const finalized = compressor.normalizeToFinal(localId);
				expect(isFinalId(finalized)).to.be.true;
				expect(compressor.normalizeToLocal(finalized)).to.equal(localId);
			}
		});

		it('can normalize compressed IDs local IDs', () => {
			const clusterCapacity = 5;
			const localCompressor: IdCompressor = createCompressor(Client.Client1, clusterCapacity);
			const remoteCompressor: IdCompressor = createCompressor(Client.Client2, clusterCapacity);

			const usages = [
				{
					client: Client.Local,
					numIds: clusterCapacity,
				},
				{
					client: Client.Client1,
					numIds: clusterCapacity,
				},
				{
					client: Client.Client2,
					numIds: clusterCapacity,
				},
				{
					client: Client.Local,
					numIds: clusterCapacity - 2,
				},
				{
					client: Client.Client1,
					numIds: clusterCapacity - 2,
				},
				{
					client: Client.Client2,
					numIds: clusterCapacity - 3,
				},
			];

			const idData: [local: CompressedId[], final: CompressedId[]][] = [];
			idData[Client.Client1] = [[], []];
			idData[Client.Client2] = [[], []];

			function useBothCompressors(usages: IdAllocationUsage[]): CompressedId[] {
				const totalIds: CompressedId[] = [];
				for (const usage of usages) {
					useCompressor(remoteCompressor, [usage]);
					const ids = useCompressor(localCompressor, [usage]);
					totalIds.push(...ids);
					const isLocal = usage.client === Client.Local;
					const actualClient = isLocal ? Client.Client1 : usage.client;
					idData[actualClient][isLocal ? 0 : 1].push(...ids);
				}
				return totalIds;
			}

			const ids = useBothCompressors(usages);
			expect(idData[Client.Client2][0].length).to.equal(0);
			expect(
				idData[Client.Client1][0].length + idData[Client.Client1][1].length + idData[Client.Client2][1].length
			).to.equal(ids.length);

			const localIds = idData[Client.Client1][0];
			for (const id of localIds) {
				expect(isFinalId(id)).to.be.false;
				expect(localCompressor.normalizeToLocal(id)).to.equal(id);
			}

			const finalizedIds = idData[Client.Client1][1];
			for (let i = 0; i < finalizedIds.length; i++) {
				const id = finalizedIds[i];
				expect(isFinalId(id)).to.be.true;
				expect(remoteCompressor.normalizeToLocal(id)).to.equal(id);
				const localLocalized = localCompressor.normalizeToLocal(id);
				expect(isFinalId(localLocalized)).to.be.false;
				expect(localLocalized).to.equal(localIds[i]);
			}

			for (const id of idData[Client.Client2][1]) {
				expect(isFinalId(id)).to.be.true;
				expect(isFinalId(remoteCompressor.normalizeToLocal(id))).to.be.false;
				expect(localCompressor.normalizeToLocal(id)).to.equal(id);
			}
		});

		it('can normalize local IDs from a remote session to final IDs', () => {
			const localCompressor: IdCompressor = createCompressor(Client.Client1);
			const remoteCompressor: IdCompressor = createCompressor(Client.Client2);
			const usages = [
				{
					client: Client.Local,
					numIds: 5,
				},
				{
					client: Client.Client1,
					numIds: 5,
				},
				{
					client: Client.Client2,
					numIds: 5,
				},
				{
					client: Client.Client1,
					numIds: 5,
				},
				{
					client: Client.Client2,
					numIds: 5,
				},
			];
			const remoteIds = useCompressor(remoteCompressor, usages);
			const remoteLocalIds = remoteIds.filter((compressedId) => !isFinalId(compressedId)) as LocalCompressedId[];
			remoteLocalIds.forEach((remoteLocalId) => {
				expect(localCompressor.normalizeToFinal(remoteLocalId, remoteCompressor.localSessionId)).to.be
					.undefined;
			});
			useCompressor(localCompressor, usages);
			remoteLocalIds.forEach((remoteLocalId) => {
				expect(localCompressor.normalizeToFinal(remoteLocalId, remoteCompressor.localSessionId)).to.equal(
					remoteCompressor.normalizeToFinal(remoteLocalId)
				);
			});
		});

		it('can normalize local IDs from a local session to final IDs', () => {
			const compressor = createCompressor(Client.Client1, 2);
			const compressorClone = createCompressor(Client.Client1, 2);
			// This local ID is only allocated on the clone, so it should not decompress on the original compressor
			const unallocatedLocal = compressorClone.generateCompressedId();
			assert(!isFinalId(unallocatedLocal));
			expect(() => compressor.normalizeToFinal(1 as LocalCompressedId)).to.throw('1 is not an local ID.');
			expect(() => compressor.normalizeToFinal(unallocatedLocal)).to.throw(
				'Supplied local ID was not created by this compressor.'
			);
			const client1Ids = useCompressor(compressor, [
				{
					client: Client.Local,
					numIds: 1,
				},
			]);
			const firstLocal = client1Ids[0];
			assert(!isFinalId(firstLocal));
			expect(compressor.normalizeToFinal(firstLocal)).to.equal(firstLocal);
			client1Ids.push(
				...useCompressor(compressor, [
					{
						client: Client.Client1,
						numIds: 1,
					},
				])
			);
			expect(compressor.normalizeToFinal(firstLocal)).to.equal(client1Ids[1]);
			client1Ids.push(
				...useCompressor(compressor, [
					{
						client: Client.Local,
						numIds: 10,
					},
				])
			);
			useCompressor(compressor, [
				{
					client: Client.Client2,
					numIds: 2,
				},
			]);
			client1Ids.push(
				...useCompressor(compressor, [
					{
						client: Client.Client1,
						numIds: 3,
					},
				])
			);
			useCompressor(compressor, [
				{
					client: Client.Client2,
					numIds: 2,
				},
			]);
			client1Ids.push(
				...useCompressor(compressor, [
					{
						client: Client.Client1,
						numIds: 1,
					},
				])
			);
			const localIds = client1Ids.filter((compressedId) => !isFinalId(compressedId)) as LocalCompressedId[];
			const finalIds = client1Ids.filter((compressedId) => isFinalId(compressedId)) as FinalCompressedId[];
			for (let i = 0; i < localIds.length; i++) {
				if (i < finalIds.length) {
					expect(compressor.normalizeToFinal(localIds[i])).to.equal(finalIds[i]);
				} else {
					expect(compressor.normalizeToFinal(localIds[i])).to.equal(localIds[i]);
				}
			}
		});

		it('can normalize local IDs to final IDs in a large fuzz session', () => {
			const [compressorAUsages, compressorBUsages] = makeFuzzLocalAndRemoteCompressorPair(10);
			const [compressorA, compressorAIds] = compressorAUsages;
			const [compressorB, compressorBIds] = compressorBUsages;
			const results: [IdCompressor, CompressedId[], IdCompressor][] = [
				[compressorA, compressorAIds, compressorB],
				[compressorB, compressorBIds, compressorA],
			];
			results.forEach(([localCompressor, ids, remoteCompressor]) => {
				const localIds = ids.filter((compressedId) => !isFinalId(compressedId)) as LocalCompressedId[];
				localIds.forEach((localId) => {
					const finalIdLocal = localCompressor.normalizeToFinal(localId);
					const finalIdRemote = remoteCompressor.normalizeToFinal(localId, localCompressor.localSessionId);
					assert(finalIdRemote !== undefined);
					expect(finalIdLocal).to.equal(finalIdRemote);
					expect(localCompressor.decompress(finalIdLocal)).to.equal(
						remoteCompressor.decompress(finalIdRemote)
					);
				});
			});
		});

		it('unifies duplicate explicit ids', () => {
			const uuid = '03c63ee57a4346d6bd9ced779d94f654' as StableId;
			const compressor1 = createCompressor(Client.Client1, 3);
			const compressor2 = createCompressor(Client.Client2, 3);

			// Client1 compresses a uuid
			const localId1_1 = compressor1.generateCompressedId(uuid);
			const localId1_2 = compressor1.generateCompressedId(uuid);
			expect(localId1_1).to.equal(localId1_2, 'only one local ID should be allocated for the same uuid');
			expect(compressor1.decompress(localId1_1)).to.equal(uuid, 'uuid incorrectly associated with local ID');

			// Client2 compresses the same uuid before seeing Client1's compressed version
			compressor2.generateCompressedId(); // Interleave to ensure local IDs are different
			const localId2_1 = compressor2.generateCompressedId(uuid);
			const localId2_2 = compressor2.generateCompressedId(uuid);
			expect(localId2_1).to.equal(localId2_2, 'only one local ID should be allocated for the same uuid');
			expect(compressor2.decompress(localId2_1)).to.equal(uuid, 'uuid incorrectly associated with local ID');

			const generator1 = compressor1.getFinalIdGenerator(compressor1.localSessionId);
			const generator2 = compressor2.getFinalIdGenerator(compressor2.localSessionId);

			// Client1's compression is final
			const finalIdForUuid1_1 = generator1.generateFinalId(uuid);
			const finalIdForUuid2_1 = generator2.generateFinalId(uuid);
			expect(isFinalId(finalIdForUuid1_1)).to.be.true;
			expect(finalIdForUuid1_1).equals(finalIdForUuid2_1);
			expect(compressor1.compress(uuid)).to.equal(finalIdForUuid1_1);

			// Client2's compression is final
			const finalIdForUuid1_2 = generator1.generateFinalId(uuid);
			const finalIdForUuid2_2 = generator2.generateFinalId(uuid);
			expect(finalIdForUuid1_2).to.equal(
				finalIdForUuid2_2,
				'only one final ID should be allocated for the same uuid'
			);
			expect(finalIdForUuid1_2).to.equal(finalIdForUuid1_1, 'final IDs for the same uuid should be deduplicated');
			const uuidDecompressed = compressor1.decompress(finalIdForUuid1_1);
			expect(uuidDecompressed).to.equal(uuid);
			expect(uuidDecompressed).to.equal(compressor2.decompress(finalIdForUuid1_1));
		});

		it('detects explicit ids that collide with sequential ids', () => {
			const clusterCapacity = 3;
			const explicitInInitialCluster = stableIdFromNumericUuid(
				incrementUuid(sessionNumericUuids[Client.Client1], clusterCapacity - 1)
			);
			const explicitOutsideInitialCluster = stableIdFromNumericUuid(
				incrementUuid(sessionNumericUuids[Client.Client1], clusterCapacity)
			);
			const makeFailure = (explicitId): string =>
				`Explicit ID ${explicitId} collides with another allocated uuid.`;
			const failure = makeFailure(explicitInInitialCluster);

			const scenarios: [(compressor: IdCompressor) => void, string | undefined][] = [
				[
					(compressor) => {
						useCompressor(compressor, [
							{
								client: Client.Client1,
								numIds: 3,
							},
							{
								client: Client.Client2,
								numIds: 1,
								explicitIds: {
									0: explicitOutsideInitialCluster,
								},
							},
						]);
					},
					undefined, // No failure expected
				],
				[
					(compressor) => {
						useCompressor(compressor, [
							{
								client: Client.Client1,
								numIds: 3,
							},
							{
								client: Client.Client2,
								numIds: 1,
								explicitIds: {
									// Collide with the last final ID in the previous cluster (uuid base + 2)
									0: explicitInInitialCluster,
								},
							},
						]);
					},
					failure,
				],
				[
					(compressor) => {
						useCompressor(compressor, [
							{
								client: Client.Client2,
								numIds: 1,
								explicitIds: {
									// Collide with the last final ID in the cluster about to be created
									0: explicitInInitialCluster,
								},
							},
							{
								client: Client.Client1,
								numIds: 3,
							},
						]);
					},
					failure,
				],
				[
					(compressor) => {
						useCompressor(compressor, [
							{
								client: Client.Client1,
								numIds: 1,
							},
							{
								client: Client.Client2,
								numIds: 1,
								explicitIds: {
									// Collide with an empty part of the cluster, since it has been reserved
									0: explicitInInitialCluster,
								},
							},
						]);
					},
					failure,
				],
				[
					(compressor) => {
						useCompressor(compressor, [
							{
								client: Client.Client1,
								numIds: 3,
							},
							{
								client: Client.Client2,
								numIds: 1,
								explicitIds: {
									// Will collide with the next cluster created by Client1
									0: explicitOutsideInitialCluster,
								},
							},
							{
								client: Client.Client1,
								numIds: 1,
							},
						]);
					},
					explicitOutsideInitialCluster,
				],
			];
			scenarios.forEach((scenario) => {
				const compressor = createCompressor(Client.Client1, clusterCapacity);
				if (scenario[1] !== undefined) {
					expect(() => scenario[0](compressor)).to.throw(scenario[1]);
				} else {
					expect(() => scenario[0](compressor)).to.not.throw();
				}
			});
		});

		const scenarios: IdCompressorScenario[] = [
			[
				'can decompress local IDs before and after sequencing',
				3,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 5,
						explicitIds: { 1: '01674aef6b2e4e388212f2de4e5e4068' as StableId },
					},
					{
						client: Client.Client1,
						numIds: 5,
						explicitIds: { 1: '01674aef6b2e4e388212f2de4e5e4068' as StableId },
					},
				],
				(compressor, idData) => {
					for (let i = 0; i < 5; i++) {
						const local = idData[i];
						const final = idData[i + 5];
						expect(isFinalId(local.id)).to.be.false;
						expect(isFinalId(final.id)).to.be.true;
						const localStable = compressor.decompress(local.id);
						const finalStable = compressor.decompress(final.id);
						expect(localStable).to.not.be.undefined;
						expect(localStable).to.equal(finalStable);
					}
				},
			],
			[
				'will not decompress ids for empty parts of clusters',
				5,
				Client.Client1,
				[
					{ client: Client.Client1, numIds: 1 },
					{ client: Client.Client2, numIds: 1 },
				],
				(compressor, idData) => {
					expect(idData.length).to.equal(2);
					// Traverse the range of final IDs that should be covered by clusters (but unallocated) and assert they do not
					// decompress (except for the two requested)
					for (const idDataPoint of idData) {
						let offset = 1;
						const idAsNumber = idDataPoint.id as number;
						for (let i = idAsNumber + 1; i < idAsNumber + 5; i++, offset++) {
							expect(compressor.decompress(i as FinalCompressedId)).to.be.undefined;
							const correspondingStableId = stableIdFromNumericUuid(idDataPoint.sessionUuid, offset);
							expect(compressor.compress(correspondingStableId)).to.be.undefined;
						}
					}
				},
			],
			[
				'can decompress final IDs from a single client',
				3,
				Client.Client1,
				[{ client: Client.Client1, numIds: 4 }],
				noop,
			],
			[
				'can decompress final IDs from multiple clients',
				3,
				Client.Client1,
				[
					{ client: Client.Client1, numIds: 2 },
					{ client: Client.Client2, numIds: 3 },
					{ client: Client.Client1, numIds: 5 },
					{ client: Client.Client3, numIds: 3 },
					{ client: Client.Client2, numIds: 3 },
				],
				noop,
			],
			[
				'can re-compress local stable IDs',
				3,
				Client.Client1,
				[{ client: Client.Local, numIds: 2 }],
				(compressor, idData) => {
					for (let i = 0; i < 2; i++) {
						const local = idData[i];
						expect(isFinalId(local.id)).to.be.false;
						const localStable = compressor.decompress(local.id);
						if (localStable === undefined) {
							expect.fail();
						}
						const recompressed = compressor.compress(localStable);
						expect(recompressed).to.equal(local.id);
					}
					const numericSession = sessionNumericUuids[Client.Client1];
					const notAllocatedStable = stableIdFromNumericUuid(numericSession, 10);
					expect(compressor.compress(notAllocatedStable)).to.be.undefined;
				},
			],
			[
				'can decompress final explicit IDs',
				3,
				Client.Client1,
				[
					{
						client: Client.Client1,
						numIds: 2,
						explicitIds: {
							1: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
						},
					},
					{
						client: Client.Client2,
						numIds: 3,
						explicitIds: {
							0: '98d37498701d42bbabb5831eea3106ad' as StableId,
							2: 'cd6ae62c515f4ae48625701a8b8eb435' as StableId,
						},
					},
				],
				noop,
			],
			[
				'can compress an explicit ID that aligns with cluster boundaries',
				2,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 2,
						explicitIds: {
							0: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
						},
					},
					{
						client: Client.Client1,
						numIds: 2,
						explicitIds: {
							0: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
						},
					},
				],
				noop,
			],
			[
				'can decompress local IDs after sequencing',
				2,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 5,
						explicitIds: {
							1: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
							3: '542f1a60cc294addbc91ed3d87e76f9f' as StableId,
						},
					},
					{
						client: Client.Client2,
						numIds: 10,
					},
					{
						client: Client.Client1,
						numIds: 5,
						explicitIds: {
							1: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
							3: '542f1a60cc294addbc91ed3d87e76f9f' as StableId,
						},
					},
					{
						client: Client.Client3,
						numIds: 10,
					},
				],
				noop,
			],
			[
				'can dynamically change cluster size',
				2,
				Client.Client1,
				[
					...[...new Array(20).keys()].map((i) => {
						if (i % 2 === 1) {
							return { newClusterCapacity: i };
						}
						return {
							client: i % 3,
							numIds: i * 2,
						};
					}),
				],
				noop,
			],
			[
				'can process batch final ID allocations from multiple clients',
				3,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 100,
					},
					{
						client: Client.Client1,
						numIds: 2,
					},
					{
						client: Client.Client2,
						numIds: 5,
					},
					{
						client: Client.Client1,
						batchSize: 1,
					},
					{
						client: Client.Client1,
						numIds: 2,
					},
					{
						client: Client.Client1,
						batchSize: 5,
					},
					{
						client: Client.Client2,
						numIds: 10,
					},
					{
						client: Client.Client1,
						numIds: 3,
					},
				],
				noop,
			],
			[
				'returns undefined when decompressing a uuid that was never compressed',
				3,
				Client.Client1,
				[
					{
						client: Client.Client2,
						numIds: 10,
						explicitIds: {
							0: '20aa9f408d114e0faef7657c2b862b01' as StableId,
							3: '9849f95bd7234c69abecfa49dcccd37c' as StableId,
						},
					},
				],
				(compressor) => {
					expect(compressor.compress('00d9f957b0d546519b50362b53e9c8fa' as StableId)).to.be.undefined;
					expect(compressor.decompress((systemReservedIdCount + 100) as FinalCompressedId)).to.be.undefined;
					expect(compressor.decompress(-1 as LocalCompressedId)).to.be.undefined;
				},
			],
			[
				'can generate IDs for large fuzzed input',
				3,
				Client.Client1,
				makeLargeFuzzTest(3, true, Client.Client1, 2001),
				noop,
			],
		];

		/**
		 *
		 * @param compressor the compressor owning the ID
		 * @param data the ID data
		 * @param correspondingLocalId a corresponding local ID if `data` is a final ID generated by the local session, otherwise undefined.
		 * @param correspondingFinalId a corresponding final ID if `data` is a local ID generated by the local session that was finalized
		 * individually, true if it was finalized by the local session in a batch, otherwise false.
		 */
		function expectValidId(
			compressor: IdCompressor,
			data: TestIdData,
			correspondingLocalId: LocalCompressedId | undefined,
			correspondingFinalId: FinalCompressedId | boolean
		): void {
			const stableId = compressor.decompress(data.id);
			if (stableId === undefined) {
				expect.fail('compressed id did not decompress to stable id');
			}
			const compressed = compressor.compress(stableId);
			if (compressed === undefined) {
				expect.fail('stable id does not compress');
			}
			const localized = compressor.normalizeToLocal(compressed);
			if (!isFinalId(data.id)) {
				const finalized = compressor.normalizeToFinal(data.id);
				if (typeof correspondingFinalId === 'boolean') {
					expect(isFinalId(finalized)).to.equal(correspondingFinalId);
					expect(isFinalId(compressed)).to.equal(correspondingFinalId);
					if (correspondingFinalId) {
						expect(finalized).to.equal(compressed);
					} else {
						expect(finalized).to.equal(data.id);
						expect(compressed).to.equal(data.id);
					}
				} else {
					expect(finalized).to.equal(correspondingFinalId);
					expect(compressed).to.equal(finalized);
				}
			} else {
				if (correspondingLocalId !== undefined) {
					const finalized = compressor.normalizeToFinal(correspondingLocalId);
					expect(data.id).to.equal(finalized);
					expect(finalized).to.equal(compressed);
					expect(localized).to.equal(correspondingLocalId);
				} else {
					expect(compressed).to.equal(data.id);
				}
			}
			if (isFinalId(compressed) === isFinalId(data.id)) {
				expect(compressed).to.equal(data.id, 'bidirectional mapping not correct');
			}
			if (data.explicitId === undefined && !isFinalId(data.id)) {
				expect(stableId).to.equal(
					stableIdFromNumericUuid(incrementUuid(data.sessionUuid, data.clientIdNumber)),
					'non-sequential uuids generated'
				);
			} else if (data.explicitId !== undefined) {
				expect(stableId).to.equal(data.explicitId);
			}
		}

		scenarios.forEach((scenario) => {
			it(scenario[0], () => {
				const compressor = createCompressor(scenario[2]);
				compressor.clusterCapacity = scenario[1];
				const sessionIdCounts = new Map<string, number>();
				const idDataWithoutIds: Mutable<Omit<TestIdData, 'id'>>[] = [];
				const finalIndexToBatchOffset: number[] = [];
				let totalLocalIdCount = 0;
				let currentLocalOffset = 0;
				for (const usage of scenario[3]) {
					if (!isCapacityChange(usage)) {
						const isLocal = usage.client === Client.Local;
						const realClient = isLocal ? scenario[2] : usage.client;
						const isFinalizingLocal = usage.client === scenario[2];
						const sessionStableId = sessionIds[realClient];
						const accumulatorClientKey = isLocal ? 'local' : sessionStableId;
						let clientIdNumber = sessionIdCounts.get(accumulatorClientKey) ?? 0;
						if (isBatchAllocation(usage)) {
							sessionIdCounts.set(accumulatorClientKey, clientIdNumber + usage.batchSize);
							if (isFinalizingLocal) {
								currentLocalOffset += usage.batchSize;
							}
						} else {
							for (let j = 0; j < usage.numIds; j++) {
								const idDataPoint = {
									client: realClient,
									clientIdNumber,
									sessionStableId,
									sessionUuid: sessionNumericUuids[realClient],
									explicitId: usage.explicitIds === undefined ? undefined : usage.explicitIds[j],
								};
								idDataWithoutIds.push(idDataPoint);
								if (isFinalizingLocal) {
									finalIndexToBatchOffset.push(currentLocalOffset);
								} else if (isLocal) {
									totalLocalIdCount++;
								}
								clientIdNumber++;
							}
							sessionIdCounts.set(accumulatorClientKey, clientIdNumber);
						}
					}
				}

				const localIndexToBatchOffset: (number | boolean)[] = [];
				let prevOffset = 0;
				for (const currentOffset of finalIndexToBatchOffset) {
					for (let i = 0; i < currentOffset - prevOffset; i++) {
						localIndexToBatchOffset.push(true);
					}
					localIndexToBatchOffset.push(currentOffset);
					prevOffset = currentOffset;
				}
				for (let i = localIndexToBatchOffset.length; i < totalLocalIdCount; i++) {
					localIndexToBatchOffset.push(false);
				}

				const idData: TestIdData[] = [];
				let idsProcessed = 0;
				const localIds: LocalCompressedId[] = [];
				const finalizedLocalIds: FinalCompressedId[] = [];
				const ids = useCompressor(compressor, scenario[3], (usage, idsInProgress) => {
					while (idsProcessed < idsInProgress.length) {
						const id = idsInProgress[idsProcessed];
						const isLocal = usage.client === Client.Local;
						const isFinalizedLocal = usage.client === scenario[2];
						expect(isFinalId(id)).to.equal(!isLocal);
						if (!isFinalId(id)) {
							localIds.push(id);
						} else if (isFinalizedLocal) {
							finalizedLocalIds.push(id);
						}
						const dataWithoutId = idDataWithoutIds[idsProcessed];
						const idDataPoint = { ...dataWithoutId, id };
						idData.push(idDataPoint);
						const finalizedIndex = finalizedLocalIds.length - 1;
						expectValidId(
							compressor,
							idDataPoint,
							isFinalizedLocal
								? localIds[finalizedIndex + finalIndexToBatchOffset[finalizedIndex]]
								: undefined,
							isFinalizedLocal && isFinalId(id) ? id : false
						);
						idsProcessed++;
					}
				});

				expect(ids.length).to.equal(idData.length);
				expect(idData.length).to.equal(idDataWithoutIds.length);

				let localIdCount = 0;
				let finalizedIdCount = 0;
				idData.forEach((data) => {
					let correspondingLocalId: LocalCompressedId | undefined;
					let correspondingFinalId: FinalCompressedId | boolean;
					if (!isFinalId(data.id)) {
						correspondingLocalId = data.id;
						const batchOffset = localIndexToBatchOffset[localIdCount];
						correspondingFinalId =
							typeof batchOffset === 'boolean'
								? batchOffset
								: finalizedLocalIds[localIdCount - batchOffset];
						localIdCount++;
					} else {
						if (data.client === scenario[2]) {
							correspondingLocalId =
								localIds[finalizedIdCount + finalIndexToBatchOffset[finalizedIdCount]];
							finalizedIdCount++;
						} else {
							correspondingLocalId = undefined;
						}
						correspondingFinalId = data.id;
					}
					expectValidId(compressor, data, correspondingLocalId, correspondingFinalId);
				});
				scenario[4](compressor, idData);
			});
		});
	});

	/**
	 * Creates two compressors, each having received the same final ID generation requests.
	 * The two have different local session IDs and have processed requests for local ID generation.
	 */
	function makeFuzzLocalAndRemoteCompressorPair(seed: number): [IdCompressor, CompressedId[]][] {
		const clientAId = Client.Client1;
		const clientBId = Client.Client2;
		const compressorA = createCompressor(clientAId);
		const compressorB = createCompressor(clientBId);
		const clusterSize = 5;
		const includeExplicitIds = true;
		const localUsages = makeLargeFuzzTest(clusterSize, includeExplicitIds, clientAId, seed);
		const remoteUsages = makeLargeFuzzTest(clusterSize, includeExplicitIds, clientBId, seed);
		const results: [IdCompressor, CompressedId[]][] = [
			[compressorA, useCompressor(compressorA, localUsages)],
			[compressorB, useCompressor(compressorB, remoteUsages)],
		];
		return results;
	}

	describe('Serialization', () => {
		function roundtrip(compressor: IdCompressor, sessionId?: SessionId): [SerializedIdCompressor, IdCompressor] {
			const serialized = compressor.serialize();
			const deserialized = IdCompressor.deserialize(serialized, sessionId ?? compressor.localSessionId);
			return [serialized, deserialized];
		}
		function expectSerializes(compressor: IdCompressor): SerializedIdCompressor {
			const [serialized, deserialized] = roundtrip(compressor);
			const chainCount: number[] = [];
			for (let i = 0; i < serialized.sessions.length; i++) {
				chainCount[i] = 0;
			}
			const chainProcessed: number[] = [...chainCount];

			for (const cluster of serialized.clusters) {
				const [sessionIndex] = cluster;
				expect(sessionIndex < serialized.sessions.length);
				chainCount[sessionIndex]++;
			}

			for (const cluster of serialized.clusters) {
				const [sessionIndex, capacity, maybeSize] = cluster;
				const chainIndex = chainProcessed[sessionIndex];
				if (chainIndex < chainCount[sessionIndex] - 1) {
					expect(maybeSize === undefined);
				} else {
					expect(maybeSize === undefined || typeof maybeSize !== 'number' || maybeSize < capacity);
				}
				chainProcessed[sessionIndex]++;
			}
			expect(compressor.equals(deserialized)).to.be.true;
			return serialized;
		}

		it('can serialize an empty compressor', () => {
			const compressor = createCompressor(Client.Client1);
			const serialized = expectSerializes(compressor);
			expect(serialized.clusters.length).to.equal(0, 'system cluster should not be serialized');
		});

		it('round-trips local state if deserialization uses the same session ID', () => {
			const compressor = createCompressor(Client.Client1, 3);
			useCompressor(compressor, [
				{ client: Client.Local, numIds: 12 },
				{ client: Client.Client1, numIds: 2 },
				{ client: Client.Client2, numIds: 3 },
				{ client: Client.Client1, numIds: 5 },
				{ client: Client.Client1, numIds: 5 },
				{ client: Client.Client3, numIds: 3 },
				{ client: Client.Client2, numIds: 3 },
				{ client: Client.Local, numIds: 4 },
			]);
			expectSerializes(compressor);
		});

		it('drops local state if deserialization uses a different session ID', () => {
			const capacity = 3;
			const compressor = createCompressor(Client.Client1, capacity);
			const compressorNoLocal = createCompressor(Client.Client3, capacity);
			const finalUsages = [
				{ client: Client.Client1, numIds: 2 },
				{ client: Client.Client2, numIds: 3 },
			];
			useCompressor(compressor, [{ client: Client.Local, numIds: 5 }, ...finalUsages]);
			useCompressor(compressorNoLocal, finalUsages);
			const [_, roundtripped] = roundtrip(compressor, sessionIds[Client.Client3]);
			expect(roundtripped.equals(compressorNoLocal)).to.be.true;
			expect(compressorNoLocal.serialize().localState).to.be.undefined;
		});

		it('finalizes local IDs', () => {
			// Upholds the queue invariant in top-level IdCompressor doc
			function expectIdsFinalize(compressor: IdCompressor, client: Client, numIds: number): void {
				const localIds = useCompressor(compressor, [{ client: Client.Local, numIds }]);
				const finalizedIds = useCompressor(compressor, [{ client, numIds }]);
				expect(localIds.map((id) => compressor.decompress(id))).to.deep.equal(
					finalizedIds.map((id) => compressor.decompress(id))
				);
			}

			const capacity = 3;
			const compressor = createCompressor(Client.Client1, capacity);
			expectIdsFinalize(compressor, Client.Client1, 2);
			useCompressor(compressor, [{ client: Client.Client1, numIds: capacity * 2 }]);
			expectIdsFinalize(compressor, Client.Client1, 2);
			useCompressor(compressor, [{ client: Client.Client2, numIds: capacity * 2 }]);
			expectIdsFinalize(compressor, Client.Client1, 2);
		});

		it('can serialize a cluster chain with an smaller explicit ID overriding the first final ID', () => {
			// the uuid ordering will look like:
			// 0000-0000-0000-0001 (explicit)
			// 0000-0000-0000-000C (cluster 1)
			// 0000-0000-0000-000E (cluster 2),
			// XXXX-XXXX-XXXX-XXXX (system cluster),
			// The first of them is an explicit ID that maps to the first final ID in the cluster ending in 0C.
			// This test is a glass box test that ensures the backwards walk through the cluster chain handles this case correctly.
			const explicitId = integerToStableId(1);
			const sessionStableId = integerToStableId(10) as SessionId; // This is a valid SessionId since its highest order bit is 0
			const compressor = new IdCompressor(sessionStableId);
			const clusterSize = 2;
			const numClusters = 2;
			compressor.clusterCapacity = 2;
			const generator = compressor.getFinalIdGenerator(sessionStableId);
			generator.generateFinalId(explicitId);
			for (let i = 1; i < numClusters * clusterSize; i++) {
				generator.generateFinalId();
			}
			expectSerializes(compressor);
		});

		const scenarios: [
			description: string,
			clusterCapacity: number,
			localClient: Client,
			usages: TestUsage[],
			asserts: (compressor: IdCompressor, serialized: SerializedIdCompressor) => void
		][] = [
			[
				'can serialize a partially empty cluster',
				5,
				Client.Client1,
				[
					{ client: Client.Local, numIds: 2 },
					{ client: Client.Client1, numIds: 2 },
				],
				noop,
			],
			['can serialize a full cluster', 2, Client.Client1, [{ client: Client.Client1, numIds: 2 }], noop],
			[
				'can serialize full clusters from different clients',
				2,
				Client.Client1,
				[
					{ client: Client.Local, numIds: 2 },
					{ client: Client.Client1, numIds: 2 },
					{ client: Client.Client2, numIds: 2 },
				],
				noop,
			],
			[
				'can serialize clusters of different sizes and clients',
				3,
				Client.Client1,
				[
					{ client: Client.Local, numIds: 2 },
					{ client: Client.Client1, numIds: 2 },
					{ client: Client.Client2, numIds: 3 },
					{ client: Client.Client1, numIds: 5 },
					{ client: Client.Client1, numIds: 5 },
					{ client: Client.Client3, numIds: 3 },
					{ client: Client.Client2, numIds: 3 },
					{ client: Client.Local, numIds: 4 },
				],
				noop,
			],
			[
				'can serialize clusters with explicit ids',
				3,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 2,
						explicitIds: {
							1: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
						},
					},
					{
						client: Client.Client1,
						numIds: 2,
						explicitIds: {
							1: 'b2043d3f57bf4c38b97a01b380539ff1' as StableId,
						},
					},
					{
						client: Client.Client2,
						numIds: 3,
						explicitIds: {
							0: '98d37498701d42bbabb5831eea3106ad' as StableId,
							2: 'c25c9a04d1e0463bb44fe18cb46b7ddf' as StableId,
						},
					},
				],
				noop,
			],
			[
				'packs IDs into a single cluster when a single client generates non-explicit ids',
				3,
				Client.Client1,
				[
					{ client: Client.Local, numIds: 20 },
					{ client: Client.Client1, numIds: 20 },
				],
				(_, serialized) => {
					expect(serialized.clusters.length).to.equal(1);
				},
			],
			[
				'does not pack IDs into a single cluster when explicit IDs are present',
				3,
				Client.Client1,
				[
					{
						client: Client.Local,
						numIds: 20,
						explicitIds: { 10: '34caac2168f647dfb54b593c7c452e3f' as StableId },
					},
					{
						client: Client.Client1,
						numIds: 20,
						explicitIds: { 10: '34caac2168f647dfb54b593c7c452e3f' as StableId },
					},
				],
				(_, serialized) => {
					expect(serialized.clusters.length).to.equal(2);
				},
			],
			[
				'can serialize after a large fuzz input',
				3,
				Client.Client1,
				makeLargeFuzzTest(3, true, Client.Client1, Math.PI),
				noop,
			],
		];

		scenarios.forEach((scenario) => {
			it(scenario[0], () => {
				const compressor = createCompressor(scenario[2]);
				compressor.clusterCapacity = scenario[1];
				useCompressor(compressor, scenario[3]);
				const serialized = expectSerializes(compressor);
				scenario[4](compressor, serialized);
			});
		});
	});
});
