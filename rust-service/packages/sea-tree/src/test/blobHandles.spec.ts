/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";

import type { IFluidHandle } from "@fluidframework/core-interfaces/internal";
import { SeaSessionDriverClient } from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import {
	SchemaFactoryAlpha,
	TreeViewConfigurationAlpha,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
} from "@fluidframework/tree/alpha";

import { DirectSharedTreeClient } from "../index.js";
import { BlobHandles, byteKey } from "../blobHandles.js";

const sf = new SchemaFactoryAlpha("direct-blob-tests");
class Handles extends sf.array("Handles", sf.handle) {}
class State extends sf.object("State", {
	handles: sf.types([Handles], { custom: { [incrementalSummaryHint]: true } }),
	text: sf.string,
}) {}
const configuration = new TreeViewConfigurationAlpha({ schema: State });
const bytes = new Uint8Array([3, 5, 7, 11]);

async function until(condition: () => boolean): Promise<void> {
	const deadline = Date.now() + 5000;
	while (!condition()) {
		assert.ok(Date.now() < deadline, "timed out waiting for blob state");
		await delay(5);
	}
}

async function read(handle: IFluidHandle | undefined): Promise<Uint8Array> {
	assert.ok(handle);
	const buffer = await handle.get();
	assert.ok(buffer instanceof ArrayBuffer);
	return new Uint8Array(buffer);
}

describe("DirectSharedTreeClient blob handles", () => {
	let service: Awaited<ReturnType<typeof createMemoryService>>;
	const hosts: DirectSharedTreeClient[] = [];
	const views: { dispose(): void }[] = [];

	beforeEach(async () => {
		service = await createMemoryService({ environment: "node" });
	});
	afterEach(async () => {
		for (const view of views.splice(0)) view.dispose();
		await Promise.all(hosts.splice(0).map(async (host) => host.dispose()));
		service.close();
	});

	async function open(document?: Uint8Array, eager = false, bulk = true) {
		const driver = new SeaSessionDriverClient(service.open, "seaSelected", {
			contentCacheObjects: 0,
		});
		const reads: string[] = [];
		const fetch = driver.fetchBlob.bind(driver);
		driver.fetchBlob = async (id) => {
			reads.push(byteKey(id));
			return fetch(id);
		};
		const fetchMany = driver.fetchBlobs.bind(driver);
		driver.fetchBlobs = async (ids) => {
			reads.push(...ids.map(byteKey));
			return fetchMany(ids);
		};
		if (!bulk) Object.defineProperty(driver, "fetchBlobs", { value: undefined });
		const host = await DirectSharedTreeClient.create(
			driver,
			document ?? new Uint8Array(),
			64,
			1024 * 1024,
			document === undefined,
			{
				blobLoading: eager ? "eager" : "lazy",
				summaryIdleMs: 60_000,
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(configuration),
			},
		);
		hosts.push(host);
		const view = host.tree.viewWith(configuration);
		views.push(view);
		if (document === undefined) {
			view.initialize({ handles: [], text: "initial" });
			await host.waitForIdle();
		}
		return { host, view, driver, reads };
	}

	it("returns pending handles immediately, gates submission, and exposes successful upload", async () => {
		const writer = await open();
		const upload = writer.driver.uploadBlob.bind(writer.driver);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		writer.driver.uploadBlob = async (payload) => {
			await gate;
			return upload(payload);
		};
		const source = bytes.slice();
		const handle = writer.host.createBlob(source);
		source.fill(0);
		assert.equal(handle.payloadState, "pending");
		assert.deepEqual(new Uint8Array(await handle.get()), bytes);
		let shared = 0;
		handle.events.on("payloadShared", () => {
			shared++;
		});
		let submitted = false;
		const submit = writer.driver.submitEvent.bind(writer.driver);
		writer.driver.submitEvent = async (...args) => {
			submitted = true;
			assert.ok(args[2], "application event must retain a native blob tree");
			const references = await writer.driver.fetchSummary(args[2]);
			assert.equal(references.length, 1);
			return submit(...args);
		};
		writer.view.root.handles.insertAtEnd(handle);
		await delay(10);
		assert.equal(submitted, false);
		release();
		await writer.host.waitForIdle();
		assert.equal(handle.payloadState, "shared");
		assert.equal(shared, 1);
		assert.equal(submitted, true);
	});

	it("resolves handles delivered by live operations without reading their payloads", async () => {
		const writer = await open();
		const reader = await open(writer.host.documentId);
		const handle = writer.host.createBlob(bytes);
		writer.view.root.handles.insertAtEnd(handle);
		await writer.host.waitForIdle();
		await until(() => reader.view.root.handles.length === 1);
		assert.equal(reader.reads.length, 0);
		assert.deepEqual(await read(reader.view.root.handles[0]), bytes);
		assert.equal(reader.reads.length, 1);
	});

	for (const eager of [false, true]) {
		for (const bulk of [false, true]) {
			it(`loads with ${eager ? "eager" : "lazy"} payloads and ${bulk ? "bulk" : "individual"} reads`, async () => {
				const writer = await open();
				const handle = writer.host.createBlob(bytes);
				const unused = writer.host.createBlob(new Uint8Array([23, 29]));
				await until(() => unused.payloadState === "shared");
				writer.view.root.handles.insertAtEnd(handle, handle);
				await writer.host.waitForIdle();
				await writer.host.summarize();
				const snapshot = await writer.driver.latestSnapshot();
				assert.ok(snapshot);
				const entries = await writer.driver.fetchSummary(snapshot.root);
				const references = entries.filter((entry) =>
					new TextDecoder().decode(entry.path).includes("/.handles/"),
				);
				assert.ok(references.length > 0);
				assert.equal(
					new Set(references.map((entry) => byteKey(entry.blob))).size,
					1,
					"unreferenced uploads must not become snapshot edges",
				);
				const reference = references[0];
				assert.ok(reference);
				const digest = byteKey(reference.blob);
				const reader = await open(writer.host.documentId, eager, bulk);
				assert.equal(reader.reads.includes(digest), eager);
				const first = reader.view.root.handles[0];
				const second = reader.view.root.handles[1];
				assert.ok(first);
				assert.ok(second);
				assert.equal(first, second, "aliases resolve to one live handle");
				const readsBefore = reader.reads.length;
				if (eager) {
					reader.driver.fetchBlob = async () =>
						assert.fail("eager data must survive cache eviction");
					reader.host.disconnect();
				}
				const [a, b] = await Promise.all([read(first), read(second)]);
				assert.deepEqual(a, bytes);
				assert.deepEqual(b, bytes);
				a.fill(0);
				assert.deepEqual(b, bytes);
				assert.equal(reader.reads.length - readsBefore, eager ? 0 : 1);
				await reader.host.dispose();
				assert.deepEqual(await read(first), bytes);
			});
		}
	}

	it("preserves blob-reference edges through incremental reuse and reload", async () => {
		const writer = await open();
		writer.view.root.handles.insertAtEnd(writer.host.createBlob(bytes));
		await writer.host.waitForIdle();
		await writer.host.summarize();
		writer.view.root.text = "changed";
		await writer.host.waitForIdle();
		await writer.host.summarize();
		const reader = await open(writer.host.documentId);
		assert.deepEqual(await read(reader.view.root.handles[0]), bytes);
		writer.host.disconnect();
		await until(() => reader.driver.canPublishSnapshot);
		reader.view.root.text = "changed after reload";
		await reader.host.waitForIdle();
		await reader.host.summarize();
		const third = await open(writer.host.documentId);
		assert.deepEqual(await read(third.view.root.handles[0]), bytes);
	});

	it("reports failed uploads, retains local bytes, and permits explicit retries", async () => {
		const writer = await open();
		const upload = writer.driver.uploadBlob.bind(writer.driver);
		const failure = new Error("upload unavailable");
		writer.driver.uploadBlob = async () => {
			throw failure;
		};
		const handle = writer.host.createBlob(bytes);
		let observed: unknown;
		handle.events.on("payloadShareFailed", (error) => {
			observed = error;
		});
		await until(() => observed !== undefined);
		assert.equal(observed, failure);
		assert.equal(handle.payloadShareError, failure);
		assert.equal(handle.payloadState, "pending");
		assert.deepEqual(await read(handle), bytes);
		writer.driver.uploadBlob = upload;
		handle.sharePayload?.();
		await until(() => handle.payloadState === "shared");
		assert.equal(handle.payloadShareError, undefined);
	});

	it("retains references needed by edit history after removing a visible handle", async () => {
		const writer = await open();
		// The idle peer keeps the minimum sequence before the insert and removal.
		await open(writer.host.documentId);
		writer.view.root.handles.insertAtEnd(writer.host.createBlob(bytes));
		await writer.host.waitForIdle();
		writer.view.root.handles.removeAt(0);
		await writer.host.waitForIdle();
		await writer.host.summarize();
		const snapshot = await writer.driver.latestSnapshot();
		assert.ok(snapshot);
		const entries = await writer.driver.fetchSummary(snapshot.root);
		assert.ok(
			entries.some((entry) => new TextDecoder().decode(entry.path).includes("/.handles/")),
		);
		const loaded = await open(writer.host.documentId);
		assert.equal(loaded.view.root.handles.length, 0);
		assert.equal(loaded.host.loadedFromSummary, true);
	});

	it("keeps late upload errors on the handle without overwriting disposed-host status", async () => {
		const writer = await open();
		let reject!: (error: Error) => void;
		let admitted = false;
		writer.driver.uploadBlob = async () => {
			admitted = true;
			return new Promise((_, fail) => {
				reject = fail;
			});
		};
		const handle = writer.host.createBlob(bytes);
		await until(() => admitted);
		await writer.host.dispose();
		const failure = new Error("late upload failure");
		reject(failure);
		await until(() => handle.payloadShareError === failure);
		assert.equal(writer.host.lastError, undefined);
		assert.deepEqual(await read(handle), bytes);
	});

	it("supports offline creation, reconnect submission, and copying retained bytes after disposal", async () => {
		const writer = await open();
		writer.host.disconnect();
		const handle = writer.host.createBlob(bytes);
		writer.view.root.handles.insertAtEnd(handle);
		assert.deepEqual(await read(handle), bytes);
		await writer.host.reconnect();
		await writer.host.waitForIdle();
		const reader = await open(writer.host.documentId);
		assert.deepEqual(await read(reader.view.root.handles[0]), bytes);
		await writer.host.dispose();
		const other = await open();
		other.view.root.handles.insertAtEnd(other.host.createBlob(await read(handle)));
		await other.host.waitForIdle();
		await other.host.summarize();
		const loaded = await open(other.host.documentId);
		assert.deepEqual(await read(loaded.view.root.handles[0]), bytes);
	});

	it("allows retrying failed lazy reads without poisoning the handle cache", async () => {
		const writer = await open();
		writer.view.root.handles.insertAtEnd(writer.host.createBlob(bytes));
		await writer.host.waitForIdle();
		await writer.host.summarize();
		const reader = await open(writer.host.documentId);
		const handle = reader.view.root.handles[0];
		assert.ok(handle);
		reader.host.disconnect();
		await assert.rejects(handle.get(), /Blob transport is disconnected/u);
		await reader.host.reconnect();
		const fetch = reader.driver.fetchBlob.bind(reader.driver);
		reader.driver.fetchBlob = async () => {
			throw new Error("read unavailable");
		};
		await assert.rejects(handle.get(), /read unavailable/u);
		reader.driver.fetchBlob = fetch;
		assert.deepEqual(await read(handle), bytes);
	});

	it("rejects foreign-document handles rather than publishing an unresolvable reference", async () => {
		const writer = await open();
		const other = await open();
		const handle = other.host.createBlob(bytes);
		await until(() => handle.payloadState === "shared");
		const serializer = new BlobHandles(
			writer.driver,
			writer.host.documentId,
			() => {},
			() => {},
			() => 0,
		);
		assert.throws(() => serializer.encodeMessage(handle), /same document/u);
	});

	for (const point of ["before", "after"] as const) {
		it(`recovers blob-bearing edits after a failure ${point} submission`, async () => {
			const writer = await open();
			const submit = writer.driver.submitEvent.bind(writer.driver);
			let failed = false;
			writer.driver.submitEvent = async (...args) => {
				if (failed) return submit(...args);
				failed = true;
				if (point === "after") await submit(...args);
				throw new Error("Injected submission failure");
			};
			writer.view.root.handles.insertAtEnd(writer.host.createBlob(bytes));
			await writer.host.waitForIdle();
			assert.equal(failed, true);
			const reader = await open(writer.host.documentId);
			assert.equal(reader.view.root.handles.length, 1);
			assert.deepEqual(await read(reader.view.root.handles[0]), bytes);
		});
	}
});
