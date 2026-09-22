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

/** One directory being assembled from a flattened Fluid summary. */
interface DirectoryNode {
	/** Named nested directories and immutable blob identities. */
	readonly children: Map<string, DirectoryNode | SeaTreeId>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Projects neutral SEA sessions into the Fluid driver contract without owning a WASM loader.
 * @internal
 */
export class SeaSessionDriverClient implements SeaDriverClient {
	/** Identity assigned to the currently open membership. */
	public get sessionId(): Uint8Array | undefined {
		return this.sessionIdentity?.slice();
	}
	/** Membership records already occupy the projected history, without synthetic joins. */
	public readonly applicationSequenceOffset = 0;
	/** Announced modes are retained to distinguish read-only audience from writer quorum. */
	private readonly membershipModes = new Map<string, "read" | "write">();
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
	) {}

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
			stream = session.read();
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

	/** Opens fresh membership and rebuilds the retained Fluid sequence projection. */
	public openSession(
		document: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		return this.replace(() => this.replaceSession(document, session, resumeAfter));
	}

	/** Rebuilds the projection inside an exclusive membership transition. */
	private async replaceSession(
		document: Uint8Array,
		_session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		this.disconnect();
		await this.closing;
		const reference = decodePosition(resumeAfter);
		this.session = await this.factory(document, {
			...(reference === undefined ? {} : { reference }),
		});
		this.sessionIdentity = this.session.sessionId.slice();
		try {
			this.positionSequences.clear();
			this.sequencePositions.clear();
			this.membershipModes.clear();
			this.nextSequence = 1n;
			await this.readProjectedFrom(this.current());
			this.eventStream = this.current().read(reference);
			this.eventResumeAfter = reference;
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
		await this.current().announceMembership(metadata);
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
				await this.readProjectedFrom(session);
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
		const snapshot = await this.current().publishSnapshot(
			decodePosition(expectedParent),
			this.snapshotFence,
			position,
			{ kind: "directory", bytes: root },
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
		const stream = session.read(decodePosition(after));
		const operations: ProjectedOperation[] = [];
		let cursor = after;
		try {
			for (;;) {
				const item = await stream.next();
				if (
					item === undefined ||
					(item.kind === "progress" && item.status === "AwaitingNewItems")
				) {
					return cursor === undefined ? { operations } : { operations, cursor };
				}
				if (item.kind === "event") {
					const operation = this.project(item);
					if (operation !== undefined) operations.push(operation);
					cursor = encodePosition(item.position);
				}
			}
		} finally {
			stream.cancel();
		}
	}

	/** Transfers the pre-opened stream once; later subscriptions open independent readers. */
	public async subscribeProjected(
		after?: Uint8Array,
	): Promise<ProjectedOperationSubscription> {
		if (this.eventStream === undefined || decodePosition(after) !== this.eventResumeAfter) {
			this.eventStream?.cancel();
			this.eventStream = this.current().read(decodePosition(after));
			this.eventResumeAfter = decodePosition(after);
		}
		const stream = this.eventStream;
		if (stream === undefined) throw new Error("SEA event stream is not open");
		this.eventStream = undefined;
		return {
			next: async () => {
				for (;;) {
					const item = await stream.next();
					if (item === undefined) throw new Error("SEA subscription ended");
					if (item.kind === "event") {
						const operation = this.project(item);
						if (operation !== undefined) return operation;
					}
				}
			},
			cancel: () => stream.cancel(),
		};
	}

	/** Uploads an immutable blob without claiming backend deduplication measurements. */
	public async uploadBlob(payload: Uint8Array): Promise<BlobUpload> {
		const id = await this.withArchiveSession((session) => session.putBlob(payload));
		return { digest: id.bytes, sizeBytes: BigInt(payload.length), deduplicated: false };
	}

	/** Fetches a blob through the configured session stack. */
	public fetchBlob(digest: Uint8Array): Promise<Uint8Array> {
		return this.withArchiveSession((session) =>
			session.getBlob({ kind: "blob", bytes: digest }),
		);
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
			return entries;
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
		this.eventStream?.cancel();
		this.eventStream = undefined;
		this.eventResumeAfter = undefined;
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
		if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0)
			throw new RangeError(`invalid Fluid sequence number ${sequenceNumber}`);
		const position = this.sequencePositions.get(BigInt(sequenceNumber));
		return position === undefined ? undefined : encodePosition(position);
	}

	/** Waits for prior disposal; the subsequent open obtains a fresh session from the factory. */
	public async reconnect(..._args: readonly unknown[]): Promise<void> {
		await this.closing;
	}

	/** Projects initialization and the durable SEA floor into the same dense sequence space. */
	private project(item: SeaEvent): ProjectedOperation | undefined {
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
		for (const entry of await session.getDirectory(directory)) {
			const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
			if (entry.child.kind === "directory")
				await this.flattenDirectory(session, entry.child, path, entries);
			else entries.push({ path: encoder.encode(path), blob: entry.child.bytes });
		}
	}
}

/** Converts opaque identity bytes to a stable map key. */
function bytesKey(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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
