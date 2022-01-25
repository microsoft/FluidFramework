/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4, v5 } from 'uuid';
import {
	IdCompressor,
	isFinalId,
	isLocalId,
	reservedIdCount,
	reservedSessionId,
	reservedIdRange,
	hasOngoingSession,
} from '../id-compressor/IdCompressor';
import { LocalCompressedId, FinalCompressedId, SessionSpaceCompressedId, OpSpaceCompressedId } from '../Identifiers';
import { assert, assertNotUndefined, fail } from '../Common';
import {
	assertIsStableId,
	createSessionId as createSessionId,
	incrementUuid,
	isStableId,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
} from '../id-compressor/NumericUuid';
import { IdRange, UnackedLocalId } from '../id-compressor/IdRange';
import {
	createCompressor,
	performFuzzActions,
	sessionIds,
	IdCompressorTestNetwork,
	Client,
	DestinationClient,
	MetaClient,
	expectSerializes,
	roundtrip,
	sessionNumericUuids,
} from './utilities/IdCompressorTestUtilities';
import { expectDefined } from './utilities/TestUtilities';

describe('IdCompressor', () => {
	it('detects invalid cluster sizes', () => {
		const compressor = createCompressor(Client.Client1, 1);
		expect(() => (compressor.clusterCapacity = -1)).to.throw('Clusters must have a positive capacity');
		expect(() => (compressor.clusterCapacity = 0)).to.throw('Clusters must have a positive capacity');
		expect(() => (compressor.clusterCapacity = IdCompressor.maxClusterSize + 1)).to.throw(
			'Clusters must not exceed max cluster size'
		);
	});

	it('reports the proper session ID', () => {
		const sessionId = createSessionId();
		const compressor = new IdCompressor(sessionId);
		expect(compressor.localSessionId).to.equal(sessionId);
	});

	describe('ID Generation', () => {
		it('can create a compressed ID with an override', () => {
			const compressor = createCompressor(Client.Client1);
			const override = 'override';
			const id = compressor.generateCompressedId(override);
			expect(compressor.decompress(id)).to.equal(override);
		});

		it('can create compressed IDs with v5 overrides', () => {
			const compressor = createCompressor(Client.Client1);
			const uuidA = v5('foo', '7834b437-6e8c-4936-a1a3-0130b1178f17');
			const uuidB = uuidA.slice(0, uuidA.length - 1) + (uuidA.charAt(uuidA.length - 1) === 'a' ? 'b' : 'a');
			const idA = compressor.generateCompressedId(uuidA);
			const idB = compressor.generateCompressedId(uuidB);
			expect(compressor.decompress(idA)).to.equal(uuidA);
			expect(compressor.decompress(idB)).to.equal(uuidB);
		});

		it('can manually create a compressed ID', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			expect(id).to.equal(compressor.compress(uuid));
		});

		it('will not decompress IDs it did not compress', () => {
			const compressor = createCompressor(Client.Client1);
			expect(() => compressor.decompress(-1 as LocalCompressedId)).to.throw(
				'Cannot decompress ID which is not known to this compressor'
			);
			expect(() => compressor.decompress(reservedIdCount as FinalCompressedId)).to.throw(
				'Cannot decompress ID which is not known to this compressor'
			);
		});

		it('will not re-compress uuids it did not originally compress', () => {
			const compressor = createCompressor(Client.Client1);
			expect(compressor.compress('5fff846a-efd4-42fb-8b78-b32ce2672f99')).to.be.undefined;
		});

		it('unifies duplicate overrides originating from the same compressor', () => {
			const override = 'override';
			const compressor = createCompressor(Client.Client1, 3);

			// Client1 compresses a uuid
			const localId1 = compressor.generateCompressedId(override);
			const localId2 = compressor.generateCompressedId(override);
			expect(localId1).to.equal(localId2, 'only one local ID should be allocated for the same uuid');
			expect(compressor.decompress(localId1)).to.equal(override, 'uuid incorrectly associated with local ID');
		});

		it('cannot create negative amounts of implicit IDs', () => {
			expect(() => createCompressor(Client.Client1).takeNextRange(-1)).to.throw(
				'Implicit count cannot be negative.'
			);
		});
	});

	it('only sends attribution info on the first range from each session', () => {
		const compressor = createCompressor(Client.Client1, 5, 'attribution');
		const range1 = compressor.takeNextRange(0);
		expectDefined(range1.attributionInfo);
		const range2 = compressor.takeNextRange(1);
		expect(range2.attributionInfo).to.be.undefined;
	});

	describe('can produce a range', () => {
		const tests: {
			title: string;
			overrideIndices: number[];
			firstImplicitIndex: number;
			implicitCount: number;
		}[] = [
			{ title: 'that is empty', overrideIndices: [], firstImplicitIndex: 0, implicitCount: 0 },
			{ title: 'with only implicit IDs', overrideIndices: [], firstImplicitIndex: 0, implicitCount: 3 },
			{
				title: 'with an overriding ID',
				overrideIndices: [0],
				firstImplicitIndex: 1,
				implicitCount: 0,
			},
			{
				title: 'with an explicit ID before an overriding ID',
				overrideIndices: [1],
				firstImplicitIndex: 2,
				implicitCount: 0,
			},
			{
				title: 'with an explicit ID after an overriding ID',
				overrideIndices: [0],
				firstImplicitIndex: 2,
				implicitCount: 0,
			},
			{
				title: 'with an overriding ID between explicit IDs',
				overrideIndices: [1],
				firstImplicitIndex: 3,
				implicitCount: 0,
			},
			{
				title: 'with an overriding ID and implicit IDs',
				overrideIndices: [0],
				firstImplicitIndex: 1,
				implicitCount: 3,
			},
			{
				title: 'with an explicit ID before an overriding ID and implicit IDs',
				overrideIndices: [1],
				firstImplicitIndex: 2,
				implicitCount: 3,
			},
			{
				title: 'with an explicit ID after an overriding ID and implicit IDs',
				overrideIndices: [0],
				firstImplicitIndex: 2,
				implicitCount: 3,
			},
			{
				title: 'with an overriding ID between explicit IDs and implicit IDs',
				overrideIndices: [1],
				firstImplicitIndex: 3,
				implicitCount: 3,
			},
		];

		tests.forEach(({ title, overrideIndices, firstImplicitIndex, implicitCount }) => {
			it(title, () => {
				const compressor = createCompressor(Client.Client1);
				validateIdRange(compressor, firstImplicitIndex, implicitCount, new Set(overrideIndices));
			});

			tests.forEach(
				({
					title: title2,
					overrideIndices: overrideIndices2,
					firstImplicitIndex: firstImplicitIndex2,
					implicitCount: implicitCount2,
				}) => {
					it(`${title2} after a range ${title}`, () => {
						const compressor = createCompressor(Client.Client1);
						const lastTaken = validateIdRange(
							compressor,
							firstImplicitIndex,
							implicitCount,
							new Set(overrideIndices)
						);
						validateIdRange(
							compressor,
							firstImplicitIndex2,
							implicitCount2,
							new Set(overrideIndices2),
							lastTaken
						);
					});
				}
			);
		});

		function validateIdRange(
			compressor: IdCompressor,
			firstImplicitIndex: number,
			implicitCount: number,
			overrideIndices: Set<number>,
			lastTakenId = 0 as UnackedLocalId
		): UnackedLocalId {
			const overrides: [SessionSpaceCompressedId, string?][] = [];
			for (let i = 0; i < firstImplicitIndex; i++) {
				const override = overrideIndices.has(i) ? v4() : undefined;
				const id = compressor.generateCompressedId(override);
				overrides.push([id, override]);
			}
			const range = compressor.takeNextRange(implicitCount);
			let newLastTakenId = lastTakenId;
			let explicitsActual = IdRange.getExplicits(range);
			if (overrides.length === 0) {
				expect(explicitsActual).to.be.undefined;
			} else {
				explicitsActual = expectDefined(explicitsActual);
				expect(overrides[0][0]).to.equal(explicitsActual.first);
				expect(overrides[overrides.length - 1][0]).to.equal(explicitsActual.last);
				for (const [id, uuid] of Object.entries(overrideIndices)) {
					expect(overrides[id][1]).to.equal(uuid);
				}
				newLastTakenId = explicitsActual.last;
			}

			let implicitsActual = IdRange.getImplicits(range);
			if (implicitCount === 0) {
				expect(implicitsActual).to.be.undefined;
			} else {
				implicitsActual = expectDefined(implicitsActual);
				if (overrides.length > 0) {
					expect(implicitsActual.first).to.equal(overrides[overrides.length - 1][0] - 1);
				} else {
					expect(implicitsActual.first).to.equal(lastTakenId - 1);
				}

				expect(implicitsActual.last).to.equal(newLastTakenId - implicitCount);
				expect(implicitsActual.count).to.equal(implicitCount);
				newLastTakenId = implicitsActual.last;
			}

			return newLastTakenId;
		}
	});

	describe('Finalizing', () => {
		it('can finalize multiple overrides into the same cluster using different ranges', () => {
			const compressor = createCompressor(Client.Client1);
			const override1 = 'override1';
			const override2 = 'override2';
			const id1 = compressor.generateCompressedId(override1);
			const range1 = compressor.takeNextRange(1);
			const id2 = compressor.generateCompressedId(override2);
			const range2 = compressor.takeNextRange(0);
			compressor.finalizeRange(range1);
			compressor.finalizeRange(range2);
			const finalId1 = compressor.normalizeToOpSpace(id1);
			const finalId2 = compressor.normalizeToOpSpace(id2);
			expect(isFinalId(finalId1)).to.be.true;
			expect(isFinalId(finalId2)).to.be.true;
			expect(compressor.decompress(finalId1)).to.equal(override1);
			expect(compressor.decompress(finalId2)).to.equal(override2);
		});

		it('prevents attempts to finalize ranges twice', () => {
			const implicitCompressor = createCompressor(Client.Client1);
			const implicitRange = implicitCompressor.takeNextRange(1);
			implicitCompressor.finalizeRange(implicitRange);
			expect(() => implicitCompressor.finalizeRange(implicitRange)).to.throw('Ranges finalized out of order.');

			// Make a new compressor, as the first one will be left in a bad state
			const explicitCompressor = createCompressor(Client.Client1);
			explicitCompressor.generateCompressedId();
			const explicitRange = explicitCompressor.takeNextRange(1);
			explicitCompressor.finalizeRange(explicitRange);
			expect(() => explicitCompressor.finalizeRange(explicitRange)).to.throw('Ranges finalized out of order.');
		});

		it('prevents attempts to finalize ranges out of order', () => {
			const implicitCompressor = createCompressor(Client.Client1);
			implicitCompressor.takeNextRange(1);
			const implicitRange = implicitCompressor.takeNextRange(1);
			expect(() => implicitCompressor.finalizeRange(implicitRange)).to.throw('Ranges finalized out of order.');

			// Make a new compressor, as the first one will be left in a bad state
			const explicitCompressor = createCompressor(Client.Client1);
			explicitCompressor.generateCompressedId();
			explicitCompressor.takeNextRange(1);
			explicitCompressor.generateCompressedId();
			const explicitRange = implicitCompressor.takeNextRange(1);
			expect(() => explicitCompressor.finalizeRange(explicitRange)).to.throw('Ranges finalized out of order.');
		});

		it('prevents finalizing unacceptably enormous amounts of ID allocation', () => {
			const compressor1 = createCompressor(Client.Client1);
			const compressor2 = createCompressor(Client.Client2);
			const integerLargerThanHalfMax = Math.round((Number.MAX_SAFE_INTEGER / 3) * 2);
			const range1 = compressor1.takeNextRange(integerLargerThanHalfMax);
			const range2 = compressor2.takeNextRange(integerLargerThanHalfMax);
			compressor1.finalizeRange(range1);
			expect(() => compressor1.finalizeRange(range2)).to.throw(
				'The number of allocated final IDs must not exceed the JS maximum safe integer.'
			);
		});
	});

	describe('Compression', () => {
		it('can re-compress a sequential uuid it generated', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			expect(compressor.compress(uuid)).to.equal(id);
			compressor.finalizeRange(compressor.takeNextRange(0));
			expect(compressor.compress(uuid)).to.equal(id);
		});

		it('can re-compress an override', () => {
			const compressor = createCompressor(Client.Client1);
			const override = 'override';
			const id = compressor.generateCompressedId(override);
			expect(compressor.compress(override)).to.equal(id);
			compressor.finalizeRange(compressor.takeNextRange(0));
			expect(compressor.compress(override)).to.equal(id);
		});

		it('can re-compress uuids from a remote client it has finalized', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const override = 'override';
			compressor.generateCompressedId(override);
			const uuid = compressor.decompress(id);

			const compressor2 = createCompressor(Client.Client2);
			compressor2.finalizeRange(compressor.takeNextRange(0));
			const finalId1 = compressor2.compress(uuid);
			const finalId2 = compressor2.compress(override);
			if (finalId1 === undefined || finalId2 === undefined) {
				expect.fail();
			}
			expect(isFinalId(finalId1)).to.be.true;
			expect(isFinalId(finalId2)).to.be.true;
		});

		it('will not compress a uuid it never compressed or finalized', () => {
			const compressor = createCompressor(Client.Client1, 5);
			// Leading zeroes to exploit calls to getOrNextLower on uuid maps, as it will be before test session uuids
			const override = 'override';
			expect(compressor.compress(override)).to.be.undefined;
			expect(compressor.compress(stableIdFromNumericUuid(sessionNumericUuids.get(Client.Client1), 1))).to.be
				.undefined;
			compressor.generateCompressedId(override);
			compressor.finalizeRange(compressor.takeNextRange(2));
			expect(compressor.compress(stableIdFromNumericUuid(sessionNumericUuids.get(Client.Client1), 4))).to.be
				.undefined;
		});
	});

	describe('Decompression', () => {
		it('can decompress a local ID before and after finalizing', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			expect(isStableId(uuid)).to.be.true;
			compressor.finalizeRange(compressor.takeNextRange(0));
			expect(compressor.decompress(id)).to.equal(uuid);
		});

		it('can decompress reserved IDs', () => {
			// This is a glass box test in that it increments UUIDs
			const reservedSessionUuid = numericUuidFromStableId(reservedSessionId);
			const compressor = createCompressor(Client.Client1);
			const reservedIds = compressor.getImplicitIdsFromRange(reservedIdRange);
			for (let i = 0; i < reservedIdCount; i++) {
				const reservedId = reservedIds.get(i);
				const stable = compressor.decompress(reservedId);
				expect(stable).to.equal(stableIdFromNumericUuid(incrementUuid(reservedSessionUuid, i)));
				const finalIdForReserved = compressor.compress(stable);
				if (finalIdForReserved === undefined) {
					expect.fail();
				}
				if (isLocalId(finalIdForReserved)) {
					expect.fail();
				}
				expect(finalIdForReserved).to.equal(reservedId);
			}
			const outOfBoundsError = 'Index out of bounds of implicit range.';
			expect(() => reservedIds.get(-1)).to.throw(outOfBoundsError);
			expect(() => reservedIds.get(reservedIdCount)).to.throw(outOfBoundsError);
		});

		it('can decompress a final ID', () => {
			const compressor = createCompressor(Client.Client1);
			const range = compressor.takeNextRange(1);
			compressor.finalizeRange(range);
			const finalId = compressor.normalizeToOpSpace(compressor.getImplicitIdsFromRange(range).get(0));
			if (isLocalId(finalId)) {
				expect.fail('Op space ID was finalized but is local');
			}
			const uuid = compressor.decompress(finalId);
			expect(isStableId(uuid)).to.be.true;
		});

		it('can decompress a final ID with an override', () => {
			const compressor = createCompressor(Client.Client1);
			const override = 'override';
			const id = compressor.generateCompressedId(override);
			const range = compressor.takeNextRange(0);
			compressor.finalizeRange(range);
			const finalId = compressor.normalizeToOpSpace(id);
			if (isLocalId(finalId)) {
				expect.fail('Op space ID was finalized but is local');
			}
			const uuid = compressor.decompress(finalId);
			expect(uuid).to.equal(override);
		});
	});

	describe('Normalization', () => {
		it('can normalize a local ID to op space before finalizing', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const normalized = compressor.normalizeToOpSpace(id);
			expect(isLocalId(id)).to.be.true;
			expect(id).to.equal(normalized);
		});

		it('can normalize a local ID to op space after finalizing', () => {
			const compressor = createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			compressor.finalizeRange(compressor.takeNextRange(0));
			const normalized = compressor.normalizeToOpSpace(id);
			expect(isFinalId(normalized)).to.be.true;
			expect(id).to.not.equal(normalized);
		});

		it('cannot normalize a remote ID to session space if it has not been finalized', () => {
			const compressor1 = createCompressor(Client.Client1);
			const compressor2 = createCompressor(Client.Client2);
			const normalized = compressor1.normalizeToOpSpace(compressor1.generateCompressedId());
			expect(() => compressor2.normalizeToSessionSpace(normalized, compressor1.localSessionId)).to.throw(
				'No IDs have ever been finalized by the supplied session.'
			);
		});

		it('can normalize local and final IDs from a remote session to session space', () => {
			const compressor1 = createCompressor(Client.Client1);
			const compressor2 = createCompressor(Client.Client2);
			const id = compressor1.generateCompressedId();
			const normalizedLocal = compressor1.normalizeToOpSpace(id);
			const range = compressor1.takeNextRange(0);
			compressor1.finalizeRange(range);
			const normalizedFinal = compressor1.normalizeToOpSpace(id);
			compressor2.finalizeRange(range);
			expect(isLocalId(normalizedLocal)).to.be.true;
			expect(isFinalId(normalizedFinal)).to.be.true;
			expect(compressor2.normalizeToSessionSpace(normalizedFinal, compressor1.localSessionId)).to.equal(
				normalizedFinal
			);
			expect(compressor2.normalizeToSessionSpace(normalizedLocal, compressor1.localSessionId)).to.equal(
				normalizedFinal
			);
		});
	});

	describe('Serialization', () => {
		it('can serialize an empty compressor', () => {
			const compressor = createCompressor(Client.Client1);
			const [serializedNoSession, serializedWithSession] = expectSerializes(compressor);
			expect(serializedWithSession.clusters.length).to.equal(0, 'reserved cluster should not be serialized');
			expect(serializedNoSession.clusters.length).to.equal(0, 'reserved cluster should not be serialized');
		});

		it('correctly deserializes and resumes a session', () => {
			const compressor1 = createCompressor(Client.Client1, undefined, Client.Client1);
			const compressor2 = createCompressor(Client.Client2, undefined, Client.Client2);
			const range1 = compressor1.takeNextRange(1);
			compressor1.finalizeRange(range1);
			compressor2.finalizeRange(range1);
			const [_, serializedWithSession] = expectSerializes(compressor1);
			const compressorResumed = IdCompressor.deserialize(serializedWithSession);
			const range2 = compressorResumed.takeNextRange(1);
			compressor1.finalizeRange(range2);
			compressor2.finalizeRange(range2);
			expect(
				IdCompressor.deserialize(compressor1.serialize(false), createSessionId()).equals(
					IdCompressor.deserialize(compressor2.serialize(false), createSessionId()),
					false // don't compare local state
				)
			).to.be.true;
		});
	});

	// No validation, as these leave the network in a broken state
	describeNetworkNoValidation('detects UUID collision', (itNetwork) => {
		itNetwork('when an override collides with a sequentially-allocated UUID', 2, (network) => {
			network.allocateAndSendIds(Client.Client1, 1);
			network.deliverOperations(Client.Client1);
			const compressor1 = network.getCompressor(Client.Client1);
			const id = network.getIdLog(Client.Client1)[0].id;
			const uuid = compressor1.decompress(id);
			expect(() => network.allocateAndSendIds(Client.Client1, 1, { 0: uuid })).to.throw(
				`Override '${uuid}' collides with another allocated UUID.`
			);
		});

		itNetwork(
			'when a client requests an override that is an UUID reserved for later allocation by a cluster',
			2,
			(network) => {
				network.allocateAndSendIds(Client.Client1, 1);
				network.deliverOperations(Client.Client1);
				const compressor1 = network.getCompressor(Client.Client1);
				const id = network.getIdLog(Client.Client1)[0].id;
				const uuid = assertIsStableId(compressor1.decompress(id));
				const nextUuid = stableIdFromNumericUuid(numericUuidFromStableId(uuid), 1);
				expect(() => network.allocateAndSendIds(Client.Client1, 1, { 0: nextUuid })).to.throw(
					`Override '${nextUuid}' collides with another allocated UUID.`
				);
			}
		);

		itNetwork(
			'when a new cluster is allocated whose base UUID collides with an existing override',
			2,
			(network) => {
				network.allocateAndSendIds(Client.Client1, 1);
				network.deliverOperations(DestinationClient.All);
				const compressor1 = network.getCompressor(Client.Client1);
				const id = network.getIdLog(Client.Client1)[0].id;
				const uuid = assertIsStableId(compressor1.decompress(id));
				const nextUuid = stableIdFromNumericUuid(numericUuidFromStableId(uuid), 2);
				network.allocateAndSendIds(Client.Client1, 1, { 0: nextUuid });
				network.allocateAndSendIds(Client.Client2, 1);
				network.deliverOperations(DestinationClient.All);
				network.allocateAndSendIds(Client.Client1, 1); // new cluster
				expect(() => network.deliverOperations(Client.Client1)).to.throw(
					`Override '${nextUuid}' collides with another allocated UUID.`
				);
			}
		);

		itNetwork('detects colliding override UUIDs when expanding a cluster', 1, (network) => {
			// This is a glass box test in that it is testing cluster expansion
			network.allocateAndSendIds(Client.Client1, 1);
			network.deliverOperations(DestinationClient.All);
			const compressor1 = network.getCompressor(Client.Client1);
			const id = network.getIdLog(Client.Client1)[0].id;
			const uuid = assertIsStableId(compressor1.decompress(id));
			const expansion = 3;
			const nextUuid = stableIdFromNumericUuid(numericUuidFromStableId(uuid), expansion);
			network.allocateAndSendIds(Client.Client1, expansion, { 0: nextUuid });
			expect(() => network.deliverOperations(DestinationClient.All)).to.throw(
				`Override '${nextUuid}' collides with another allocated UUID.`
			);
		});
	});

	describeNetwork('Networked', (itNetwork) => {
		describe('can attribute', () => {
			itNetwork('local IDs before and after being finalized', (network) => {
				const compressor = network.getCompressor(Client.Client1);
				network.allocateAndSendIds(Client.Client1, 1);
				const id = network.getIdLog(Client.Client1)[0].id;
				expect(compressor.attributeId(id)).to.equal(Client.Client1);
				network.deliverOperations(Client.Client1);
				expect(compressor.attributeId(id)).to.equal(Client.Client1);
			});

			itNetwork('final IDs from a remote session', (network) => {
				const compressor = network.getCompressor(Client.Client1);
				network.allocateAndSendIds(Client.Client2, 1);
				network.deliverOperations(DestinationClient.All);
				const id = network.getSequencedIdLog(Client.Client1)[0].id;
				expect(compressor.attributeId(id)).to.equal(Client.Client2);
			});

			itNetwork('final IDs from multiple remote sessions', 1, (network) => {
				const compressor = network.getCompressor(Client.Client1);
				// Ensure multiple clusters are made by each client. Cluster size === 1.
				network.allocateAndSendIds(Client.Client1, compressor.clusterCapacity);
				network.allocateAndSendIds(Client.Client2, compressor.clusterCapacity);
				network.allocateAndSendIds(Client.Client3, compressor.clusterCapacity);
				network.allocateAndSendIds(Client.Client1, compressor.clusterCapacity);
				network.allocateAndSendIds(Client.Client2, compressor.clusterCapacity);
				network.allocateAndSendIds(Client.Client3, compressor.clusterCapacity);
				network.deliverOperations(DestinationClient.All);
				const log = network.getSequencedIdLog(Client.Client1);
				expect(compressor.attributeId(log[0].id)).to.equal(Client.Client1);
				expect(compressor.attributeId(log[1].id)).to.equal(Client.Client2);
				expect(compressor.attributeId(log[2].id)).to.equal(Client.Client3);
				expect(compressor.attributeId(log[3].id)).to.equal(Client.Client1);
				expect(compressor.attributeId(log[4].id)).to.equal(Client.Client2);
				expect(compressor.attributeId(log[5].id)).to.equal(Client.Client3);
			});

			itNetwork('unified IDs', (network) => {
				const override = 'override';
				const allTargets = network.getTargetCompressors(DestinationClient.All);
				for (const [client, compressor] of allTargets) {
					network.allocateAndSendIds(client, 1, { 0: override });
					for (const { id } of network.getIdLog(client)) {
						expect(compressor.attributeId(id)).to.equal(client);
					}
				}
				network.deliverOperations(DestinationClient.All);
				const firstTarget = allTargets[0][0];
				for (const [client, compressor] of allTargets) {
					for (const { id } of network.getIdLog(client)) {
						expect(compressor.attributeId(id)).to.equal(firstTarget);
					}
				}
			});
		});

		itNetwork('upholds the invariant that IDs always decompress to the same UUID', 2, (network) => {
			network.allocateAndSendIds(Client.Client1, 5, {
				1: 'override1',
			});
			network.allocateAndSendIds(Client.Client2, 5, {
				2: 'override2',
			});
			network.allocateAndSendIds(Client.Client3, 5, {
				3: 'override3',
			});

			const preAckLocals = new Map<Client, [SessionSpaceCompressedId, string][]>();
			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				const locals: [SessionSpaceCompressedId, string][] = [];
				for (const idData of network.getIdLog(client)) {
					locals.push([idData.id, compressor.decompress(idData.id)]);
				}
				preAckLocals.set(client, locals);
			}

			// Ack all IDs
			network.deliverOperations(DestinationClient.All);

			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				const preAckLocalIds = preAckLocals.get(client) ?? fail();
				let i = 0;
				for (const idData of network.getIdLog(client)) {
					if (idData.originatingClient === client) {
						expect(isFinalId(idData.id)).to.be.false;
						const currentUuid = compressor.decompress(idData.id);
						expect(currentUuid).to.equal(preAckLocalIds[i % preAckLocalIds.length][1]);
						i++;
					}
				}
			}
		});

		itNetwork('can normalize session space IDs to op space', 5, (network) => {
			const clusterCapacity = 5;
			const idCount = clusterCapacity * 2;
			for (let i = 0; i < idCount; i++) {
				network.allocateAndSendIds(Client.Client1, 1);
				network.allocateAndSendIds(Client.Client2, 1);
				network.allocateAndSendIds(Client.Client3, 1);
			}

			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				for (const idData of network.getIdLog(client)) {
					expect(idData.originatingClient).to.equal(client);
					expect(isLocalId(compressor.normalizeToOpSpace(idData.id))).to.be.true;
				}
			}

			network.deliverOperations(DestinationClient.All);

			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				for (const idData of network.getIdLog(client)) {
					expect(isFinalId(compressor.normalizeToOpSpace(idData.id))).to.be.true;
				}
			}
		});

		itNetwork('can normalize local op space IDs from a local session to session space IDs', (network) => {
			const compressor = network.getCompressor(Client.Client1);
			const range = network.allocateAndSendIds(Client.Client1, 1);
			network.deliverOperations(Client.Client1);
			const id = compressor.normalizeToOpSpace(compressor.getImplicitIdsFromRange(range).get(0));
			expect(isFinalId(id)).to.be.true;
			expect(isLocalId(compressor.normalizeToSessionSpace(id, compressor.localSessionId))).to.be.true;
		});

		itNetwork('can normalize local op space IDs from a remote session to session space IDs', (network) => {
			const compressor1 = network.getCompressor(Client.Client1);
			const compressor2 = network.getCompressor(Client.Client2);
			const range = network.allocateAndSendIds(Client.Client1, 1);
			// Mimic sending a reference to an ID that hasn't been acked yet, such as in a slow network
			const id = compressor1.normalizeToOpSpace(compressor1.getImplicitIdsFromRange(range).get(0));
			const getSessionNormalizedId = () => compressor2.normalizeToSessionSpace(id, compressor1.localSessionId);
			expect(getSessionNormalizedId).to.throw('No IDs have ever been finalized by the supplied session.');
			network.deliverOperations(Client.Client2);
			expect(isFinalId(getSessionNormalizedId())).to.be.true;
		});

		itNetwork('unifies duplicate overrides', 3, (network) => {
			const override = 'override';
			const compressor1 = network.getCompressor(Client.Client1);
			const compressor2 = network.getCompressor(Client.Client2);
			const compressor3 = network.getCompressor(Client.Client3);
			const clusterCapacity = compressor1.clusterCapacity;

			// Ensure some clusters exist to avoid simple case of empty clusters
			network.allocateAndSendIds(Client.Client1, clusterCapacity);
			network.allocateAndSendIds(Client.Client2, clusterCapacity);
			network.allocateAndSendIds(Client.Client3, clusterCapacity);
			network.deliverOperations(DestinationClient.All);

			const range1 = network.allocateAndSendIds(Client.Client1, 1, { 0: override });
			const overrides1 = expectDefined(IdRange.getExplicits(range1)?.overrides);
			const id1 = compressor1.normalizeToSessionSpace(overrides1[0][0], compressor1.localSessionId);
			const opNormalizedLocal1 = compressor1.normalizeToOpSpace(id1);
			expect(isLocalId(opNormalizedLocal1)).to.be.true;
			expect(isFinalId(id1)).to.be.false;

			network.deliverOperations(DestinationClient.Client1);

			const finalId1 = compressor1.normalizeToOpSpace(id1);
			expect(isFinalId(finalId1)).to.be.true;

			const range2 = network.allocateAndSendIds(Client.Client2, 2, { 1: override });
			const overrides2 = expectDefined(IdRange.getExplicits(range2)?.overrides);
			const id2 = compressor2.normalizeToSessionSpace(overrides2[0][0], compressor2.localSessionId);
			const opNormalizedLocal2 = compressor2.normalizeToOpSpace(id2);
			expect(isLocalId(opNormalizedLocal2)).to.be.true;
			expect(isFinalId(id2)).to.be.false;

			network.allocateAndSendIds(Client.Client3, 1);
			network.deliverOperations(DestinationClient.All);

			const finalId2 = compressor2.normalizeToOpSpace(id2);
			expect(isFinalId(finalId2)).to.be.true;

			expect(finalId1).to.equal(finalId2);

			expect(compressor1.normalizeToOpSpace(id1)).to.equal(finalId1);
			expect(compressor1.normalizeToSessionSpace(finalId1, compressor1.localSessionId)).to.equal(id1);
			expect(compressor1.normalizeToSessionSpace(opNormalizedLocal2, compressor2.localSessionId)).to.equal(id1);
			expect(compressor1.decompress(id1)).to.equal(override);
			expect(compressor1.decompress(finalId1)).to.equal(override);
			expect(compressor1.compress(override)).to.equal(id1);

			expect(compressor2.normalizeToOpSpace(id2)).to.equal(finalId2);
			expect(compressor2.normalizeToSessionSpace(finalId1, compressor1.localSessionId)).to.equal(id2);
			expect(compressor2.normalizeToSessionSpace(opNormalizedLocal1, compressor1.localSessionId)).to.equal(id2);
			expect(compressor2.decompress(id2)).to.equal(override);
			expect(compressor2.decompress(finalId2)).to.equal(override);
			expect(compressor2.compress(override)).to.equal(id2);

			expect(compressor3.normalizeToSessionSpace(finalId1, compressor1.localSessionId)).to.equal(finalId1);
			expect(compressor3.normalizeToSessionSpace(opNormalizedLocal1, compressor1.localSessionId)).to.equal(
				finalId1
			);
			expect(compressor3.normalizeToSessionSpace(opNormalizedLocal2, compressor2.localSessionId)).to.equal(
				finalId1
			);
			expect(compressor3.decompress(finalId1)).to.equal(override);
			expect(compressor3.compress(override)).to.equal(finalId1);
		});

		itNetwork('maintains alignment after unifying duplicate overrides', 3, (network) => {
			const override = 'override';
			network.allocateAndSendIds(Client.Client1, 1, { 0: override });
			network.allocateAndSendIds(Client.Client2, 2, { 1: override });
			network.allocateAndSendIds(Client.Client1, 5);
			network.allocateAndSendIds(Client.Client2, 5);
			expectSequencedLogsAlign(network, Client.Client1, Client.Client2, 1);
		});

		function expectSequencedLogsAlign(
			network: IdCompressorTestNetwork,
			client1: Client,
			client2: Client,
			numUnifications = 0
		): void {
			network.deliverOperations(DestinationClient.All);
			assert(client1 !== client2);
			const log1 = network.getSequencedIdLog(client1);
			const log2 = network.getSequencedIdLog(client2);
			expect(log1.length).to.equal(log2.length);
			const compressor1 = network.getCompressor(client1);
			const compressor2 = network.getCompressor(client2);
			const ids = new Set<OpSpaceCompressedId>();
			const uuidsOrOverrides = new Set<string>();
			for (let i = 0; i < log1.length; i++) {
				const data1 = log1[i];
				const id1 = compressor1.normalizeToOpSpace(data1.id);
				const id2 = compressor2.normalizeToOpSpace(log2[i].id);
				expect(isFinalId(id1)).to.be.true;
				ids.add(id1);
				expect(id1).to.equal(id2);
				const uuidOrOverride1 = compressor1.decompress(id1);
				uuidsOrOverrides.add(uuidOrOverride1);
				if (data1.expectedOverride === undefined) {
					expect(isStableId(uuidOrOverride1)).to.be.true;
				}
				expect(uuidOrOverride1).to.equal(compressor2.decompress(id2));
			}
			const expectedSize = log1.length - numUnifications;
			expect(ids.size).to.equal(expectedSize);
			expect(uuidsOrOverrides.size).to.equal(expectedSize);
		}

		itNetwork('produces ID spaces correctly', (network) => {
			// This test asserts that IDs returned from IDCompressor APIs are correctly encoded as either local or final.
			// This is a glass box test in that it assumes the negative/positive encoding of CompressedIds (negative = local, positive = final).
			const compressor1 = network.getCompressor(Client.Client1);

			// Client 1 makes two IDs, two explicit (one with an override) and one implicit
			network.allocateAndSendIds(Client.Client1, 3, {
				1: 'override1',
			});

			network.getIdLog(Client.Client1).forEach((id) => expect(id.id).to.be.lessThan(0));

			// Client 1's IDs have not been acked so have no op space equivalent
			network
				.getIdLog(Client.Client1)
				.forEach((idData) => expect(compressor1.normalizeToOpSpace(idData.id)).to.be.lessThan(0));

			// Client 1's IDs are acked
			network.deliverOperations(Client.Client1);
			network.getIdLog(Client.Client1).forEach((id) => expect(id.id).to.be.lessThan(0));

			// Client 3 makes two IDs, two explicit (one with an override) and one implicit
			network.allocateAndSendIds(Client.Client2, 3, {
				1: 'override2',
			});

			network.getIdLog(Client.Client2).forEach((id) => expect(id.id).to.be.lessThan(0));

			// Client 1 receives Client 2's IDs
			network.deliverOperations(Client.Client1);

			network
				.getIdLog(Client.Client1)
				.slice(-3)
				.forEach((id) => expect(id.id).to.be.greaterThan(0));

			// All IDs have been acked or are from another client, and therefore have a final form in op space
			network
				.getIdLog(Client.Client1)
				.forEach((idData) => expect(compressor1.normalizeToOpSpace(idData.id)).to.be.greaterThan(0));

			// Compression should preserve ID space correctness
			network.getIdLog(Client.Client1).forEach((idData) => {
				const roundtripped = compressor1.compress(compressor1.decompress(idData.id)) ?? fail();
				expect(Math.sign(roundtripped)).to.equal(Math.sign(idData.id));
			});

			network.getIdLog(Client.Client1).forEach((idData) => {
				const opNormalized = compressor1.normalizeToOpSpace(idData.id);
				expect(Math.sign(compressor1.normalizeToSessionSpace(opNormalized, idData.sessionId))).to.equal(
					Math.sign(idData.id)
				);
			});
		});

		itNetwork('produces consistent IDs with large fuzz input', (network) => {
			performFuzzActions(network, 1984, true, undefined, true, 1000, 25, (network) =>
				network.assertNetworkState()
			);
			network.deliverOperations(DestinationClient.All);
		});

		itNetwork('can set the cluster size via constructor', 2, (network) => {
			const compressor1 = network.getCompressor(Client.Client1);
			network.allocateAndSendIds(Client.Client1, 1);
			const range = network.allocateAndSendIds(Client.Client2, 2);
			network.deliverOperations(DestinationClient.All);
			const id = compressor1.getImplicitIdsFromRange(range).get(0);
			// Glass box test, as it knows the order of final IDs
			expect(id).to.equal(reservedIdCount + compressor1.clusterCapacity);
		});

		itNetwork('can set the cluster size via API', 2, (network) => {
			const compressor1 = network.getCompressor(Client.Client1);
			const initialClusterCapacity = compressor1.clusterCapacity;
			network.allocateAndSendIds(Client.Client1, initialClusterCapacity);
			network.allocateAndSendIds(Client.Client2, initialClusterCapacity);
			network.enqueueCapacityChange(5);
			network.allocateAndSendIds(Client.Client1, 1);
			const range = network.allocateAndSendIds(Client.Client2, 1);
			network.deliverOperations(DestinationClient.All);
			const id = compressor1.getImplicitIdsFromRange(range).get(0);
			// Glass box test, as it knows the order of final IDs
			expect(id).to.equal(reservedIdCount + initialClusterCapacity * 2 + compressor1.clusterCapacity);
		});

		describe('can get IDs from ranges', () => {
			itNetwork('unless they are unfinalized and from a remote session', (network) => {
				const compressor = network.getCompressor(Client.Client1);
				const unackedRemoteRange = network.allocateAndSendIds(Client.Client2, 5);
				expect(() => compressor.getImplicitIdsFromRange(unackedRemoteRange)).to.throw(
					'Unknown session, range may not be finalized.'
				);
				network.deliverOperations(Client.Client1);
				const unackedRemoteRange2 = network.allocateAndSendIds(Client.Client2, 5);
				expect(() => compressor.getImplicitIdsFromRange(unackedRemoteRange2)).to.throw(
					'Remote range must be finalized before getting IDs.'
				);
			});

			itNetwork('that are unacked', (network) => {
				const compressor = network.getCompressor(Client.Client1);
				const range1 = compressor.getImplicitIdsFromRange(network.allocateAndSendIds(Client.Client1, 5));
				for (let i = 0; i < range1.length; i++) {
					expect(range1.get(i)).to.equal(-(i + 1));
				}
				const range2 = compressor.getImplicitIdsFromRange(network.allocateAndSendIds(Client.Client1, 7));
				for (let i = 0; i < range2.length; i++) {
					expect(range2.get(i)).to.equal(-(i + 1 + range1.length));
				}
			});

			itNetwork('from the local session that are acked', (network) => {
				const compressor = network.getCompressor(Client.Client1);
				const range1 = compressor.getImplicitIdsFromRange(network.allocateAndSendIds(Client.Client1, 5));
				network.deliverOperations(Client.Client1);

				for (let i = 0; i < range1.length; i++) {
					expect(range1.get(i)).to.equal(-(i + 1));
				}
			});

			itNetwork('from a remote session that are in a single cluster', 5, (network) => {
				const compressor = network.getCompressor(Client.Client1);
				const clusterCapacity = compressor.clusterCapacity;
				network.allocateAndSendIds(Client.Client1, 1);
				// Spans an entire cluster
				const rangeFullCluster = network.allocateAndSendIds(Client.Client2, clusterCapacity);
				network.allocateAndSendIds(Client.Client1, 1);
				network.allocateAndSendIds(Client.Client2, 1);
				// Spans the middle 3 IDs in a cluster of size 5
				const rangeMiddleCluster = network.allocateAndSendIds(Client.Client2, clusterCapacity - 2);
				network.deliverOperations(Client.Client1);

				const idsFullCluster = compressor.getImplicitIdsFromRange(rangeFullCluster);
				for (let i = 0; i < idsFullCluster.length; i++) {
					expect(idsFullCluster.get(i)).to.equal(reservedIdCount + clusterCapacity + i);
				}

				const idsMiddleCluster = compressor.getImplicitIdsFromRange(rangeMiddleCluster);
				for (let i = 0; i < idsMiddleCluster.length; i++) {
					expect(idsMiddleCluster.get(i)).to.equal(reservedIdCount + clusterCapacity * 2 + 1 + i);
				}
			});

			itNetwork('from a remote session that span multiple clusters', 5, (network) => {
				const compressor = network.getCompressor(Client.Client1);
				const clusterCapacity = compressor.clusterCapacity;
				network.allocateAndSendIds(Client.Client1, clusterCapacity);
				network.allocateAndSendIds(Client.Client2, clusterCapacity - 2);
				network.allocateAndSendIds(Client.Client1, 1);
				const rangeSpanningClusters = network.allocateAndSendIds(Client.Client2, clusterCapacity);
				network.deliverOperations(Client.Client1);

				const idsSpanningClusters = compressor.getImplicitIdsFromRange(rangeSpanningClusters);
				for (let i = 0; i < 2; i++) {
					expect(idsSpanningClusters.get(i)).to.equal(reservedIdCount + clusterCapacity + 3 + i);
				}
				for (let i = 2; i < idsSpanningClusters.length; i++) {
					expect(idsSpanningClusters.get(i)).to.equal(reservedIdCount + clusterCapacity * 2 + 3 + i);
				}
			});
		});

		itNetwork('does not decompress ids for empty parts of clusters', 2, (network) => {
			// This is a glass box test in that it creates a final ID outside of the ID compressor
			network.allocateAndSendIds(Client.Client1, 1);
			network.deliverOperations(DestinationClient.All);
			const id = network.getSequencedIdLog(Client.Client2)[0].id;
			expect(isFinalId(id)).to.be.true;
			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			const emptyId = (id + 1) as FinalCompressedId;
			expect(() => network.getCompressor(Client.Client2).decompress(emptyId)).to.throw(
				'Cannot decompress ID which is not known to this compressor'
			);
		});

		describe('Finalizing', () => {
			itNetwork('can finalize IDs from multiple clients', (network) => {
				network.allocateAndSendIds(Client.Client1, 3, {
					1: 'override1',
				});
				network.allocateAndSendIds(Client.Client2, 3, {
					1: 'override2',
				});
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});

			itNetwork('can finalize a range when the current cluster is full', 5, (network) => {
				const clusterCapacity = network.getCompressor(Client.Client1).clusterCapacity;
				network.allocateAndSendIds(Client.Client1, clusterCapacity);
				network.allocateAndSendIds(Client.Client2, clusterCapacity);
				network.allocateAndSendIds(Client.Client1, clusterCapacity, {
					0: 'override1',
					1: 'override2',
					2: 'override3',
				});
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});

			itNetwork('can finalize a range that spans multiple clusters', 5, (network) => {
				const clusterCapacity = network.getCompressor(Client.Client1).clusterCapacity;
				network.allocateAndSendIds(Client.Client1, clusterCapacity - 2, {
					0: 'override1',
					1: 'override2',
				});
				network.allocateAndSendIds(Client.Client2, 1);
				network.allocateAndSendIds(Client.Client1, clusterCapacity, {
					0: 'override3',
					1: 'override4',
					2: 'override5',
				});
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});
		});

		describe('Serialization', () => {
			itNetwork(
				'prevents attempts to resume a session from a serialized compressor with no session',
				(network) => {
					const compressor = network.getCompressor(Client.Client1);
					network.allocateAndSendIds(Client.Client2, 1);
					network.allocateAndSendIds(Client.Client3, 1);
					network.deliverOperations(Client.Client1);
					const serializedWithoutLocalState = compressor.serialize(false);
					expect(() =>
						IdCompressor.deserialize(serializedWithoutLocalState, sessionIds.get(Client.Client2))
					).to.throw('Cannot resume existing session.');
				}
			);

			itNetwork('round-trips local state', 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 3);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client3, 3);
				network.allocateAndSendIds(Client.Client2, 3);
				network.deliverOperations(Client.Client1);
				// Some un-acked locals at the end
				network.allocateAndSendIds(Client.Client1, 4);
				const [serializedNoSession, serializedWithSession] = expectSerializes(
					network.getCompressor(Client.Client1)
				);
				expect(hasOngoingSession(serializedWithSession)).to.be.true;
				expect(hasOngoingSession(serializedNoSession)).to.be.false;
			});

			itNetwork('can serialize a partially empty cluster', 5, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('can serialize a full cluster', 2, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('can serialize full clusters from different clients', 2, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('can serialize clusters of different sizes and clients', 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 3);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client2, 3);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('can serialize clusters with overrides', 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 2, {
					1: 'override',
				});
				network.allocateAndSendIds(Client.Client2, 3, {
					0: 'override1',
					2: 'override2',
				});
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork(
				'packs IDs into a single cluster when a single client generates non-overridden ids',
				3,
				(network) => {
					network.allocateAndSendIds(Client.Client1, 20);
					network.deliverOperations(DestinationClient.All);
					const [serialized1WithNoSession, serialized1WithSession] = expectSerializes(
						network.getCompressor(Client.Client1)
					);
					expect(serialized1WithNoSession.clusters.length).to.equal(1);
					expect(serialized1WithSession.clusters.length).to.equal(1);
					const [serialized3WithNoSession, serialized3WithSession] = expectSerializes(
						network.getCompressor(Client.Client3)
					);
					expect(serialized3WithNoSession.clusters.length).to.equal(1);
					expect(serialized3WithSession.clusters.length).to.equal(1);
				}
			);

			itNetwork('serializes correctly after unifying duplicate overrides', 3, (network) => {
				const override = 'override';
				network.allocateAndSendIds(Client.Client1, 1, { 0: override });
				network.allocateAndSendIds(Client.Client2, 2, { 1: override });
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client2, 5);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client2));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('can resume a session and interact with multiple other clients', 3, (network) => {
				const clusterSize = network.getCompressor(Client.Client1).clusterCapacity;
				network.allocateAndSendIds(Client.Client1, clusterSize);
				network.allocateAndSendIds(Client.Client2, clusterSize);
				network.allocateAndSendIds(Client.Client3, clusterSize);
				network.allocateAndSendIds(Client.Client1, clusterSize);
				network.allocateAndSendIds(Client.Client2, clusterSize);
				network.allocateAndSendIds(Client.Client3, clusterSize);
				network.deliverOperations(DestinationClient.All);
				network.goOfflineThenResume(Client.Client1);
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 2);
				network.allocateAndSendIds(Client.Client3, 2);
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});

			itNetwork('can serialize after a large fuzz input', 3, (network) => {
				performFuzzActions(network, Math.PI, true, undefined, true, 1000, 25, (network) => {
					// Periodically check that everyone in the network has the same serialized state
					network.deliverOperations(DestinationClient.All);
					const compressors = network.getTargetCompressors(DestinationClient.All);
					let deserializedPrev = roundtrip(compressors[0][1], false)[1];
					for (let i = 1; i < compressors.length; i++) {
						const deserializedCur = roundtrip(compressors[i][1], false)[1];
						expect(deserializedPrev.equals(deserializedCur, false)).to.be.true;
						deserializedPrev = deserializedCur;
					}
				});
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client2));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork('stores override indices relative to their clusters', 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 3, { 0: 'cluster1' });
				network.allocateAndSendIds(Client.Client2, 3, { 0: 'cluster2' });
				network.deliverOperations(Client.Client1);
				const serialized = network.getCompressor(Client.Client1).serialize(false);
				expect(serialized.clusters.length).to.equal(2);
				expect(serialized.clusters[0][2]?.[0][0]).to.equal(0);
				expect(serialized.clusters[1][2]?.[0][0]).to.equal(0);
			});
		});
	});
});

type NetworkTestFunction = (title: string, test: (network: IdCompressorTestNetwork) => void) => void;

type NetworkTestFunctionWithCapacity = (
	title: string,
	initialClusterCapacity: number,
	test: (network: IdCompressorTestNetwork) => void
) => void;

function createNetworkTestFunction(validateAfter: boolean): NetworkTestFunction & NetworkTestFunctionWithCapacity {
	return (
		title: string,
		testOrCapacity: ((network: IdCompressorTestNetwork) => void) | number,
		test?: (network: IdCompressorTestNetwork) => void
	) => {
		it(title, () => {
			const hasCapacity = typeof testOrCapacity === 'number';
			const capacity = hasCapacity ? testOrCapacity : undefined;
			const network = new IdCompressorTestNetwork(capacity);
			(hasCapacity ? assertNotUndefined(test) : testOrCapacity)(network);
			if (validateAfter) {
				network.deliverOperations(DestinationClient.All);
				network.assertNetworkState();
			}
		});
	};
}

function describeNetwork(title: string, its: (itFunc: NetworkTestFunction & NetworkTestFunctionWithCapacity) => void) {
	describe(title, () => {
		its(createNetworkTestFunction(false));
	});

	describe(`${title} (with validation)`, () => {
		its(createNetworkTestFunction(true));
	});
}

function describeNetworkNoValidation(
	title: string,
	its: (itFunc: NetworkTestFunction & NetworkTestFunctionWithCapacity) => void
) {
	describe(title, () => {
		its(createNetworkTestFunction(false));
	});
}
