/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IContainer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import { loadContainerToSequenceNumber } from "@fluidframework/container-loader/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IClient,
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentServicePolicies,
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ITestFluidObject,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	createAndAttachContainerUsingProps,
	createLoaderProps,
} from "@fluidframework/test-utils/internal";

/**
 * Optional white-box hook into the bounded replay. Lets a test observe both what the loader asks
 * delta storage for and what actually comes back, so the "no op past the target is ever fetched"
 * guarantee can be verified at the data level rather than inferred from the resulting state.
 */
interface ReplayInstrumentation {
	/** Raw upper bound the loader passed to `fetchMessages`, before this service clamps it. */
	recordRequestedTo(to: number | undefined): void;
	/** Sequence number of an op actually handed back to the loader. */
	recordReturnedOp(sequenceNumber: number): void;
}

/**
 * A read-only document service that materializes a document at a target sequence number by serving
 * the base snapshot and bounding delta storage so no op past the target is fetched.
 *
 * @remarks
 * This mirrors the ODSP point-in-time service (`OdspPointInTimeDocumentService`) but wraps a single
 * inner service, which is sufficient for the local server: the local server keeps every op in delta
 * storage and (absent summarization) its snapshot is the empty base at sequence number 0, so the
 * bounded replay alone reconstructs the document at the target. The `storageOnly` policy reuses the
 * loader's frozen-load mechanism: the connection manager synthesizes a read-only frozen delta stream
 * instead of opening a live socket and forces the container read-only.
 */
class BoundedReplayDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public readonly resolvedUrl: IResolvedUrl;
	public readonly policies: IDocumentServicePolicies = { storageOnly: true };

	public constructor(
		private readonly inner: IDocumentService,
		private readonly targetSequenceNumber: number,
		private readonly instrumentation?: ReplayInstrumentation,
		// If set, the bounded replay's delta-storage read rejects with this error, modelling an
		// op-fetch failure part-way through replay (e.g. a transient REST/network failure).
		private readonly deltaFetchError?: Error,
	) {
		super();
		this.resolvedUrl = inner.resolvedUrl;
		this.inner.on("metadataUpdate", this.metadataUpdateHandler);
	}

	public dispose(error?: unknown): void {
		this.inner.off("metadataUpdate", this.metadataUpdateHandler);
		this.inner.dispose(error);
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return this.inner.connectToStorage();
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		const innerDeltaStorage = await this.inner.connectToDeltaStorage();
		// The exclusive upper bound needed to include the target op itself.
		const boundedTo = this.targetSequenceNumber + 1;
		const instrumentation = this.instrumentation;
		const deltaFetchError = this.deltaFetchError;
		return {
			fetchMessages: (from, to, abortSignal, cachedOnly, fetchReason) => {
				instrumentation?.recordRequestedTo(to);
				if (deltaFetchError !== undefined) {
					// Model the op replay failing: the loader's catch-up read rejects instead of
					// yielding ops, so the whole point-in-time load should reject.
					return {
						read: async () => {
							throw deltaFetchError;
						},
					};
				}
				const effectiveTo = to === undefined ? boundedTo : Math.min(to, boundedTo);
				const innerStream = innerDeltaStorage.fetchMessages(
					from,
					effectiveTo,
					abortSignal,
					cachedOnly,
					fetchReason,
				);
				if (instrumentation === undefined) {
					return innerStream;
				}
				// Observe every op the loader actually receives so the test can assert none is past
				// the target - the guarantee, not merely its side effect on final state.
				return {
					read: async () => {
						const result = await innerStream.read();
						if (!result.done) {
							for (const op of result.value) {
								instrumentation.recordReturnedOp(op.sequenceNumber);
							}
						}
						return result;
					},
				};
			},
		};
	}

	public async connectToDeltaStream(_client: IClient): Promise<IDocumentDeltaConnection> {
		// Unreachable: the connection manager short-circuits on the storageOnly policy and
		// synthesizes a frozen delta stream before ever calling connectToDeltaStream.
		throw new Error(
			"BoundedReplayDocumentService is storage-only; connectToDeltaStream should not be called",
		);
	}

	private readonly metadataUpdateHandler = (metadata: Record<string, string>): void => {
		this.emit("metadataUpdate", metadata);
	};
}

/**
 * Options controlling the local point-in-time factory, including fault injection for failure-path
 * tests.
 */
interface PointInTimeFactoryOptions {
	/** White-box hook into the bounded replay (see {@link ReplayInstrumentation}). */
	readonly instrumentation?: ReplayInstrumentation;
	/**
	 * If set, `createPointInTimeDocumentService` rejects with this error before producing a service,
	 * modelling the case where no base version exists at or before the target (target predates
	 * retained history) - the local analogue of the ODSP factory's `noBaseVersion` `UsageError`.
	 */
	readonly createError?: Error;
	/**
	 * If set, the bounded replay's delta-storage read rejects with this error, modelling an op-fetch
	 * failure part-way through replay.
	 */
	readonly deltaFetchError?: Error;
}

/**
 * A local document service factory that additionally advertises the point-in-time capability
 * (`createPointInTimeDocumentService`) the loader detects. It lets us exercise
 * {@link loadContainerToSequenceNumber} end-to-end against the in-memory local server without ODSP
 * credentials.
 */
class PointInTimeLocalDocumentServiceFactory implements IDocumentServiceFactory {
	private readonly inner: LocalDocumentServiceFactory;

	public constructor(
		server: ILocalDeltaConnectionServer,
		private readonly options: PointInTimeFactoryOptions = {},
	) {
		this.inner = new LocalDocumentServiceFactory(server);
	}

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.inner.createDocumentService(resolvedUrl, logger, clientIsSummarizer);
	}

	public async createContainer(
		...args: Parameters<LocalDocumentServiceFactory["createContainer"]>
	): Promise<IDocumentService> {
		return this.inner.createContainer(...args);
	}

	public async createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		if (this.options.createError !== undefined) {
			throw this.options.createError;
		}
		const innerService = await this.inner.createDocumentService(
			resolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return new BoundedReplayDocumentService(
			innerService,
			targetSequenceNumber,
			this.options.instrumentation,
			this.options.deltaFetchError,
		);
	}
}

describe("Point-in-time container loading (local server)", () => {
	const documentId = "pointInTimeLocalServerTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const codeDetails: IFluidCodeDetails = {
		package: "pointInTimeLocalServerTestPackage",
		config: {},
	};
	const runtimeFactory = new TestContainerRuntimeFactory(
		"",
		new TestFluidObjectFactory([]),
		{},
	);

	/**
	 * Every key set on the source document, mapped to the sequence number at which it landed. The
	 * expected state at any target T is exactly `{ key : keySeq[key] <= T }`.
	 */
	const keySeq = new Map<string, number>();
	// The latest sequence number after all ops were applied.
	let fullSeqNum: number;
	// An arbitrary target partway through the timeline: a real op sequence number with ops on both
	// sides, so the "no op past the target" bound has something past it to (not) return.
	let arbitraryTarget: number;

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let loaderContainerTracker: LoaderContainerTracker;

	/** Present/absent keys expected at a target sequence number, per the recorded key/seq map. */
	function expectedKeysAt(target: number): { present: string[]; absent: string[] } {
		const present: string[] = [];
		const absent: string[] = [];
		for (const [key, seq] of keySeq) {
			(seq <= target ? present : absent).push(key);
		}
		return { present, absent };
	}

	function assertStateAt(dataObject: ITestFluidObject, target: number): void {
		const { present, absent } = expectedKeysAt(target);
		for (const key of present) {
			assert.strictEqual(
				dataObject.root.get(key),
				Number(key),
				`key ${key} (set at seq ${keySeq.get(key)}) should be present at target ${target}`,
			);
		}
		for (const key of absent) {
			assert.strictEqual(
				dataObject.root.get(key),
				undefined,
				`key ${key} (set at seq ${keySeq.get(key)}) should NOT be present at target ${target}`,
			);
		}
	}

	async function loadToSequenceNumber(
		loadToSequenceNumberValue: number,
		documentServiceFactory: IDocumentServiceFactory = new PointInTimeLocalDocumentServiceFactory(
			deltaConnectionServer,
		),
	): Promise<IContainer> {
		const loaderProps = createLoaderProps(
			[[codeDetails, runtimeFactory]],
			documentServiceFactory,
			new LocalResolver(),
		);
		return loadContainerToSequenceNumber({
			...loaderProps,
			request: { url: documentLoadUrl },
			loadToSequenceNumber: loadToSequenceNumberValue,
		});
	}

	beforeEach("setup source container", async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		loaderContainerTracker = new LoaderContainerTracker();
		keySeq.clear();

		const createProps = createLoaderProps(
			[[codeDetails, runtimeFactory]],
			new LocalDocumentServiceFactory(deltaConnectionServer),
			new LocalResolver(),
		);
		const container = await createAndAttachContainerUsingProps(
			{ ...createProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container);

		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;

		// Set single keys one at a time, recording the sequence number each key lands at - exactly as
		// the ODSP real-service test does. This yields a precise key -> seq map to derive expected
		// state at any target from.
		const keyCount = 10;
		const orderedSeqs: number[] = [];
		for (let i = 0; i < keyCount; i++) {
			const key = i.toString();
			dataObject.root.set(key, i);
			await loaderContainerTracker.ensureSynchronized();
			const seq = container.deltaManager.lastSequenceNumber;
			keySeq.set(key, seq);
			orderedSeqs.push(seq);
		}

		fullSeqNum = container.deltaManager.lastSequenceNumber;
		// Pick a target partway through: a real op sequence number with ops on both sides. In the
		// ODSP test this is a target between two file versions; here there are no versions, so any
		// recorded op seq in the middle of the timeline serves the same purpose.
		arbitraryTarget = orderedSeqs[Math.floor(orderedSeqs.length / 2)];
		container.close();

		assert(
			arbitraryTarget < fullSeqNum,
			`arbitraryTarget (${arbitraryTarget}) should be below fullSeqNum (${fullSeqNum})`,
		);
	});

	afterEach(async () => {
		loaderContainerTracker.reset();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("loads to an arbitrary target with only the ops up to the target applied", async () => {
		const container = await loadToSequenceNumber(arbitraryTarget);
		try {
			assert.strictEqual(
				container.deltaManager.lastSequenceNumber,
				arbitraryTarget,
				"loaded sequence number should match the arbitrary target",
			);
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			assertStateAt(dataObject, arbitraryTarget);
		} finally {
			container.close();
		}
	});

	it("bounds the replay at the data level: the loader asks for more, but no op past the target is ever returned", async () => {
		// White-box counterpart to the state-based tests above. Rather than only checking the
		// resulting document, this instruments the point-in-time delta storage to observe both what
		// the loader requests and what it actually receives, proving the bound is what stops the
		// over-read (not that there merely happened to be nothing past the target).
		const requestedUpperBounds: (number | undefined)[] = [];
		let maxReturnedSeq = -1;
		const instrumentedFactory = new PointInTimeLocalDocumentServiceFactory(
			deltaConnectionServer,
			{
				instrumentation: {
					recordRequestedTo: (to) => requestedUpperBounds.push(to),
					recordReturnedOp: (seq) => {
						maxReturnedSeq = Math.max(maxReturnedSeq, seq);
					},
				},
			},
		);

		// Target the earlier point while later ops (seq > arbitraryTarget) still exist in delta
		// storage, so there genuinely are ops past the target that could be over-fetched.
		const container = await loadToSequenceNumber(arbitraryTarget, instrumentedFactory);
		try {
			assert.strictEqual(
				container.deltaManager.lastSequenceNumber,
				arbitraryTarget,
				"loaded sequence number should match the target",
			);

			assert(
				requestedUpperBounds.length > 0,
				"the point-in-time delta storage should have been queried during catch-up",
			);

			// The bound is load-bearing: with no live socket and no known target, the frozen catch-up
			// keeps asking for more ops (to the end, or past target+1) until delta storage runs dry.
			// Clamping is the only thing that stops it, so at least one raw request must reach past the
			// target - otherwise this test would pass trivially even with a broken bound.
			assert(
				requestedUpperBounds.some((to) => to === undefined || to > arbitraryTarget + 1),
				`the loader should have requested ops past the target; observed bounds ${JSON.stringify(
					requestedUpperBounds,
				)}`,
			);

			// The guarantee itself: despite those requests, no op past the target was ever handed back.
			assert(
				maxReturnedSeq <= arbitraryTarget,
				`no op past the target should be returned; max returned seq ${maxReturnedSeq} exceeds target ${arbitraryTarget}`,
			);

			// And the materialized document reflects exactly the target state.
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			assertStateAt(dataObject, arbitraryTarget);
		} finally {
			container.close();
		}
	});

	it("loads to the latest sequence number with all ops applied", async () => {
		const container = await loadToSequenceNumber(fullSeqNum);
		try {
			assert.strictEqual(
				container.deltaManager.lastSequenceNumber,
				fullSeqNum,
				"loaded sequence number should match the target",
			);
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			assertStateAt(dataObject, fullSeqNum);
		} finally {
			container.close();
		}
	});

	it("materializes a read-only, disconnected container", async () => {
		const container = await loadToSequenceNumber(arbitraryTarget);
		try {
			assert.strictEqual(
				container.deltaManager.readOnlyInfo.readonly,
				true,
				"point-in-time container should be read-only",
			);
			assert.strictEqual(
				container.deltaManager.active,
				false,
				"point-in-time container should not have an active delta connection",
			);
		} finally {
			container.close();
		}
	});

	it("rejects a negative loadToSequenceNumber", async () => {
		await assert.rejects(
			loadToSequenceNumber(-1),
			(error: Error) => error instanceof UsageError,
			"a negative target should be rejected",
		);
	});

	it("rejects a non-integer loadToSequenceNumber", async () => {
		await assert.rejects(
			loadToSequenceNumber(1.5),
			(error: Error) => error instanceof UsageError,
			"a non-integer target should be rejected",
		);
	});

	it("rejects a factory that does not support point-in-time loading", async () => {
		await assert.rejects(
			loadToSequenceNumber(fullSeqNum, new LocalDocumentServiceFactory(deltaConnectionServer)),
			(error: Error) => error instanceof UsageError,
			"a factory without createPointInTimeDocumentService should be rejected",
		);
	});

	it("propagates a UsageError when no base version exists at or before the target", async () => {
		// Local analogue of the ODSP factory's `noBaseVersion` path: when the target predates
		// retained history, the factory cannot produce a base snapshot and rejects. The loader must
		// surface that failure rather than silently loading something else.
		const noBaseError = new UsageError(
			"No file version is available at or before the requested sequence number",
		);
		const factory = new PointInTimeLocalDocumentServiceFactory(deltaConnectionServer, {
			createError: noBaseError,
		});
		await assert.rejects(
			loadToSequenceNumber(arbitraryTarget, factory),
			(error: Error) => {
				assert(error instanceof UsageError, "the load should surface a UsageError");
				return true;
			},
			"a target with no base version should reject the load",
		);
	});

	it("rejects the load when the bounded op replay fails", async () => {
		// The replay reads ops from delta storage to advance the base snapshot to the target. If that
		// read fails part-way (e.g. a transient op-fetch failure), the point-in-time load must reject
		// rather than materialize a partial/incorrect document.
		const replayError = new Error("simulated delta feed failure during replay");
		const factory = new PointInTimeLocalDocumentServiceFactory(deltaConnectionServer, {
			deltaFetchError: replayError,
		});
		await assert.rejects(
			loadToSequenceNumber(arbitraryTarget, factory),
			"a delta-storage failure during replay should reject the load",
		);
	});
});
