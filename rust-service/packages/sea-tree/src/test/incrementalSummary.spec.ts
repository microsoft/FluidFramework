/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";

import {
	createIdCompressor,
	serializeIdCompressor,
} from "@fluidframework/id-compressor/internal";
import {
	SeaDocumentStorage,
	SeaSessionDriverClient,
} from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import {
	SchemaFactoryAlpha,
	FluidClientVersion,
	TreeCompressionStrategy,
	TreeViewConfigurationAlpha,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
} from "@fluidframework/tree/alpha";
import { createDirectSharedTree, ForestTypeOptimized } from "@fluidframework/tree/internal";

import { DirectSharedTreeClient } from "../index.js";

const sf = new SchemaFactoryAlpha("direct-incremental-test");
/** Distinct text regions make uploaded bytes and chunk reuse observable. */
class Items extends sf.array("Items", sf.string) {}
/** Each field supplies an independently reusable chunk boundary. */
class State extends sf.object("State", {
	left: sf.types([Items], { custom: { [incrementalSummaryHint]: true } }),
	right: sf.types([Items], { custom: { [incrementalSummaryHint]: true } }),
}) {}
const configuration = new TreeViewConfigurationAlpha({ schema: State });
type Summary = ReturnType<DirectSharedTreeClient["tree"]["kernel"]["getSummary"]>;
type SummaryContext = Parameters<DirectSharedTreeClient["tree"]["kernel"]["getSummary"]>[0];

/** Collects references without expanding the immutable content they represent. */
function handles(summary: Summary): { path: string; tree: boolean }[] {
	return Object.values(summary.tree).flatMap((object) =>
		object.type === 1
			? handles(object)
			: object.type === 3
				? [{ path: object.handle, tree: object.handleType === 1 }]
				: [],
	);
}

/** Expands the same persisted snapshot for a full-upload control with identical contents. */
async function expand(client: SeaSessionDriverClient, root: Uint8Array): Promise<Summary> {
	const summary: Summary = { type: 1, tree: {} };
	for (const { name, child } of await client.fetchDirectory(root)) {
		summary.tree[name] =
			child.kind === "directory"
				? await expand(client, child.bytes)
				: { type: 2, content: await client.fetchBlob(child.bytes) };
	}
	return summary;
}

/** Waits for peer delivery and nomination without an unbounded test hang. */
async function until(condition: () => boolean): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (!condition()) {
		assert.ok(Date.now() < deadline, "timed out waiting for direct client");
		await delay(5);
	}
}

describe("DirectSharedTreeClient incremental summaries", () => {
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

	/** Opens an instrumented client and registers its resources for cleanup. */
	async function open(document?: Uint8Array, clientSelected = false, bulkReads = true) {
		const driver = new SeaSessionDriverClient(
			service.open,
			clientSelected ? "clientSelected" : "seaSelected",
		);
		if (!bulkReads) Object.defineProperty(driver, "fetchBlobs", { value: undefined });
		const host = await DirectSharedTreeClient.create(
			driver,
			document ?? new Uint8Array(),
			4,
			1024 * 1024,
			document === undefined,
			{
				summaryIdleMs: 60_000,
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(configuration),
			},
		);
		clients.push(host);
		const view = host.tree.viewWith(configuration);
		views.push(view);
		if (document === undefined) {
			view.initialize({
				left: Array.from({ length: 20 }, (_, i) => `left-${i}-${"a".repeat(1024)}`),
				right: Array.from({ length: 20 }, (_, i) => `right-${i}-${"b".repeat(1024)}`),
			});
			await host.waitForIdle();
		}
		const summaries: {
			summary: Summary;
			context: SummaryContext;
			full: boolean | undefined;
		}[] = [];
		const getSummary = host.tree.kernel.getSummary.bind(host.tree.kernel);
		host.tree.kernel.getSummary = (context, full) => {
			const summary = getSummary(context, full);
			summaries.push({ summary, context, full });
			return summary;
		};
		const blobs: { id: Uint8Array; bytes: number }[] = [];
		const directories: Uint8Array[] = [];
		const uploadBlob = driver.uploadBlob.bind(driver);
		driver.uploadBlob = async (payload) => {
			const result = await uploadBlob(payload);
			blobs.push({ id: result.digest, bytes: payload.byteLength });
			return result;
		};
		const uploadDirectory = driver.uploadDirectory.bind(driver);
		driver.uploadDirectory = async (entries) => {
			const id = await uploadDirectory(entries);
			directories.push(id);
			return id;
		};
		return { driver, host, view, summaries, blobs, directories };
	}

	it("loads all snapshot blobs in one deduplicated bulk read without relying on the cache", async () => {
		const writer = await open();
		await writer.host.summarize();
		const driver = new SeaSessionDriverClient(service.open, "readOnly", {
			loadingHint: { includeDescendantBlobs: false, maxExtraItems: 4096 },
			contentCacheObjects: 0,
		});
		let batches = 0;
		const fetchBlobs = driver.fetchBlobs.bind(driver);
		driver.fetchBlobs = async (ids) => {
			batches++;
			assert.equal(new Set(ids.map((id) => Buffer.from(id).toString("hex"))).size, ids.length);
			return fetchBlobs(ids);
		};
		driver.fetchBlob = async () =>
			assert.fail("SharedTree must use the retained bulk results");
		const host = await DirectSharedTreeClient.create(
			driver,
			writer.host.documentId,
			4,
			1024 * 1024,
			false,
		);
		clients.push(host);
		const view = host.tree.viewWith(configuration);
		views.push(view);
		assert.deepEqual([...view.root.left], [...writer.view.root.left]);
		assert.deepEqual([...view.root.right], [...writer.view.root.right]);
		assert.equal(batches, 1);
	});

	it("reports bulk loading failures and closes the failed client", async () => {
		const writer = await open();
		await writer.host.summarize();
		const driver = new SeaSessionDriverClient(service.open, "readOnly");
		const failure = new Error("bulk snapshot unavailable");
		driver.fetchBlobs = async () => {
			throw failure;
		};
		try {
			await assert.rejects(
				DirectSharedTreeClient.create(driver, writer.host.documentId, 4, 1024 * 1024, false),
				(error) => error === failure,
			);
			await driver.reconnect();
			assert.equal(driver.sessionId, undefined);
		} finally {
			driver.disconnect();
			await driver.reconnect();
		}
	});

	it("loads through individual reads when the supplied client has no bulk API", async () => {
		const writer = await open();
		await writer.host.summarize();
		const reader = await open(writer.host.documentId, false, false);
		assert.equal(reader.host.loadedFromSummary, true);
		assert.deepEqual([...reader.view.root.left], [...writer.view.root.left]);
		assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
	});

	it("uploads less, preserves untouched directory IDs, and reuses chunks immediately after reload", async () => {
		const writer = await open();
		await writer.host.summarize();
		const first = writer.summaries[0];
		assert.ok(first);
		assert.equal(first.full, true);
		assert.deepEqual(handles(first.summary), []);
		const baseline = await writer.driver.latestSnapshot();
		assert.ok(baseline);
		writer.blobs.length = 0;
		writer.directories.length = 0;
		writer.view.root.left.insertAtEnd("changed left");
		await writer.host.waitForIdle();
		await writer.host.summarize();
		const second = writer.summaries[1];
		assert.ok(second);
		assert.equal(second.full, false);
		assert.equal(
			second.context?.latestSummarySequenceNumber,
			first.context?.summarySequenceNumber,
		);
		const reused = handles(second.summary).filter((handle) => handle.tree);
		assert.ok(reused.length > 0, "unchanged forest chunks must be handles");
		for (const handle of reused) {
			let id = baseline.root;
			for (const segment of handle.path.split("/").filter((part) => part !== "")) {
				const entry = (await writer.driver.fetchDirectory(id)).find(
					(child) => child.name === segment,
				);
				assert.equal(entry?.child.kind, "directory");
				assert.ok(entry);
				id = entry.child.bytes;
			}
			assert.ok(
				!writer.directories.some((uploaded) => Buffer.from(uploaded).equals(id)),
				"reused directories must not be reuploaded",
			);
		}
		const incrementalBytes = writer.blobs.reduce((sum, blob) => sum + blob.bytes, 0);
		const incrementalDirectories = writer.directories.length;
		const snapshot = await writer.driver.latestSnapshot();
		assert.ok(snapshot);
		const full = await expand(writer.driver, snapshot.root);
		writer.blobs.length = 0;
		writer.directories.length = 0;
		assert.deepEqual(
			await new SeaDocumentStorage(writer.driver).uploadSummaryTree(full),
			snapshot.root,
			"the full-upload control must represent exactly the same state",
		);
		const fullBytes = writer.blobs.reduce((sum, blob) => sum + blob.bytes, 0);
		assert.ok(
			incrementalBytes < fullBytes * 0.75,
			`${incrementalBytes} must be below 75% of ${fullBytes}`,
		);
		assert.ok(incrementalDirectories < writer.directories.length);

		const reader = await open(writer.host.documentId);
		assert.deepEqual([...reader.view.root.left], [...writer.view.root.left]);
		assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
		writer.host.disconnect();
		await until(() => reader.driver.canPublishSnapshot);
		reader.view.root.left.insertAtEnd("changed after reload");
		await reader.host.waitForIdle();
		await reader.host.summarize();
		assert.equal(reader.summaries[0]?.full, false);
		assert.ok(reader.summaries[0]);
		assert.ok(handles(reader.summaries[0].summary).some((handle) => handle.tree));
		const third = await open(writer.host.documentId);
		assert.deepEqual([...third.view.root.left], [...reader.view.root.left]);
		assert.deepEqual([...third.view.root.right], [...reader.view.root.right]);
	});

	for (const failure of ["upload", "before publication", "after publication"] as const) {
		it(`keeps the confirmed baseline after failure ${failure}`, async () => {
			const writer = await open();
			await writer.host.summarize();
			const confirmed = writer.summaries[0]?.context?.summarySequenceNumber;
			writer.view.root.left.insertAtEnd("first change");
			await writer.host.waitForIdle();
			const upload = writer.driver.uploadBlob.bind(writer.driver);
			const publish = writer.driver.publishSnapshotRoot.bind(writer.driver);
			if (failure === "upload") {
				writer.driver.uploadBlob = async () => {
					throw new Error("injected summary failure");
				};
			} else {
				writer.driver.publishSnapshotRoot = async (...args) => {
					if (failure === "after publication") await publish(...args);
					throw new Error("injected summary failure");
				};
			}
			await assert.rejects(writer.host.summarize(), /injected summary failure/u);
			assert.equal(writer.host.summaryCount, 1);
			writer.driver.uploadBlob = upload;
			writer.driver.publishSnapshotRoot = publish;
			await writer.host.summarize();
			if (failure === "after publication") {
				assert.equal(
					writer.host.summaryCount,
					1,
					"observing publication is not acknowledgment",
				);
			}
			writer.view.root.left.insertAtEnd("second change");
			await writer.host.waitForIdle();
			await writer.host.summarize();
			assert.equal(writer.summaries[2]?.context?.latestSummarySequenceNumber, confirmed);
			assert.ok(writer.summaries[2]);
			assert.ok(handles(writer.summaries[2].summary).some((handle) => handle.tree));
			const reader = await open(writer.host.documentId);
			assert.deepEqual([...reader.view.root.left], [...writer.view.root.left]);
			assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
		});
	}

	it("does not adopt a peer's different summary at the same sequence as a failed candidate", async () => {
		const writer = await open(undefined, true);
		await writer.host.summarize();
		const confirmed = writer.summaries[0]?.context?.summarySequenceNumber;
		const peer = await open(writer.host.documentId, true);
		writer.view.root.left.insertAtEnd("shared edit");
		await writer.host.waitForIdle();
		await until(
			() => peer.host.lastAppliedSequenceNumber === writer.host.lastAppliedSequenceNumber,
		);
		const publish = writer.driver.publishSnapshotRoot.bind(writer.driver);
		let failedRoot: Uint8Array | undefined;
		writer.driver.publishSnapshotRoot = async (_parent, _position, root) => {
			failedRoot = root;
			throw new Error("injected publication failure");
		};
		await assert.rejects(writer.host.summarize(), /injected publication failure/u);
		writer.driver.publishSnapshotRoot = publish;
		// A full peer candidate deliberately has different paths from the failed incremental one.
		const getSummary = peer.host.tree.kernel.getSummary.bind(peer.host.tree.kernel);
		peer.host.tree.kernel.getSummary = (context) => getSummary(context, true);
		await peer.host.summarize();
		const peerSnapshot = await peer.driver.latestSnapshot();
		assert.ok(peerSnapshot);
		assert.notDeepEqual(peerSnapshot.root, failedRoot);
		assert.equal(
			peer.summaries[0]?.context?.summarySequenceNumber,
			writer.summaries[1]?.context?.summarySequenceNumber,
		);
		writer.view.root.left.insertAtEnd("edit after peer publication");
		await writer.host.waitForIdle();
		await writer.host.summarize();
		assert.equal(writer.summaries[2]?.context?.latestSummarySequenceNumber, confirmed);
		const reader = await open(writer.host.documentId, true);
		assert.deepEqual([...reader.view.root.left], [...writer.view.root.left]);
		assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
	});

	for (const version of [2, 3]) {
		it(`loads version ${version} summaries and establishes a new full baseline before reusing chunks`, async () => {
			const writer = await open();
			const compressor = createIdCompressor();
			let sequenceNumber = -1;
			// Replay through the previous host's configuration, not just a relabeled new snapshot.
			const legacy = createDirectSharedTree({
				forest: ForestTypeOptimized,
				...(version === 3
					? {
							treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
							minVersionForCollab: FluidClientVersion.v2_74,
							shouldEncodeIncrementally:
								incrementalEncodingPolicyForAllowedTypes(configuration),
						}
					: {}),
				idCompressor: compressor,
				lastSequenceNumber: () => sequenceNumber,
				submitLocalMessage: () =>
					assert.fail("legacy fixture only replays canonical messages"),
			});
			const page = await writer.driver.readProjected();
			for (const operation of page.operations) {
				sequenceNumber = Number(operation.sequenceNumber);
				if (operation.eventType !== "application") continue;
				const payload = JSON.parse(new TextDecoder().decode(operation.payload)) as Pick<
					Parameters<typeof legacy.kernel.processSequencedMessages>[0][number],
					"contents" | "idCreationRange"
				>;
				legacy.kernel.processSequencedMessages([
					{
						...payload,
						sequenceNumber,
						referenceSequenceNumber:
							operation.reference === undefined
								? -1
								: Number(new DataView(operation.reference.slice().buffer).getBigUint64(0)),
						minimumSequenceNumber: Number(operation.minimumSequenceNumber ?? -1n),
						local: false,
					},
				]);
			}
			assert.equal(sequenceNumber, writer.host.lastAppliedSequenceNumber);
			const summary = legacy.kernel.getSummary();
			assert.deepEqual(handles(summary), []);
			summary.tree[".sea-direct"] = {
				type: 2,
				content: JSON.stringify({
					version,
					sequenceNumber,
					compressor: serializeIdCompressor(compressor, false),
				}),
			};
			const root = await new SeaDocumentStorage(writer.driver).uploadSummaryTree(summary);
			await writer.driver.publishSnapshotRoot(undefined, page.cursor, root);
			const reader = await open(writer.host.documentId);
			assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
			writer.host.disconnect();
			await until(() => reader.driver.canPublishSnapshot);
			reader.view.root.left.insertAtEnd("migration");
			await reader.host.waitForIdle();
			await reader.host.summarize();
			assert.equal(reader.summaries[0]?.full, true);
			assert.ok(reader.summaries[0]);
			assert.deepEqual(handles(reader.summaries[0].summary), []);
			reader.view.root.left.insertAtEnd("incremental after migration");
			await reader.host.waitForIdle();
			await reader.host.summarize();
			assert.ok(reader.summaries[1]);
			assert.ok(handles(reader.summaries[1].summary).some((handle) => handle.tree));
			const loaded = await open(writer.host.documentId);
			assert.deepEqual([...loaded.view.root.left], [...reader.view.root.left]);
		});
	}

	it("starts a full baseline when a nominee has only observed another client's summary", async () => {
		const writer = await open();
		const peer = await open(writer.host.documentId);
		await writer.host.summarize();
		writer.host.disconnect();
		await until(() => peer.driver.canPublishSnapshot);
		peer.view.root.left.insertAtEnd("new nominee");
		await peer.host.waitForIdle();
		await peer.host.summarize();
		assert.equal(peer.summaries[0]?.full, true);
		assert.ok(peer.summaries[0]);
		assert.deepEqual(handles(peer.summaries[0].summary), []);
		const reader = await open(writer.host.documentId);
		assert.deepEqual([...reader.view.root.left], [...peer.view.root.left]);
		assert.deepEqual([...reader.view.root.right], [...peer.view.root.right]);
	});

	it("retains its confirmed baseline when reconnect cancels an upload", async () => {
		const writer = await open();
		await writer.host.summarize();
		const confirmed = writer.summaries[0]?.context?.summarySequenceNumber;
		writer.view.root.left.insertAtEnd("before cancellation");
		await writer.host.waitForIdle();
		const upload = writer.driver.uploadDirectory.bind(writer.driver);
		writer.driver.uploadDirectory = async (entries) => {
			const id = await upload(entries);
			writer.host.disconnect();
			return id;
		};
		await assert.rejects(writer.host.summarize(), /SEA session is not open/u);
		assert.equal(writer.host.summaryCount, 1);
		writer.driver.uploadDirectory = upload;
		await writer.host.reconnect();
		writer.view.root.left.insertAtEnd("after reconnect");
		await writer.host.waitForIdle();
		await writer.host.summarize();
		assert.equal(writer.summaries[2]?.context?.latestSummarySequenceNumber, confirmed);
		const reader = await open(writer.host.documentId);
		assert.deepEqual([...reader.view.root.left], [...writer.view.root.left]);
		assert.deepEqual([...reader.view.root.right], [...writer.view.root.right]);
	});
});
