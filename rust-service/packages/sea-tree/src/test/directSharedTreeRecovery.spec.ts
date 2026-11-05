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
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
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
			cancel: () => subscription.cancel(),
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
		const reader = await open(writer.host.documentId);
		assert.equal(reader.host.loadedFromSummary, true);
		assert.deepEqual([...reader.view.root.items], ["before snapshot", "after snapshot"]);
		reader.view.root.items.insertAtEnd("reader edit");
		await reader.host.waitForIdle();
		await until(
			() => writer.view.root.items.length === 3,
			"writer did not receive loaded peer edit",
		);
		assert.deepEqual([...writer.view.root.items], [...reader.view.root.items]);
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
