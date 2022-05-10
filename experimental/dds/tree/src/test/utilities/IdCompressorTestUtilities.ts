/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { expect } from 'chai';
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
} from '@fluid-internal/stochastic-test-utils';
import { assert, assertNotUndefined, ClosedMap, fail, getOrCreate } from '../../Common';
import { IdCompressor, IdRangeDescriptor, isLocalId } from '../../id-compressor/IdCompressor';
import {
	createSessionId,
	ensureSessionUuid,
	NumericUuid,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
} from '../../id-compressor/NumericUuid';
import { FinalCompressedId, SessionId, StableId, SessionSpaceCompressedId, AttributionId } from '../../Identifiers';
import { getIds } from '../../id-compressor/IdRange';
import type {
	IdCreationRange,
	SerializedIdCompressorWithOngoingSession,
	SerializedIdCompressorWithNoSession,
} from '../../id-compressor';
import { assertIsStableId, assertIsUuidString } from '../../UuidUtilities';
import { expectDefined } from './TestCommon';

/** Identifies a compressor in a network */
export enum Client {
	Client1 = 'Client1',
	Client2 = 'Client2',
	Client3 = 'Client3',
}

/** Identifies a compressor with respect to a specific operation */
export enum SemanticClient {
	LocalClient = 'LocalClient',
}

/** Identifies categories of compressors */
export enum MetaClient {
	All = 'All',
}

/**
 * Used to attribute actions to clients in a distributed collaboration session.
 * `Local` implies a local and unsequenced operation. All others imply sequenced operations.
 */
export type OriginatingClient = Client | SemanticClient;
export const OriginatingClient = { ...Client, ...SemanticClient };

/** Identifies a compressor to which to send an operation */
export type DestinationClient = Client | MetaClient;
export const DestinationClient = { ...Client, ...MetaClient };

/**
 * Creates a new compressor with the supplied cluster capacity.
 */
export function createCompressor(client: Client, clusterCapacity = 5, attributionId?: AttributionId): IdCompressor {
	const compressor = new IdCompressor(sessionIds.get(client), 1024, attributionId);
	compressor.clusterCapacity = clusterCapacity;
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
		const sessionId = ensureSessionUuid(assertIsStableId(`88888888-8888-4888-b${i}88-888888888888`));
		stableIds.set(clients[i], sessionId);
	}
	return stableIds as ClientMap<SessionId>;
}

/**
 * An array of session ID strings corresponding to all non-local `Client` entries.
 */
export const sessionIds = makeSessionIds();

/**
 * An array of session uuids corresponding to all non-local `Client` entries.
 */
export const sessionNumericUuids = new Map(
	[...sessionIds.entries()].map(([client, sessionId]) => {
		return [client, numericUuidFromStableId(sessionId)];
	})
) as ClientMap<NumericUuid>;

export const attributionIds = new Map(
	Object.values(Client).map((c, i) => [
		c,
		assertIsUuidString(`00000000-0000-0000-0000-${(i + 1).toString(16).padStart(12, '0')}`),
	])
) as ClientMap<AttributionId>;

/** An immutable view of an `IdCompressor` */
export interface ReadonlyIdCompressor
	extends Omit<
		IdCompressor,
		'generateCompressedId' | 'generateCompressedIdRange' | 'takeNextCreationRange' | 'finalizeCreationRange'
	> {
	readonly clusterCapacity: number;
}

/** Information about a generated ID in a network to be validated by tests */
export interface TestIdData {
	readonly id: SessionSpaceCompressedId;
	readonly originatingClient: Client;
	readonly sessionId: SessionId;
	readonly sessionNumericUuid: NumericUuid;
	readonly expectedOverride: string | undefined;
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
	private readonly serverOperations: ([range: IdCreationRange, clientFrom: Client] | number)[] = [];
	/** An index into `serverOperations` for each client which represents how many operations have been delivered to that client */
	private readonly clientProgress: ClientMap<number>;
	/** All ids (local and sequenced) that a client has created or received, in order. */
	private readonly idLogs: ClientMap<TestIdData[]>;
	/** All ids that a client has received from the server, in order. */
	private readonly sequencedIdLogs: ClientMap<TestIdData[]>;

	public constructor(
		public readonly initialClusterSize = 5,
		private readonly onIdReceived?: (network: IdCompressorTestNetwork, clientTo: Client, ids: TestIdData[]) => void
	) {
		const compressors = new Map<Client, IdCompressor>();
		const clientProgress = new Map<Client, number>();
		const clientIds = new Map<Client, TestIdData[]>();
		const clientSequencedIds = new Map<Client, TestIdData[]>();
		for (const client of Object.values(Client)) {
			const compressor = createCompressor(client, initialClusterSize, attributionIds.get(client));
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
	 * Returns an immutable handle to a compressor in the network.
	 */
	public getCompressor(client: Client): ReadonlyIdCompressor {
		const compressors = this.compressors;
		const handler = {
			get(_, property) {
				const compressor = compressors.get(client);
				return compressor[property];
			},
			set(_, property, value): boolean {
				const compressor = compressors.get(client);
				compressor[property] = value;
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
	 * Returns data for all IDs created and received by this client, including ack's of their own (i.e. their own IDs will appear twice)
	 */
	public getIdLog(client: Client): readonly TestIdData[] {
		return this.idLogs.get(client);
	}

	/**
	 * Returns data for all IDs received by this client, including ack's of their own (i.e. their own IDs will appear twice)
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
	 * Submit a capacity change operation to the network. It will not take effect immediately but will be processed in sequence order.
	 */
	public enqueueCapacityChange(newClusterCapacity: number): void {
		this.serverOperations.push(newClusterCapacity);
	}

	private addNewId(
		client: Client,
		id: SessionSpaceCompressedId,
		expectedOverride: string | undefined,
		originatingClient: Client,
		isSequenced: boolean
	): void {
		const idData = {
			id,
			originatingClient,
			sessionId: sessionIds.get(originatingClient),
			sessionNumericUuid: sessionNumericUuids.get(originatingClient),
			expectedOverride,
			isSequenced,
		};
		const clientIds = this.idLogs.get(client);
		clientIds.push(idData);
		if (isSequenced) {
			const sequencedIds = this.sequencedIdLogs.get(client);
			sequencedIds.push(idData);
		}
		this.onIdReceived?.(this, client, clientIds);
	}

	/**
	 * Allocates a new range of local IDs and enqueues them for future delivery via a `testIdDelivery` action.
	 * Calls to this method determine the total order of delivery, regardless of when `deliverOperations` is called.
	 */
	public allocateAndSendIds(
		client: Client,
		numIds: number
	): { range: IdRangeDescriptor<SessionSpaceCompressedId>; sessionId: SessionId };

	/**
	 * Allocates a new range of local IDs and enqueues them for future delivery via a `testIdDelivery` action.
	 * Calls to this method determine the total order of delivery, regardless of when `deliverOperations` is called.
	 */
	public allocateAndSendIds(client: Client, numIds: number, overrides: { [index: number]: string }): IdCreationRange;

	public allocateAndSendIds(
		client: Client,
		numIds: number,
		overrides: { [index: number]: string } = {}
	): { range: IdRangeDescriptor<SessionSpaceCompressedId>; sessionId: SessionId } | IdCreationRange {
		assert(numIds > 0, 'Must allocate a non-zero number of IDs');
		const compressor = this.compressors.get(client);
		let nextIdIndex = 0;
		for (const [overrideIndex, uuid] of Object.entries(overrides)
			.map(([id, uuid]) => [Number.parseInt(id, 10), uuid] as [number, string])
			.sort(([a], [b]) => a - b)) {
			while (nextIdIndex < overrideIndex) {
				this.addNewId(client, compressor.generateCompressedId(), undefined, client, false);
				nextIdIndex += 1;
			}
			this.addNewId(client, compressor.generateCompressedId(uuid), uuid, client, false);
			nextIdIndex += 1;
		}
		const numTrailingIds = numIds - nextIdIndex;
		let range: IdRangeDescriptor<SessionSpaceCompressedId> | undefined;
		if (numTrailingIds > 0) {
			range = compressor.generateCompressedIdRange(numTrailingIds);
			const ids = compressor.getIdsFromRange(range, compressor.localSessionId);
			for (let i = 0; i < numTrailingIds; i++) {
				this.addNewId(client, ids.get(i), undefined, client, false);
			}
		}
		const creationRange = compressor.takeNextCreationRange();
		this.serverOperations.push([creationRange, client]);
		return nextIdIndex === 0 ? { range: range ?? fail(), sessionId: compressor.localSessionId } : creationRange;
	}

	/**
	 * Delivers all undelivered ID ranges and cluster capacity changes from the server to the target clients.
	 */
	public deliverOperations(clientTakingDelivery: DestinationClient) {
		for (const [clientTo, compressorTo] of this.getTargetCompressors(clientTakingDelivery)) {
			for (let i = this.clientProgress.get(clientTo); i < this.serverOperations.length; i++) {
				const operation = this.serverOperations[i];
				if (typeof operation === 'number') {
					compressorTo.clusterCapacity = operation;
				} else {
					const [range, clientFrom] = operation;
					compressorTo.finalizeCreationRange(range);

					const ids = getIds(range);
					if (ids !== undefined) {
						let overrideIndex = 0;
						const overrides = ids.overrides;
						for (let id = ids.first; id >= ids.last; id--) {
							let override: string | undefined;
							if (
								overrides !== undefined &&
								overrideIndex < overrides.length &&
								id === overrides[overrideIndex][0]
							) {
								override = overrides[overrideIndex][1];
								overrideIndex++;
							}
							const sessionSpaceId = compressorTo.normalizeToSessionSpace(id, range.sessionId);
							this.addNewId(clientTo, sessionSpaceId, override, clientFrom, true);
						}
						assert(overrideIndex === (overrides?.length ?? 0));
					}
				}
			}

			this.clientProgress.set(clientTo, this.serverOperations.length);
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
			(client) => [this.compressors.get(client), this.getSequencedIdLog(client)] as const
		);

		const maxLogLength = sequencedLogs.map(([_, data]) => data.length).reduce((p, n) => Math.max(p, n));

		function getNextLogWithEntryAt(logsIndex: number, entryIndex: number): number | undefined {
			for (let i = logsIndex; i < sequencedLogs.length; i++) {
				const log = sequencedLogs[i];
				if (log[1].length > entryIndex) {
					return i;
				}
			}
			return undefined;
		}

		const uuids = new Set<string>();
		const finalIds = new Set<FinalCompressedId>();
		const idIndicesAggregator = new Map<Client, number>();

		function* getLogIndices(
			columnIndex: number
		): Iterable<
			[
				current: [compressor: IdCompressor, idData: TestIdData],
				next?: [compressor: IdCompressor, idData: TestIdData]
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
			const creator: [creator: Client, override?: string][] = [];
			let originatingClient: Client | undefined;
			let localCount = 0;
			let rowCount = 0;
			for (const [current, next] of getLogIndices(i)) {
				const [compressorA, idDataA] = current;
				const sessionSpaceIdA = idDataA.id;
				if (isLocalId(sessionSpaceIdA)) {
					localCount += 1;
				}
				const idIndex = getOrCreate(idIndicesAggregator, idDataA.originatingClient, () => 0);
				originatingClient ??= idDataA.originatingClient;
				assert(
					idDataA.originatingClient === originatingClient,
					'Test infra gave wrong originating client to TestIdData'
				);
				const attributionA = compressorA.attributeId(idDataA.id);
				if (attributionA !== attributionIds.get(idDataA.originatingClient)) {
					// Unification
					expectDefined(idDataA.expectedOverride);
				}

				// Only one client should have this ID as local in its session space, as only one client could have created this ID
				if (isLocalId(sessionSpaceIdA)) {
					localCount++;
					expect(idDataA.sessionId).to.equal(this.compressors.get(originatingClient).localSessionId);
					expect(creator.length === 0 || creator[creator.length - 1][1] === idDataA.expectedOverride).to.be
						.true;
					creator.push([originatingClient, idDataA.expectedOverride]);
				}

				const uuidASessionSpace = compressorA.decompress(sessionSpaceIdA);
				if (idDataA.expectedOverride !== undefined) {
					expect(uuidASessionSpace).to.equal(idDataA.expectedOverride);
				} else {
					expect(uuidASessionSpace).to.equal(stableIdFromNumericUuid(idDataA.sessionNumericUuid, idIndex));
				}
				expect(compressorA.recompress(uuidASessionSpace)).to.equal(sessionSpaceIdA);
				uuids.add(uuidASessionSpace);
				const opSpaceIdA = compressorA.normalizeToOpSpace(sessionSpaceIdA);
				if (isLocalId(opSpaceIdA)) {
					expect.fail('IDs should have been finalized.');
				}
				// TODO: This cast can be removed on typescript 4.6
				finalIds.add(opSpaceIdA as FinalCompressedId);
				const uuidAOpSpace = compressorA.decompress(opSpaceIdA);

				expect(uuidASessionSpace).to.equal(uuidAOpSpace);

				if (next !== undefined) {
					const [compressorB, idDataB] = next;
					const sessionSpaceIdB = idDataB.id;

					const uuidBSessionSpace = compressorB.decompress(sessionSpaceIdB);
					expect(uuidASessionSpace).to.equal(uuidBSessionSpace);
					const opSpaceIdB = compressorB.normalizeToOpSpace(sessionSpaceIdB);
					if (opSpaceIdA !== opSpaceIdB) {
						compressorB.normalizeToOpSpace(sessionSpaceIdB);
						compressorA.normalizeToOpSpace(sessionSpaceIdA);
					}
					expect(opSpaceIdA).to.equal(opSpaceIdB);
					if (isLocalId(opSpaceIdB)) {
						fail('IDs should have been finalized.');
					}
					const uuidBOpSpace = compressorB.decompress(opSpaceIdB);
					expect(uuidAOpSpace).to.equal(uuidBOpSpace);
				}

				rowCount += 1;
			}

			// A local count > 1 indicates that this ID was unified, as more than one client has a local ID for it
			// in their session space.
			if (rowCount === this.sequencedIdLogs.size && localCount <= 1) {
				expect(localCount).to.equal(1);
				for (const [[compressor, { id, originatingClient }]] of getLogIndices(i)) {
					expect(compressor.attributeId(id)).to.equal(originatingClient);
				}
			}

			expect(uuids.size).to.equal(finalIds.size);
			assert(originatingClient !== undefined);
			idIndicesAggregator.set(
				originatingClient,
				assertNotUndefined(idIndicesAggregator.get(originatingClient)) + 1
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
	withSession: true
): [SerializedIdCompressorWithOngoingSession, IdCompressor];

/**
 * Roundtrips the supplied compressor through serialization and deserialization.
 */
export function roundtrip(
	compressor: ReadonlyIdCompressor,
	withSession: false
): [SerializedIdCompressorWithNoSession, IdCompressor];

export function roundtrip(
	compressor: ReadonlyIdCompressor,
	withSession: boolean
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
	compressor: ReadonlyIdCompressor
): [SerializedIdCompressorWithNoSession, SerializedIdCompressorWithOngoingSession] {
	function expectSerializes(
		withSession: boolean
	): SerializedIdCompressorWithOngoingSession | SerializedIdCompressorWithNoSession {
		let serialized: SerializedIdCompressorWithOngoingSession | SerializedIdCompressorWithNoSession;
		let deserialized: IdCompressor;
		if (withSession) {
			[serialized, deserialized] = roundtrip(compressor, true);
		} else {
			[serialized, deserialized] = roundtrip(compressor, false);
		}
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

		expect(compressor.equals(deserialized, withSession)).to.be.true;
		return serialized;
	}

	return [
		expectSerializes(false) as SerializedIdCompressorWithNoSession,
		expectSerializes(true) as SerializedIdCompressorWithOngoingSession,
	];
}

/**
 * Merges 'from' into 'to', and returns 'to'.
 */
export function mergeArrayMaps<K, V>(
	to: Pick<Map<K, V[]>, 'get' | 'set'>,
	from: ReadonlyMap<K, V[]>
): Pick<Map<K, V[]>, 'get' | 'set'> {
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
	type: 'allocateIds';
	client: Client;
	numIds: number;
	overrides: { [index: number]: string };
}

interface DeliverOperations {
	type: 'deliverOperations';
	client: DestinationClient;
}

interface ChangeCapacity {
	type: 'changeCapacity';
	newSize: number;
}

interface GenerateUnifyingIds {
	type: 'generateUnifyingIds';
	clientA: Client;
	clientB: Client;
	uuid: string;
}

// Represents intent to go offline then resume.
interface Reconnect {
	type: 'reconnect';
	client: Client;
}

interface Validate {
	type: 'validate';
}

type Operation = AllocateIds | DeliverOperations | ChangeCapacity | GenerateUnifyingIds | Reconnect | Validate;

interface FuzzTestState extends BaseFuzzTestState {
	network: IdCompressorTestNetwork;
	activeClients: Client[];
	selectableClients: Client[];
	clusterSize: number;
}

export interface OperationGenerationConfig {
	/** whether or not the fuzz actions will generate override UUIDs */
	includeOverrides: boolean;
	/** maximum cluster size of the network. Default: 25 */
	maxClusterSize?: number;
	/** Number of ops between validation ops. Default: 200 */
	validateInterval?: number;
}

const defaultOptions = {
	includeOverrides: false,
	maxClusterSize: 25,
	validateInterval: 200,
};

export function makeOpGenerator(options: OperationGenerationConfig): Generator<Operation, FuzzTestState> {
	const { includeOverrides, maxClusterSize, validateInterval } = { ...defaultOptions, ...options };

	function allocateIdsGenerator({ activeClients, clusterSize, random }: FuzzTestState): AllocateIds {
		const client = random.pick(activeClients);
		const maxIdsPerUsage = clusterSize * 2;
		const numIds = Math.floor(random.real(0, 1) ** 2 * maxIdsPerUsage) + 1;
		const overrides: AllocateIds['overrides'] = {};
		if (includeOverrides && random.bool(1 / 4)) {
			for (let j = 0; j < numIds; j++) {
				if (random.bool(1 / 3)) {
					overrides[j] = random.uuid4();
				}
			}
		}
		return {
			type: 'allocateIds',
			client,
			numIds,
			overrides,
		};
	}

	function changeCapacityGenerator({ random }: FuzzTestState): ChangeCapacity {
		return {
			type: 'changeCapacity',
			newSize: Math.min(Math.floor(random.real(0, 1) ** 2 * maxClusterSize) + 1, maxClusterSize),
		};
	}

	function deliverOperationsGenerator({ random, selectableClients }: FuzzTestState): DeliverOperations {
		return {
			type: 'deliverOperations',
			client: random.pick([...selectableClients, MetaClient.All]),
		};
	}

	function generateUnifyingIdsGenerator({ activeClients, random }: FuzzTestState): GenerateUnifyingIds {
		const clientA = random.pick(activeClients);
		const clientB = random.pick(activeClients.filter((c) => c !== clientA));
		return { type: 'generateUnifyingIds', clientA, clientB, uuid: random.uuid4() };
	}

	function reconnectGenerator({ activeClients, random }: FuzzTestState): Reconnect {
		return { type: 'reconnect', client: random.pick(activeClients) };
	}

	return interleave(
		createWeightedGenerator<Operation, FuzzTestState>([
			[changeCapacityGenerator, 1],
			[allocateIdsGenerator, 8],
			[deliverOperationsGenerator, 4],
			[generateUnifyingIdsGenerator, 1],
			[reconnectGenerator, 1],
		]),
		take(1, repeat<Operation, FuzzTestState>({ type: 'validate' })),
		validateInterval
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
	saveInfo?: SaveInfo
): void {
	const random = makeRandom(seed);
	const selectableClients: Client[] = network.getTargetCompressors(MetaClient.All).map(([client]) => client);

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
			allocateIds: (state, { client, numIds, overrides }) => {
				network.allocateAndSendIds(client, numIds, overrides);
				return state;
			},
			changeCapacity: (state, op) => {
				network.enqueueCapacityChange(op.newSize);
				return { ...state, clusterSize: op.newSize };
			},
			deliverOperations: (state, op) => {
				network.deliverOperations(op.client);
				return state;
			},
			generateUnifyingIds: (state, { clientA, clientB, uuid }) => {
				network.allocateAndSendIds(clientA, 1, { 0: uuid });
				network.allocateAndSendIds(clientB, 1, { 0: uuid });
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
		saveInfo
	);

	if (synchronizeAtEnd) {
		network.deliverOperations(DestinationClient.All);
		validator?.(network);
	}
}

/**
 * Converts the supplied integer to a uuid.
 */
export function integerToStableId(num: number | bigint): StableId {
	const bigintNum = BigInt(num);
	const upper = bigintNum >> BigInt(74);
	const middle = (bigintNum & (BigInt(0xfff) << BigInt(62))) >> BigInt(62);
	const lower = bigintNum & BigInt('0x3fffffffffffffff');
	const upperString = padToLength(upper.toString(16), '0', 12);
	const middleString = `4${padToLength(middle.toString(16), '0', 3)}`;
	const lowerString = padToLength((BigInt('0x8000000000000000') | BigInt(lower)).toString(16), '0', 16);
	const uuid = upperString + middleString + lowerString;
	return assertIsStableId(
		`${uuid.substr(0, 8)}-${uuid.substr(8, 4)}-${uuid.substr(12, 4)}-${uuid.substr(16, 4)}-${uuid.substr(20)}`
	);
}

/**
 * Pads the strings to a length of 32 with zeroes.
 */
export function padToUuidLength(str: string): string {
	return padToLength(str, '0', 32);
}

function padToLength(str: string, char: string, length: number): string {
	return char.repeat(length - str.length) + str;
}
