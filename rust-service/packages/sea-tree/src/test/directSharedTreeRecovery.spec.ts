/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";

import {
	SeaSessionDriverClient,
	type ProjectedOperationSubscription,
	type SeaSessionFactory,
} from "@fluidframework/sea-driver/internal";
import {
	createMemoryService,
	type SeaLoadResult,
	type SeaStream,
} from "@fluidframework/sea-typescript/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

import { DirectSharedTreeClient, type DirectSharedTreeClientOptions } from "../index.js";

const sf = new SchemaFactory("direct-recovery-test");
/** Ordered edits make dropped or duplicated resubmissions observable. */
class Items extends sf.array("Items", sf.string) {}
/** Shared fixture schema for snapshot and reconnect tests. */
class State extends sf.object("State", { items: Items }) {}
const configuration = new TreeViewConfiguration({ schema: State });

/** Injects both definite rejection and acknowledgment loss around a real append. */
class FaultClient extends SeaSessionDriverClient {
	/** Failure point for the next submission. */
	public failNext: "before" | "after" | undefined;
	public cancellation: Promise<void> | undefined;
	/** Releases held subscription delivery after transport is cancelled. */
	private release: (() => void) | undefined;
	/** Blocks delivery independently of service acceptance. */
	private delivery: Promise<void> = Promise.resolve();

	/** Uses the real memory service and SEA-selected publication authority. */
	public constructor(open: SeaSessionFactory) {
		super(open, "seaSelected");
	}

	/** Prevents an accepted operation's acknowledgment reaching the kernel. */
	public holdDelivery(): void {
		this.delivery = new Promise((resolve) => {
			this.release = resolve;
		});
	}

	/** Wraps service reads without changing their canonical contents. */
	public override async subscribeProjected(
		after?: Uint8Array,
	): Promise<ProjectedOperationSubscription> {
		const subscription = await super.subscribeProjected(after);
		return {
			next: async () => {
				const operation = await subscription.next();
				await this.delivery;
				return operation;
			},
			cancel: () => {
				const result = subscription.cancel();
				return this.cancellation ?? result;
			},
		};
	}

	/** Fails once before append or after commit, exercising both recovery outcomes. */
	public override async submitEvent(
		payload: Uint8Array,
		reference?: Uint8Array,
	): Promise<Uint8Array> {
		const failure = this.failNext;
		this.failNext = undefined;
		if (failure === "before") throw new Error("Injected pre-append connection loss");
		const position = await super.submitEvent(payload, reference);
		if (failure === "after") throw new Error("Injected lost acknowledgment");
		return position;
	}

	/** Releases stale deliveries so host disposal cannot strand a receive loop. */
	public override disconnect(owner?: Uint8Array): void {
		this.release?.();
		this.release = undefined;
		super.disconnect(owner);
	}
}

/** Waits for an observable condition with a bounded failure deadline. */
async function until(condition: () => boolean, message: string): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (!condition()) {
		assert.ok(Date.now() < deadline, message);
		await delay(5);
	}
}

/** Exposes the same archive with sparse positions, including zero and large exact integers. */
function remapPositions(
	open: SeaSessionFactory,
	offset: bigint,
	stride = 1n,
): SeaSessionFactory {
	const toPosition = (value: bigint): bigint => offset + (value - 1n) * stride;
	const fromPosition = (value: bigint): bigint => (value - offset) / stride + 1n;
	const fromOptionalPosition = (value: bigint | undefined): bigint | undefined =>
		value === undefined ? undefined : fromPosition(value);
	const mapStream = (stream: SeaStream<SeaLoadResult>): SeaStream<SeaLoadResult> => ({
		cancel: () => stream.cancel(),
		next: async () => {
			const item = await stream.next();
			if (item === undefined) return undefined;
			if (item.kind === "snapshot") return { ...item, atEvent: toPosition(item.atEvent) };
			if (item.kind === "progress")
				return {
					...item,
					...(item.previous === undefined ? {} : { previous: toPosition(item.previous) }),
					...(item.latestKnown === undefined
						? {}
						: { latestKnown: toPosition(item.latestKnown) }),
				};
			return {
				...item,
				position: toPosition(item.position),
				...(item.reference === undefined ? {} : { reference: toPosition(item.reference) }),
				...(item.minimumReference === undefined
					? {}
					: { minimumReference: toPosition(item.minimumReference) }),
			};
		},
	});
	return async (document, options) => {
		const session = await open(document, {
			...options,
			...(options.reference === undefined
				? {}
				: { reference: fromPosition(options.reference) }),
		});
		return {
			...session,
			read: (after, stopAfter) =>
				mapStream(session.read(fromOptionalPosition(after), fromOptionalPosition(stopAfter))),
			load: async (required, hint) => {
				const loaded = await session.load(fromOptionalPosition(required), hint);
				return { ...loaded, events: mapStream(loaded.events) };
			},
			submit: async (reference, payload, tree) =>
				toPosition(await session.submit(fromOptionalPosition(reference), payload, tree)),
			announceMembership: async (metadata) =>
				toPosition(await session.announceMembership(metadata)),
			getSnapshot: async (required) => {
				const snapshot = await session.getSnapshot(fromOptionalPosition(required));
				return snapshot === undefined
					? undefined
					: { ...snapshot, atEvent: toPosition(snapshot.atEvent) };
			},
			publishSnapshot: async (parent, fence, position, root) => {
				const snapshot = await session.publishSnapshot(
					fromOptionalPosition(parent),
					fence,
					fromPosition(position),
					root,
				);
				return { ...snapshot, atEvent: toPosition(snapshot.atEvent) };
			},
		};
	};
}

describe("DirectSharedTreeClient recovery", () => {
	let service: Awaited<ReturnType<typeof createMemoryService>>;
	const clients: DirectSharedTreeClient[] = [];
	const views: { dispose(): void }[] = [];

	beforeEach(async () => {
		service = await createMemoryService({ environment: "node" });
	});

	afterEach(async () => {
		for (const view of views.splice(0)) view.dispose();
		await Promise.all(clients.splice(0).map(async (client) => client.dispose()));
		service.close();
	});

	/** Opens a fixture and tracks all resources for test cleanup. */
	async function open(
		document?: Uint8Array,
		options: DirectSharedTreeClientOptions = {},
		factory: SeaSessionFactory = service.open,
	) {
		const driver = new FaultClient(factory);
		const host = await DirectSharedTreeClient.create(
			driver,
			document ?? new Uint8Array(),
			4,
			1024 * 1024,
			document === undefined,
			{ summaryIdleMs: 60_000, ...options },
		);
		clients.push(host);
		const view = host.tree.viewWith(configuration);
		views.push(view);
		if (document === undefined) {
			view.initialize({ items: [] });
			await host.waitForIdle();
		}
		return { driver, host, view };
	}

	it("loads a full summary, replays its suffix, and continues collaborating", async () => {
		const writer = await open();
		writer.view.root.items.insertAtEnd("before snapshot");
		await writer.host.waitForIdle();
		await writer.host.summarize();
		assert.equal(writer.host.summaryCount, 1);
		writer.view.root.items.insertAtEnd("after snapshot");
		await writer.host.waitForIdle();
		let loads = 0;
		const fetchedBlobs = new Set<string>();
		const reader = await open(writer.host.documentId, {}, async (document, options) => {
			const session = await service.open(document, options);
			return {
				...session,
				getBlobTrees: (roots, hint) => {
					for (const id of roots) {
						if (id.kind !== "blob") continue;
						const key = Buffer.from(id.bytes).toString("hex");
						assert.ok(
							!fetchedBlobs.has(key),
							"identical snapshot blobs must be fetched only once",
						);
						fetchedBlobs.add(key);
					}
					return session.getBlobTrees(roots, hint);
				},
				getSnapshot: async () => assert.fail("opening must use the selected snapshot"),
				read: () => assert.fail("opening and live delivery must reuse the load stream"),
				load: async (required, hint) => {
					loads++;
					const loaded = await session.load(required, hint);
					const stream = loaded.events;
					let floor = -1n;
					return {
						content: loaded.content,
						events: {
							cancel: () => stream.cancel(),
							next: async () => {
								const item = await stream.next();
								if (item?.kind === "snapshot") floor = item.atEvent;
								if (item?.kind === "event")
									assert.ok(item.position > floor, "must not download pre-snapshot events");
								return item;
							},
						},
					};
				},
			};
		});
		assert.equal(loads, 1);
		assert.ok(fetchedBlobs.size > 0);
		assert.equal(reader.host.loadedFromSummary, true);
		assert.deepEqual([...reader.view.root.items], ["before snapshot", "after snapshot"]);
		reader.view.root.items.insertAtEnd("reader edit");
		await reader.host.waitForIdle();
		await until(
			() => writer.view.root.items.length === 3,
			"writer did not receive loaded peer edit",
		);
		assert.deepEqual([...writer.view.root.items], [...reader.view.root.items]);
		reader.host.disconnect();
		reader.view.root.items.insertAtEnd("offline after summary");
		await reader.host.reconnect();
		await reader.host.waitForIdle();
		await until(() => writer.view.root.items.length === 4, "loaded peer did not recover");
		assert.equal(loads, 2, "recovery must reuse its opening stream too");
	});

	for (const offset of [0n, 2n ** 52n]) {
		it(`uses sparse native positions starting at ${offset} through summary and recovery`, async () => {
			const factory = remapPositions(service.open, offset, 17n);
			const writer = await open(undefined, {}, factory);
			assert.equal((BigInt(writer.host.lastAppliedSequenceNumber) - offset) % 17n, 0n);
			writer.view.root.items.insertAtEnd("before");
			await writer.host.waitForIdle();
			await writer.host.summarize();
			const snapshot = await writer.driver.latestSnapshot();
			assert.ok(snapshot);
			const entries = await writer.driver.fetchSummary(snapshot.root);
			assert.ok(
				!entries.some(
					(entry) => new TextDecoder().decode(entry.path) === ".sea-fluid-projection",
				),
			);
			const metadataEntry = entries.find(
				(entry) => new TextDecoder().decode(entry.path) === ".sea-direct",
			);
			assert.ok(metadataEntry);
			const metadata = JSON.parse(
				new TextDecoder().decode(await writer.driver.fetchBlob(metadataEntry.blob)),
			);
			assert.equal(metadata.version, 4);
			assert.equal(metadata.positions, undefined);
			const peer = await open(writer.host.documentId, {}, factory);
			assert.deepEqual([...peer.view.root.items], ["before"]);
			writer.host.disconnect();
			writer.view.root.items.insertAtEnd("offline");
			peer.view.root.items.insertAtEnd("remote");
			await peer.host.waitForIdle();
			await writer.host.reconnect();
			await writer.host.waitForIdle();
			await until(() => peer.view.root.items.length === 3, "sparse-position recovery failed");
			assert.deepEqual([...writer.view.root.items], [...peer.view.root.items]);
		});
	}

	it("summarizes at the maximum safe integer and rejects an out-of-range position", async () => {
		const writer = await open(
			undefined,
			{},
			remapPositions(service.open, BigInt(Number.MAX_SAFE_INTEGER) - 2n),
		);
		writer.view.root.items.insertAtEnd("boundary");
		await writer.host.waitForIdle();
		assert.equal(writer.host.lastAppliedSequenceNumber, Number.MAX_SAFE_INTEGER);
		await writer.host.summarize();
		assert.equal(writer.host.summaryCount, 1);
		await assert.rejects(
			open(
				writer.host.documentId,
				{},
				remapPositions(service.open, BigInt(Number.MAX_SAFE_INTEGER) - 2n),
			),
			/lossless JavaScript integer range/u,
		);
	});

	for (const field of ["reference", "minimumReference"] as const) {
		it(`rejects an unsafe ${field} without rounding it`, async () => {
			await assert.rejects(
				open(undefined, {}, async (document, options) => {
					const session = await service.open(document, options);
					return {
						...session,
						load: async (required, hint) => {
							const loaded = await session.load(required, hint);
							const stream = loaded.events;
							return {
								content: loaded.content,
								events: {
									cancel: () => stream.cancel(),
									next: async () => {
										const item = await stream.next();
										return item?.kind === "event" ? { ...item, [field]: 2n ** 53n } : item;
									},
								},
							};
						},
					};
				}),
				/lossless JavaScript integer range/u,
			);
		});
	}

	it("rejects old direct snapshot versions", async () => {
		const writer = await open();
		await writer.host.summarize();
		const snapshot = await writer.driver.latestSnapshot();
		assert.ok(snapshot);
		const entries = await writer.driver.fetchSummary(snapshot.root);
		const entry = entries.find(
			(item) => new TextDecoder().decode(item.path) === ".sea-direct",
		);
		assert.ok(entry);
		const metadata = JSON.parse(
			new TextDecoder().decode(await writer.driver.fetchBlob(entry.blob)),
		);
		const replacement = await writer.driver.uploadBlob(
			new TextEncoder().encode(JSON.stringify({ ...metadata, version: 1 })),
		);
		const root = await writer.driver.publishSummary(
			entries.map((item) => (item === entry ? { ...item, blob: replacement.digest } : item)),
		);
		// A later event supplies a new publication position without changing the old format.
		writer.view.root.items.insertAtEnd("later");
		await writer.host.waitForIdle();
		const history = await writer.driver.readProjected(snapshot.atEvent);
		await writer.driver.publishSnapshotRoot(snapshot.id, history.cursor, root.digest);
		await assert.rejects(
			open(writer.host.documentId),
			/Unsupported or invalid direct SharedTree summary metadata/u,
		);
	});

	it("summarizes after idle, does not repeatedly summarize unchanged state, and respects nomination", async () => {
		const writer = await open(undefined, { summaryIdleMs: 20 });
		const peer = await open(writer.host.documentId, { summaryIdleMs: 20 });
		await until(() => writer.host.summaryCount === 1, "idle summary was not published");
		await delay(100);
		assert.equal(writer.host.summaryCount, 1);
		assert.equal(peer.host.summaryCount, 0);
		writer.view.root.items.insertAtEnd("next summary");
		await until(() => writer.host.summaryCount === 2, "dirty state was not summarized");
	});

	it("summarizes at the operation threshold without waiting for the idle timer", async () => {
		const writer = await open(undefined, { summaryMaxOperations: 2 });
		await writer.host.summarize();
		const baseline = writer.host.summaryCount;
		assert.equal(baseline, 1);
		writer.view.root.items.insertAtEnd("below threshold");
		await writer.host.waitForIdle();
		assert.equal(writer.host.summaryCount, baseline);
		writer.view.root.items.insertAtEnd("at threshold");
		await until(
			() => writer.host.summaryCount === baseline + 1,
			"operation threshold did not trigger a summary",
		);
	});

	it("hands summarization to another client when the nominee disconnects", async () => {
		const writer = await open();
		const peer = await open(writer.host.documentId, { summaryIdleMs: 20 });
		writer.view.root.items.insertAtEnd("survives nomination handoff");
		await writer.host.waitForIdle();
		await until(() => peer.view.root.items.length === 1, "peer missed edit before handoff");
		writer.host.disconnect();
		await until(() => peer.host.summaryCount === 1, "replacement nominee did not summarize");
		const loaded = await open(writer.host.documentId);
		assert.equal(loaded.host.loadedFromSummary, true);
		assert.deepEqual([...loaded.view.root.items], ["survives nomination handoff"]);
	});

	it("retains and rebases offline edits on the same application view", async () => {
		const writer = await open();
		const peer = await open(writer.host.documentId);
		writer.host.disconnect();
		writer.view.root.items.insertAtEnd("offline");
		peer.view.root.items.insertAtEnd("remote");
		await peer.host.waitForIdle();
		assert.equal(writer.host.pendingOperationCount, 1);
		await writer.host.summarize();
		assert.equal(writer.host.summaryCount, 0);
		await writer.host.reconnect();
		await writer.host.waitForIdle();
		await until(() => peer.view.root.items.length === 2, "offline edit was not resubmitted");
		assert.deepEqual([...writer.view.root.items], [...peer.view.root.items]);
		assert.deepEqual([...writer.view.root.items].sort(), ["offline", "remote"]);
		assert.equal(writer.host.connectionState, "connected");
	});

	it("reports a failed transport close without permanently blocking reconnect", async () => {
		let failClose = false;
		const failure = new Error("Injected transport close failure");
		const writer = await open(undefined, {}, async (document, options) => {
			const session = await service.open(document, options);
			return {
				...session,
				close: async () => {
					await session.close();
					if (failClose) {
						failClose = false;
						throw failure;
					}
				},
			};
		});
		const observed: unknown[] = [];
		writer.host.onStatusChange(() => observed.push(writer.host.lastError));
		failClose = true;
		writer.host.disconnect();
		writer.view.root.items.insertAtEnd("survives failed cleanup");
		await writer.host.reconnect();
		await writer.host.waitForIdle();
		assert.ok(observed.includes(failure));
		assert.equal(writer.host.connectionState, "connected");
		const peer = await open(writer.host.documentId);
		assert.deepEqual([...peer.view.root.items], ["survives failed cleanup"]);
	});

	for (const outcome of ["disconnect", "dispose", "connected", "error"] as const) {
		it(`handles an in-flight summary failure after ${outcome} without hiding current failures`, async () => {
			let blockUploads = false;
			let started = false;
			let rejectUpload: (error: Error) => void = () =>
				assert.fail("upload gate not initialized");
			const blocked = new Promise<void>((_resolve, reject) => {
				rejectUpload = reject;
			});
			const failure = new Error("Injected summary transport cancellation");
			const writer = await open(
				undefined,
				{ summaryIdleMs: 20 },
				async (document, options) => {
					const session = await service.open(document, options);
					return {
						...session,
						putBlob: async (payload) => {
							if (blockUploads) {
								started = true;
								await blocked;
							}
							return session.putBlob(payload);
						},
					};
				},
			);
			blockUploads = true;
			await until(() => started, "scheduled summary did not start");
			const rejected = assert.rejects(writer.host.summarize(), (error) => error === failure);
			let disposed: Promise<void> | undefined;
			let terminalError: unknown;
			if (outcome === "disconnect") writer.host.disconnect();
			if (outcome === "dispose") disposed = writer.host.dispose();
			if (outcome === "error") {
				const history = await writer.driver.readProjected();
				await writer.driver.submitEvent(new TextEncoder().encode("{}"), history.cursor);
				await until(
					() => writer.host.connectionState === "error",
					"invalid acknowledgment did not stop the host",
				);
				terminalError = writer.host.lastError;
				assert.ok(terminalError instanceof Error);
			}
			blockUploads = false;
			rejectUpload(failure);
			await rejected;
			await disposed;
			assert.equal(writer.host.lastError, outcome === "connected" ? failure : terminalError);
			assert.equal(
				writer.host.connectionState,
				outcome === "dispose"
					? "disposed"
					: outcome === "disconnect"
						? "disconnected"
						: outcome === "error"
							? "error"
							: "connected",
			);
			if (outcome === "disconnect" || outcome === "connected") {
				if (outcome === "disconnect") await writer.host.reconnect();
				await until(
					() => writer.host.summaryCount > 0,
					"summary did not retry on the live connection",
				);
				assert.equal(writer.host.lastError, undefined);
			}
		});
	}

	it("does not let delayed subscription cleanup overwrite a recovered connection", async () => {
		const writer = await open();
		let rejectCancellation: (error: Error) => void = () =>
			assert.fail("cancellation gate not initialized");
		writer.driver.cancellation = new Promise<void>((_resolve, reject) => {
			rejectCancellation = reject;
		});
		writer.host.disconnect();
		writer.driver.cancellation = undefined;
		await writer.host.reconnect();
		rejectCancellation(new Error("Late cleanup failure"));
		await delay(0);
		assert.equal(writer.host.connectionState, "connected");
		assert.equal(writer.host.lastError, undefined);
	});

	it("still reports a cleanup failure in the current lifecycle", async () => {
		const writer = await open();
		const failure = new Error("Current cleanup failure");
		writer.driver.cancellation = Promise.reject(failure);
		writer.host.disconnect();
		await delay(0);
		assert.equal(writer.host.lastError, failure);
		writer.driver.cancellation = undefined;
		await writer.host.reconnect();
		assert.equal(writer.host.lastError, undefined);
	});

	it("closes a replacement session that finishes opening after host disposal", async () => {
		let holdOpen = false;
		let opening = false;
		let replacementClosed = false;
		let release: () => void = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const writer = await open(undefined, {}, async (document, options) => {
			const session = await service.open(document, options);
			if (!holdOpen) return session;
			opening = true;
			await blocked;
			return {
				...session,
				close: async () => {
					replacementClosed = true;
					await session.close();
				},
			};
		});
		writer.host.disconnect();
		holdOpen = true;
		const reconnecting = writer.host.reconnect();
		await until(() => opening, "replacement did not begin opening");
		const disposing = writer.host.dispose();
		release();
		await Promise.all([reconnecting, disposing]);
		await writer.driver.reconnect();
		assert.equal(writer.host.connectionState, "disposed");
		assert.equal(replacementClosed, true);
	});

	for (const failure of ["before", "after"] as const) {
		it(`automatically recovers ${failure === "before" ? "unaccepted edits" : "lost acknowledgments"} without duplicates`, async () => {
			const writer = await open();
			const peer = await open(writer.host.documentId);
			writer.driver.holdDelivery();
			writer.driver.failNext = failure;
			writer.view.root.items.insertAtEnd("exactly once");
			writer.view.root.items.insertAtEnd("queued suffix");
			await writer.host.waitForIdle();
			await until(
				() => peer.view.root.items.length === 2,
				"peer did not receive recovered suffix",
			);
			assert.deepEqual([...writer.view.root.items], ["exactly once", "queued suffix"]);
			assert.deepEqual([...peer.view.root.items], [...writer.view.root.items]);
			assert.equal(writer.host.pendingOperationCount, 0);
			assert.equal(writer.host.connectionState, "connected");
		});
	}
});
