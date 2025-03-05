/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { ILoader } from "@fluidframework/container-definitions/internal";
import type {
	ISummarizerEvents,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import {
	IFluidHandleContext,
	type FluidObject,
	type IRequest,
	type IResponse,
} from "@fluidframework/core-interfaces/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import { responseToException } from "@fluidframework/runtime-utils/internal";
import {
	IFluidErrorBase,
	ITelemetryLoggerExt,
	LoggingError,
	UsageError,
	createChildLogger,
	wrapErrorAndLog,
} from "@fluidframework/telemetry-utils/internal";

// eslint-disable-next-line import/no-deprecated
import { ICancellableSummarizerController } from "./runWhileConnectedCoordinator.js";
import { RunningSummarizer } from "./runningSummarizer.js";
import { summarizerClientType } from "./summarizerClientElection.js";
import { SummarizeHeuristicData } from "./summarizerHeuristics.js";
import {
	EnqueueSummarizeResult,
	// eslint-disable-next-line import/no-deprecated
	IConnectableRuntime,
	IEnqueueSummarizeOptions,
	IOnDemandSummarizeOptions,
	ISummarizeHeuristicData,
	ISummarizeResults,
	ISummarizer,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerInternalsProvider,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerRuntime,
	ISummarizingWarning,
	type IRetriableFailureError,
} from "./summarizerTypes.js";
import { SummaryCollection } from "./summaryCollection.js";
import { SummarizeResultBuilder } from "./summaryGenerator.js";

const summarizingError = "summarizingError";

/**
 * @legacy
 * @alpha
 */
export interface ISummaryBaseConfiguration {
	/**
	 * Delay before first attempt to spawn summarizing container.
	 */
	initialSummarizerDelayMs: number;

	/**
	 * Defines the maximum allowed time to wait for a pending summary ack.
	 * The maximum amount of time client will wait for a summarize is the minimum of
	 * maxSummarizeAckWaitTime (currently 3 * 60 * 1000) and maxAckWaitTime.
	 */
	maxAckWaitTime: number;
	/**
	 * Defines the maximum number of Ops in between Summaries that can be
	 * allowed before forcibly electing a new summarizer client.
	 */
	maxOpsSinceLastSummary: number;
}

/**
 * @legacy
 * @alpha
 */
export interface ISummaryConfigurationHeuristics extends ISummaryBaseConfiguration {
	state: "enabled";
	/**
	 * Defines the maximum allowed time, since the last received Ack, before running the summary
	 * with reason maxTime.
	 * For example, say we receive ops one by one just before the idle time is triggered.
	 * In this case, we still want to run a summary since it's been a while since the last summary.
	 */
	maxTime: number;
	/**
	 * Defines the maximum number of Ops, since the last received Ack, that can be allowed
	 * before running the summary with reason maxOps.
	 */
	maxOps: number;
	/**
	 * Defines the minimum number of Ops, since the last received Ack, that can be allowed
	 * before running the last summary.
	 */
	minOpsForLastSummaryAttempt: number;
	/**
	 * Defines the lower boundary for the allowed time in between summarizations.
	 * Pairs with maxIdleTime to form a range.
	 * For example, if we only receive 1 op, we don't want to have the same idle time as say 100 ops.
	 * Based on the boundaries we set in minIdleTime and maxIdleTime, the idle time will change
	 * linearly depending on the number of ops we receive.
	 */
	minIdleTime: number;
	/**
	 * Defines the upper boundary for the allowed time in between summarizations.
	 * Pairs with minIdleTime to form a range.
	 * For example, if we only receive 1 op, we don't want to have the same idle time as say 100 ops.
	 * Based on the boundaries we set in minIdleTime and maxIdleTime, the idle time will change
	 * linearly depending on the number of ops we receive.
	 */
	maxIdleTime: number;
	/**
	 * Runtime op weight to use in heuristic summarizing.
	 * This number is a multiplier on the number of runtime ops we process when running summarize heuristics.
	 * For example: (multiplier) * (number of runtime ops) = weighted number of runtime ops
	 */
	runtimeOpWeight: number;
	/**
	 * Non-runtime op weight to use in heuristic summarizing
	 * This number is a multiplier on the number of non-runtime ops we process when running summarize heuristics.
	 * For example: (multiplier) * (number of non-runtime ops) = weighted number of non-runtime ops
	 */
	nonRuntimeOpWeight: number;

	/**
	 * Number of ops since last summary needed before a non-runtime op can trigger running summary heuristics.
	 *
	 * Note: Any runtime ops sent before the threshold is reached will trigger heuristics normally.
	 * This threshold ONLY applies to non-runtime ops triggering summaries.
	 *
	 * For example: Say the threshold is 20. Sending 19 non-runtime ops will not trigger any heuristic checks.
	 * Sending the 20th non-runtime op will trigger the heuristic checks for summarizing.
	 */
	nonRuntimeHeuristicThreshold?: number;
}

/**
 * @legacy
 * @alpha
 */
export interface ISummaryConfigurationDisableSummarizer {
	state: "disabled";
}

/**
 * @legacy
 * @alpha
 */
export interface ISummaryConfigurationDisableHeuristics extends ISummaryBaseConfiguration {
	state: "disableHeuristics";
}

/**
 * @legacy
 * @alpha
 */
export type ISummaryConfiguration =
	| ISummaryConfigurationDisableSummarizer
	| ISummaryConfigurationDisableHeuristics
	| ISummaryConfigurationHeuristics;

export function isSummariesDisabled(
	config: ISummaryConfiguration,
): config is ISummaryConfigurationDisableSummarizer {
	return config.state === "disabled";
}

/**
 * @legacy
 * @alpha
 */
export const DefaultSummaryConfiguration: ISummaryConfiguration = {
	state: "enabled",

	minIdleTime: 0,

	maxIdleTime: 30 * 1000, // 30 secs.

	maxTime: 60 * 1000, // 1 min.

	maxOps: 100, // Summarize if 100 weighted ops received since last snapshot.

	minOpsForLastSummaryAttempt: 10,

	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.

	maxOpsSinceLastSummary: 7000,

	initialSummarizerDelayMs: 5 * 1000, // 5 secs.

	nonRuntimeOpWeight: 0.1,

	runtimeOpWeight: 1,

	nonRuntimeHeuristicThreshold: 20,
};

export class SummarizingWarning
	extends LoggingError
	implements ISummarizingWarning, IFluidErrorBase
{
	readonly errorType = summarizingError;
	readonly canRetry = true;

	constructor(
		errorMessage: string,
		readonly logged: boolean = false,
	) {
		super(errorMessage);
	}

	static wrap(
		error: unknown,
		logged: boolean = false,
		logger: ITelemetryLoggerExt,
	): SummarizingWarning {
		const newErrorFn = (errMsg: string): SummarizingWarning =>
			new SummarizingWarning(errMsg, logged);
		return wrapErrorAndLog<SummarizingWarning>(error, newErrorFn, logger);
	}
}

export const summarizerRequestUrl = "_summarizer";

/**
 * Create and retrieve the summarizer
 */
async function createSummarizer(loader: ILoader, url: string): Promise<ISummarizer> {
	const request: IRequest = {
		headers: {
			[LoaderHeader.cache]: false,
			[LoaderHeader.clientDetails]: {
				capabilities: { interactive: false },
				type: summarizerClientType,
			},
			[DriverHeader.summarizingClient]: true,
			[LoaderHeader.reconnect]: false,
		},
		url,
	};

	const resolvedContainer = await loader.resolve(request);
	let fluidObject: FluidObject<ISummarizer> | undefined;

	// Older containers may not have the "getEntryPoint" API
	// ! This check will need to stay until LTS of loader moves past 2.0.0-internal.7.0.0
	if (resolvedContainer.getEntryPoint === undefined) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
		const response = (await (resolvedContainer as any).request({
			url: `/${summarizerRequestUrl}`,
		})) as IResponse;
		if (response.status !== 200 || response.mimeType !== "fluid/object") {
			throw responseToException(response, request);
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		fluidObject = response.value;
	} else {
		fluidObject = await resolvedContainer.getEntryPoint();
	}

	if (fluidObject?.ISummarizer === undefined) {
		throw new UsageError("Fluid object does not implement ISummarizer");
	}
	return fluidObject.ISummarizer;
}
export const createSummarizingWarning = (
	errorMessage: string,
	logged: boolean,
): SummarizingWarning => new SummarizingWarning(errorMessage, logged);

/**
 * Returns a function that will create and retrieve a Summarizer.
 */
export function formCreateSummarizerFn(loader: ILoader): () => Promise<ISummarizer> {
	return async () => {
		return createSummarizer(loader, `/${summarizerRequestUrl}`);
	};
}

export function validateSummaryHeuristicConfiguration(
	configuration: ISummaryConfigurationHeuristics,
): void {
	// eslint-disable-next-line no-restricted-syntax
	for (const prop in configuration) {
		if (typeof configuration[prop] === "number" && configuration[prop] < 0) {
			throw new UsageError(
				`Summary heuristic configuration property "${prop}" cannot be less than 0`,
			);
		}
	}
	if (configuration.minIdleTime > configuration.maxIdleTime) {
		throw new UsageError(
			`"minIdleTime" [${configuration.minIdleTime}] cannot be greater than "maxIdleTime" [${configuration.maxIdleTime}]`,
		);
	}
}

/**
 * Summarizer is responsible for coordinating when to generate and send summaries.
 * It is the main entry point for summary work.
 * It is created only by summarizing container (i.e. one with clientType === "summarizer")
 * @legacy
 * @alpha
 * @deprecated This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export class Summarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
	public get ISummarizer(): this {
		return this;
	}

	private readonly logger: ITelemetryLoggerExt;
	private runningSummarizer?: RunningSummarizer;
	private _disposed: boolean = false;
	private starting: boolean = false;

	private readonly stopDeferred = new Deferred<SummarizerStopReason>();

	constructor(
		/**
		 * Reference to runtime that created this object.
		 * i.e. runtime with clientType === "summarizer"
		 */
		// eslint-disable-next-line import/no-deprecated
		private readonly runtime: ISummarizerRuntime,
		private readonly configurationGetter: () => ISummaryConfiguration,
		/**
		 * Represents an object that can generate summary.
		 * In practical terms, it's same runtime (this.runtime) with clientType === "summarizer".
		 */
		// eslint-disable-next-line import/no-deprecated
		private readonly internalsProvider: ISummarizerInternalsProvider,
		handleContext: IFluidHandleContext,
		public readonly summaryCollection: SummaryCollection,
		private readonly runCoordinatorCreateFn: (
			// eslint-disable-next-line import/no-deprecated
			runtime: IConnectableRuntime,
			// eslint-disable-next-line import/no-deprecated
		) => Promise<ICancellableSummarizerController>,
	) {
		super();
		this.logger = createChildLogger({
			logger: this.runtime.baseLogger,
			namespace: "Summarizer",
		});
	}

	public async run(onBehalfOf: string): Promise<SummarizerStopReason> {
		try {
			const stopReason = await this.runCore(onBehalfOf);
			this.emit("summarizerStop", {
				stopReason,
				numUnsummarizedRuntimeOps: this._heuristicData?.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this._heuristicData?.numNonRuntimeOps,
			});
			return stopReason;
		} catch (error) {
			this.stop("summarizerException");
			this.emit("summarizerStop", {
				stopReason: "summarizerException",
				error,
				numUnsummarizedRuntimeOps: this._heuristicData?.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this._heuristicData?.numNonRuntimeOps,
			});
			throw SummarizingWarning.wrap(error, false /* logged */, this.logger);
		} finally {
			this.close();
		}
	}

	/**
	 * Stops the summarizer from running.  This will complete
	 * the run promise, and also close the container.
	 * @param reason - reason code for stopping
	 */
	public stop(reason: SummarizerStopReason): void {
		this.stopDeferred.resolve(reason);
	}

	public close(): void {
		// This will result in "summarizerClientDisconnected" stop reason recorded in telemetry,
		// unless stop() was called earlier
		this.dispose();
		this.runtime.disposeFn();
	}

	private async runCore(onBehalfOf: string): Promise<SummarizerStopReason> {
		// eslint-disable-next-line import/no-deprecated
		const runCoordinator: ICancellableSummarizerController = await this.runCoordinatorCreateFn(
			this.runtime,
		);

		// Wait for either external signal to cancel, or loss of connectivity.
		const stopP = Promise.race([runCoordinator.waitCancelled, this.stopDeferred.promise]);
		// eslint-disable-next-line no-void
		void stopP.then((reason) => {
			this.logger.sendTelemetryEvent({
				eventName: "StoppingSummarizer",
				onBehalfOf,
				reason,
			});
		});

		if (runCoordinator.cancelled) {
			this.emit("summarizerStartupFailed", {
				reason: await runCoordinator.waitCancelled,
				numUnsummarizedRuntimeOps: this._heuristicData?.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this._heuristicData?.numNonRuntimeOps,
			});
			return runCoordinator.waitCancelled;
		}

		this.emit("summarizerStart", {
			onBehalfOf,
			numUnsummarizedRuntimeOps: this._heuristicData?.numRuntimeOps,
			numUnsummarizedNonRuntimeOps: this._heuristicData?.numNonRuntimeOps,
		});

		const runningSummarizer = await this.start(onBehalfOf, runCoordinator);

		// Wait for either external signal to cancel, or loss of connectivity.
		const stopReason = await stopP;

		// There are two possible approaches here:
		// 1. Propagate cancellation from this.stopDeferred to runCoordinator. This will ensure that we move to the exit
		//    faster, including breaking out of the RunningSummarizer.trySummarize() faster.
		//    We could create new coordinator and pass it to waitStop() -> trySummarizeOnce("lastSummary") flow.
		//    The con of this approach is that we might cancel active summary, and lastSummary will fail because it
		//    did not wait for ack/nack from previous summary. Plus we disregard any 429 kind of info from service
		//    that way (i.e. trySummarize() loop might have been waiting for 5 min because storage told us so).
		//    In general, it's more wasted resources.
		// 2. We can not do it and make waitStop() do last summary only if there was no active summary. This ensures
		//    that client behaves properly (from server POV) and we do not waste resources. But, it may mean we wait
		//    substantially longer for trySummarize() retries to play out and thus this summary loop may run into
		//    conflict with new summarizer client starting on different client.
		// As of now, #2 is implemented. It's more forward looking, as issue #7279 suggests changing design for new
		// summarizer client to not be created until current summarizer fully moves to exit, and that would reduce
		// cons of #2 substantially.

		// Cleanup after running
		await runningSummarizer.waitStop(
			!runCoordinator.cancelled && Summarizer.stopReasonCanRunLastSummary(stopReason),
		);

		// Propagate reason and ensure that if someone is waiting for cancellation token, they are moving to exit
		runCoordinator.stop(stopReason);

		return stopReason;
	}

	/**
	 * Should we try to run a last summary for the given stop reason?
	 * Currently only allows "parentNotConnected"
	 * @param stopReason - SummarizerStopReason
	 * @returns `true` if the stop reason can run a last summary, otherwise `false`.
	 */
	public static stopReasonCanRunLastSummary(stopReason: SummarizerStopReason): boolean {
		return stopReason === "parentNotConnected";
	}

	private _heuristicData: ISummarizeHeuristicData | undefined;

	/**
	 * Put the summarizer in a started state, including creating and initializing the RunningSummarizer.
	 * The start request can come either from the SummaryManager (in the auto-summarize case) or from the user
	 * (in the on-demand case).
	 * @param onBehalfOf - ID of the client that requested that the summarizer start
	 * @param runCoordinator - cancellation token
	 * @param newConfig - Summary configuration to override the existing config when invoking the RunningSummarizer.
	 * @returns A promise that is fulfilled when the RunningSummarizer is ready.
	 */
	private async start(
		onBehalfOf: string,
		// eslint-disable-next-line import/no-deprecated
		runCoordinator: ICancellableSummarizerController,
	): Promise<RunningSummarizer> {
		if (this.runningSummarizer) {
			if (this.runningSummarizer.disposed) {
				throw new UsageError("Starting a disposed summarizer");
			}
			return this.runningSummarizer;
		}
		if (this.starting) {
			throw new UsageError("Attempting to start a summarizer that is already starting");
		}
		this.starting = true;
		// Initialize values and first ack (time is not exact)
		this.logger.sendTelemetryEvent({
			eventName: "RunningSummarizer",
			onBehalfOf,
			initSummarySeqNumber: this.runtime.deltaManager.initialSequenceNumber,
			config: JSON.stringify(this.configurationGetter()),
		});

		// Summarizing container ID (with clientType === "summarizer")
		const clientId = this.runtime.clientId;
		if (clientId === undefined) {
			throw new UsageError("clientId should be defined if connected.");
		}

		this._heuristicData = new SummarizeHeuristicData(
			this.runtime.deltaManager.lastSequenceNumber,
			{
				/**
				 * summary attempt baseline for heuristics
				 */
				refSequenceNumber: this.runtime.deltaManager.initialSequenceNumber,
				summaryTime: Date.now(),
			} as const,
		);

		const runningSummarizer = await RunningSummarizer.start(
			this.logger,
			this.summaryCollection.createWatcher(clientId),
			this.configurationGetter(),
			async (...args) => this.internalsProvider.submitSummary(...args), // submitSummaryCallback
			async (...args) => this.internalsProvider.refreshLatestSummaryAck(...args), // refreshLatestSummaryAckCallback
			this._heuristicData,
			this.summaryCollection,
			runCoordinator /* cancellationToken */,
			(reason) => runCoordinator.stop(reason) /* stopSummarizerCallback */,
			this.runtime,
		);
		this.runningSummarizer = runningSummarizer;
		this.setupForwardedEvents();
		this.starting = false;
		return runningSummarizer;
	}

	/**
	 * Disposes of resources after running.  This cleanup will
	 * clear any outstanding timers and reset some of the state
	 * properties.
	 * Called by ContainerRuntime when it is disposed, as well as at the end the run().
	 */
	public dispose(): void {
		// Given that the call can come from own ContainerRuntime, ensure that we stop all the processes.
		this.stop("summarizerClientDisconnected");

		this._disposed = true;
		if (this.runningSummarizer) {
			this.cleanupForwardedEvents();
			this.runningSummarizer.dispose();
			this.runningSummarizer = undefined;
		}
	}

	public summarizeOnDemand(options: IOnDemandSummarizeOptions): ISummarizeResults {
		try {
			if (this._disposed || this.runningSummarizer?.disposed) {
				throw new UsageError("Summarizer is already disposed.");
			}
			if (
				this.runtime.summarizerClientId !== undefined &&
				this.runtime.summarizerClientId !== this.runtime.clientId
			) {
				// If there is an elected summarizer, and it's not this one, don't allow on-demand summary.
				// This is to prevent the on-demand summary and heuristic-based summary from stepping on
				// each other.
				throw new UsageError(
					"On-demand summary attempted while an elected summarizer is present",
				);
			}
			const builder = new SummarizeResultBuilder();
			if (this.runningSummarizer) {
				// Summarizer is already running. Go ahead and start.
				return this.runningSummarizer.summarizeOnDemand(options, builder);
			}

			// Summarizer isn't running, so we need to start it, which is an async operation.
			// Manage the promise related to creating the cancellation token here.
			// The promises related to starting, summarizing,
			// and submitting are communicated to the caller through the results builder.
			const coordinatorCreateP = this.runCoordinatorCreateFn(this.runtime);

			coordinatorCreateP
				.then((runCoordinator) => {
					// Successfully created the cancellation token. Start the summarizer.
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const startP = this.start(this.runtime.clientId!, runCoordinator);
					startP
						.then(async (runningSummarizer) => {
							// Successfully started the summarizer. Run it.
							runningSummarizer.summarizeOnDemand(options, builder);
							// Wait for a command to stop or loss of connectivity before tearing down the summarizer and client.
							const stopReason = await Promise.race([
								this.stopDeferred.promise,
								runCoordinator.waitCancelled,
							]);
							await runningSummarizer.waitStop(false);
							runCoordinator.stop(stopReason);
							this.close();
						})
						.catch((error: IRetriableFailureError) => {
							builder.fail("Failed to start summarizer", error);
						});
				})
				.catch((error: IRetriableFailureError) => {
					builder.fail("Failed to create cancellation token", error);
				});

			return builder.build();
		} catch (error) {
			throw SummarizingWarning.wrap(error, false /* logged */, this.logger);
		}
	}

	public enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult {
		if (
			this._disposed ||
			this.runningSummarizer === undefined ||
			this.runningSummarizer.disposed
		) {
			throw new UsageError("Summarizer is not running or already disposed.");
		}
		return this.runningSummarizer.enqueueSummarize(options);
	}

	public recordSummaryAttempt?(summaryRefSeqNum?: number): void {
		this._heuristicData?.recordAttempt(summaryRefSeqNum);
	}

	private readonly forwardedEvents = new Map<string, () => void>();

	private setupForwardedEvents(): void {
		for (const event of ["summarize", "summarizeAllAttemptsFailed"]) {
			const listener = (...args: unknown[]): void => {
				this.emit(event, ...args);
			};
			// TODO: better typing here
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
			this.runningSummarizer?.on(event as any, listener);
			this.forwardedEvents.set(event, listener);
		}
	}

	private cleanupForwardedEvents(): void {
		for (const [event, listener] of this.forwardedEvents.entries()) {
			this.runningSummarizer?.off(event, listener);
		}
		this.forwardedEvents.clear();
	}
}
