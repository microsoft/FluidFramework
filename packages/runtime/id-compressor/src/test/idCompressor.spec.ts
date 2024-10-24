/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { take } from "@fluid-private/stochastic-test-utils";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { IdCompressor, createIdCompressor, deserializeIdCompressor } from "../idCompressor.js";
import {
	OpSpaceCompressedId,
	SerializedIdCompressorWithNoSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "../index.js";
import { createSessionId } from "../utilities.js";

import {
	Client,
	CompressorFactory,
	DestinationClient,
	IdCompressorTestNetwork,
	MetaClient,
	expectSerializes,
	makeOpGenerator,
	performFuzzActions,
	roundtrip,
	sessionIds,
} from "./idCompressorTestUtilities.js";
import {
	LocalCompressedId,
	fail,
	incrementStableId,
	isFinalId,
	isLocalId,
} from "./testCommon.js";

describe("IdCompressor", () => {
	it("reports the proper session ID", () => {
		const sessionId = createSessionId();
		const compressor = CompressorFactory.createCompressorWithSession(sessionId);
		assert(compressor.localSessionId, sessionId);
	});

	describe("ID Generation", () => {
		it("can manually create a compressed ID", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			assert.equal(id, compressor.recompress(uuid));
		});

		it("can generate document unique IDs", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1, 2);
			let id = compressor.generateDocumentUniqueId();
			assert(typeof id === "string");
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			id = compressor.generateDocumentUniqueId();
			assert(typeof id === "number" && isFinalId(id));
			id = compressor.generateDocumentUniqueId();
			assert(typeof id === "number" && isFinalId(id));
			id = compressor.generateDocumentUniqueId();
			assert(typeof id === "string");
		});

		describe("Eager final ID allocation", () => {
			it("eagerly allocates final IDs when cluster creation has been finalized", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 3);
				const localId1 = compressor.generateCompressedId();
				assert(isLocalId(localId1));
				const localId2 = compressor.generateCompressedId();
				assert(isLocalId(localId2));
				compressor.finalizeCreationRange(compressor.takeNextCreationRange());
				const finalId3 = compressor.generateCompressedId();
				assert(isFinalId(finalId3));
				const finalId4 = compressor.generateCompressedId();
				assert(isFinalId(finalId4));
				const finalId5 = compressor.generateCompressedId();
				assert(isFinalId(finalId5));
				const localId6 = compressor.generateCompressedId();
				assert(isLocalId(localId6));

				compressor.finalizeCreationRange(compressor.takeNextCreationRange());

				const opSpaceId1 = compressor.normalizeToOpSpace(localId1);
				const opSpaceId2 = compressor.normalizeToOpSpace(localId2);
				const opSpaceId3 = compressor.normalizeToOpSpace(finalId3);
				const opSpaceId4 = compressor.normalizeToOpSpace(finalId4);
				const opSpaceId5 = compressor.normalizeToOpSpace(finalId5);
				const opSpaceId6 = compressor.normalizeToOpSpace(localId6);

				assert(isFinalId(opSpaceId1));
				assert(isFinalId(opSpaceId2));
				assert(isFinalId(opSpaceId3) && opSpaceId3 === finalId3);
				assert(isFinalId(opSpaceId4) && opSpaceId4 === finalId4);
				assert(isFinalId(opSpaceId5) && opSpaceId5 === finalId5);
				assert(isFinalId(opSpaceId6));

				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId1, compressor.localSessionId),
					localId1,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId2, compressor.localSessionId),
					localId2,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId3, compressor.localSessionId),
					finalId3,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId4, compressor.localSessionId),
					finalId4,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId5, compressor.localSessionId),
					finalId5,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId6, compressor.localSessionId),
					localId6,
				);
			});

			it("correctly normalizes eagerly allocated final IDs", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 5);
				const localId1 = compressor.generateCompressedId();
				const range1 = compressor.takeNextCreationRange();
				const localId2 = compressor.generateCompressedId();
				const range2 = compressor.takeNextCreationRange();
				assert(isLocalId(localId1));
				assert(isLocalId(localId2));

				compressor.finalizeCreationRange(range1);
				compressor.finalizeCreationRange(range2);

				const opSpaceId1 = compressor.normalizeToOpSpace(localId1);
				const opSpaceId2 = compressor.normalizeToOpSpace(localId2);

				assert(isFinalId(opSpaceId1));
				assert(isFinalId(opSpaceId2));

				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId1, compressor.localSessionId),
					localId1,
				);
				assert.equal(
					compressor.normalizeToSessionSpace(opSpaceId2, compressor.localSessionId),
					localId2,
				);
			});

			it("generates correct eager finals when there are outstanding locals after cluster expansion", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 2);

				// Before cluster expansion
				assert(isLocalId(compressor.generateCompressedId()));
				const rangeA = compressor.takeNextCreationRange();
				compressor.finalizeCreationRange(rangeA);
				assert(isFinalId(compressor.generateCompressedId()));
				assert(isFinalId(compressor.generateCompressedId()));

				// After cluster expansion
				assert(isLocalId(compressor.generateCompressedId()));
				const rangeB = compressor.takeNextCreationRange();
				const localId = compressor.generateCompressedId();
				assert(isLocalId(localId));

				// Take a range that won't be finalized in this test; the finalizing of range B should associate this range with finals
				const rangeC = compressor.takeNextCreationRange();

				compressor.finalizeCreationRange(rangeB);
				const eagerId = compressor.generateCompressedId();
				assert(isFinalId(eagerId));

				assert.equal(compressor.recompress(compressor.decompress(localId)), localId);
				assert.equal(compressor.recompress(compressor.decompress(eagerId)), eagerId);

				compressor.finalizeCreationRange(rangeC);

				assert.equal(compressor.recompress(compressor.decompress(localId)), localId);
				assert.equal(compressor.recompress(compressor.decompress(eagerId)), eagerId);
			});

			it("generates unique eager finals when multiple outstanding creation ranges during finalizing", () => {
				const compressor = CompressorFactory.createCompressor(
					Client.Client1,
					10 /* must be 10 for the test to make sense */,
				);

				// Make a first outstanding range
				const id1_1 = compressor.generateCompressedId();
				const id1_2 = compressor.generateCompressedId();
				assert(isLocalId(id1_1));
				assert(isLocalId(id1_2));
				const range1 = compressor.takeNextCreationRange();

				// Make a second outstanding range
				const id2_1 = compressor.generateCompressedId();
				const id2_2 = compressor.generateCompressedId();
				assert(isLocalId(id2_1));
				assert(isLocalId(id2_2));
				const range2 = compressor.takeNextCreationRange();

				// Finalize just the first one, which should create finals that align with both outstanding ranges
				compressor.finalizeCreationRange(range1);

				// Make a third range. This one should be composed of eager finals that align after the two ranges above.
				const id3_1 = compressor.generateCompressedId();
				const id3_2 = compressor.generateCompressedId();
				assert(isFinalId(id3_1));
				assert(isFinalId(id3_2));
				const range3 = compressor.takeNextCreationRange();

				// Finalize both initial ranges.
				compressor.finalizeCreationRange(range2);
				compressor.finalizeCreationRange(range3);

				// Make some more eager finals that should be aligned correctly.
				const id4_1 = compressor.generateCompressedId();
				const id4_2 = compressor.generateCompressedId();
				assert(isFinalId(id4_1));
				assert(isFinalId(id4_2));

				// Assert everything is unique and consistent.
				const ids = new Set<SessionSpaceCompressedId>();
				const uuids = new Set<StableId | string>();
				[id1_1, id1_2, id2_1, id2_2, id3_1, id3_2, id4_1, id4_2].forEach((id) => {
					ids.add(id);
					uuids.add(compressor.decompress(id));
				});
				assert.equal(ids.size, 8);
				assert.equal(uuids.size, 8);
			});

			it("generates unique eager finals when there are still outstanding locals after a cluster is expanded", () => {
				const compressor = CompressorFactory.createCompressor(
					Client.Client1,
					2 /* must be 2 for the test to make sense */,
				);

				// Make locals to fill half the future cluster
				const id1_1 = compressor.generateCompressedId();
				const id1_2 = compressor.generateCompressedId();
				assert(isLocalId(id1_1));
				assert(isLocalId(id1_2));
				const range1 = compressor.takeNextCreationRange();

				// Make locals to overflow the future cluster
				const id2_1 = compressor.generateCompressedId();
				const id2_2 = compressor.generateCompressedId();
				const id2_3 = compressor.generateCompressedId();
				assert(isLocalId(id2_1));
				assert(isLocalId(id2_2));
				assert(isLocalId(id2_3));
				const range2 = compressor.takeNextCreationRange();

				// Finalize the first range. This should align the first four locals (i.e. all of range1, and 2/3 of range2)
				compressor.finalizeCreationRange(range1);
				assert(isFinalId(compressor.normalizeToOpSpace(id2_2)));
				assert(isLocalId(compressor.normalizeToOpSpace(id2_3)));

				// Make a single range that should still be overflowing the initial cluster (i.e. be local)
				const id3_1 = compressor.generateCompressedId();
				assert(isLocalId(id3_1));
				const range3 = compressor.takeNextCreationRange();

				// Second finalize should expand the cluster and align all outstanding ranges.
				compressor.finalizeCreationRange(range2);

				// All generated IDs should have aligned finals (even though range3 has not been finalized)
				const allIds: SessionSpaceCompressedId[] = [id1_1, id1_2, id2_1, id2_2, id2_3, id3_1];
				allIds.forEach((id) => assert(isFinalId(compressor.normalizeToOpSpace(id))));

				compressor.finalizeCreationRange(range3);

				// Make one eager final
				const id4_1 = compressor.generateCompressedId();
				allIds.push(id4_1);
				assert(isFinalId(id4_1));

				// Assert everything is unique and consistent.
				const ids = new Set<SessionSpaceCompressedId>();
				const uuids = new Set<StableId | string>();
				allIds.forEach((id) => {
					ids.add(id);
					uuids.add(compressor.decompress(id));
				});
				assert.equal(ids.size, 7);
				assert.equal(uuids.size, 7);
			});
		});
	});

	/**
	 * Helper to generate a fixed number of IDs.
	 */
	function generateCompressedIds(
		compressor: IdCompressor,
		count: number,
	): SessionSpaceCompressedId[] {
		const ids: SessionSpaceCompressedId[] = [];
		for (let i = 0; i < count; i++) {
			ids.push(compressor.generateCompressedId());
		}
		return ids;
	}

	describe("can produce a creation range", () => {
		const clusterSize = 5;
		const tests: {
			title: string;
			idCount: number;
		}[] = [
			{ title: "that is empty", idCount: 0 },
			{ title: "with one ID", idCount: 1 },
			{ title: "with more IDs than fit in a cluster", idCount: clusterSize * 2 },
		];

		tests.forEach(({ title, idCount }) => {
			it(title, () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1);
				generateCompressedIds(compressor, idCount);
				const range = compressor.takeNextCreationRange();
				if (range.ids !== undefined) {
					assert.equal(range.ids.count, idCount);
				} else {
					assert.equal(idCount, 0);
				}
			});
		});

		it("with the correct local ranges", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1, 1);
			const ids1 = generateCompressedIds(compressor, 1);
			const range1 = compressor.takeNextCreationRange(); // one local
			assert.deepEqual(ids1, [-1]);
			assert.deepEqual(range1.ids?.localIdRanges, [[1, 1]]);

			compressor.finalizeCreationRange(range1);
			const ids2 = generateCompressedIds(compressor, 1);
			const range2 = compressor.takeNextCreationRange(); // one eager final
			assert.deepEqual(ids2, [1]);
			assert.deepEqual(range2.ids?.localIdRanges, []);

			// make new cluster
			compressor.finalizeCreationRange(range2);
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());

			const ids3 = generateCompressedIds(compressor, 2);
			const range3 = compressor.takeNextCreationRange(); // one eager final and one local
			assert.deepEqual(ids3, [3, -5]);
			assert.deepEqual(range3.ids?.localIdRanges, [[5, 1]]);

			(range3 as any).ids.requestedClusterSize = 4;
			const ids4 = generateCompressedIds(compressor, 2);
			compressor.finalizeCreationRange(range3);
			ids4.push(...generateCompressedIds(compressor, 5));
			const range4 = compressor.takeNextCreationRange(); // two locals, two eager finals, three locals
			assert.deepEqual(ids4, [-6, -7, 7, 8, -10, -11, -12]);
			assert.deepEqual(range4.ids?.localIdRanges, [
				[6, 2],
				[10, 3],
			]);
		});

		describe("by retaking all outstanding ranges", () => {
			it("when there are no outstanding ranges", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 2);
				let retakenRangeEmpty = compressor.takeUnfinalizedCreationRange();
				assert.equal(retakenRangeEmpty.ids, undefined);
				compressor.finalizeCreationRange(retakenRangeEmpty);
				generateCompressedIds(compressor, 1);
				compressor.finalizeCreationRange(compressor.takeNextCreationRange());
				retakenRangeEmpty = compressor.takeUnfinalizedCreationRange();
				assert.equal(retakenRangeEmpty.ids, undefined);
			});

			it("when there is one outstanding ranges with local IDs only", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 2);

				generateCompressedIds(compressor, 1);
				compressor.takeNextCreationRange();

				let retakenRangeLocalOnly = compressor.takeUnfinalizedCreationRange();
				assert.deepEqual(retakenRangeLocalOnly.ids, {
					firstGenCount: 1,
					count: 1,
					localIdRanges: [[1, 1]],
					requestedClusterSize: 2,
				});

				generateCompressedIds(compressor, 1);
				retakenRangeLocalOnly = compressor.takeUnfinalizedCreationRange();
				assert.deepEqual(retakenRangeLocalOnly.ids, {
					firstGenCount: 1,
					count: 2,
					localIdRanges: [[1, 2]],
					requestedClusterSize: 2,
				});

				let postRetakeRange = compressor.takeNextCreationRange();
				// IDs should be undefined because retaking should still advance the taken ID counter
				// if it doesn't, ranges will be resubmitted causing out of order errors
				assert.equal(postRetakeRange.ids, undefined);
				generateCompressedIds(compressor, 1);
				postRetakeRange = compressor.takeNextCreationRange();
				assert.deepEqual(postRetakeRange.ids, {
					firstGenCount: 3,
					count: 1,
					localIdRanges: [[3, 1]],
					requestedClusterSize: 2,
				});

				compressor.finalizeCreationRange(retakenRangeLocalOnly);
			});

			it("when there are multiple outstanding ranges", () => {
				const compressor = CompressorFactory.createCompressor(Client.Client1, 2);
				generateCompressedIds(compressor, 1);
				const range1 = compressor.takeNextCreationRange();
				generateCompressedIds(compressor, 1); // one local
				compressor.finalizeCreationRange(range1);
				const range2 = compressor.takeNextCreationRange();
				assert.deepEqual(range2.ids?.localIdRanges, [[2, 1]]);
				generateCompressedIds(compressor, 1); // one eager final
				const range3 = compressor.takeNextCreationRange();
				assert.deepEqual(range3.ids?.localIdRanges, []);
				generateCompressedIds(compressor, 1); // one local
				const range4 = compressor.takeNextCreationRange();
				assert.deepEqual(range4.ids?.localIdRanges, [[4, 1]]);

				const retakenRange = compressor.takeUnfinalizedCreationRange();
				assert.deepEqual(retakenRange.ids?.firstGenCount, 2);
				assert.deepEqual(retakenRange.ids?.count, 3);
				assert.deepEqual(retakenRange.ids?.localIdRanges, [
					[2, 1],
					[4, 1],
				]);

				compressor.finalizeCreationRange(retakenRange);
				assert.throws(
					() => compressor.finalizeCreationRange(range2),
					(e: Error) => e.message === "Ranges finalized out of order",
				);
				assert.throws(
					() => compressor.finalizeCreationRange(range3),
					(e: Error) => e.message === "Ranges finalized out of order",
				);
				assert.throws(
					() => compressor.finalizeCreationRange(range4),
					(e: Error) => e.message === "Ranges finalized out of order",
				);
			});
		});
	});

	describe("Finalizing", () => {
		it("prevents attempts to finalize ranges twice", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			generateCompressedIds(compressor, 3);
			const batchRange = compressor.takeNextCreationRange();
			compressor.finalizeCreationRange(batchRange);
			assert.throws(
				() => compressor.finalizeCreationRange(batchRange),
				(e: Error) =>
					e.message === "Ranges finalized out of order" &&
					(e as any).expectedStart === -4 &&
					(e as any).actualStart === -1,
			);
		});

		it("prevents attempts to finalize ranges out of order", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			compressor.generateCompressedId();
			compressor.takeNextCreationRange();
			compressor.generateCompressedId();
			const secondRange = compressor.takeNextCreationRange();
			assert.throws(
				() => compressor.finalizeCreationRange(secondRange),
				(e: Error) =>
					e.message === "Ranges finalized out of order" &&
					(e as any).expectedStart === -1 &&
					(e as any).actualStart === -2,
			);
		});

		it("can finalize ranges into clusters of varying sizes", () => {
			for (let i = 1; i < 5; i++) {
				for (let j = 0; j <= i; j++) {
					const compressor = CompressorFactory.createCompressor(Client.Client1, i);
					const ids = new Set<SessionSpaceCompressedId>();
					for (let k = 0; k <= j; k++) {
						ids.add(compressor.generateCompressedId());
					}
					compressor.finalizeCreationRange(compressor.takeNextCreationRange());
					const opIds = new Set<OpSpaceCompressedId>();
					ids.forEach((id) => opIds.add(compressor.normalizeToOpSpace(id)));
					assert.equal(ids.size, opIds.size);
					opIds.forEach((id) => assert.equal(isFinalId(id), true));
				}
			}
		});
	});

	describe("Ghost sessions", () => {
		it("prevents non-allocation mutations during a ghost session", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const range = compressor.takeNextCreationRange();
			compressor.beginGhostSession(createSessionId(), () => {
				assert.throws(() => compressor.takeNextCreationRange());
				assert.throws(() => compressor.finalizeCreationRange(range));
				assert.throws(() => compressor.serialize(false));
			});
		});

		it("can generate IDs during a ghost session", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const idCount = 10;
			const ids = new Set<SessionSpaceCompressedId>();
			const ghostSession = createSessionId();
			compressor.beginGhostSession(ghostSession, () => {
				for (let i = 0; i < idCount; i++) {
					const id = compressor.generateCompressedId();
					assert(isFinalId(id));
					assert(compressor.decompress(id) === incrementStableId(ghostSession, i));
					ids.add(id);
				}
			});
			assert.equal(ids.size, idCount);
		});

		it("does not create a cluster for a no-op ghost session", () => {
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5, mockLogger);
			compressor.serialize(false);
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
					clusterCount: 0,
					sessionCount: 0,
				},
			]);
			compressor.beginGhostSession(createSessionId(), () => {});
			compressor.serialize(false);
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
					clusterCount: 0,
					sessionCount: 0,
				},
			]);
			compressor.beginGhostSession(createSessionId(), () => {
				compressor.generateCompressedId();
			});
			compressor.serialize(false);
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
					clusterCount: 1,
					sessionCount: 1,
				},
			]);
		});
	});

	describe("Recompression", () => {
		it("can re-compress a uuid it generated", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			assert.equal(compressor.recompress(uuid), id);
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			assert.equal(compressor.recompress(uuid), id);
		});

		it("can re-compress uuids from a remote client", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const uuid = compressor.decompress(compressor.generateCompressedId());

			const compressor2 = CompressorFactory.createCompressor(Client.Client2);
			compressor2.finalizeCreationRange(compressor.takeNextCreationRange());
			const finalId = compressor2.recompress(uuid);
			if (finalId === undefined) {
				assert.fail();
			}
			assert(isFinalId(finalId));
		});

		it("will not re-compress uuids it did not originally generate", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			assert.equal(
				compressor.tryRecompress("5fff846a-efd4-42fb-8b78-b32ce2672f99" as StableId),
				undefined,
			);
		});

		it("can re-compress an eager final ID that is not finalized", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5);
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			const finalId = compressor.generateCompressedId();
			assert(isFinalId(finalId));
			const stableId = incrementStableId(sessionIds.get(Client.Client1), 1);
			assert.equal(compressor.recompress(stableId), finalId);
		});
	});

	describe("Decompression", () => {
		it("will not decompress IDs it did not generate", () => {
			const errorMessage = "Unknown ID";
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			assert.throws(
				() => compressor.decompress(-1 as LocalCompressedId),
				(e: Error) => e.message === errorMessage,
			);
			assert.throws(
				() => compressor.decompress(0 as SessionSpaceCompressedId),
				(e: Error) => e.message === errorMessage,
			);
		});

		it("can decompress a local ID before and after finalizing", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const uuid = compressor.decompress(id);
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			assert.equal(compressor.decompress(id), uuid);
		});

		it("can decompress a final ID", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			const finalId = compressor.normalizeToOpSpace(id);
			if (isLocalId(finalId)) {
				assert.fail("Op space ID was finalized but is local");
			}
			compressor.decompress(
				compressor.normalizeToSessionSpace(finalId, compressor.localSessionId),
			);
		});

		it("can decompress an eagerly generated final ID that is not finalized", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5);
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			const finalId = compressor.generateCompressedId();
			assert(isFinalId(finalId));
			assert.equal(
				compressor.decompress(finalId),
				incrementStableId(sessionIds.get(Client.Client1), 1),
			);
		});
	});

	describe("Normalization", () => {
		it("can normalize a local ID to op space before finalizing", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			const normalized = compressor.normalizeToOpSpace(id);
			assert(isLocalId(id));
			assert.equal(id, normalized);
		});

		it("can normalize a local ID to op space after finalizing", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const id = compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			const normalized = compressor.normalizeToOpSpace(id);
			assert(isFinalId(normalized));
			assert.notEqual(id, normalized);
		});

		it("can normalize an eagerly generated final ID", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5);
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			const eagerFinalId = compressor.generateCompressedId();
			assert(isFinalId(eagerFinalId));
			const opNormalized = compressor.normalizeToOpSpace(eagerFinalId);
			assert.equal(eagerFinalId, opNormalized);
			const sessionNormalized = compressor.normalizeToSessionSpace(
				opNormalized,
				compressor.localSessionId,
			);
			assert.equal(sessionNormalized, opNormalized);
		});

		it("cannot normalize a remote ID to session space if it has not been finalized", () => {
			const compressor1 = CompressorFactory.createCompressor(Client.Client1);
			const compressor2 = CompressorFactory.createCompressor(Client.Client2);
			const normalized = compressor1.normalizeToOpSpace(compressor1.generateCompressedId());
			assert.throws(
				() => compressor2.normalizeToSessionSpace(normalized, compressor1.localSessionId),
				(e: Error) => e.message === "No IDs have ever been finalized by the supplied session.",
			);
		});

		it("can normalize local and final IDs from a remote session to session space", () => {
			const compressor1 = CompressorFactory.createCompressor(Client.Client1);
			const compressor2 = CompressorFactory.createCompressor(Client.Client2);
			const id = compressor1.generateCompressedId();
			const normalizedLocal = compressor1.normalizeToOpSpace(id);
			const range = compressor1.takeNextCreationRange();
			compressor1.finalizeCreationRange(range);
			const normalizedFinal = compressor1.normalizeToOpSpace(id);
			compressor2.finalizeCreationRange(range);
			assert(isLocalId(normalizedLocal));
			assert(isFinalId(normalizedFinal));
			assert.equal(
				compressor2.normalizeToSessionSpace(normalizedFinal, compressor1.localSessionId),
				normalizedFinal,
			);
			assert.equal(
				compressor2.normalizeToSessionSpace(normalizedLocal, compressor1.localSessionId),
				normalizedFinal,
			);
		});

		it("can normalize a final ID created by the local session but sent in another client's op space", () => {
			// Regression test for the situation in which a client creates a final ID and another client references
			// that final ID in a message back to the creating client. The creating client will normalize it and
			// pass the session ID of the remote (non-creating) client. This should be handled correctly.
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5);
			const compressor2 = CompressorFactory.createCompressor(Client.Client2, 5);
			const id = compressor.generateCompressedId();
			const creationRange = compressor.takeNextCreationRange();
			compressor.finalizeCreationRange(creationRange);
			compressor2.finalizeCreationRange(creationRange);
			const idInClient2OpSpace = compressor2.normalizeToOpSpace(
				compressor2.normalizeToSessionSpace(
					compressor.normalizeToOpSpace(id),
					compressor.localSessionId,
				),
			);
			const normalizedToClient1SessionSpace = compressor.normalizeToSessionSpace(
				idInClient2OpSpace,
				compressor2.localSessionId,
			);
			assert.equal(normalizedToClient1SessionSpace, id);
		});
	});

	describe("Telemetry", () => {
		it("emits first cluster and new cluster telemetry events", () => {
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5, mockLogger);
			const localId1 = compressor.generateCompressedId();
			assert(isLocalId(localId1));
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());

			mockLogger.assertMatch([
				{
					eventName: "RuntimeIdCompressor:FirstCluster",
					sessionId: compressor.localSessionId,
				},
				{
					eventName: "RuntimeIdCompressor:IdCompressorStatus",
					eagerFinalIdCount: 0,
					localIdCount: 1,
					sessionId: compressor.localSessionId,
				},
			]);
		});

		it("emits new cluster event on second cluster", () => {
			// Fill the first cluster
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 1, mockLogger);
			compressor.generateCompressedId();
			const range = compressor.takeNextCreationRange();
			compressor.finalizeCreationRange(range);

			// Create another cluster with a different client so that expansion doesn't happen
			const mockLogger2 = new MockLogger();
			const compressor2 = CompressorFactory.createCompressor(Client.Client2, 1, mockLogger2);
			compressor2.finalizeCreationRange(range);
			compressor2.generateCompressedId();
			const range2 = compressor2.takeNextCreationRange();
			compressor2.finalizeCreationRange(range2);
			compressor.finalizeCreationRange(range2);
			// Make sure we emitted the FirstCluster event
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:FirstCluster",
				},
			]);
			mockLogger.clear();

			// Fill the one remaining spot
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());

			// Trigger a new cluster creation
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:NewCluster",
				},
			]);
		});

		it("correctly logs telemetry events for eager final id allocations", () => {
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5, mockLogger);
			const localId1 = compressor.generateCompressedId();
			assert(isLocalId(localId1));

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:IdCompressorStatus",
					eagerFinalIdCount: 0,
					localIdCount: 1,
					sessionId: compressor.localSessionId,
				},
			]);
			mockLogger.clear();
			const finalId1 = compressor.generateCompressedId();
			const finalId2 = compressor.generateCompressedId();
			assert(isFinalId(finalId1));
			assert(isFinalId(finalId2));

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:IdCompressorStatus",
					eagerFinalIdCount: 2,
					localIdCount: 0,
					sessionId: compressor.localSessionId,
				},
			]);
		});

		it("correctly logs telemetry events for expansion case", () => {
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5, mockLogger);
			const localId1 = compressor.generateCompressedId();
			assert(isLocalId(localId1));

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:IdCompressorStatus",
					eagerFinalIdCount: 0,
					localIdCount: 1,
					sessionId: compressor.localSessionId,
				},
			]);
			mockLogger.clear();

			for (let i = 0; i < 5; i++) {
				const id = compressor.generateCompressedId();
				assert(isFinalId(id));
			}

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:IdCompressorStatus",
					eagerFinalIdCount: 5,
					localIdCount: 0,
					sessionId: compressor.localSessionId,
				},
			]);
			mockLogger.clear();

			const expansionId1 = compressor.generateCompressedId();
			const expansionId2 = compressor.generateCompressedId();
			assert(isLocalId(expansionId1));
			assert(isLocalId(expansionId2));

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:ClusterExpansion",
					sessionId: compressor.localSessionId,
					previousCapacity: 6,
					newCapacity: 13,
					overflow: 2,
				},
			]);
		});

		it("emits telemetry when serialized", () => {
			const mockLogger = new MockLogger();
			const compressor = CompressorFactory.createCompressor(Client.Client1, 5, mockLogger);
			const localId1 = compressor.generateCompressedId();
			assert(isLocalId(localId1));

			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			compressor.serialize(false);

			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
					size: 72,
					clusterCount: 1,
					sessionCount: 1,
				},
			]);
		});

		it("correctly passes logger when no session specified", () => {
			const mockLogger = new MockLogger();
			const compressor = createIdCompressor(mockLogger);
			compressor.generateCompressedId();
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
			mockLogger.assertMatchAny([
				{
					eventName: "RuntimeIdCompressor:FirstCluster",
				},
			]);
		});
	});

	describe("Serialization", () => {
		it("can serialize an empty compressor", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			expectSerializes(compressor);
			compressor.generateCompressedId();
			expectSerializes(compressor);
		});

		it("correctly deserializes and resumes a session", () => {
			const compressor1 = CompressorFactory.createCompressor(Client.Client1);
			const compressor2 = CompressorFactory.createCompressor(Client.Client2);
			compressor1.generateCompressedId();
			const creationRange = compressor1.takeNextCreationRange();
			compressor1.finalizeCreationRange(creationRange);
			compressor2.finalizeCreationRange(creationRange);
			const [_, serializedWithSession] = expectSerializes(compressor1);
			const compressorResumed = IdCompressor.deserialize(serializedWithSession);
			compressorResumed.generateCompressedId();
			const range2 = compressorResumed.takeNextCreationRange();
			compressorResumed.finalizeCreationRange(range2);
			compressor2.finalizeCreationRange(range2);
			const [__, roundtrippedCompressorResumed] = roundtrip(compressorResumed, false);
			const [___, roundtrippedCompressor2] = roundtrip(compressor2, false);
			assert(
				roundtrippedCompressorResumed.equals(
					roundtrippedCompressor2,
					false, // don't compare local state
				),
			);
		});

		it("can detect and fails to load 1.0 documents", () => {
			const compressor = CompressorFactory.createCompressor(Client.Client1);
			const base64Content = compressor.serialize(false);
			const floatView = new Float64Array(stringToBuffer(base64Content, "base64"));
			// Change the version to 1.0
			floatView[0] = 1.0;
			const docString1 = bufferToString(
				floatView.buffer,
				"base64",
			) as SerializedIdCompressorWithNoSession;
			assert.throws(
				() => deserializeIdCompressor(docString1, createSessionId()),
				(e: Error) => e.message === "IdCompressor version 1.0 is no longer supported.",
			);
		});
	});

	describe("Collision detection", () => {
		it("detects when a new cluster is allocated whose UUIDs collide with another cluster", () => {
			const compressor1 = CompressorFactory.createCompressor(Client.Client1);
			const compressor2 = CompressorFactory.createCompressorWithSession(
				incrementStableId(compressor1.localSessionId, 5) as SessionId,
			);
			compressor1.generateCompressedId();
			const creationRange1 = compressor1.takeNextCreationRange();

			compressor2.generateCompressedId();
			const creationRange2 = compressor2.takeNextCreationRange();

			const errorMessage = "0x758";

			// Simulate world in which range1 was sequenced first
			compressor1.finalizeCreationRange(creationRange1);
			assert.throws(
				() => compressor1.finalizeCreationRange(creationRange2),
				(e: Error) => e.message === errorMessage,
			);

			// Simulate world in which range2 was sequenced first
			compressor2.finalizeCreationRange(creationRange2);
			assert.throws(
				() => compressor2.finalizeCreationRange(creationRange1),
				(e: Error) => e.message === errorMessage,
			);
		});
	});

	describeNetwork("Networked", (itNetwork) => {
		itNetwork(
			"upholds the invariant that IDs always decompress to the same UUID",
			2,
			(network) => {
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client2, 5);
				network.allocateAndSendIds(Client.Client3, 5);

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
					const preAckLocalIds =
						preAckLocals.get(client) ?? fail("Expected preack locals for client");
					let i = 0;
					for (const idData of network.getIdLog(client)) {
						if (idData.originatingClient === client) {
							assert(!isFinalId(idData.id));
							const currentUuid = compressor.decompress(idData.id);
							assert.equal(currentUuid, preAckLocalIds[i % preAckLocalIds.length][1]);
							i++;
						}
					}
				}
			},
		);

		itNetwork("can normalize session space IDs to op space", 5, (network) => {
			const clusterCapacity = 5;
			const idCount = clusterCapacity * 2;
			for (let i = 0; i < idCount; i++) {
				network.allocateAndSendIds(Client.Client1, 1);
				network.allocateAndSendIds(Client.Client2, 1);
				network.allocateAndSendIds(Client.Client3, 1);
			}

			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				for (const idData of network.getIdLog(client)) {
					assert.equal(idData.originatingClient, client);
					assert(isLocalId(compressor.normalizeToOpSpace(idData.id)));
				}
			}

			network.deliverOperations(DestinationClient.All);

			for (const [client, compressor] of network.getTargetCompressors(MetaClient.All)) {
				for (const idData of network.getIdLog(client)) {
					assert(isFinalId(compressor.normalizeToOpSpace(idData.id)));
				}
			}
		});

		itNetwork(
			"can normalize local op space IDs from a local session to session space IDs",
			(network) => {
				const compressor = network.getCompressor(Client.Client1);
				network.allocateAndSendIds(Client.Client1, 1);
				network.deliverOperations(Client.Client1);
				const sessionSpaceIds = network.getIdLog(Client.Client1);
				const opSpaceId = compressor.normalizeToOpSpace(sessionSpaceIds[0].id);
				const sessionSpaceId = compressor.normalizeToSessionSpace(
					opSpaceId,
					compressor.localSessionId,
				);
				assert(isFinalId(opSpaceId));
				assert(isLocalId(sessionSpaceId));
			},
		);

		itNetwork(
			"can normalize local op space IDs from a remote session to session space IDs",
			(network) => {
				const compressor1 = network.getCompressor(Client.Client1);
				const compressor2 = network.getCompressor(Client.Client2);
				const opSpaceIds = network.allocateAndSendIds(Client.Client1, 1);
				// Mimic sending a reference to an ID that hasn't been acked yet, such as in a slow network
				const id = opSpaceIds[0];
				const getSessionNormalizedId = () =>
					compressor2.normalizeToSessionSpace(id, compressor1.localSessionId);
				assert.throws(
					getSessionNormalizedId,
					(e: Error) =>
						e.message === "No IDs have ever been finalized by the supplied session.",
				);
				network.deliverOperations(Client.Client2);
				assert(isFinalId(getSessionNormalizedId()));
			},
		);

		function expectSequencedLogsAlign(
			network: IdCompressorTestNetwork,
			client1: Client,
			client2: Client,
			numUnifications = 0,
		): void {
			network.deliverOperations(DestinationClient.All);
			assert(client1 !== client2, "Clients must not be the same");
			const log1 = network.getSequencedIdLog(client1);
			const log2 = network.getSequencedIdLog(client2);
			assert.equal(log1.length, log2.length);
			const compressor1 = network.getCompressor(client1);
			const compressor2 = network.getCompressor(client2);
			const ids = new Set<OpSpaceCompressedId>();
			const uuids = new Set<StableId>();
			for (let i = 0; i < log1.length; i++) {
				const data1 = log1[i];
				const id1 = compressor1.normalizeToOpSpace(data1.id);
				const id2 = compressor2.normalizeToOpSpace(log2[i].id);
				assert(isFinalId(id1));
				ids.add(id1);
				assert.equal(id1, id2);
				const uuidOrOverride1 = compressor1.decompress(
					compressor1.normalizeToSessionSpace(id1, compressor1.localSessionId),
				);
				uuids.add(uuidOrOverride1);
				assert.equal(
					uuidOrOverride1,
					compressor2.decompress(
						compressor2.normalizeToSessionSpace(id2, compressor2.localSessionId),
					),
				);
			}
			const expectedSize = log1.length - numUnifications;
			assert.equal(ids.size, expectedSize);
			assert.equal(uuids.size, expectedSize);
		}

		itNetwork("produces ID spaces correctly", (network) => {
			// This test asserts that IDs returned from IdCompressor APIs are correctly encoded as either local or final.
			// This is a glass box test in that it assumes the negative/positive encoding of CompressedIds (negative = local, positive = final).
			const compressor1 = network.getCompressor(Client.Client1);

			// Client 1 makes three IDs
			network.allocateAndSendIds(Client.Client1, 3);
			network.getIdLog(Client.Client1).forEach(({ id }) => assert(isLocalId(id)));

			// Client 1's IDs have not been acked so have no op space equivalent
			network
				.getIdLog(Client.Client1)
				.forEach((idData) => assert(isLocalId(compressor1.normalizeToOpSpace(idData.id))));

			// Client 1's IDs are acked
			network.deliverOperations(Client.Client1);
			network.getIdLog(Client.Client1).forEach(({ id }) => assert(isLocalId(id)));

			// Client 2 makes three IDs
			network.allocateAndSendIds(Client.Client2, 3);

			network.getIdLog(Client.Client2).forEach(({ id }) => assert(isLocalId(id)));

			// Client 1 receives Client 2's IDs
			network.deliverOperations(Client.Client1);

			network
				.getIdLog(Client.Client1)
				.slice(-3)
				.forEach(({ id }) => assert(isFinalId(id)));

			// All IDs have been acked or are from another client, and therefore have a final form in op space
			network
				.getIdLog(Client.Client1)
				.forEach(({ id }) => assert(isFinalId(compressor1.normalizeToOpSpace(id))));

			// Compression should preserve ID space correctness
			network.getIdLog(Client.Client1).forEach((idData) => {
				const roundtripped = compressor1.recompress(compressor1.decompress(idData.id));
				assert.equal(Math.sign(roundtripped), Math.sign(idData.id));
			});

			network.getIdLog(Client.Client1).forEach((idData) => {
				const opNormalized = compressor1.normalizeToOpSpace(idData.id);
				assert.equal(
					Math.sign(compressor1.normalizeToSessionSpace(opNormalized, idData.sessionId)),
					Math.sign(idData.id),
				);
			});
		});

		itNetwork("produces consistent IDs with large fuzz input", (network) => {
			const generator = take(5000, makeOpGenerator({}));
			performFuzzActions(generator, network, 1984, undefined, true, (n) =>
				n.assertNetworkState(),
			);
			network.deliverOperations(DestinationClient.All);
		});

		itNetwork("does not decompress ids for empty parts of clusters", 2, (network) => {
			// This is a glass box test in that it creates a final ID outside of the ID compressor
			network.allocateAndSendIds(Client.Client1, 1);
			network.deliverOperations(DestinationClient.All);
			const id = network.getSequencedIdLog(Client.Client2)[0].id;
			assert(isFinalId(id));
			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			const emptyId = (id + 1) as SessionSpaceCompressedId;
			assert.throws(
				() => network.getCompressor(Client.Client2).decompress(emptyId),
				(e: Error) => e.message === "Unknown ID",
			);
		});

		describe("Finalizing", () => {
			itNetwork("can finalize IDs from multiple clients", (network) => {
				network.allocateAndSendIds(Client.Client1, 3);
				network.allocateAndSendIds(
					Client.Client2,

					// eslint-disable-next-line @typescript-eslint/dot-notation
					network.getCompressor(Client.Client2)["nextRequestedClusterSize"] * 2,
				);
				network.allocateAndSendIds(Client.Client3, 5);
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});

			itNetwork("can finalize a range when the current cluster is full", 5, (network) => {
				const clusterCapacity = network.getCompressor(
					Client.Client1,
					// eslint-disable-next-line @typescript-eslint/dot-notation
				)["nextRequestedClusterSize"];
				network.allocateAndSendIds(Client.Client1, clusterCapacity);
				network.allocateAndSendIds(Client.Client2, clusterCapacity);
				network.allocateAndSendIds(Client.Client1, clusterCapacity);
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});

			itNetwork("can finalize a range that spans multiple clusters", 5, (network) => {
				const clusterCapacity = network.getCompressor(
					Client.Client1,
					// eslint-disable-next-line @typescript-eslint/dot-notation
				)["nextRequestedClusterSize"];
				network.allocateAndSendIds(Client.Client1, 1);
				network.allocateAndSendIds(Client.Client2, 1);
				network.allocateAndSendIds(Client.Client1, clusterCapacity * 3);
				expectSequencedLogsAlign(network, Client.Client1, Client.Client2);
			});
		});

		describe("Serialization", () => {
			itNetwork(
				"prevents attempts to resume a session from a serialized compressor with no session",
				(network) => {
					const compressor = network.getCompressor(Client.Client1);
					network.allocateAndSendIds(Client.Client2, 1);
					network.allocateAndSendIds(Client.Client3, 1);
					network.deliverOperations(Client.Client1);
					const serializedWithoutLocalState = compressor.serialize(false);
					assert.throws(
						() =>
							IdCompressor.deserialize(
								serializedWithoutLocalState,
								sessionIds.get(Client.Client2),
							),
						(e: Error) => e.message === "Cannot resume existing session.",
					);
				},
			);

			itNetwork("round-trips local state", 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 3);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client3, 3);
				network.allocateAndSendIds(Client.Client2, 3);
				network.deliverOperations(Client.Client1);
				// Some un-acked locals at the end
				network.allocateAndSendIds(Client.Client1, 4);
				expectSerializes(network.getCompressor(Client.Client1));
			});

			itNetwork("can serialize a partially empty cluster", 5, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork("can serialize a full cluster", 2, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork("can serialize full clusters from different clients", 2, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 2);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork("can serialize clusters of different sizes and clients", 3, (network) => {
				network.allocateAndSendIds(Client.Client1, 2);
				network.allocateAndSendIds(Client.Client2, 3);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client1, 5);
				network.allocateAndSendIds(Client.Client2, 3);
				network.deliverOperations(DestinationClient.All);
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client3));
			});

			itNetwork(
				"can resume a session and interact with multiple other clients",
				3,
				(network) => {
					const clusterSize = network.getCompressor(
						Client.Client1,
						// eslint-disable-next-line @typescript-eslint/dot-notation
					)["nextRequestedClusterSize"];
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
				},
			);

			itNetwork("can serialize after a large fuzz input", 3, (network) => {
				const generator = take(5000, makeOpGenerator({}));
				performFuzzActions(generator, network, Math.PI, undefined, true, (n) => {
					// Periodically check that everyone in the network has the same serialized state
					n.deliverOperations(DestinationClient.All);
					const compressors = n.getTargetCompressors(DestinationClient.All);
					let deserializedPrev = roundtrip(compressors[0][1], false)[1];
					for (let i = 1; i < compressors.length; i++) {
						const deserializedCur = roundtrip(compressors[i][1], false)[1];
						assert(deserializedPrev.equals(deserializedCur, false));
						deserializedPrev = deserializedCur;
					}
				});
				expectSerializes(network.getCompressor(Client.Client1));
				expectSerializes(network.getCompressor(Client.Client2));
				expectSerializes(network.getCompressor(Client.Client3));
			});
		});
	});
});

type NetworkTestFunction = (
	title: string,
	test: (network: IdCompressorTestNetwork) => void,
) => void;

type NetworkTestFunctionWithCapacity = (
	title: string,
	initialClusterCapacity: number,
	test: (network: IdCompressorTestNetwork) => void,
) => void;

function createNetworkTestFunction(
	validateAfter: boolean,
): NetworkTestFunction & NetworkTestFunctionWithCapacity {
	return (
		title: string,
		testOrCapacity: ((network: IdCompressorTestNetwork) => void) | number,
		test?: (network: IdCompressorTestNetwork) => void,
	) => {
		it(title, () => {
			const hasCapacity = typeof testOrCapacity === "number";
			const capacity = hasCapacity ? testOrCapacity : undefined;
			const network = new IdCompressorTestNetwork(capacity);
			(hasCapacity ? (test ?? fail("test must be defined")) : testOrCapacity)(network);
			if (validateAfter) {
				network.deliverOperations(DestinationClient.All);
				network.assertNetworkState();
			}
		}).timeout(10000);
	};
}

function describeNetwork(
	title: string,
	its: (itFunc: NetworkTestFunction & NetworkTestFunctionWithCapacity) => void,
) {
	describe(title, () => {
		its(createNetworkTestFunction(false));
	});

	describe(`${title} (with validation)`, () => {
		its(createNetworkTestFunction(true));
	});
}
