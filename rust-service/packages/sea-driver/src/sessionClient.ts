/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SeaDirectoryEntry,
	SeaEvent,
	SeaLoadResult,
	SeaSession,
	SeaSessionOptions,
	SeaSignalMember,
	SeaSignals,
	SeaSnapshotCoordination,
	SeaStream,
	SeaTreeId,
	SeaBlobTreeHint,
	SeaBlobTreeItem,
} from "@fluidframework/sea-typescript/internal";

import { MessageType } from "@fluidframework/driver-definitions/internal";

import { hexToBytes } from "./lifecycleHelpers.js";
import type {
	BlobUpload,
	ProjectedOperation,
	ProjectedOperationSubscription,
	ProjectedReadPage,
	SeaDriverClient,
	SummaryEntry,
	SummaryPublication,
} from "./wasmClient.js";

/** Opens a concrete neutral session, retaining service ownership and bundle configuration in the closure.
 * @internal
 */
export type SeaSessionFactory = (
	document: Uint8Array | undefined,
	options: SeaSessionOptions,
) => Promise<SeaSession>;

/** Application-owned choice of snapshot election policy.
 * @internal
 */
export type SeaSnapshotParticipation = "readOnly" | "seaSelected" | "clientSelected";

/** Bounded decoded-content retention and opt-in direct-load prefetch.
 * @internal
 */
export interface SeaSessionDriverOptions {
	/** Sent identically to the opening handshake and its direct load. Defaults to lazy loading. */
	readonly loadingHint?: SeaBlobTreeHint;
	/** Maximum retained decoded bytes, including directory names and identities. Defaults to 16 MiB. */
	readonly contentCacheBytes?: number;
	/** Maximum retained content objects. Defaults to 1024. */
	readonly contentCacheObjects?: number;
}

/** One directory being assembled from a flattened Fluid summary. */
interface DirectoryNode {
	/** Named nested directories and immutable blob identities. */
	readonly children: Map<string, DirectoryNode | SeaTreeId>;
}

/** Projection state at one published snapshot, independent of later stream delivery. */
interface ProjectionCheckpoint {
	readonly version: 1;
	readonly atEvent: string;
	readonly positions: readonly (readonly [string, string])[];
	readonly members: readonly (readonly [string, string, "read" | "write"])[];
}

const projectionBlobName = ".sea-fluid-projection";
const directoryReadConcurrency = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Projects neutral SEA sessions into the Fluid driver contract without owning a WASM loader.
 * @internal
 */
export class SeaSessionDriverClient implements SeaDriverClient {
	/** Reports current publication eligibility without transferring the nomination fence. */
	public get canPublishSnapshot(): boolean {
		return (
			this.session !== undefined &&
			this.snapshotFailure === undefined &&
			(this.participation === "clientSelected" ||
				(this.participation === "seaSelected" && this.snapshotFence !== undefined))
		);
	}
	/** Identity assigned to the currently open membership. */
	public get sessionId(): Uint8Array | undefined {
		return this.sessionIdentity?.slice();
	}
	/** Membership records already occupy the projected history, without synthetic joins. */
	public readonly applicationSequenceOffset = 0;
	/** Announced modes are retained to distinguish read-only audience from writer quorum. */
	private readonly membershipModes = new Map<string, "read" | "write">();
	private readonly membershipPositions = new Map<string, { joined: bigint; left?: bigint }>();
	private readonly minimumReferences = new Map<bigint, bigint | undefined>();
	private projectionCursor: bigint | undefined;
	private projectionBase: ProjectionCheckpoint | undefined;
	private projectionDocument: string | undefined;
	private direct = false;
	/** Mapping from opaque SEA positions to Fluid sequence numbers. */
	private readonly positionSequences = new Map<bigint, bigint>();
	/** Reverse mapping used by Fluid reference sequence numbers. */
	private readonly sequencePositions = new Map<bigint, bigint>();
	/** Next non-initialization Fluid sequence number. */
	private nextSequence = 1n;
	/** Current document membership, independent of the factory's shared service. */
	private session: SeaSession | undefined;
	/** Session identity used to ignore cleanup from superseded delta connections. */
	private sessionIdentity: Uint8Array | undefined;
	/** Document retained for lazy storage access after delta membership ends. */
	private archiveDocument: Uint8Array | undefined;
	/** Unannounced archive session, never used to resume delta author authority. */
	private archiveSession: Promise<SeaSession> | undefined;
	/** Pending close retained so reopening never races prior membership disposal. */
	private closing: Promise<void> = Promise.resolve();
	/** Membership replacement blocks new archive reads until its setup finishes. */
	private transition: Promise<unknown> | undefined;
	/** Admitted finite reads and blob uploads must settle before membership replacement or close. */
	private readonly archiveOperations = new Set<Promise<unknown>>();
	/** Event subscription retained until transferred to the driver. */
	private eventStream: SeaStream<SeaLoadResult> | undefined;
	/** Resume position captured when the event stream is opened. */
	private eventResumeAfter: bigint | undefined;
	private openingReference: bigint | undefined;
	private openingLoad: ReturnType<SeaDriverClient["latestSnapshot"]> | undefined;
	private contentStream: SeaStream<SeaBlobTreeItem> | undefined;
	private contentTask: Promise<void> | undefined;
	private contentFailure: { readonly error: unknown } | undefined;
	private readonly contentObservers = new Set<(error: unknown) => void>();
	private readonly contentCache = new Map<string, { item: SeaBlobTreeItem; size: number }>();
	private contentBytes = 0;
	private contentGeneration = 0;
	private readonly cacheBytes: number;
	private readonly cacheObjects: number;
	private readonly loadingHint: SeaBlobTreeHint;
	private readonly subscriptions = new Set<SeaStream<SeaLoadResult>>();
	private pendingEventItem: SeaLoadResult | undefined;
	private announcedPosition: bigint | undefined;
	/** Snapshot registration owning this session's publication authority. */
	private snapshotStream: SeaStream<SeaSnapshotCoordination> | undefined;
	/** Latest observed SEA-selected nomination fence. */
	private snapshotFence: bigint | undefined;
	/** Coordination failures prevent publication with stale authority. */
	private snapshotFailure: unknown;
	/** Uploaded proposals are private to this author until their summary op commits. */
	private readonly stagedSnapshots = new Map<
		string,
		{ expectedParent: Uint8Array | undefined; atEvent: Uint8Array; root: Uint8Array }
	>();

	/** Uses a caller-owned factory for every create, open, and reconnect. */
	public constructor(
		private readonly factory: SeaSessionFactory,
		private readonly participation: SeaSnapshotParticipation,
		options: SeaSessionDriverOptions = {},
	) {
		this.loadingHint = { ...options.loadingHint };
		this.cacheBytes = options.contentCacheBytes ?? 16 * 1024 * 1024;
		this.cacheObjects = options.contentCacheObjects ?? 1024;
		for (const limit of [this.cacheBytes, this.cacheObjects]) {
			if (!Number.isSafeInteger(limit) || limit < 0)
				throw new Error("content cache limits must be nonnegative safe integers");
		}
	}

	/** Requires live membership for all archive and author operations. */
	private current(): SeaSession {
		if (this.session === undefined) {
			throw new Error("SEA session is not open");
		}
		return this.session;
	}

	/** Serializes membership changes and drains archive operations admitted before replacement. */
	private replace<Result>(operation: () => Promise<Result>): Promise<Result> {
		const previous = this.transition ?? Promise.resolve();
		const replacement = previous
			.catch(() => {})
			.then(async () => {
				await Promise.allSettled([...this.archiveOperations]);
				return operation();
			});
		this.transition = replacement;
		const settled = (): void => {
			if (this.transition === replacement) this.transition = undefined;
		};
		void replacement.then(settled, settled);
		return replacement;
	}

	/** Pins finite reads and blob uploads to a session without serializing independent operations. */
	private async withArchiveSession<Result>(
		operation: (session: SeaSession) => Promise<Result>,
	): Promise<Result> {
		while (this.transition !== undefined) await this.transition;
		if (this.session === undefined && this.archiveDocument !== undefined) {
			const document = this.archiveDocument;
			this.archiveSession ??= this.closing.then(() => this.openArchiveSession(document));
		}
		const session = this.session ?? this.archiveSession ?? this.current();
		const result = Promise.resolve(session).then(operation);
		this.archiveOperations.add(result);
		try {
			return await result;
		} finally {
			this.archiveOperations.delete(result);
		}
	}

	/** Opens content access without announcing a new Fluid delta membership. */
	private async openArchiveSession(document: Uint8Array): Promise<SeaSession> {
		const session = await this.factory(document, {});
		let stream: SeaStream<SeaLoadResult> | undefined;
		try {
			stream = session.read(this.projectionCursor);
			await stream.next();
			return session;
		} catch (error) {
			await session.close();
			throw error;
		} finally {
			stream?.cancel();
		}
	}

	/** Creates backend-assigned document storage after admitted archive reads finish. */
	public create(): Promise<Uint8Array> {
		return this.replace(() => this.createSession());
	}

	/** Allocates document storage within the exclusive membership transition. */
	private async createSession(): Promise<Uint8Array> {
		this.disconnect();
		await this.closing;
		this.session = await this.factory(undefined, {});
		return this.session.document;
	}

	/** Opens fresh membership and restores the projection before reading the snapshot suffix. */
	public openSession(
		document: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		return this.replace(() => this.replaceSession(document, session, resumeAfter));
	}

	/** Opens native-position delivery without reading or projecting the archive. */
	public openDirectSession(
		document: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		return this.replace(() => this.replaceSession(document, session, resumeAfter, true));
	}

	/** Establishes delivery and snapshot coordination inside an exclusive membership transition. */
	private async replaceSession(
		document: Uint8Array,
		_session: Uint8Array,
		resumeAfter?: Uint8Array,
		direct = false,
	): Promise<void> {
		this.disconnect();
		await this.closing;
		const reference = decodePosition(resumeAfter);
		this.session = await this.factory(document, {
			...(reference === undefined ? {} : { reference }),
			...(direct ? { loadingHint: this.loadingHint } : {}),
		});
		this.sessionIdentity = this.session.sessionId.slice();
		try {
			if (this.projectionDocument !== bytesKey(document) || this.direct !== direct) {
				this.projectionBase = undefined;
				this.projectionDocument = bytesKey(document);
			}
			this.direct = direct;
			this.openingReference = reference;
			this.positionSequences.clear();
			this.sequencePositions.clear();
			this.membershipModes.clear();
			this.membershipPositions.clear();
			this.minimumReferences.clear();
			this.projectionCursor = undefined;
			this.nextSequence = 1n;
			if (!direct) {
				if (this.projectionBase === undefined) {
					const snapshot = await this.current().getSnapshot(reference);
					if (snapshot !== undefined) {
						const entries = await this.current().getDirectory(snapshot.root);
						const metadata = entries.find((entry) => entry.name === projectionBlobName);
						if (metadata?.child.kind !== "blob")
							throw new Error("SEA snapshot is missing Fluid projection metadata");
						this.projectionBase = parseCheckpoint(
							await this.current().getBlob(metadata.child),
							snapshot.atEvent,
						);
					}
				}
				if (this.projectionBase !== undefined) {
					for (const [position, sequence] of this.projectionBase.positions) {
						this.positionSequences.set(BigInt(position), BigInt(sequence));
						this.sequencePositions.set(BigInt(sequence), BigInt(position));
						this.nextSequence = BigInt(sequence) + 1n;
					}
					for (const [id, joined, mode] of this.projectionBase.members) {
						this.membershipModes.set(id, mode);
						this.membershipPositions.set(id, { joined: BigInt(joined) });
					}
					this.projectionCursor = BigInt(this.projectionBase.atEvent);
				}
				await this.readProjectedFrom(this.current());
				const start = this.readStart(reference);
				this.eventStream = this.current().read(start);
				this.eventResumeAfter = start;
			}
			const stream = await this.current().coordinateSnapshots(this.participation);
			this.snapshotStream = stream;
			const state = await stream.next();
			if (state === undefined) {
				throw new Error("SEA snapshot registration ended");
			}
			this.snapshotFence = state.fence;
			this.snapshotFailure = undefined;
			void this.watchSnapshots(stream).catch((error: unknown) => {
				if (this.snapshotStream === stream) {
					this.snapshotFailure = error;
				}
			});
		} catch (error) {
			this.disconnect();
			await this.closing;
			throw error;
		}
	}

	/** Continuously observes nomination changes without blocking publication on a notification read. */
	private async watchSnapshots(stream: SeaStream<SeaSnapshotCoordination>): Promise<void> {
		while (this.snapshotStream === stream) {
			const state = await stream.next();
			if (this.snapshotStream !== stream) {
				return;
			}
			if (state === undefined) {
				throw new Error("SEA snapshot registration ended");
			}
			this.snapshotFence = state.fence;
		}
	}

	/** Announces Fluid metadata while keeping its interpretation above the neutral session API. */
	public async announceMembership(metadata: Uint8Array): Promise<void> {
		this.announcedPosition = await this.current().announceMembership(metadata);
	}

	/** Uses the snapshot and event stream already selected by the opening handshake. */
	public loadDirectSnapshot(): ReturnType<SeaDriverClient["latestSnapshot"]> {
		return this.withArchiveSession((session) => this.prepareOpeningLoad(session));
	}

	private prepareOpeningLoad(
		session: SeaSession,
	): ReturnType<SeaDriverClient["latestSnapshot"]> {
		if (!this.direct || session !== this.session)
			throw new Error("opening snapshot requires a live direct session");
		this.openingLoad ??= (async () => {
			const loaded = await session.load(this.openingReference, this.loadingHint);
			if (session !== this.session) {
				loaded.events.cancel();
				loaded.content.cancel();
				throw new Error("SEA opening load was cancelled");
			}
			const stream = loaded.events;
			this.startContent(loaded.content);
			this.eventStream = stream;
			const first = await this.observeContent(stream.next());
			if (first === undefined)
				throw new Error("SEA opening load ended before its initial state");
			const snapshot = first.kind === "snapshot" ? first : undefined;
			this.pendingEventItem = snapshot === undefined ? first : undefined;
			this.eventResumeAfter = this.openingReference ?? snapshot?.atEvent;
			return snapshot === undefined
				? undefined
				: {
						id: encodePosition(snapshot.atEvent),
						root: snapshot.root.bytes,
						atEvent: encodePosition(snapshot.atEvent),
					};
		})();
		return this.openingLoad;
	}

	/** Drains prefetch independently of event delivery; errors remain observable after startup. */
	private startContent(stream: SeaStream<SeaBlobTreeItem>): void {
		this.contentStream = stream;
		this.contentTask = (async () => {
			try {
				for (;;) {
					const item = await stream.next();
					if (this.contentStream !== stream || item === undefined) return;
					this.cacheContent(item);
				}
			} catch (error) {
				if (this.contentStream === stream) {
					this.contentFailure = { error };
					for (const observer of this.contentObservers) observer(error);
					this.contentObservers.clear();
					throw error;
				}
			} finally {
				stream.cancel();
				if (this.contentStream === stream) {
					this.contentStream = undefined;
					this.contentObservers.clear();
				}
			}
		})();
		void this.contentTask.catch(() => {});
	}

	private observeContent<Result>(result: Promise<Result>): Promise<Result> {
		if (this.contentFailure !== undefined) {
			void result.catch(() => {});
			return Promise.reject(this.contentFailure.error);
		}
		if (this.contentStream === undefined) return result;
		return new Promise<Result>((resolve, reject) => {
			const failed = (error: unknown): void => {
				this.contentObservers.delete(failed);
				reject(error);
			};
			this.contentObservers.add(failed);
			void result.then((value) => {
				this.contentObservers.delete(failed);
				resolve(value);
			}, failed);
		});
	}

	private checkContentFailure(): void {
		if (this.contentFailure !== undefined) throw this.contentFailure.error;
	}

	/** Bounds both retained bytes and objects without assuming unique stream items or coverage. */
	private cacheContent(item: SeaBlobTreeItem): void {
		const key = contentKey(item.id);
		const previous = this.contentCache.get(key);
		if (previous !== undefined) {
			this.contentBytes -= previous.size;
			this.contentCache.delete(key);
		}
		const size =
			item.id.bytes.length +
			(item.kind === "blob"
				? item.bytes.length
				: item.entries.reduce(
						(total, entry) =>
							total + encoder.encode(entry.name).length + entry.child.bytes.length,
						0,
					));
		if (size > this.cacheBytes || this.cacheObjects === 0) return;
		while (
			this.contentBytes + size > this.cacheBytes ||
			this.contentCache.size >= this.cacheObjects
		) {
			const oldest = this.contentCache.entries().next().value;
			if (oldest === undefined) break;
			this.contentCache.delete(oldest[0]);
			this.contentBytes -= oldest[1].size;
		}
		this.contentCache.set(key, { item: copyContent(item), size });
		this.contentBytes += size;
	}

	/** Missing or evicted descendants always fall back to an explicit root request. */
	private async readContent(session: SeaSession, id: SeaTreeId): Promise<SeaBlobTreeItem> {
		const generation = this.contentGeneration;
		this.checkContentFailure();
		let cached = this.contentCache.get(contentKey(id));
		if (cached === undefined && this.contentTask !== undefined) {
			await this.contentTask;
			cached = this.contentCache.get(contentKey(id));
		}
		this.checkContentFailure();
		if (cached !== undefined) return copyContent(cached.item);
		const stream = session.getBlobTrees([id]);
		try {
			const item = await this.observeContent(stream.next());
			if (
				item === undefined ||
				item.kind !== id.kind ||
				contentKey(item.id) !== contentKey(id)
			)
				throw new Error("SEA content response omitted its requested root");
			if (generation === this.contentGeneration) this.cacheContent(item);
			return copyContent(item);
		} finally {
			stream.cancel();
		}
	}

	private async readDirectory(
		session: SeaSession,
		id: SeaTreeId,
	): Promise<readonly SeaDirectoryEntry[]> {
		const item = await this.readContent(session, id);
		if (item.kind !== "directory") throw new Error("SEA content is not a directory");
		return item.entries;
	}

	/** Opens the neutral relay without adding signal traffic to event history. */
	public openSignals(member: SeaSignalMember): Promise<SeaSignals> {
		return this.current().openSignals(member);
	}

	/** Submits serialized Fluid data as a new event.
	 * Published summary proposals receive a separate durable adapter-owned acknowledgment.
	 * An interrupted acknowledgment is never retried implicitly.
	 */
	public async submitEvent(
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Promise<Uint8Array> {
		const session = this.current();
		try {
			if (this.direct)
				return encodePosition(
					await session.submit(decodePosition(referencePosition), payload),
				);
			const message = JSON.parse(decoder.decode(payload)) as {
				type?: string;
				contents?: string | { handle?: string };
			};
			const isSummary = message.type === MessageType.Summarize;
			const proposal =
				isSummary && typeof message.contents === "string"
					? (JSON.parse(message.contents) as { handle?: string })
					: message.contents;
			const handle = typeof proposal === "object" ? proposal?.handle : undefined;
			const staged = typeof handle === "string" ? this.stagedSnapshots.get(handle) : undefined;
			if (isSummary) {
				if (typeof handle !== "string")
					throw new Error("summary proposal requires a snapshot handle");
				const position = staged === undefined ? decodePosition(hexToBytes(handle)) : undefined;
				if (
					staged === undefined &&
					(await session.getSnapshot(position))?.atEvent !== position
				) {
					throw new Error("summary proposal must reference a published snapshot");
				}
			}
			const position = await session.submit(decodePosition(referencePosition), payload);
			if (isSummary) {
				if (this.session !== session) {
					throw new Error("summary publication requires its original session");
				}
				const acknowledgedHandle =
					staged === undefined
						? handle
						: bytesKey(
								await this.publishSnapshotRoot(
									staged.expectedParent,
									staged.atEvent,
									staged.root,
								),
							);
				if (handle !== undefined) this.stagedSnapshots.delete(handle);
				await this.readProjectedFrom(
					session,
					this.projectionCursor === undefined
						? undefined
						: encodePosition(this.projectionCursor),
				);
				const proposalSequence = Number(this.sequence(position));
				await session.submit(
					position,
					encoder.encode(
						JSON.stringify({
							seaFluid: "summaryAck",
							type: MessageType.SummaryAck,
							clientSequenceNumber: -1,
							referenceSequenceNumber: proposalSequence,
							contents: {
								handle: acknowledgedHandle,
								summaryProposal: { summarySequenceNumber: proposalSequence },
							},
						}),
					),
				);
			}
			return encodePosition(position);
		} catch (error) {
			await session.close().catch(() => {});
			throw error;
		}
	}

	/** Returns the latest SEA snapshot in the driver's byte-position representation. */
	public async latestSnapshot(): ReturnType<SeaDriverClient["latestSnapshot"]> {
		const snapshot = await this.withArchiveSession((session) => session.getSnapshot());
		return snapshot === undefined
			? undefined
			: {
					id: encodePosition(snapshot.atEvent),
					root: snapshot.root.bytes,
					atEvent: encodePosition(snapshot.atEvent),
				};
	}

	/** Looks up an exact snapshot rather than accepting an earlier bounded selection. */
	public async snapshot(id: Uint8Array): ReturnType<SeaDriverClient["snapshot"]> {
		const position = decodePosition(id);
		const snapshot = await this.withArchiveSession((session) => session.getSnapshot(position));
		return snapshot === undefined || snapshot.atEvent !== position
			? undefined
			: {
					id: encodePosition(snapshot.atEvent),
					root: snapshot.root.bytes,
					atEvent: encodePosition(snapshot.atEvent),
				};
	}

	/** Retains an upload without advancing the latest snapshot before a matching proposal. */
	public async stageSnapshotRoot(
		expectedParent: Uint8Array | undefined,
		atEvent: Uint8Array | undefined,
		root: Uint8Array,
	): Promise<Uint8Array> {
		this.current();
		if (atEvent === undefined)
			throw new Error("summary proposal requires a reference position");
		const handle = crypto.getRandomValues(new Uint8Array(16));
		this.stagedSnapshots.set(bytesKey(handle), {
			expectedParent: expectedParent?.slice(),
			atEvent: atEvent.slice(),
			root: root.slice(),
		});
		return handle;
	}

	/** Publishes a Fluid snapshot, reserving sequence zero for the document initialization event. */
	public async publishSnapshotRoot(
		expectedParent: Uint8Array | undefined,
		atEvent: Uint8Array | undefined,
		root: Uint8Array,
	): Promise<Uint8Array> {
		if (this.snapshotFailure !== undefined) {
			throw this.snapshotFailure;
		}
		if (this.direct) {
			const position = decodePosition(atEvent);
			if (position === undefined) throw new Error("direct snapshot requires a SEA position");
			const snapshot = await this.current().publishSnapshot(
				decodePosition(expectedParent),
				this.snapshotFence,
				position,
				{ kind: "directory", bytes: root },
			);
			return encodePosition(snapshot.atEvent);
		}
		let position = decodePosition(atEvent) ?? this.sequencePositions.get(0n);
		if (position === undefined) {
			if (expectedParent !== undefined || this.nextSequence !== 1n) {
				throw new Error("a snapshot must reference a known application position");
			}
			position = await this.current().submit(
				undefined,
				encoder.encode(JSON.stringify({ seaFluid: "initialize", version: 1 })),
				{ kind: "directory", bytes: root },
			);
			this.positionSequences.set(position, 0n);
			this.sequencePositions.set(0n, position);
		}
		const sequence = this.positionSequences.get(position);
		if (sequence === undefined) throw new Error("snapshot position is not projected");
		const floor = this.minimumReferences.get(position);
		const checkpoint: ProjectionCheckpoint = {
			version: 1,
			atEvent: position.toString(),
			positions: [...this.positionSequences]
				.filter(([at]) => at <= position && (floor === undefined || at >= floor))
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([at, seq]) => [at.toString(), seq.toString()]),
			members: [...this.membershipPositions]
				.filter(
					([, member]) =>
						member.joined <= position && (member.left === undefined || member.left > position),
				)
				.map(([id, member]) => [
					id,
					member.joined.toString(),
					this.membershipModes.get(id) ?? "write",
				]),
		};
		const session = this.current();
		const entries = await session.getDirectory({ kind: "directory", bytes: root });
		if (entries.some((entry) => entry.name === projectionBlobName))
			throw new Error("summary uses the reserved Fluid projection path");
		const metadata = await session.putBlob(encoder.encode(JSON.stringify(checkpoint)));
		const snapshotRoot = await session.putDirectory(
			[...entries, { name: projectionBlobName, child: metadata }].sort((a, b) =>
				a.name.localeCompare(b.name),
			),
		);
		const snapshot = await this.current().publishSnapshot(
			decodePosition(expectedParent),
			this.snapshotFence,
			position,
			snapshotRoot,
		);
		return encodePosition(snapshot.atEvent);
	}

	/** Reads until caught up while preserving the continuation position of initialization events. */
	public async readProjected(after?: Uint8Array): Promise<ProjectedReadPage> {
		return this.withArchiveSession((session) => this.readProjectedFrom(session, after));
	}

	/** Reads through one captured session, including during exclusive projection initialization. */
	private async readProjectedFrom(
		session: SeaSession,
		after?: Uint8Array,
	): Promise<ProjectedReadPage> {
		if (this.direct && session === this.session) await this.prepareOpeningLoad(session);
		const start = this.readStart(decodePosition(after));
		const openingStream =
			this.direct && session === this.session && start === this.eventResumeAfter
				? this.eventStream
				: undefined;
		const opening = openingStream !== undefined;
		const stream = openingStream ?? session.read(start);
		const operations: ProjectedOperation[] = [];
		let cursor = start === undefined ? undefined : encodePosition(start);
		let caughtUpThrough: bigint | undefined;
		try {
			for (;;) {
				const item =
					opening && this.pendingEventItem !== undefined
						? this.pendingEventItem
						: await this.observeContent(stream.next());
				if (opening) this.pendingEventItem = undefined;
				if (item?.kind === "progress" && item.status === "AwaitingNewItems") {
					const announced = opening ? (this.announcedPosition ?? -1n) : -1n;
					caughtUpThrough = item.latestKnown ?? -1n;
					if (announced > caughtUpThrough) caughtUpThrough = announced;
				}
				if (
					item?.kind === "event" &&
					!(opening && start !== undefined && item.position <= start)
				) {
					const operation = this.project(item);
					if (operation !== undefined) operations.push(operation);
					cursor = encodePosition(item.position);
				}
				// Progress can precede buffered events. Drain through its advertised cursor.
				if (
					item === undefined ||
					(caughtUpThrough !== undefined && (decodePosition(cursor) ?? -1n) >= caughtUpThrough)
				) {
					if (opening) this.eventResumeAfter = decodePosition(cursor);
					return cursor === undefined ? { operations } : { operations, cursor };
				}
			}
		} finally {
			if (!opening) stream.cancel();
		}
	}

	/** A snapshot replaces its prefix; explicit older cursors cannot be served by this projection. */
	private readStart(after: bigint | undefined): bigint | undefined {
		if (this.direct) return after;
		const base =
			this.projectionBase === undefined ? undefined : BigInt(this.projectionBase.atEvent);
		if (base !== undefined && after !== undefined && after < base)
			throw new Error("requested history precedes the loaded Fluid snapshot");
		return after ?? base;
	}

	/** Transfers the pre-opened stream once; later subscriptions open independent readers. */
	public async subscribeProjected(
		after?: Uint8Array,
	): Promise<ProjectedOperationSubscription> {
		const start = this.readStart(decodePosition(after));
		if (this.eventStream === undefined || start !== this.eventResumeAfter) {
			this.eventStream?.cancel();
			this.pendingEventItem = undefined;
			this.eventStream = this.current().read(start);
			this.eventResumeAfter = start;
		}
		const stream = this.eventStream;
		const content = this.contentStream;
		if (stream === undefined) throw new Error("SEA event stream is not open");
		this.eventStream = undefined;
		this.subscriptions.add(stream);
		let pending = this.pendingEventItem;
		this.pendingEventItem = undefined;
		return {
			next: async () => {
				for (;;) {
					const item = pending ?? (await this.observeContent(stream.next()));
					pending = undefined;
					if (item === undefined) throw new Error("SEA subscription ended");
					if (item.kind === "event") {
						const operation = this.project(item);
						if (operation !== undefined) return operation;
					}
				}
			},
			cancel: () => {
				this.subscriptions.delete(stream);
				stream.cancel();
				content?.cancel();
			},
		};
	}

	/** Uploads an immutable blob without claiming backend deduplication measurements. */
	public async uploadBlob(payload: Uint8Array): Promise<BlobUpload> {
		const id = await this.withArchiveSession((session) => session.putBlob(payload));
		return { digest: id.bytes, sizeBytes: BigInt(payload.length), deduplicated: false };
	}

	/** Fetches a blob through the configured session stack. */
	public fetchBlob(digest: Uint8Array): Promise<Uint8Array> {
		return this.withArchiveSession(async (session) => {
			const item = await this.readContent(session, { kind: "blob", bytes: digest });
			if (item.kind !== "blob") throw new Error("SEA content is not a blob");
			return item.bytes;
		});
	}

	/** Converts a flattened Fluid summary into immutable SEA directories. */
	public async publishSummary(entries: readonly SummaryEntry[]): Promise<SummaryPublication> {
		const root: DirectoryNode = { children: new Map() };
		for (const entry of entries)
			insert(root, decoder.decode(entry.path).split("/"), { kind: "blob", bytes: entry.blob });
		const tree = await this.publishDirectory(root);
		return {
			digest: tree.bytes,
			entryCount: entries.length,
			persistedBytes: 0n,
			deduplicated: false,
		};
	}

	/** Converts immutable SEA directories back to the driver's flattened summary representation. */
	public async fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]> {
		return this.withArchiveSession(async (session) => {
			const entries: SummaryEntry[] = [];
			await this.flattenDirectory(session, { kind: "directory", bytes: digest }, "", entries);
			return entries.filter((entry) => decoder.decode(entry.path) !== projectionBlobName);
		});
	}

	/** Closes membership after admitted work; owned delta disposal retains lazy archive access. */
	public disconnect(owner?: Uint8Array): void {
		if (
			owner !== undefined &&
			(this.sessionIdentity === undefined ||
				bytesKey(owner) !== bytesKey(this.sessionIdentity))
		) {
			return;
		}
		this.archiveDocument = owner === undefined ? undefined : this.session?.document.slice();
		this.stagedSnapshots.clear();
		const archiveSession = this.archiveSession;
		this.archiveSession = undefined;
		this.sessionIdentity = undefined;
		this.contentStream?.cancel();
		this.contentStream = undefined;
		this.contentTask = undefined;
		this.contentFailure = undefined;
		this.contentObservers.clear();
		this.contentCache.clear();
		this.contentBytes = 0;
		this.contentGeneration++;
		for (const stream of this.subscriptions) stream.cancel();
		this.subscriptions.clear();
		this.eventStream?.cancel();
		this.eventStream = undefined;
		this.eventResumeAfter = undefined;
		this.openingLoad = undefined;
		this.pendingEventItem = undefined;
		this.announcedPosition = undefined;
		const snapshots = this.snapshotStream;
		this.snapshotStream = undefined;
		snapshots?.cancel();
		this.snapshotFence = undefined;
		const session = this.session;
		this.session = undefined;
		if (session !== undefined || archiveSession !== undefined) {
			this.closing = Promise.allSettled([...this.archiveOperations]).then(async () => {
				await session?.close();
				await archiveSession?.then(
					(archive) => archive.close(),
					() => {},
				);
			});
			void this.closing.catch(() => {});
		}
	}

	/** Resolves a Fluid reference sequence without converting a SEA position through number. */
	public positionForSequence(sequenceNumber: number): Uint8Array | undefined {
		if (this.direct) throw new Error("direct sessions do not use Fluid sequence mappings");
		if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0)
			throw new RangeError(`invalid Fluid sequence number ${sequenceNumber}`);
		const position = this.sequencePositions.get(BigInt(sequenceNumber));
		return position === undefined ? undefined : encodePosition(position);
	}

	/** Waits for prior disposal; the subsequent open obtains a fresh session from the factory. */
	public async reconnect(..._args: readonly unknown[]): Promise<void> {
		const closing = this.closing;
		try {
			await closing;
		} finally {
			// Report a failed close once, but do not let its settled promise block every future open.
			if (this.closing === closing) this.closing = Promise.resolve();
		}
	}

	/** Projects initialization and the durable SEA floor into the same dense sequence space. */
	private project(item: SeaEvent): ProjectedOperation | undefined {
		if (this.direct) {
			return {
				eventType: item.eventType,
				position: encodePosition(item.position),
				sequenceNumber: item.position,
				minimumSequenceNumber: item.minimumReference ?? -1n,
				...(item.minimumReference === undefined
					? {}
					: { minimumReference: encodePosition(item.minimumReference) }),
				session: item.session,
				localSequenceNumber: 0n,
				...(item.reference === undefined ? {} : { reference: encodePosition(item.reference) }),
				payload: item.payload,
			};
		}
		if (this.projectionCursor === undefined || item.position > this.projectionCursor)
			this.projectionCursor = item.position;
		this.minimumReferences.set(item.position, item.minimumReference);
		const message = (
			item.eventType === "left" ? {} : JSON.parse(decoder.decode(item.payload))
		) as {
			clientSequenceNumber?: number;
			seaFluid?: string;
			version?: number;
			mode?: "read" | "write";
		};
		if (item.eventType === "application" && message.seaFluid === "initialize") {
			const previous = this.sequencePositions.get(0n);
			if (
				message.version !== 1 ||
				item.blobTree?.kind !== "directory" ||
				(previous !== undefined ? previous !== item.position : this.nextSequence !== 1n)
			)
				throw new Error("invalid Fluid initialization event");
			this.positionSequences.set(item.position, 0n);
			this.sequencePositions.set(0n, item.position);
			return undefined;
		}
		const membership = bytesKey(item.session);
		if (item.eventType === "joined") {
			this.membershipModes.set(membership, message.mode ?? "write");
			const previous = this.membershipPositions.get(membership);
			this.membershipPositions.set(membership, { ...previous, joined: item.position });
		}
		if (item.eventType === "left") {
			const member = this.membershipPositions.get(membership);
			if (member !== undefined) member.left = item.position;
		}
		const membershipMode = this.membershipModes.get(membership);
		const minimumSequenceNumber =
			item.minimumReference === undefined
				? 0n
				: this.positionSequences.get(item.minimumReference);
		if (minimumSequenceNumber === undefined) {
			throw new Error("SEA minimum reference is missing from the retained projection");
		}
		return {
			eventType:
				item.eventType === "application" && message.seaFluid === "summaryAck"
					? "summaryAck"
					: item.eventType,
			...(membershipMode === undefined ? {} : { membershipMode }),
			minimumSequenceNumber,
			position: encodePosition(item.position),
			sequenceNumber: this.sequence(item.position),
			...(item.minimumReference === undefined
				? {}
				: { minimumReference: encodePosition(item.minimumReference) }),
			session: item.session,
			localSequenceNumber: BigInt(message.clientSequenceNumber ?? 0),
			...(item.reference === undefined ? {} : { reference: encodePosition(item.reference) }),
			payload: item.payload,
		};
	}

	/** Allocates stable dense sequence numbers within the retained projection. */
	private sequence(position: bigint): bigint {
		const existing = this.positionSequences.get(position);
		if (existing !== undefined) return existing;
		const sequence = this.nextSequence++;
		this.positionSequences.set(position, sequence);
		this.sequencePositions.set(sequence, position);
		return sequence;
	}

	/** Publishes child directories before their parent. */
	private async publishDirectory(node: DirectoryNode): Promise<SeaTreeId> {
		const entries: SeaDirectoryEntry[] = [];
		for (const [name, child] of [...node.children].sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			entries.push({
				name,
				child: "children" in child ? await this.publishDirectory(child) : child,
			});
		}
		return this.current().putDirectory(entries);
	}

	/** Walks summary directories without interpreting blob contents. */
	private async flattenDirectory(
		session: SeaSession,
		directory: SeaTreeId,
		prefix: string,
		entries: SummaryEntry[],
	): Promise<void> {
		const pending = [{ directory, prefix }];
		while (pending.length > 0) {
			const batch = pending.splice(0, directoryReadConcurrency);
			const results = await Promise.allSettled(
				batch.map(async (item) => ({
					prefix: item.prefix,
					children: await this.readDirectory(session, item.directory),
				})),
			);
			for (const result of results) {
				if (result.status === "rejected") throw result.reason;
				for (const entry of result.value.children) {
					const path =
						result.value.prefix.length === 0
							? entry.name
							: `${result.value.prefix}/${entry.name}`;
					if (entry.child.kind === "directory")
						pending.push({ directory: entry.child, prefix: path });
					else entries.push({ path: encoder.encode(path), blob: entry.child.bytes });
				}
			}
		}
		entries.sort((left, right) =>
			decoder.decode(left.path).localeCompare(decoder.decode(right.path)),
		);
	}
}

/** Converts opaque identity bytes to a stable map key. */
function bytesKey(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Rejects incompatible or malformed state before exposing any restored projection. */
function parseCheckpoint(bytes: Uint8Array, atEvent: bigint): ProjectionCheckpoint {
	const value: unknown = JSON.parse(decoder.decode(bytes));
	if (
		typeof value !== "object" ||
		value === null ||
		!("version" in value) ||
		value.version !== 1 ||
		!("atEvent" in value) ||
		value.atEvent !== atEvent.toString() ||
		!("positions" in value) ||
		!Array.isArray(value.positions) ||
		!("members" in value) ||
		!Array.isArray(value.members)
	)
		throw new Error("Unsupported or invalid Fluid projection checkpoint");
	const positions: [string, string][] = [];
	let previousPosition = -1n;
	let previousSequence: bigint | undefined;
	for (const pair of value.positions) {
		if (
			!Array.isArray(pair) ||
			pair.length !== 2 ||
			!isUnsignedInteger(pair[0]) ||
			!isUnsignedInteger(pair[1])
		)
			throw new Error("Invalid Fluid projection position");
		const position = BigInt(pair[0]);
		const sequence = BigInt(pair[1]);
		if (
			position <= previousPosition ||
			position > atEvent ||
			(previousSequence !== undefined && sequence !== previousSequence + 1n)
		)
			throw new Error("Invalid Fluid projection ordering");
		positions.push([pair[0], pair[1]]);
		previousPosition = position;
		previousSequence = sequence;
	}
	if (previousPosition !== atEvent)
		throw new Error("Fluid projection checkpoint does not end at its snapshot");
	const members: [string, string, "read" | "write"][] = [];
	const identities = new Set<string>();
	for (const member of value.members) {
		if (
			!Array.isArray(member) ||
			member.length !== 3 ||
			typeof member[0] !== "string" ||
			!/^(?:[0-9a-f]{2})+$/u.test(member[0]) ||
			!isUnsignedInteger(member[1]) ||
			BigInt(member[1]) > atEvent ||
			(member[2] !== "read" && member[2] !== "write") ||
			identities.has(member[0])
		)
			throw new Error("Invalid Fluid projection membership");
		identities.add(member[0]);
		members.push([member[0], member[1], member[2]]);
	}
	return { version: 1, atEvent: atEvent.toString(), positions, members };
}

/** JSON stores exact unsigned integers as decimal strings. */
function isUnsignedInteger(value: unknown): value is string {
	return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

/** Inserts a summary path while rejecting ambiguous directory/blob collisions. */
function insert(directory: DirectoryNode, parts: readonly string[], leaf: SeaTreeId): void {
	const [name, ...rest] = parts;
	if (name === undefined || name.length === 0)
		throw new Error("summary path contains an empty segment");
	if (rest.length === 0) {
		directory.children.set(name, leaf);
		return;
	}
	const existing = directory.children.get(name);
	if (existing !== undefined && !("children" in existing))
		throw new Error("summary path collides with a blob");
	const child = existing ?? { children: new Map<string, DirectoryNode | SeaTreeId>() };
	directory.children.set(name, child);
	insert(child as DirectoryNode, rest, leaf);
}

/** Encodes a canonical SEA position without precision loss. */
function encodePosition(position: bigint): Uint8Array {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, position);
	return bytes;
}

/** Decodes a canonical SEA position, rejecting malformed driver tokens. */
function decodePosition(position?: Uint8Array): bigint | undefined {
	if (position === undefined) return undefined;
	if (position.length !== 8)
		throw new Error("SEA event position must contain exactly eight bytes");
	return new DataView(position.buffer, position.byteOffset, position.byteLength).getBigUint64(
		0,
	);
}

function contentKey(id: SeaTreeId): string {
	return `${id.kind}:${bytesKey(id.bytes)}`;
}

function copyContent(item: SeaBlobTreeItem): SeaBlobTreeItem {
	const id = { kind: item.id.kind, bytes: item.id.bytes.slice() };
	return item.kind === "blob"
		? { kind: "blob", id, bytes: item.bytes.slice() }
		: {
				kind: "directory",
				id,
				entries: item.entries.map((entry) => ({
					name: entry.name,
					child: { kind: entry.child.kind, bytes: entry.child.bytes.slice() },
				})),
			};
}
