/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";

import type { IRequest, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { SummaryType } from "@fluidframework/driver-definitions";
import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
	ISummaryContext,
	ISummaryTree,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import {
	createInspectableStorageAdapter,
	type IInspectableStorageAdapterOptions,
	type ISummaryUploadAttempt,
} from "../inspectableStorageAdapter.js";

/** Raw service state exposed only to the adapter's unit tests. */
interface IStorageConnection {
	/** Independently disposable raw document service. */
	service: IDocumentService;
	/** Raw storage, before any upload observation wrapper. */
	storage: IDocumentStorageService;
	/** Calls received by raw storage, including external-create writes. */
	attempts: Pick<ISummaryUploadAttempt, "summary" | "context">[];
	/** Snapshot fetch options received by this connection. */
	fetches: (ISnapshotFetchOptions | undefined)[];
	/** Sentinel op source used to verify ordinary service delegation. */
	deltaStorage: IDocumentDeltaStorageService;
	/** Whether this connection alone has been disposed. */
	readonly disposed: boolean;
	/** Number of times storage was requested on this service. */
	readonly connectCount: number;
	/** Optional failure injected at the raw upload boundary. */
	set uploadError(error: Error | undefined);
	/** Optional failure injected while reading a snapshot. */
	set snapshotError(error: Error | undefined);
	/** Optional failure injected while opening storage. */
	set connectError(error: Error | undefined);
}

/** Unknown factory capabilities must keep working when the observer only overrides creation methods. */
interface IObservableFactory extends IDocumentServiceFactory {
	/** Live getter backed by private factory state. */
	readonly revision: number;
	/** Unoverridden method backed by the same private state. */
	advanceRevision(): number;
}

/** Driver fixture and observations shared by the generic adapter unit tests. */
interface IStorageDriverFixture {
	/** Complete host configuration passed to the adapter. */
	options: IInspectableStorageAdapterOptions;
	/** Raw factory, including the private-state capability probes. */
	factory: IObservableFactory;
	/** Raw URL resolver, retained for identity checks and failure injection. */
	resolver: IUrlResolver;
	/** All allocated raw connections, in allocation order. */
	services: IStorageConnection[];
	/** Arguments passed to each raw document load. */
	loads: Parameters<IDocumentServiceFactory["createDocumentService"]>[];
	/** Arguments passed to each raw document creation. */
	creates: Parameters<IDocumentServiceFactory["createContainer"]>[];
	/** Requests seen by the URL resolver, including host-specific headers. */
	requests: IRequest[];
	/** Host-owned request returned by the creation callback. */
	createRequest: IRequest;
	/** Arbitrary summary used to demonstrate format independence. */
	summary: ISummaryTree;
	/** Upload parent and checkpoint information which must be passed unchanged. */
	context: ISummaryContext;
	/** Snapshot returned by every fixture storage connection. */
	snapshot: ISnapshot;
	/** Blob body used for storage and detached readBlob receiver checks. */
	blob: ArrayBuffer;
	/** Number of times the explicit host cleanup callback ran. */
	readonly closeCount: number;
	/** Configure whether the resolver accepts the create-new request. */
	set resolveResult(value: IResolvedUrl | undefined);
	/** Inject a failure when deriving a created or loaded document's absolute URL. */
	set urlError(error: Error | undefined);
}

/** An arbitrary non-LocalResolver identity, without pretending to be an authenticated ODSP URL. */
function resolvedUrl(id: string): IResolvedUrl {
	return { type: "fluid", id, url: `test-storage:${id}`, tokens: {}, endpoints: {} };
}

/** Build a driver fixture that rejects incorrect receivers and exposes each independent connection. */
function createDriverFixture(): IStorageDriverFixture {
	const summary: ISummaryTree = { type: SummaryType.Tree, tree: {} };
	const context: ISummaryContext = {
		proposalHandle: "proposal",
		ackHandle: "ack",
		referenceSequenceNumber: 42,
	};
	const snapshot: ISnapshot = {
		snapshotTree: { trees: {}, blobs: {} },
		blobContents: new Map(),
		ops: [],
		sequenceNumber: 42,
		latestSequenceNumber: 42,
		snapshotFormatV: 1,
	};
	const blob = new ArrayBuffer(3);
	const createRequest: IRequest = {
		url: "test-storage:create",
		headers: { createNew: { destination: "host-selected-folder" } },
	};
	const requests: IRequest[] = [];
	let resolveResult: IResolvedUrl | undefined = resolvedUrl("external");
	let urlError: Error | undefined;
	let closeCount = 0;

	/** Preserve URL-resolver receiver identity as well as driver-specific request headers. */
	const resolver: IUrlResolver = {
		async resolve(request) {
			assert.equal(this, resolver);
			requests.push(request);
			return request === createRequest ? resolveResult : resolvedUrl(request.url);
		},
		async getAbsoluteUrl(resolved, relative) {
			assert.equal(this, resolver);
			assert.equal(relative, "");
			if (urlError !== undefined) {
				throw urlError;
			}
			return `test-storage:${resolved.id}`;
		},
	};

	/** Record one raw service/storage pair without any collaboration runtime or backend dependency. */
	function createService(resolved: IResolvedUrl): IStorageConnection {
		let disposed = false;
		let connectCount = 0;
		let uploadError: Error | undefined;
		let snapshotError: Error | undefined;
		let connectError: Error | undefined;
		const attempts: IStorageConnection["attempts"] = [];
		const fetches: (ISnapshotFetchOptions | undefined)[] = [];
		const deltaStorage: IDocumentDeltaStorageService = {
			fetchMessages: () => ({ read: async () => ({ done: true }) }),
		};
		/** Raw storage methods assert the actual storage receiver, including nested overrides. */
		const storage: IDocumentStorageService = {
			async getSnapshotTree() {
				assert.equal(this, storage);
				return snapshot.snapshotTree;
			},
			async getSnapshot(fetchOptions) {
				assert.equal(this, storage);
				fetches.push(fetchOptions);
				if (snapshotError !== undefined) {
					throw snapshotError;
				}
				return snapshot;
			},
			async getVersions() {
				assert.equal(this, storage);
				return [{ id: resolved.id, treeId: "tree" }];
			},
			async uploadSummaryWithContext(uploadedSummary, uploadedContext) {
				assert.equal(this, storage);
				attempts.push({ summary: uploadedSummary, context: uploadedContext });
				if (uploadError !== undefined) {
					throw uploadError;
				}
				return `${resolved.id}-uploaded`;
			},
			async downloadSummary() {
				assert.equal(this, storage);
				return summary;
			},
			async createBlob() {
				assert.equal(this, storage);
				return { id: "blob" };
			},
			async readBlob(id) {
				assert.equal(this, storage);
				assert.equal(id, "blob");
				assert.equal(disposed, false);
				return blob;
			},
		};
		const service: IDocumentService = Object.assign(new EventEmitter(), {
			resolvedUrl: resolved,
			async connectToStorage() {
				assert.equal(this, service);
				connectCount++;
				if (connectError !== undefined) {
					throw connectError;
				}
				return storage;
			},
			async connectToDeltaStorage() {
				assert.equal(this, service);
				return deltaStorage;
			},
			async connectToDeltaStream() {
				assert.equal(this, service);
				assert.fail("The adapter must not open a delta stream for storage inspection");
			},
			dispose() {
				assert.equal(this, service);
				assert.equal(disposed, false, "Each connection should be disposed exactly once");
				disposed = true;
			},
		});
		return {
			service,
			storage,
			attempts,
			fetches,
			deltaStorage,
			get disposed() {
				return disposed;
			},
			get connectCount() {
				return connectCount;
			},
			set uploadError(error: Error | undefined) {
				uploadError = error;
			},
			set snapshotError(error: Error | undefined) {
				snapshotError = error;
			},
			set connectError(error: Error | undefined) {
				connectError = error;
			},
		};
	}

	const services: ReturnType<typeof createService>[] = [];
	const loads: Parameters<IDocumentServiceFactory["createDocumentService"]>[] = [];
	const creates: Parameters<IDocumentServiceFactory["createContainer"]>[] = [];
	/** Future capabilities use private state so a wrapper cannot silently substitute its own receiver. */
	class Factory implements IDocumentServiceFactory {
		/** Mutable backing state verifies that forwarding reads do not snapshot factory properties. */
		#revision = 1;
		/** Driver capabilities must be read against the original instance, not a proxy receiver. */
		public get revision(): number {
			return this.#revision;
		}
		/** An unoverridden method must also retain the original receiver when extracted. */
		public advanceRevision(): number {
			return ++this.#revision;
		}
		/** Create a distinct connection on every load, retaining all factory arguments. */
		public async createDocumentService(
			...args: Parameters<IDocumentServiceFactory["createDocumentService"]>
		): Promise<IDocumentService> {
			assert.equal(this, factory);
			loads.push(args);
			const connection = createService(args[0]);
			services.push(connection);
			return connection.service;
		}
		/** Model driver-side attach uploads so external creation cannot pollute the client journal. */
		public async createContainer(
			...args: Parameters<IDocumentServiceFactory["createContainer"]>
		): Promise<IDocumentService> {
			assert.equal(this, factory);
			creates.push(args);
			const connection = createService(args[1]);
			services.push(connection);
			await connection.storage.uploadSummaryWithContext(args[0] ?? summary, context);
			return connection.service;
		}
	}
	const factory = new Factory();
	const options = {
		documentServiceFactory: factory,
		urlResolver: resolver,
		createCreateNewRequest: async () => createRequest,
		supportsLoadingGroups: false,
		omitsUnrequestedGroupBlobs: false,
		close: async () => {
			closeCount++;
		},
	};
	return {
		options,
		factory,
		resolver,
		services,
		loads,
		creates,
		requests,
		createRequest,
		summary,
		context,
		snapshot,
		blob,
		get closeCount() {
			return closeCount;
		},
		set resolveResult(value: IResolvedUrl | undefined) {
			resolveResult = value;
		},
		set urlError(error: Error | undefined) {
			urlError = error;
		},
	};
}

// Exercise the same generic wrapper used by Memorylicious against unrelated supplied driver objects.
describe("Seed projection reference: inspectable storage adapter", () => {
	// The observer must leave factory flags, live capabilities, method receivers, and storage results intact.
	it("delegates factory, service, and storage calls with their original receivers", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter(fixture.options);
		const factory = adapter.documentServiceFactory as typeof fixture.factory;
		const logger: ITelemetryBaseLogger = { send: () => {} };
		const resolved = resolvedUrl("client");
		assert.equal(adapter.urlResolver, fixture.resolver);
		assert.equal(factory.revision, 1);
		const advance = factory.advanceRevision;
		assert.equal(advance(), 2);
		assert.equal(factory.revision, 2);
		const service = await factory.createDocumentService(resolved, logger, true);
		assert.deepEqual(fixture.loads, [[resolved, logger, true]]);
		try {
			assert.equal(await service.connectToDeltaStorage(), fixture.services[0].deltaStorage);
			const storage = await service.connectToStorage();
			const readBlob = storage.readBlob;
			assert.equal(await readBlob("blob"), fixture.blob);
			assert.equal(await storage.getSnapshotTree(), fixture.snapshot.snapshotTree);
			assert.equal(
				await storage.uploadSummaryWithContext(fixture.summary, fixture.context),
				"client-uploaded",
			);
			assert.equal(adapter.uploads[0].summary, fixture.summary);
			assert.equal(adapter.uploads[0].context, fixture.context);
		} finally {
			service.dispose();
		}
	});

	// Interleaved clients must not inherit the last document opened on the shared factory.
	it("tags successful and failed upload attempts with the correct document", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter(fixture.options);
		const first = await adapter.documentServiceFactory.createDocumentService(
			resolvedUrl("one"),
		);
		const second = await adapter.documentServiceFactory.createDocumentService(
			resolvedUrl("two"),
		);
		try {
			const firstStorage = await first.connectToStorage();
			const secondStorage = await second.connectToStorage();
			const failure = new Error("upload rejected");
			fixture.services[0].uploadError = failure;
			await secondStorage.uploadSummaryWithContext(fixture.summary, fixture.context);
			await assert.rejects(
				firstStorage.uploadSummaryWithContext(fixture.summary, fixture.context),
				(error) => error === failure,
			);
			fixture.services[0].uploadError = undefined;
			await firstStorage.uploadSummaryWithContext(fixture.summary, fixture.context);
			assert.deepEqual(
				adapter.uploads.map((attempt) => attempt.documentUrl),
				["test-storage:two", "test-storage:one", "test-storage:one"],
			);
			assert.equal(fixture.services[0].attempts.length, 2);
		} finally {
			first.dispose();
			second.dispose();
		}
	});

	// Loader-created documents need the same subsequent upload observation as loaded documents.
	it("observes client uploads after factory createContainer without journaling its initial write", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter(fixture.options);
		const logger: ITelemetryBaseLogger = { send: () => {} };
		const resolved = resolvedUrl("attached-client");
		const service = await adapter.documentServiceFactory.createContainer(
			fixture.summary,
			resolved,
			logger,
			false,
		);
		try {
			assert.deepEqual(fixture.creates, [[fixture.summary, resolved, logger, false]]);
			assert.equal(adapter.uploads.length, 0);
			const storage = await service.connectToStorage();
			await storage.uploadSummaryWithContext(fixture.summary, fixture.context);
			assert.equal(adapter.uploads[0].documentUrl, "test-storage:attached-client");
		} finally {
			service.dispose();
		}
	});

	// The host's creation request carries service-specific setup; the raw creation connection is temporary.
	it("uses the supplied creation request and excludes external creation from the journal", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter(fixture.options);
		assert.equal(await adapter.create(fixture.summary), "test-storage:external");
		assert.equal(fixture.requests[0], fixture.createRequest);
		assert.equal(fixture.creates[0][0], fixture.summary);
		assert.equal(fixture.services[0].disposed, true);
		assert.equal(fixture.services[0].attempts.length, 1);
		assert.equal(adapter.uploads.length, 0);
		await adapter.close();
		assert.equal(fixture.closeCount, 1);
	});

	// Group-fetch support and omission of unrequested bodies are different backend guarantees.
	it("preserves explicit group flags and forwards snapshot version and loading groups unchanged", async () => {
		for (const flags of [
			{ supportsLoadingGroups: false, omitsUnrequestedGroupBlobs: false },
			{ supportsLoadingGroups: true, omitsUnrequestedGroupBlobs: false },
			{ supportsLoadingGroups: true, omitsUnrequestedGroupBlobs: true },
		]) {
			const fixture = createDriverFixture();
			const adapter = createInspectableStorageAdapter({ ...fixture.options, ...flags });
			assert.equal(adapter.supportsLoadingGroups, flags.supportsLoadingGroups);
			assert.equal(adapter.omitsUnrequestedGroupBlobs, flags.omitsUnrequestedGroupBlobs);
			const groups = flags.supportsLoadingGroups ? ["readable"] : undefined;
			const inspection = await adapter.inspect("document", "version", groups);
			try {
				assert.equal(inspection.snapshot, fixture.snapshot);
				assert.deepEqual(fixture.services[0].fetches, [
					{ versionId: "version", loadingGroupIds: groups },
				]);
				assert.equal(fixture.services[0].fetches[0]?.loadingGroupIds, groups);
			} finally {
				inspection.dispose();
			}
		}
	});

	// Inspection must not use a client's storage, own its lifetime, or wrap its readBlob receiver.
	it("opens independent inspection connections and disposes only the requested connection", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter(fixture.options);
		const client = await adapter.documentServiceFactory.createDocumentService(
			resolvedUrl("doc"),
		);
		try {
			const first = await adapter.inspect("doc");
			const second = await adapter.inspect("doc");
			assert.equal(fixture.services.length, 3);
			assert.equal(fixture.services[0].connectCount, 0);
			assert.deepEqual(fixture.services[1].fetches, [
				{ versionId: undefined, loadingGroupIds: undefined },
			]);
			try {
				first.dispose();
				assert.equal(fixture.services[1].disposed, true);
				assert.equal(fixture.services[0].disposed, false);
				assert.equal(fixture.services[2].disposed, false);
				assert.equal(await second.readBlob("blob"), fixture.blob);
				const storage = await client.connectToStorage();
				assert.equal(await storage.readBlob("blob"), fixture.blob);
				assert.equal(adapter.uploads.length, 0);
			} finally {
				second.dispose();
			}
		} finally {
			client.dispose();
		}
	});

	// A resolver may decline a request, which must fail before a document service is allocated.
	it("rejects unresolved create and inspection requests without allocating a connection", async () => {
		const fixture = createDriverFixture();
		fixture.resolveResult = undefined;
		const adapter = createInspectableStorageAdapter(fixture.options);
		await assert.rejects(adapter.create(fixture.summary), /create-new request/);
		fixture.resolver.resolve = async () => undefined;
		await assert.rejects(adapter.inspect("unsupported"), /inspection URL/);
		assert.equal(fixture.services.length, 0);
	});

	// Identity lookup failure must close both external-create and newly opened client services.
	it("disposes allocated services if absolute URL lookup fails", async () => {
		const fixture = createDriverFixture();
		const failure = new Error("absolute URL unavailable");
		fixture.urlError = failure;
		const adapter = createInspectableStorageAdapter(fixture.options);
		await assert.rejects(adapter.create(fixture.summary), (error) => error === failure);
		await assert.rejects(
			adapter.documentServiceFactory.createDocumentService(resolvedUrl("client")),
			(error) => error === failure,
		);
		await assert.rejects(
			adapter.documentServiceFactory.createContainer(fixture.summary, resolvedUrl("attach")),
			(error) => error === failure,
		);
		assert(fixture.services.every((connection) => connection.disposed));
		assert.equal(adapter.uploads.length, 0);
	});

	// Both connection and snapshot failures must release the otherwise unreachable inspection service.
	it("disposes inspection connections when storage connection or snapshot fetch fails", async () => {
		for (const stage of ["connect", "snapshot", "unsupported"]) {
			const fixture = createDriverFixture();
			const failure = new Error(`${stage} failed`);
			const original = fixture.factory.createDocumentService.bind(fixture.factory);
			fixture.factory.createDocumentService = async (...args) => {
				const service = await original(...args);
				if (stage === "connect") {
					fixture.services[0].connectError = failure;
				} else if (stage === "snapshot") {
					fixture.services[0].snapshotError = failure;
				} else {
					delete fixture.services[0].storage.getSnapshot;
				}
				return service;
			};
			const adapter = createInspectableStorageAdapter(fixture.options);
			await assert.rejects(
				adapter.inspect("doc"),
				stage === "unsupported"
					? /does not support getSnapshot/
					: (error) => error === failure,
			);
			assert.equal(fixture.services[0].disposed, true);
			assert.equal(adapter.uploads.length, 0);
		}
	});

	// Borrowing a configured factory requires neither an invented disposal API nor ownership of the host.
	it("allows borrowed factories without a close callback", async () => {
		const fixture = createDriverFixture();
		const adapter = createInspectableStorageAdapter({ ...fixture.options, close: undefined });
		await adapter.close();
		assert.equal(fixture.closeCount, 0);
	});
});
