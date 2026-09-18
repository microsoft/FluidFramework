/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";

import { SeaDocumentStorage, SeaDeltaConnection } from "@fluidframework/sea-driver/internal";
import { createGeneratedSeaBindingAdapter, encodePosition } from "./generatedSeaBinding.js";
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

test("generated driver hides initialization and preserves snapshot versions across reopen", async () => {
	const require = createRequire(import.meta.url);
	const bindings =
		require("../../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js") as typeof import("../../../crates/sea-webtransport/test-support/pkg/web/sea_webtransport_test_support.js");
	const service = await bindings.SeaLocalService.create();
	const writerClient = service.connect();
	const writer = createGeneratedSeaBindingAdapter(writerClient, bindings, "ClientSelected");
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
	const observerClient = service.connect();
	const observer = createGeneratedSeaBindingAdapter(observerClient, bindings, "ReadOnly");
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
	assert.equal(await observer.snapshot(encodePosition(999n)), undefined);
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
	await writerClient.close();
	await observerClient.close();
});

test("generated driver cancels startup history when initialization is invalid", async () => {
	const require = createRequire(import.meta.url);
	const bindings =
		require("../../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js") as typeof import("../../../crates/sea-webtransport/test-support/pkg/web/sea_webtransport_test_support.js");
	const service = await bindings.SeaLocalService.create();
	const client = service.connect();
	const document = await client.createDocument(
		encoder.encode("author"),
		encoder.encode("initial-session"),
	);
	await client.submit(
		encoder.encode("invalid-initialization"),
		undefined,
		encoder.encode(JSON.stringify({ seaFluid: "initialize", version: 2 })),
	);
	let cancelled = false;
	const read = client.read.bind(client);
	client.read = (...args) => {
		const stream = read(...args);
		const cancel = stream.cancel.bind(stream);
		stream.cancel = async () => {
			cancelled = true;
			await cancel();
		};
		return stream;
	};
	const adapter = createGeneratedSeaBindingAdapter(client, bindings, "ReadOnly");
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
		await client.close();
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
