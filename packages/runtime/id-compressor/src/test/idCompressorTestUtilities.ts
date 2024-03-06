/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Generator,
	createWeightedGenerator,
	interleave,
	makeRandom,
	performFuzzActions as performFuzzActionsBase,
	repeat,
	SaveInfo,
	take,
	BaseFuzzTestState,
} from "@fluid-private/stochastic-test-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	createIdCompressor,
	IdCreationRange,
	OpSpaceCompressedId,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
	type IIdCompressor,
	type IIdCompressorCore,
} from "..//index.js";
import { IdCompressor } from "../idCompressor.js";
import { assertIsSessionId, createSessionId } from "../utilities.js";
import {
	FinalCompressedId,
	getOrCreate,
	incrementStableId,
	isFinalId,
	isLocalId,
	ReadonlyIdCompressor,
	fail,
} from "./testCommon.js";

/**
 * A readonly `Map` which is known to contain a value for every possible key
 */
export interface ClosedMap<K, V> extends Omit<Map<K, V>, "delete" | "clear"> {
	get(key: K): V;
}

/** Identifies a compressor in a network */
export enum Client {
	Client1 = "Client1",
	Client2 = "Client2",
	Client3 = "Client3",
}

/** Identifies categories of compressors */
export enum MetaClient {
	All = "All",
}

/** Identifies a compressor inside the network but outside the three specially tracked clients. */
export enum OutsideClient {
	Remote = "Remote",
}

/**
 * Used to attribute actions to clients in a distributed collaboration session.
 * `Local` implies a local and unsequenced operation. All others imply sequenced operations.
 */
export type OriginatingClient = Client | OutsideClient;
export const OriginatingClient = { ...Client, ...OutsideClient };

/** Identifies a compressor to which to send an operation */
export type DestinationClient = Client | MetaClient;
export const DestinationClient = { ...Client, ...MetaClient };

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CompressorFactory {
	/**
	 * Creates a new compressor with the supplied cluster capacity.
	 */
	public static createCompressor(
		client: Client,
		clusterCapacity = 5,
		logger?: ITelemetryBaseLogger,
	): IdCompressor {
		return CompressorFactory.createCompressorWithSession(
			sessionIds.get(client),
			clusterCapacity,
			logger,
		);
	}

	/**
	 * Creates a new compressor with the supplied cluster capacity.
	 */
	public static createCompressorWithSession(
		sessionId: SessionId,
		clusterCapacity = 5,
		logger?: ITelemetryBaseLogger,
	): IdCompressor {
		const compressor = createIdCompressor(sessionId, logger) as IdCompressor;
		// eslint-disable-next-line @typescript-eslint/dot-notation
		compressor["nextRequestedClusterSize"] = clusterCapacity;
		return compressor;
	}
}

/**
 * Utility for building a huge compressor.
 * Build via the compressor factory.
 */
export function buildHugeCompressor(
	numSessions = 10000,
	capacity = 10,
	numClustersPerSession = 3,
): IdCompressor {
	const compressor = CompressorFactory.createCompressorWithSession(createSessionId(), capacity);
	const sessions: SessionId[] = [];
	for (let i = 0; i < numSessions; i++) {
		sessions.push(createSessionId());
	}
	for (let i = 0; i < numSessions * numClustersPerSession; i++) {
		const sessionId = sessions[i % numSessions];
		if (Math.random() > 0.1) {
			for (let j = 0; j < Math.round(capacity / 2); j++) {
				compressor.generateCompressedId();
			}
			compressor.finalizeCreationRange(compressor.takeNextCreationRange());
		}
		compressor.finalizeCreationRange({
			sessionId,
			ids: {
				firstGenCount: Math.floor(i / numSessions) * capacity + 1,
				count: capacity,
				requestedClusterSize: capacity,
			},
		});
	}
	return compressor;
}

/**
 * A closed map from NamedClient to T.
 */
export type ClientMap<T> = ClosedMap<Client, T>;

function makeSessionIds(): ClientMap<SessionId> {
	const stableIds = new Map<Client, SessionId>();
	const clients = Object.values(Client);
	for (let i = 0; i < clients.length; i++) {
		// Place session uuids roughly in the middle of uuid space to increase odds of encountering interesting
		// orderings in sorted collections
		const sessionId = assertIsSessionId(`88888888-8888-4888-b${i}88-888888888888`);
		stableIds.set(clients[i], sessionId);
	}
	return stableIds as ClientMap<SessionId>;
}

/**
 * An array of session ID strings corresponding to all non-local `Client` entries.
 */
export const sessionIds = makeSessionIds();

/** Information about a generated ID in a network to be validated by tests */
export interface TestIdData {
	readonly id: SessionSpaceCompressedId;
	readonly originatingClient: OriginatingClient;
	readonly sessionId: SessionId;
	readonly isSequenced: boolean;
}

/**
 * Simulates a network of ID compressors.
 * Not suitable for performance testing.
 */
export class IdCompressorTestNetwork {
	/** The compressors used in this network */
	private readonly compressors: ClientMap<IdCompressor>;
	/** The log of operations seen by the server so far. Append-only. */
	private readonly serverOperations: [
		creationRange: IdCreationRange,
		opSpaceIds: OpSpaceCompressedId[],
		clientFrom: OriginatingClient,
		sessionIdFrom: SessionId,
	][] = [];
	/** An index into `serverOperations` for each client which represents how many operations have been delivered to that client */
	private readonly clientProgress: ClientMap<number>;
	/** All ids (local and sequenced) that a client has created or received, in order. */
	private readonly idLogs: ClientMap<TestIdData[]>;
	/** All ids that a client has received from the server, in order. */
	private readonly sequencedIdLogs: ClientMap<TestIdData[]>;

	public constructor(public readonly initialClusterSize = 5) {
		const compressors = new Map<Client, IdCompressor>();
		const clientProgress = new Map<Client, number>();
		const clientIds = new Map<Client, TestIdData[]>();
		const clientSequencedIds = new Map<Client, TestIdData[]>();
		for (const client of Object.values(Client)) {
			const compressor = CompressorFactory.createCompressor(client, initialClusterSize);
			compressors.set(client, compressor);
			clientProgress.set(client, 0);
			clientIds.set(client, []);
			clientSequencedIds.set(client, []);
		}
		this.compressors = compressors as ClientMap<IdCompressor>;
		this.clientProgress = clientProgress as ClientMap<number>;
		this.idLogs = clientIds as ClientMap<TestIdData[]>;
		this.sequencedIdLogs = clientSequencedIds as ClientMap<TestIdData[]>;
	}

	/**
	 * Returns the number of undelivered operations for the given client that are in flight in the network.
	 */
	public getPendingOperations(destination: Client): number {
		return this.serverOperations.length - this.clientProgress.get(destination);
	}

	/**
	 * Returns an immutable handle to a compressor in the network.
	 */
	public getCompressor(client: Client): ReadonlyIdCompressor {
		const compressors = this.compressors;
		const handler = {
			get<P extends keyof IdCompressor>(_: unknown, property: P): IdCompressor[P] {
				return compressors.get(client)[property];
			},
			set<P extends keyof IdCompressor>(
				_: unknown,
				property: P,
				value: IdCompressor[P],
			): boolean {
				compressors.get(client)[property] = value;
				return true;
			},
		};
		return new Proxy<IdCompressor>({} as unknown as IdCompressor, handler);
	}

	/**
	 * Returns a mutable handle to a compressor in the network. Use of mutation methods will break the network invariants and
	 * should only be used if the network will not be used again.
	 */
	public getCompressorUnsafe(client: Client): IdCompressor {
		return this.getCompressor(client) as IdCompressor;
	}

	/**
	 * Returns a mutable handle to a compressor in the network. Use of mutation methods will break the network invariants and
	 * should only be used if the network will not be used again. Additionally, the returned compressor will be invalidated/unusable
	 * if any network operations cause it to be regenerated (serialization/deserialization, etc.).
	 */
	public getCompressorUnsafeNoProxy(client: Client): IdCompressor {
		return this.compressors.get(client);
	}

	/**
	 * Returns data for all IDs created and received by this client, including ack's of their own (i.e. their own IDs will appear twice)
	 */
	public getIdLog(client: Client): readonly TestIdData[] {
		return this.idLogs.get(client);
	}

	/**
	 * Returns data for all IDs received by this client, including ack's of their own.
	 */
	public getSequencedIdLog(client: Client): readonly TestIdData[] {
		return this.sequencedIdLogs.get(client);
	}

	/**
	 * Get all compressors for the given destination
	 */
	public getTargetCompressors(clientTo: DestinationClient): [Client, IdCompressor][] {
		return clientTo === MetaClient.All
			? [...this.compressors.entries()]
			: ([[clientTo, this.getCompressor(clientTo)]] as [Client, IdCompressor][]);
	}

	/**
	 * Changes the capacity request amount for a client. It will take effect immediately.
	 */
	public changeCapacity(client: Client, newClusterCapacity: number): void {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		this.compressors.get(client)["nextRequestedClusterSize"] = newClusterCapacity;
	}

	private addNewId(
		client: Client,
		id: SessionSpaceCompressedId,
		originatingClient: OriginatingClient,
		sessionIdFrom: SessionId,
		isSequenced: boolean,
	): void {
		const idData = {
			id,
			originatingClient,
			sessionId: sessionIdFrom,
			isSequenced,
		};
		const clientIds = this.idLogs.get(client);
		clientIds.push(idData);
		if (isSequenced) {
			const sequencedIds = this.sequencedIdLogs.get(client);
			sequencedIds.push(idData);
		}
	}

	/**
	 * Allocates a new range of local IDs and enqueues them for future delivery via a `testIdDelivery` action.
	 * Calls to this method determine the total order of delivery, regardless of when `deliverOperations` is called.
	 */
	public allocateAndSendIds(clientFrom: Client, numIds: number): OpSpaceCompressedId[] {
		return this.allocateAndSendIdsFromRemoteClient(
			clientFrom,
			sessionIds.get(clientFrom),
			numIds,
		);
	}

	/**
	 * Same contract as `allocateAndSendIds`, but the originating client will be a client with the supplied sessionId.
	 */
	public allocateAndSendIdsFromRemoteClient(
		clientFrom: OriginatingClient,
		sessionIdFrom: SessionId,
		numIds: number,
	): OpSpaceCompressedId[] {
		assert(numIds > 0, "Must allocate a non-zero number of IDs");
		if (clientFrom === OriginatingClient.Remote) {
			const range: IdCreationRange = {
				sessionId: sessionIdFrom,
				ids: {
					firstGenCount: 1,
					count: numIds,
					requestedClusterSize: this.getCompressor(Client.Client1)[
						// eslint-disable-next-line @typescript-eslint/dot-notation
						"nextRequestedClusterSize"
					],
				},
			};
			const opSpaceIds: OpSpaceCompressedId[] = [];
			for (let i = 0; i < numIds; i++) {
				opSpaceIds.push(-(i + 1) as OpSpaceCompressedId);
			}
			this.serverOperations.push([range, opSpaceIds, clientFrom, sessionIdFrom]);
			return opSpaceIds;
		} else {
			assert(sessionIdFrom === sessionIds.get(clientFrom));
			const compressor = this.compressors.get(clientFrom);
			const sessionSpaceIds = generateCompressedIds(compressor, numIds);
			for (let i = 0; i < numIds; i++) {
				this.addNewId(clientFrom, sessionSpaceIds[i], clientFrom, sessionIdFrom, false);
			}
			const opSpaceIds = sessionSpaceIds.map((id) => compressor.normalizeToOpSpace(id));
			const creationRange = compressor.takeNextCreationRange();
			this.serverOperations.push([creationRange, opSpaceIds, clientFrom, sessionIdFrom]);
			return opSpaceIds;
		}
	}

	/**
	 * Delivers all undelivered ID ranges from the server to the target clients.
	 */
	public deliverOperations(clientTakingDelivery: Client, opsToDeliver?: number): void;

	/**
	 * Delivers all undelivered ID ranges from the server to the target clients.
	 */
	public deliverOperations(clientTakingDelivery: DestinationClient): void;

	/**
	 * Delivers all undelivered ID ranges from the server to the target clients.
	 */
	public deliverOperations(clientTakingDelivery: DestinationClient, opsToDeliver?: number): void {
		let opIndexBound: number;
		if (clientTakingDelivery === DestinationClient.All) {
			assert(opsToDeliver === undefined);
			opIndexBound = this.serverOperations.length;
		} else {
			opIndexBound =
				opsToDeliver !== undefined
					? this.clientProgress.get(clientTakingDelivery) + opsToDeliver
					: this.serverOperations.length;
		}
		for (const [clientTo, compressorTo] of this.getTargetCompressors(clientTakingDelivery)) {
			for (let i = this.clientProgress.get(clientTo); i < opIndexBound; i++) {
				const [range, opSpaceIds, clientFrom, sessionIdFrom] = this.serverOperations[i];
				compressorTo.finalizeCreationRange(range);

				const ids = range.ids;
				if (ids !== undefined) {
					for (const id of opSpaceIds) {
						const sessionSpaceId = compressorTo.normalizeToSessionSpace(
							id,
							range.sessionId,
						);
						this.addNewId(clientTo, sessionSpaceId, clientFrom, sessionIdFrom, true);
					}
				}
			}

			this.clientProgress.set(clientTo, opIndexBound);
		}
	}

	/**
	 * Simulate a client disconnecting (and serializing), then reconnecting (and deserializing)
	 */
	public goOfflineThenResume(client: Client): void {
		const compressor = this.compressors.get(client);
		const [_, resumedCompressor] = roundtrip(compressor, true);
		this.compressors.set(client, resumedCompressor);
	}

	/**
	 * Ensure general validity of the network state. Useful for calling periodically or at the end of test scenarios.
	 */
	public assertNetworkState(): void {
		const sequencedLogs = Object.values(Client).map(
			(client) => [this.compressors.get(client), this.getSequencedIdLog(client)] as const,
		);

		// First, ensure all clients each generated a unique ID for each of their own calls to generate.
		for (const [compressor, ids] of sequencedLogs) {
			const allUuids = new Set<StableId | string>();
			for (const idData of ids) {
				const uuid = compressor.decompress(idData.id);
				assert.strictEqual(!allUuids.has(uuid), true, "Duplicate UUID generated.");
				allUuids.add(uuid);
			}
		}

		const maxLogLength = sequencedLogs
			.map(([_, data]) => data.length)
			.reduce((p, n) => Math.max(p, n));

		function getNextLogWithEntryAt(logsIndex: number, entryIndex: number): number | undefined {
			for (let i = logsIndex; i < sequencedLogs.length; i++) {
				const log = sequencedLogs[i];
				if (log[1].length > entryIndex) {
					return i;
				}
			}
			return undefined;
		}

		const uuids = new Set<StableId>();
		const finalIds = new Set<FinalCompressedId>();
		const idIndicesAggregator = new Map<SessionId, number>();

		function* getIdLogEntries(
			columnIndex: number,
		): Iterable<
			[
				current: [compressor: IdCompressor, idData: TestIdData],
				next?: [compressor: IdCompressor, idData: TestIdData],
			]
		> {
			let current = getNextLogWithEntryAt(0, columnIndex);
			while (current !== undefined) {
				const next = getNextLogWithEntryAt(current + 1, columnIndex);
				const [compressor, log] = sequencedLogs[current];
				if (next === undefined) {
					yield [[compressor, log[columnIndex]]];
				} else {
					const [compressorNext, logNext] = sequencedLogs[next];
					yield [
						[compressor, log[columnIndex]],
						[compressorNext, logNext[columnIndex]],
					];
				}
				current = next;
			}
		}

		for (let i = 0; i < maxLogLength; i++) {
			let idCreatorCount = 0;
			let originatingSession: SessionId | undefined;
			for (const [current, next] of getIdLogEntries(i)) {
				const [compressorA, idDataA] = current;
				const sessionSpaceIdA = idDataA.id;
				const idIndex = getOrCreate(idIndicesAggregator, idDataA.sessionId, () => 0);
				originatingSession ??= idDataA.sessionId;
				assert(
					idDataA.sessionId === originatingSession,
					"Test infra gave wrong originating client to TestIdData",
				);

				// Only one client should have this ID as local in its session space, as only one client could have created this ID
				if (isLocalId(sessionSpaceIdA)) {
					if (originatingSession !== OriginatingClient.Remote) {
						assert.strictEqual(
							idDataA.sessionId,
							this.compressors.get(idDataA.originatingClient as Client)
								.localSessionId,
						);
					}
					idCreatorCount++;
				}

				const uuidASessionSpace = compressorA.decompress(sessionSpaceIdA);
				assert.strictEqual(
					uuidASessionSpace,
					incrementStableId(idDataA.sessionId, idIndex),
				);
				assert.strictEqual(compressorA.recompress(uuidASessionSpace), sessionSpaceIdA);
				uuids.add(uuidASessionSpace);
				const opSpaceIdA = compressorA.normalizeToOpSpace(sessionSpaceIdA);
				if (!isFinalId(opSpaceIdA)) {
					fail("IDs should have been finalized.");
				}
				const reNormalizedIdA = compressorA.normalizeToSessionSpace(
					opSpaceIdA,
					compressorA.localSessionId,
				);
				assert.strictEqual(reNormalizedIdA, sessionSpaceIdA);
				finalIds.add(opSpaceIdA);
				const uuidAOpSpace = compressorA.decompress(reNormalizedIdA);

				assert.strictEqual(uuidASessionSpace, uuidAOpSpace);

				if (next !== undefined) {
					const [compressorB, idDataB] = next;
					const sessionSpaceIdB = idDataB.id;

					const uuidBSessionSpace = compressorB.decompress(sessionSpaceIdB);
					assert.strictEqual(uuidASessionSpace, uuidBSessionSpace);
					const opSpaceIdB = compressorB.normalizeToOpSpace(sessionSpaceIdB);
					if (opSpaceIdA !== opSpaceIdB) {
						compressorB.normalizeToOpSpace(sessionSpaceIdB);
						compressorA.normalizeToOpSpace(sessionSpaceIdA);
					}
					assert.strictEqual(opSpaceIdA, opSpaceIdB);
					if (!isFinalId(opSpaceIdB)) {
						fail("IDs should have been finalized.");
					}
					const uuidBOpSpace = compressorB.decompress(
						opSpaceIdB as unknown as SessionSpaceCompressedId,
					);
					assert.strictEqual(uuidAOpSpace, uuidBOpSpace);
				}
			}

			assert(idCreatorCount <= 1, "Only one client can create an ID.");
			assert.strictEqual(uuids.size, finalIds.size);
			assert(originatingSession !== undefined, "Expected originating client to be defined");
			idIndicesAggregator.set(
				originatingSession,
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				(idIndicesAggregator.get(originatingSession) ??
					fail("Expected pre-existing index for originating client")) + 1,
			);
		}

		for (const [compressor] of sequencedLogs) {
			expectSerializes(compressor);
		}
	}
}

/**
 * Roundtrips the supplied compressor through serialization and deserialization.
 */
export function roundtrip(
	compressor: ReadonlyIdCompressor,
	withSession: true,
): [SerializedIdCompressorWithOngoingSession, IdCompressor];

/**
 * Roundtrips the supplied compressor through serialization and deserialization.
 */
export function roundtrip(
	compressor: ReadonlyIdCompressor,
	withSession: false,
): [SerializedIdCompressorWithNoSession, IdCompressor];

export function roundtrip(
	compressor: ReadonlyIdCompressor,
	withSession: boolean,
): [SerializedIdCompressorWithOngoingSession | SerializedIdCompressorWithNoSession, IdCompressor] {
	if (withSession) {
		const serialized = compressor.serialize(withSession);
		return [serialized, IdCompressor.deserialize(serialized)];
	}

	const nonLocalSerialized = compressor.serialize(withSession);
	return [nonLocalSerialized, IdCompressor.deserialize(nonLocalSerialized, createSessionId())];
}

/**
 * Asserts that the supplied compressor correctly roundtrips through serialization/deserialization.
 */
export function expectSerializes(
	compressor: ReadonlyIdCompressor,
): [SerializedIdCompressorWithNoSession, SerializedIdCompressorWithOngoingSession] {
	function expectSerializesWithSession(
		withSession: boolean,
	): SerializedIdCompressorWithOngoingSession | SerializedIdCompressorWithNoSession {
		let serialized:
			| SerializedIdCompressorWithOngoingSession
			| SerializedIdCompressorWithNoSession;
		let deserialized: IdCompressor;
		if (withSession) {
			[serialized, deserialized] = roundtrip(compressor, true);
		} else {
			[serialized, deserialized] = roundtrip(compressor, false);
		}
		assert.strictEqual(compressor.equals(deserialized, withSession), true);
		return serialized;
	}

	return [
		expectSerializesWithSession(false) as SerializedIdCompressorWithNoSession,
		expectSerializesWithSession(true) as SerializedIdCompressorWithOngoingSession,
	];
}

/**
 * Merges 'from' into 'to', and returns 'to'.
 */
export function mergeArrayMaps<K, V>(
	to: Pick<Map<K, V[]>, "get" | "set">,
	from: ReadonlyMap<K, V[]>,
): Pick<Map<K, V[]>, "get" | "set"> {
	for (const [key, value] of from.entries()) {
		const entry = to.get(key);
		if (entry !== undefined) {
			entry.push(...value);
		} else {
			to.set(key, [...value]);
		}
	}
	return to;
}

interface AllocateIds {
	type: "allocateIds";
	client: Client;
	numIds: number;
}

interface AllocateOutsideIds {
	type: "allocateOutsideIds";
	sessionId: SessionId;
	numIds: number;
}

interface DeliverAllOperations {
	type: "deliverAllOperations";
}

interface DeliverSomeOperations {
	type: "deliverSomeOperations";
	client: Client;
	count: number;
}

interface ChangeCapacity {
	type: "changeCapacity";
	client: Client;
	newSize: number;
}

// Represents intent to go offline then resume.
interface Reconnect {
	type: "reconnect";
	client: Client;
}

interface Validate {
	type: "validate";
}

type Operation =
	| AllocateIds
	| AllocateOutsideIds
	| DeliverSomeOperations
	| DeliverAllOperations
	| ChangeCapacity
	| Reconnect
	| Validate;

interface FuzzTestState extends BaseFuzzTestState {
	network: IdCompressorTestNetwork;
	activeClients: Client[];
	selectableClients: Client[];
	clusterSize: number;
}

export interface OperationGenerationConfig {
	/** maximum cluster size of the network. Default: 25 */
	maxClusterSize?: number;
	/** Number of ops between validation ops. Default: 200 */
	validateInterval?: number;
	/** Fraction of ID allocations that are from an outside client (not Client1/2/3). */
	outsideAllocationFraction?: number;
}

const defaultOptions = {
	maxClusterSize: 25,
	validateInterval: 200,
	outsideAllocationFraction: 0.1,
};

export function makeOpGenerator(
	options: OperationGenerationConfig,
): Generator<Operation, FuzzTestState> {
	const { maxClusterSize, validateInterval, outsideAllocationFraction } = {
		...defaultOptions,
		...options,
	};
	assert(outsideAllocationFraction >= 0 && outsideAllocationFraction <= 1);

	function allocateIdsGenerator({
		activeClients,
		clusterSize,
		random,
	}: FuzzTestState): AllocateIds {
		const client = random.pick(activeClients);
		const maxIdsPerUsage = clusterSize * 2;
		const numIds = Math.floor(random.real(0, 1) ** 3 * maxIdsPerUsage) + 1;
		return {
			type: "allocateIds",
			client,
			numIds,
		};
	}

	function allocateOutsideIdsGenerator({
		clusterSize,
		random,
	}: FuzzTestState): AllocateOutsideIds {
		const maxIdsPerUsage = clusterSize * 2;
		const numIds = Math.floor(random.real(0, 1) ** 3 * maxIdsPerUsage) + 1;
		return {
			type: "allocateOutsideIds",
			sessionId: createSessionId(),
			numIds,
		};
	}

	function changeCapacityGenerator({ random, activeClients }: FuzzTestState): ChangeCapacity {
		return {
			type: "changeCapacity",
			client: random.pick(activeClients),
			newSize: Math.min(
				Math.floor(random.real(0, 1) ** 2 * maxClusterSize) + 1,
				maxClusterSize,
			),
		};
	}

	function deliverAllOperationsGenerator(): DeliverAllOperations {
		return {
			type: "deliverAllOperations",
		};
	}

	function deliverSomeOperationsGenerator({
		random,
		selectableClients,
		network,
	}: FuzzTestState): DeliverSomeOperations {
		const pendingClients = selectableClients.filter((c) => network.getPendingOperations(c) > 0);
		if (pendingClients.length === 0) {
			return {
				type: "deliverSomeOperations",
				client: random.pick(selectableClients),
				count: 0,
			};
		}
		const client = random.pick(pendingClients);
		return {
			type: "deliverSomeOperations",
			client,
			count: random.integer(1, network.getPendingOperations(client)),
		};
	}

	function reconnectGenerator({ activeClients, random }: FuzzTestState): Reconnect {
		return { type: "reconnect", client: random.pick(activeClients) };
	}

	const allocationWeight = 16;
	return interleave(
		createWeightedGenerator<Operation, FuzzTestState>([
			[changeCapacityGenerator, 1],
			[allocateIdsGenerator, Math.round(allocationWeight * (1 - outsideAllocationFraction))],
			[allocateOutsideIdsGenerator, Math.round(allocationWeight * outsideAllocationFraction)],
			[deliverAllOperationsGenerator, 2],
			[deliverSomeOperationsGenerator, 6],
			[reconnectGenerator, 1],
		]),
		take(1, repeat<Operation, FuzzTestState>({ type: "validate" })),
		validateInterval,
	);
}

/**
 * Performs random actions on a test network.
 * @param generator - the generator used to provide operations
 * @param network - the test network to test
 * @param seed - the seed for the random generation of the fuzz actions
 * @param observerClient - if provided, this client will never generate local ids
 * @param synchronizeAtEnd - if provided, all client will have all operations delivered from the server at the end of the test
 * @param validator - if provided, this callback will be invoked periodically during the fuzz test.
 */
export function performFuzzActions(
	generator: Generator<Operation, FuzzTestState>,
	network: IdCompressorTestNetwork,
	seed: number,
	observerClient?: Client,
	synchronizeAtEnd: boolean = true,
	validator?: (network: IdCompressorTestNetwork) => void,
	saveInfo?: SaveInfo,
): void {
	const random = makeRandom(seed);
	const selectableClients: Client[] = network
		.getTargetCompressors(MetaClient.All)
		.map(([client]) => client);

	const initialState: FuzzTestState = {
		random,
		network,
		activeClients: selectableClients.filter((c) => c !== observerClient),
		selectableClients,
		clusterSize: network.initialClusterSize,
	};

	performFuzzActionsBase(
		generator,
		{
			allocateIds: (state, { client, numIds }) => {
				network.allocateAndSendIdsFromRemoteClient(client, sessionIds.get(client), numIds);
				return state;
			},
			allocateOutsideIds: (state, { sessionId, numIds }) => {
				network.allocateAndSendIdsFromRemoteClient(
					OriginatingClient.Remote,
					sessionId,
					numIds,
				);
				return state;
			},
			changeCapacity: (state, op) => {
				network.changeCapacity(op.client, op.newSize);
				return { ...state, clusterSize: op.newSize };
			},
			deliverSomeOperations: (state, op) => {
				network.deliverOperations(op.client, op.count);
				return state;
			},
			deliverAllOperations: (state) => {
				network.deliverOperations(DestinationClient.All);
				return state;
			},
			reconnect: (state, { client }) => {
				network.goOfflineThenResume(client);
				return state;
			},
			validate: (state) => {
				network.deliverOperations(DestinationClient.All);
				validator?.(network);
				return state;
			},
		},
		initialState,
		saveInfo,
	);

	if (synchronizeAtEnd) {
		network.deliverOperations(DestinationClient.All);
		validator?.(network);
	}
}

/**
 * Helper to generate a fixed number of IDs.
 */
export function generateCompressedIds(
	compressor: IdCompressor,
	count: number,
): SessionSpaceCompressedId[] {
	const ids: SessionSpaceCompressedId[] = [];
	for (let i = 0; i < count; i++) {
		ids.push(compressor.generateCompressedId());
	}
	return ids;
}

/**
 * Creates a compressor that only produces final IDs.
 * It should only be used for testing purposes.
 */
export function createAlwaysFinalizedIdCompressor(
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;
/**
 * Creates a compressor that only produces final IDs.
 * It should only be used for testing purposes.
 */
export function createAlwaysFinalizedIdCompressor(
	sessionId: SessionId,
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;
export function createAlwaysFinalizedIdCompressor(
	sessionIdOrLogger?: SessionId | ITelemetryBaseLogger,
	loggerOrUndefined?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore {
	const compressor =
		sessionIdOrLogger === undefined
			? createIdCompressor()
			: typeof sessionIdOrLogger === "string"
			? createIdCompressor(sessionIdOrLogger, loggerOrUndefined)
			: createIdCompressor(sessionIdOrLogger);
	// Permanently put the compressor in a ghost session
	(compressor as IdCompressor).startGhostSession(createSessionId());
	return compressor;
}
