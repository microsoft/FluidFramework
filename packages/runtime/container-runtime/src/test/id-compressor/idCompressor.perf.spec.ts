/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	OpSpaceCompressedId,
	SessionSpaceCompressedId,
	SessionId,
	StableId,
} from "../../../src/types";
import { take } from "../copied-utils/stochastic";
import { IdCompressor } from "../../idCompressor";
import { createSessionId } from "../../../src/utilities";
import { assert, fail } from "../../../src/copied-utils";
import { defaultClusterCapacity } from "../../types/persisted-types";
import { FinalCompressedId, LocalCompressedId, isFinalId, isLocalId } from "./testCommon";
import {
	Client,
	DestinationClient,
	IdCompressorTestNetwork,
	buildHugeCompressor,
	makeOpGenerator,
	performFuzzActions,
	sessionIds,
} from "./idCompressorTestUtilities";

describe("IdCompressor Perf", () => {
	const type = BenchmarkType.Measurement;
	const localClient = Client.Client1;
	const remoteClient = Client.Client2;
	let perfCompressor: IdCompressor;

	function setupCompressors(
		clusterSize: number,
		localClientCanEdit: boolean,
		synchronizeAtEnd: boolean,
	): IdCompressorTestNetwork {
		const perfNetwork = new IdCompressorTestNetwork(clusterSize);
		const maxClusterSize = 25;
		const generator = take(
			1000,
			makeOpGenerator({
				validateInterval: 2000,
				maxClusterSize,
				outsideAllocationFraction: 0.9,
			}),
		);
		if (perfNetwork.initialClusterSize > maxClusterSize) {
			perfNetwork.enqueueCapacityChange(maxClusterSize);
		}
		performFuzzActions(
			generator,
			perfNetwork,
			Math.E,
			localClientCanEdit ? undefined : localClient,
			synchronizeAtEnd,
		);
		perfCompressor = perfNetwork.getCompressorUnsafeNoProxy(localClient);
		return perfNetwork;
	}

	function getIdMadeBy(
		client: Client,
		eagerFinal: false,
		network: IdCompressorTestNetwork,
	): LocalCompressedId;
	function getIdMadeBy(
		client: Client,
		eagerFinal: true,
		network: IdCompressorTestNetwork,
	): FinalCompressedId & SessionSpaceCompressedId;
	function getIdMadeBy(
		client: Client,
		eagerFinal: boolean,
		network: IdCompressorTestNetwork,
	): SessionSpaceCompressedId;
	function getIdMadeBy(
		client: Client,
		eagerFinal: boolean,
		network: IdCompressorTestNetwork,
	): SessionSpaceCompressedId {
		const log = network.getIdLog(client);
		for (let i = log.length - 1; i > 0; i--) {
			const { id, originatingClient } = log[i];
			if (originatingClient === client) {
				if ((eagerFinal && isFinalId(id)) || (!eagerFinal && isLocalId(id))) {
					assert(eagerFinal === isFinalId(id), "Not local/final as requested.");
					return id;
				}
			}
		}
		fail("no ID found in log");
	}

	function benchmarkWithFlag(creator: (flag: boolean) => void) {
		for (const flag of [true, false]) {
			creator(flag);
		}
	}

	benchmark({
		type,
		title: `allocate local ID`,
		before: () => {
			setupCompressors(defaultClusterCapacity, true, true);
		},
		benchmarkFn: () => {
			perfCompressor!.generateCompressedId();
		},
	});

	benchmark({
		type,
		title: "take an ID creation range",
		before: () => {
			setupCompressors(defaultClusterCapacity, true, true);
		},
		benchmarkFn: () => {
			perfCompressor!.generateCompressedId();
			perfCompressor!.takeNextCreationRange();
		},
	});

	for (const clusterSize of [1, 10, 500, 1000]) {
		const numIds = 7;
		const session1 = "8150a099-5302-4672-b5f3-7a4492b59418" as SessionId;
		const session2 = "f2ded886-92da-4248-967b-eb96ee04cf51" as SessionId;
		let session: SessionId = session1;
		let nextFirstFinalizedGenCount1 = 1;
		let nextFirstFinalizedGenCount2 = 1;
		benchmark({
			type,
			title: `finalize a range of IDs (cluster size = ${clusterSize})`,
			before: () => {
				setupCompressors(clusterSize, false, true);
			},
			benchmarkFn: () => {
				// Create a range with as minimal overhead as possible, as we'd like for this code to not exist
				// in the timing loop at all (but benchmark forces us to do so)
				const isFirstClient = session === session1;
				const firstGenCount = isFirstClient
					? nextFirstFinalizedGenCount1
					: nextFirstFinalizedGenCount2;
				const range: IdCreationRange = {
					sessionId: session,
					ids: {
						firstGenCount,
						count: numIds,
					},
				};

				perfCompressor!.finalizeCreationRange(range);

				const lastGenCount = firstGenCount + numIds;
				if (isFirstClient) {
					nextFirstFinalizedGenCount1 = lastGenCount;
				} else {
					nextFirstFinalizedGenCount2 = lastGenCount;
				}
				// Alternate clients to sidestep optimization that packs them all into last cluster
				session = isFirstClient ? session1 : session2;
			},
		});
	}

	benchmarkWithFlag((isLocal) => {
		const remoteSessionId = sessionIds.get(remoteClient);
		let opSpaceId!: OpSpaceCompressedId;
		benchmark({
			type,
			title: `normalize a ${
				isLocal ? "local" : "final"
			} ID from a remote session to session space`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, true, true);
				const remoteSessionId = getIdMadeBy(remoteClient, false, network);
				opSpaceId = (
					isLocal
						? remoteSessionId
						: network.getCompressor(remoteClient).normalizeToOpSpace(remoteSessionId)
				) as OpSpaceCompressedId;
			},
			benchmarkFn: () => {
				perfCompressor!.normalizeToSessionSpace(opSpaceId, remoteSessionId);
			},
		});
	});

	benchmarkWithFlag((eagerFinal) => {
		let id!: OpSpaceCompressedId & FinalCompressedId;
		benchmark({
			type,
			title: `normalize a final ID corresponding to a ${
				eagerFinal ? "eager final" : "local"
			} ID from op space to the local session`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, true, true);
				const opId = perfCompressor.normalizeToOpSpace(
					getIdMadeBy(localClient, eagerFinal, network),
				);
				assert(isFinalId(opId), "Must be final");
				id = opId;
			},
			benchmarkFn: () => {
				perfCompressor!.normalizeToSessionSpace(id, perfCompressor.localSessionId);
			},
		});
	});

	benchmarkWithFlag((isLocalOriginator) => {
		const remoteSessionId = sessionIds.get(remoteClient);
		let opSpaceId!: OpSpaceCompressedId;
		benchmark({
			type,
			title: `normalize a final ID from a ${
				isLocalOriginator ? "local" : "remote"
			} session to a small session space (common case)`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, false, true);
				// Ensure the local session has several different clusters
				for (let clusterCount = 0; clusterCount < 5; clusterCount++) {
					network.allocateAndSendIds(localClient, perfCompressor.clusterCapacity);
					network.allocateAndSendIds(remoteClient, perfCompressor.clusterCapacity * 2);
					network.deliverOperations(DestinationClient.All);
				}
				const client = isLocalOriginator ? localClient : remoteClient;
				const idFromSession = getIdMadeBy(client, true, network);
				opSpaceId = network.getCompressor(client).normalizeToOpSpace(idFromSession);
			},
			benchmarkFn: () => {
				perfCompressor!.normalizeToSessionSpace(opSpaceId, remoteSessionId);
			},
		});
	});

	let unackedLocalId!: LocalCompressedId;
	benchmark({
		type,
		title: `normalize an unacked local ID from the local session to op space`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, false);
			// Ensure no eager finals
			network.allocateAndSendIds(
				localClient,
				network.getCompressor(localClient).clusterCapacity * 2 + 1,
			);
			unackedLocalId = getIdMadeBy(localClient, false, network);
			assert(
				perfCompressor.normalizeToOpSpace(unackedLocalId) === (unackedLocalId as number),
				"Local was acked.",
			);
		},
		benchmarkFn: () => {
			perfCompressor!.normalizeToOpSpace(unackedLocalId);
		},
	});

	benchmarkWithFlag((eagerFinal) => {
		let id!: SessionSpaceCompressedId;
		benchmark({
			type,
			title: `normalize an acked ${
				eagerFinal ? "eager final" : "local"
			} ID from the local session to op space`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, true, true);
				id = getIdMadeBy(localClient, eagerFinal, network);
			},
			benchmarkFn: () => {
				perfCompressor!.normalizeToOpSpace(id);
			},
		});
	});

	benchmarkWithFlag((local) => {
		let finalIdToDecompress!: SessionSpaceCompressedId & FinalCompressedId;
		benchmark({
			type,
			title: `decompress a final ID from a ${
				local ? "local" : "remote"
			} client into a stable ID`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, true, true);
				finalIdToDecompress = getIdMadeBy(
					local ? localClient : remoteClient,
					true,
					network,
				);
			},
			benchmarkFn: () => {
				perfCompressor!.decompress(finalIdToDecompress);
			},
		});
	});

	let localIdToDecompress!: LocalCompressedId;
	benchmark({
		type,
		title: `decompress a local ID into a stable ID`,
		before: () => {
			const network = setupCompressors(defaultClusterCapacity, true, true);
			localIdToDecompress = getIdMadeBy(localClient, false, network);
		},
		benchmarkFn: () => {
			perfCompressor!.decompress(localIdToDecompress);
		},
	});

	benchmarkWithFlag((eagerFinal) => {
		let stableToCompress!: StableId;
		benchmark({
			type,
			title: `recompress a stable ID to a ${eagerFinal ? "local" : "final"} ID`,
			before: () => {
				const network = setupCompressors(defaultClusterCapacity, true, true);
				stableToCompress = perfCompressor.decompress(
					getIdMadeBy(localClient, eagerFinal, network),
				);
			},
			benchmarkFn: () => {
				perfCompressor!.recompress(stableToCompress);
			},
		});
	});

	benchmarkWithFlag((manySessions) => {
		benchmark({
			type,
			title: `serialize an IdCompressor (${
				manySessions ? "many sessions" : "many clusters"
			})`,
			before: () => {
				if (manySessions) {
					perfCompressor = buildHugeCompressor(undefined, defaultClusterCapacity);
				} else {
					setupCompressors(defaultClusterCapacity, false, true);
				}
			},
			benchmarkFn: () => {
				perfCompressor!.serialize(false);
			},
		});
	});

	benchmarkWithFlag((manySessions) => {
		let serialized!: SerializedIdCompressorWithNoSession;
		const overrideRemoteSessionId = createSessionId();
		benchmark({
			type,
			title: `deserialize an IdCompressor (${
				manySessions ? "many sessions" : "many clusters"
			})`,
			before: () => {
				if (manySessions) {
					perfCompressor = buildHugeCompressor(undefined, defaultClusterCapacity);
				} else {
					setupCompressors(defaultClusterCapacity, false, true);
				}
				serialized = perfCompressor.serialize(false);
			},
			benchmarkFn: () => {
				IdCompressor.deserialize(serialized, overrideRemoteSessionId);
			},
		});
	});
});
