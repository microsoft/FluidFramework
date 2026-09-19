/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";

import {
	SeaDocumentStorage,
	SeaDocumentService,
	SeaDriver,
	SeaDeltaConnection,
	SeaSessionDriverClient,
} from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import type {
	BlobUpload,
	ProjectedOperationSubscription,
	ProjectedReadPage,
	SubmissionResolution,
	SummaryEntry,
	SummaryPublication,
	SeaDriverClient,
} from "@fluidframework/sea-driver/internal";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test("neutral session driver hides initialization and preserves snapshot versions across reopen", async (context) => {
	const service = await createMemoryService({ environment: "node" });
	const writer = new SeaSessionDriverClient(service.open, "clientSelected");
	const observer = new SeaSessionDriverClient(service.open, "readOnly");
	context.after(async () => {
		writer.disconnect();
		observer.disconnect();
		await Promise.all([writer.reconnect(), observer.reconnect()]);
		service.close();
	});
	const document = await writer.create();
	await writer.openSession(
		document,
		encoder.encode("writer"),
		encoder.encode("writer-session"),
	);
	const root = await writer.publishSummary([]);
	const initial = await writer.publishSnapshotRoot(undefined, undefined, root.digest);
	assert.deepEqual(writer.positionForSequence(0), initial);
	assert.deepEqual((await writer.readProjected()).operations, []);
	const position = await writer.submitEvent(
		encoder.encode("edit"),
		1,
		encoder.encode(JSON.stringify({ clientSequenceNumber: 1 })),
		initial,
	);
	const history = await writer.readProjected();
	assert.equal(history.operations.length, 1);
	assert.equal(history.operations[0]?.sequenceNumber, 1n);
	assert.deepEqual(writer.positionForSequence(1), position);
	const version = await writer.publishSnapshotRoot(initial, position, root.digest);
	assert.deepEqual(version, position);
	await observer.openSession(
		document,
		encoder.encode("observer"),
		encoder.encode("observer-session"),
	);
	assert.deepEqual(observer.positionForSequence(0), initial);
	assert.deepEqual(observer.positionForSequence(1), position);
	assert.equal((await observer.readProjected()).operations[0]?.sequenceNumber, 1n);
	assert.deepEqual((await observer.snapshot(initial))?.id, initial);
	assert.deepEqual((await observer.latestSnapshot())?.id, version);
	assert.equal(await observer.snapshot(encodeU64(999n)), undefined);
	const connection = new SeaDeltaConnection(
		"observer",
		{
			clientId: "observer",
			remoteClientId: "writer",
			writer: encoder.encode("observer"),
			cursor: position,
			lastPosition: initial,
			remoteClientSequenceNumber: 0,
			remoteSequenceNumbers: new Map(),
		},
		encoder.encode("observer-reopened"),
		document,
		observer,
		{
			details: { capabilities: { interactive: true } },
			permission: [],
			scopes: [],
			user: { id: "observer" },
			mode: "write",
		},
		"write",
		[],
	);
	try {
		await connection.open();
	} finally {
		connection.dispose();
	}
});

test("neutral projection preserves the durable floor across membership close and reopen", async () => {
	const service = await createMemoryService({ environment: "node" });
	const writer = await service.open(undefined, {
		author: encoder.encode("writer"),
		session: encoder.encode("first"),
	});
	const adapter = new SeaSessionDriverClient(service.open, "readOnly");
	try {
		const joined = await writer.announceMembership(encoder.encode('{"mode":"write"}'));
		await writer.submit(
			encoder.encode("edit"),
			joined,
			encoder.encode('{"clientSequenceNumber":1}'),
		);
		await writer.close();
		await adapter.openSession(
			writer.document,
			encoder.encode("reader"),
			encoder.encode("second"),
		);
		await adapter.announceMembership(encoder.encode('{"mode":"write"}'));
		const history = (await adapter.readProjected()).operations;
		assert.deepEqual(
			history.map((operation) => operation.eventType),
			["joined", "application", "left", "joined"],
		);
		assert.ok(history[1]?.minimumReference !== undefined);
		assert.deepEqual(history[3]?.minimumReference, history[1]?.position);
		assert.deepEqual(
			history.map((operation) => operation.minimumSequenceNumber),
			[0n, 1n, 2n, 2n],
		);
		assert.deepEqual(
			(await adapter.readProjected(history[1]?.position)).operations,
			history.slice(2),
		);
	} finally {
		adapter.disconnect();
		await adapter.reconnect();
		await writer.close();
		service.close();
	}
});

test("neutral session driver cancels startup history when initialization is invalid", async () => {
	const service = await createMemoryService({ environment: "node" });
	const client = await service.open(undefined, {
		author: encoder.encode("author"),
		session: encoder.encode("initial-session"),
	});
	const document = client.document;
	await client.submit(
		encoder.encode("invalid-initialization"),
		undefined,
		encoder.encode(JSON.stringify({ seaFluid: "initialize", version: 2 })),
	);
	let cancelled = false;
	const adapter = new SeaSessionDriverClient(async (archive, options) => {
		const session = await service.open(archive, options);
		const read = session.read.bind(session);
		session.read = (...args) => {
			const stream = read(...args);
			const cancel = stream.cancel.bind(stream);
			stream.cancel = () => {
				cancelled = true;
				cancel();
			};
			return stream;
		};
		return session;
	}, "readOnly");
	try {
		await assert.rejects(
			adapter.openSession(
				document,
				encoder.encode("reader"),
				encoder.encode("reader-session"),
			),
			/invalid Fluid initialization event/,
		);
		assert.equal(cancelled, true, "failed startup must release its live history read");
	} finally {
		adapter.disconnect();
		await adapter.reconnect();
		await client.close();
		service.close();
	}
});

test("neutral session replacement drains storage reads and defers later reads", async () => {
	const service = await createMemoryService({ environment: "node" });
	let releaseRead = (): void => {};
	const blocked = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	let enteredRead = (): void => {};
	const entered = new Promise<void>((resolve) => {
		enteredRead = resolve;
	});
	let opens = 0;
	let firstClosed = false;
	const adapter = new SeaSessionDriverClient(async (document, options) => {
		const session = await service.open(document, options);
		opens += 1;
		if (opens === 1) {
			const getBlob = session.getBlob.bind(session);
			const close = session.close.bind(session);
			session.getBlob = async (id) => {
				enteredRead();
				await blocked;
				return getBlob(id);
			};
			session.close = () => {
				firstClosed = true;
				return close();
			};
		}
		return session;
	}, "clientSelected");
	const document = await adapter.create();
	const payload = encoder.encode("storage read across delta membership replacement");
	const blob = await adapter.uploadBlob(payload);
	const reading = adapter.fetchBlob(blob.digest);
	await entered;
	const replacement = adapter.openSession(
		document,
		encoder.encode("writer"),
		encoder.encode("delta-session"),
	);
	let laterCompleted = false;
	const later = adapter.fetchBlob(blob.digest).then((value) => {
		laterCompleted = true;
		return value;
	});
	const results = Promise.allSettled([reading, replacement, later]);
	try {
		await setImmediate();
		assert.equal(
			firstClosed,
			false,
			"replacement must not close a session with an admitted storage read",
		);
		assert.equal(laterCompleted, false, "new reads must wait for membership replacement");
		releaseRead();
		assert.deepEqual(await reading, payload);
		await replacement;
		assert.deepEqual(await later, payload);
		assert.equal(firstClosed, true);
		assert.equal(opens, 2);
	} finally {
		releaseRead();
		await results;
		adapter.disconnect();
		await adapter.reconnect();
		service.close();
	}
});

test("read-first document services retain independent memberships and shared writer identities", async () => {
	const service = await createMemoryService({ environment: "node" });
	const seed = await service.open(undefined, {
		author: encoder.encode("seed"),
		session: encoder.encode("seed"),
	});
	const payload = encoder.encode("shared archive content");
	const blob = await seed.putBlob(payload);
	const id = Buffer.from(seed.document).toString("hex");
	const adapters: SeaSessionDriverClient[] = [];
	const services = Array.from(
		{ length: 4 },
		() =>
			new SeaDocumentService(
				{
					type: "fluid",
					id,
					url: `fluid://localhost/minimal/${id}`,
					tokens: {},
					endpoints: {},
				},
				async () => {
					const adapter = new SeaSessionDriverClient(service.open, "readOnly");
					adapters.push(adapter);
					return adapter;
				},
				{},
			),
	);
	const connections: SeaDeltaConnection[] = [];
	try {
		for (const documentService of services) {
			connections.push(
				await documentService.connectToDeltaStream({
					details: { capabilities: { interactive: true } },
					permission: [],
					scopes: [],
					user: { id: "reader" },
					mode: connections.length < 2 ? "read" : "write",
				}),
			);
		}
		for (const adapter of adapters)
			assert.deepEqual(await adapter.fetchBlob(blob.bytes), payload);
		const expectedMembers = connections.slice(2).map((connection) => connection.clientId);
		const latest = connections.at(-1);
		assert.ok(latest);
		assert.deepEqual(
			latest.initialMessages
				.filter((message) => message.type === MessageType.ClientJoin)
				.map((message) => (JSON.parse(message.data ?? "") as { clientId: string }).clientId),
			expectedMembers,
		);
		for (const documentService of services) {
			const history = await documentService.connectToDeltaStorage();
			const page = await history.fetchMessages(1, latest.checkpointSequenceNumber + 1).read();
			assert.equal(page.done, false);
			if (!page.done) assert.deepEqual(page.value, latest.initialMessages);
		}
		const writer = connections[2];
		assert.ok(writer);
		const missed: unknown[] = [];
		writer.on("op", (_document, messages) =>
			missed.push(...messages.filter((message) => message.type === MessageType.Operation)),
		);
		writer.disconnect();
		latest.submit([
			{
				clientSequenceNumber: 1,
				referenceSequenceNumber: latest.checkpointSequenceNumber,
				type: MessageType.Operation,
				contents: "offline peer edit",
			},
		]);
		await latest.waitForIdle();
		const previousClientId = writer.clientId;
		await writer.reconnect();
		assert.notEqual(writer.clientId, previousClientId);
		assert.equal(missed.length, 1, "reconnect must deliver an edit missed while offline");
		assert.equal(
			(await writer.synchronize()).length,
			0,
			"catch-up must not duplicate delivery",
		);
	} finally {
		for (const connection of connections) connection.dispose();
		for (const documentService of services) documentService.dispose();
		await Promise.all(adapters.map(async (adapter) => adapter.reconnect()));
		await seed.close();
		service.close();
	}
});

interface FixtureSnapshot {
	readonly id: Uint8Array;
	readonly root: Uint8Array;
	readonly atEvent?: Uint8Array;
}

class SummaryFixtureClient implements SeaDriverClient {
	private readonly blobs = new Map<string, Uint8Array>();
	private readonly summaries = new Map<string, readonly SummaryEntry[]>();
	private readonly snapshots = new Map<string, FixtureSnapshot>();
	private latestSnapshotId: Uint8Array | undefined;

	public blobUploadCount = 0;
	public async create(): Promise<Uint8Array> {
		return encodeU64(1n);
	}

	public async openSession(
		_document: Uint8Array,
		_writer: Uint8Array,
		_session: Uint8Array,
		_resumeAfter?: Uint8Array,
	): Promise<void> {}

	public async submitEvent(): Promise<Uint8Array> {
		throw new Error("not implemented by summary fixture");
	}

	public async latestSnapshot(): Promise<FixtureSnapshot | undefined> {
		return this.latestSnapshotId === undefined
			? undefined
			: this.snapshot(this.latestSnapshotId);
	}

	public async snapshot(id: Uint8Array): Promise<FixtureSnapshot | undefined> {
		return this.snapshots.get(bytesKey(id));
	}

	public async publishSnapshotRoot(
		expectedParent: Uint8Array | undefined,
		atEvent: Uint8Array | undefined,
		root: Uint8Array,
	): Promise<Uint8Array> {
		if (!sameOptionalBytes(expectedParent, this.latestSnapshotId)) {
			throw new Error("snapshot parent conflict");
		}
		if (!this.summaries.has(bytesKey(root))) {
			throw new Error("snapshot root does not exist");
		}
		const id = atEvent ?? encodeU64(1n);
		if (this.snapshots.has(bytesKey(id))) {
			throw new Error("snapshot position conflict");
		}
		const snapshot = {
			id,
			root: root.slice(),
			...(atEvent === undefined ? {} : { atEvent: atEvent.slice() }),
		};
		this.snapshots.set(bytesKey(id), snapshot);
		this.latestSnapshotId = id;
		return id;
	}

	public positionForSequence(sequenceNumber: number): Uint8Array | undefined {
		return sequenceNumber > 0 ? encodeU64(BigInt(sequenceNumber)) : undefined;
	}

	public async readProjected(): Promise<ProjectedReadPage> {
		throw new Error("not implemented by summary fixture");
	}

	public subscribeProjected(): ProjectedOperationSubscription {
		throw new Error("not implemented by summary fixture");
	}

	public async resolveSubmission(): Promise<SubmissionResolution> {
		throw new Error("not implemented by summary fixture");
	}

	public async uploadBlob(payload: Uint8Array): Promise<BlobUpload> {
		this.blobUploadCount++;
		const digest = digestBytes(payload);
		this.blobs.set(bytesKey(digest), payload.slice());
		return {
			digest,
			sizeBytes: BigInt(payload.length),
			deduplicated: false,
		};
	}

	public async fetchBlob(digest: Uint8Array): Promise<Uint8Array> {
		const payload = this.blobs.get(bytesKey(digest));
		if (payload === undefined) {
			throw new Error("blob does not exist");
		}
		return payload.slice();
	}

	public async publishSummary(entries: readonly SummaryEntry[]): Promise<SummaryPublication> {
		for (const entry of entries) {
			if (!this.blobs.has(bytesKey(entry.blob))) {
				throw new Error("summary references a missing blob");
			}
		}
		const hash = createHash("sha256");
		for (const entry of entries) {
			hash.update(entry.path);
			hash.update("\0");
			hash.update(entry.blob);
		}
		const digest = new Uint8Array(hash.digest());
		this.summaries.set(
			bytesKey(digest),
			entries.map((entry) => ({ path: entry.path.slice(), blob: entry.blob.slice() })),
		);
		return {
			digest,
			entryCount: entries.length,
			persistedBytes: 0n,
			deduplicated: false,
		};
	}

	public async fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]> {
		const entries = this.summaries.get(bytesKey(digest));
		if (entries === undefined) {
			throw new Error("summary does not exist");
		}
		return entries.map((entry) => ({ path: entry.path.slice(), blob: entry.blob.slice() }));
	}

	public disconnect(): void {}

	public async reconnect(): Promise<void> {}
}

test("driver creation disposes its client when initial summary upload fails", async () => {
	const client = new SummaryFixtureClient();
	let disconnected = false;
	client.disconnect = () => {
		disconnected = true;
	};
	client.uploadBlob = async () => {
		throw new Error("injected summary upload failure");
	};
	const driver = new SeaDriver(async () => client);
	await assert.rejects(
		driver.createContainer(tree({ leaf: blob("initial") }), {
			type: "fluid",
			id: "new",
			url: "fluid://sea/documents/new",
			tokens: {},
			endpoints: {},
		}),
		/injected summary upload failure/u,
	);
	assert.equal(disconnected, true);
});

test("incremental summaries reuse tree and blob handles and include attachments", async () => {
	const client = new SummaryFixtureClient();
	const storage = createStorage(client);
	const retainedAttachment = await storage.createBlob(
		encoder.encode("retained attachment").buffer,
	);
	const firstHandle = await storage.uploadSummaryWithContext(
		tree({
			stable: tree({
				leaf: blob("stable leaf"),
				nested: tree({ child: blob("stable child") }),
			}),
			single: blob("single blob"),
			retainedAttachment: {
				type: SummaryType.Attachment,
				id: retainedAttachment.id,
			},
		}),
		summaryContext(),
	);
	const directAttachment = await storage.createBlob(encoder.encode("attachment").buffer);
	const secondHandle = await storage.uploadSummaryWithContext(
		tree({
			copiedTree: {
				type: SummaryType.Handle,
				handleType: SummaryType.Tree,
				handle: "/stable",
			},
			copiedBlob: {
				type: SummaryType.Handle,
				handleType: SummaryType.Blob,
				handle: "/single",
			},
			copiedAttachment: {
				type: SummaryType.Handle,
				handleType: SummaryType.Attachment,
				handle: "/retainedAttachment",
			},
			directAttachment: {
				type: SummaryType.Attachment,
				id: directAttachment.id,
			},
			changed: blob("changed blob"),
		}),
		summaryContext(firstHandle),
	);

	assert.equal(client.blobUploadCount, 6, "handles must not upload referenced blobs again");
	const [firstVersion] = await storage.getVersions(firstHandle, 1);
	assert(firstVersion !== undefined);
	const firstSnapshot = await storage.getSnapshotTree(firstVersion);
	const secondSnapshot = await storage.getSnapshotTree();
	assert(firstSnapshot !== null);
	assert(secondSnapshot !== null);
	const copiedTree = secondSnapshot.trees.copiedTree;
	const stableTree = firstSnapshot.trees.stable;
	assert(copiedTree !== undefined);
	assert(stableTree !== undefined);
	const copiedNestedTree = copiedTree.trees.nested;
	const stableNestedTree = stableTree.trees.nested;
	assert(copiedNestedTree !== undefined);
	assert(stableNestedTree !== undefined);
	const changedBlob = secondSnapshot.blobs.changed;
	assert(changedBlob !== undefined);
	assert.equal(secondSnapshot.id, secondHandle);
	assert.equal(copiedTree.blobs.leaf, stableTree.blobs.leaf);
	assert.equal(copiedNestedTree.blobs.child, stableNestedTree.blobs.child);
	assert.equal(secondSnapshot.blobs.copiedBlob, firstSnapshot.blobs.single);
	assert.equal(secondSnapshot.blobs.copiedAttachment, firstSnapshot.blobs.retainedAttachment);
	assert.equal(secondSnapshot.blobs.directAttachment, directAttachment.id);
	assert.equal(
		decoder.decode(new Uint8Array(await storage.readBlob(changedBlob))),
		"changed blob",
	);
});

test("summary handles require a parent and attachments must identify an uploaded blob", async () => {
	const storage = createStorage(new SummaryFixtureClient());
	await assert.rejects(
		storage.uploadSummaryWithContext(
			tree({
				reused: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/missing",
				},
			}),
			summaryContext(),
		),
		/acknowledged parent snapshot/u,
	);
	const parent = await storage.uploadSummaryWithContext(
		tree({ present: blob("present") }),
		summaryContext(),
	);
	await assert.rejects(
		storage.uploadSummaryWithContext(
			tree({
				reused: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/missing",
				},
			}),
			summaryContext(parent),
		),
		/does not resolve/u,
	);
	await assert.rejects(
		storage.uploadSummaryWithContext(
			tree({
				missing: { type: SummaryType.Attachment, id: "00".repeat(32) },
			}),
			summaryContext(parent),
		),
		/missing blob/u,
	);
});

test("incremental summary publication rejects a stale acknowledged parent", async () => {
	const storage = createStorage(new SummaryFixtureClient());
	const parent = await storage.uploadSummaryWithContext(
		tree({ stable: blob("parent") }),
		summaryContext(),
	);
	const winner = await storage.uploadSummaryWithContext(
		tree({ stable: blob("winner") }),
		summaryContext(parent),
	);
	await assert.rejects(
		storage.uploadSummaryWithContext(
			tree({
				stable: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/stable",
				},
			}),
			summaryContext(parent),
		),
		/parent conflict/u,
	);
	assert.equal((await storage.getVersions(null, 1))[0]?.id, winner);
});

function createStorage(client: SummaryFixtureClient): SeaDocumentStorage {
	return new SeaDocumentStorage(client);
}

function tree(children: ISummaryTree["tree"]): ISummaryTree {
	return { type: SummaryType.Tree, tree: children };
}

function blob(content: string) {
	return { type: SummaryType.Blob, content } as const;
}

function summaryContext(ackHandle?: string): ISummaryContext {
	return {
		proposalHandle: undefined,
		ackHandle,
		referenceSequenceNumber:
			ackHandle === undefined ? 3 : Number(BigInt(`0x${ackHandle}`)) + 3,
	};
}

function digestBytes(payload: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(payload).digest());
}

function bytesKey(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

function sameOptionalBytes(
	left: Uint8Array | undefined,
	right: Uint8Array | undefined,
): boolean {
	return left === undefined || right === undefined
		? left === right
		: Buffer.from(left).equals(Buffer.from(right));
}

function encodeU64(value: bigint): Uint8Array {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, value);
	return bytes;
}
