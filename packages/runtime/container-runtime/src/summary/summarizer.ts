/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/core-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	ITelemetryLoggerExt,
	createChildLogger,
	IFluidErrorBase,
	LoggingError,
	UsageError,
	wrapErrorAndLog,
} from "@fluidframework/telemetry-utils";
import { ILoader, LoaderHeader } from "@fluidframework/container-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidObject, IFluidHandleContext, IRequest } from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "../containerRuntime";
import { ICancellableSummarizerController } from "./runWhileConnectedCoordinator";
import { summarizerClientType } from "./summarizerClientElection";
import { SummaryCollection } from "./summaryCollection";
import { RunningSummarizer } from "./runningSummarizer";
import {
	IConnectableRuntime,
	ISummarizer,
	ISummarizeHeuristicData,
	ISummarizerInternalsProvider,
	ISummarizerRuntime,
	ISummarizingWarning,
	SummarizerStopReason,
	IOnDemandSummarizeOptions,
	ISummarizeResults,
	IEnqueueSummarizeOptions,
	EnqueueSummarizeResult,
	ISummarizerEvents,
	ISummarizeEventProps,
} from "./summarizerTypes";
import { SummarizeHeuristicData } from "./summarizerHeuristics";
import { SummarizeResultBuilder } from "./summaryGenerator";

const summarizingError = "summarizingError";

export class SummarizingWarning
	extends LoggingError
	implements ISummarizingWarning, IFluidErrorBase
{
	readonly errorType = summarizingError;
	readonly canRetry = true;

	constructor(errorMessage: string, readonly logged: boolean = false) {
		super(errorMessage);
	}

	static wrap(error: any, logged: boolean = false, logger: ITelemetryLoggerExt) {
		const newErrorFn = (errMsg: string) => new SummarizingWarning(errMsg, logged);
		return wrapErrorAndLog<SummarizingWarning>(error, newErrorFn, logger);
	}
}

export const createSummarizingWarning = (errorMessage: string, logged: boolean) =>
	new SummarizingWarning(errorMessage, logged);

/**
 * Summarizer is responsible for coordinating when to generate and send summaries.
 * It is the main entry point for summary work.
 * It is created only by summarizing container (i.e. one with clientType === "summarizer")
 */
export class Summarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
	public get ISummarizer() {
		return this;
	}

	private readonly logger: ITelemetryLoggerExt;
	private runningSummarizer?: RunningSummarizer;
	private _disposed: boolean = false;
	private starting: boolean = false;

	private readonly stopDeferred = new Deferred<SummarizerStopReason>();

	constructor(
		/** Reference to runtime that created this object.
		 * i.e. runtime with clientType === "summarizer"
		 */
		private readonly runtime: ISummarizerRuntime,
		private readonly configurationGetter: () => ISummaryConfiguration,
		/** Represents an object that can generate summary.
		 * In practical terms, it's same runtime (this.runtime) with clientType === "summarizer".
		 */
		private readonly internalsProvider: ISummarizerInternalsProvider,
		handleContext: IFluidHandleContext,
		public readonly summaryCollection: SummaryCollection,
		private readonly runCoordinatorCreateFn: (
			runtime: IConnectableRuntime,
		) => Promise<ICancellableSummarizerController>,
	) {
		super();
		this.logger = createChildLogger({ logger: this.runtime.logger, namespace: "Summarizer" });
	}

	/**
	 * Creates a Summarizer and its underlying client.
	 * Note that different implementations of ILoader will handle the URL differently.
	 * ILoader provided by a ContainerRuntime is a RelativeLoader, which will treat URL's
	 * starting with "/" as relative to the Container. The general ILoader
	 * interface will expect an absolute URL and will not handle "/".
	 * @param loader - the loader that resolves the request
	 * @param url - the URL used to resolve the container
	 */
	public static async create(loader: ILoader, url: string): Promise<ISummarizer> {
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
		const fluidObject: FluidObject<ISummarizer> | undefined = resolvedContainer.getEntryPoint
			? await resolvedContainer.getEntryPoint?.()
			: await requestFluidObject<FluidObject<ISummarizer>>(resolvedContainer, {
					url: "_summarizer",
			  });
		if (fluidObject?.ISummarizer === undefined) {
			throw new UsageError("Fluid object does not implement ISummarizer");
		}
		return fluidObject.ISummarizer;
	}

	public async run(onBehalfOf: string): Promise<SummarizerStopReason> {
		try {
			return await this.runCore(onBehalfOf);
		} catch (error) {
			this.stop("summarizerException");
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
	public stop(reason: SummarizerStopReason) {
		this.stopDeferred.resolve(reason);
	}

	public close() {
		// This will result in "summarizerClientDisconnected" stop reason recorded in telemetry,
		// unless stop() was called earlier
		this.dispose();
		this.runtime.disposeFn();
	}

	private async runCore(onBehalfOf: string): Promise<SummarizerStopReason> {
		const runCoordinator: ICancellableSummarizerController = await this.runCoordinatorCreateFn(
			this.runtime,
		);

		// Wait for either external signal to cancel, or loss of connectivity.
		const stopP = Promise.race([runCoordinator.waitCancelled, this.stopDeferred.promise]);
		void stopP.then((reason) => {
			this.logger.sendTelemetryEvent({
				eventName: "StoppingSummarizer",
				onBehalfOf,
				reason,
			});
		});

		if (runCoordinator.cancelled) {
			return runCoordinator.waitCancelled;
		}

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
				/** summary attempt baseline for heuristics */
				refSequenceNumber: this.runtime.deltaManager.initialSequenceNumber,
				summaryTime: Date.now(),
			} as const,
		);

		const runningSummarizer = await RunningSummarizer.start(
			this.logger,
			this.summaryCollection.createWatcher(clientId),
			this.configurationGetter(),
			async (...args) => this.internalsProvider.submitSummary(...args), // submitSummaryCallback
			async (...args) => this.internalsProvider.refreshLatestSummaryAck(...args), // refreshLatestSummaryCallback
			this._heuristicData,
			this.summaryCollection,
			runCoordinator /* cancellationToken */,
			(reason) => runCoordinator.stop(reason) /* stopSummarizerCallback */,
			this.runtime,
		);
		this.runningSummarizer = runningSummarizer;
		this.runningSummarizer.on("summarize", this.handleSummarizeEvent);
		this.starting = false;
		return runningSummarizer;
	}

	private readonly handleSummarizeEvent = (eventProps: ISummarizeEventProps) => {
		this.emit("summarize", eventProps);
	};

	/**
	 * Disposes of resources after running.  This cleanup will
	 * clear any outstanding timers and reset some of the state
	 * properties.
	 * Called by ContainerRuntime when it is disposed, as well as at the end the run().
	 */
	public dispose() {
		// Given that the call can come from own ContainerRuntime, ensure that we stop all the processes.
		this.stop("summarizerClientDisconnected");

		this._disposed = true;
		if (this.runningSummarizer) {
			this.runningSummarizer.off("summarize", this.handleSummarizeEvent);
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
						.catch((reason) => {
							builder.fail("Failed to start summarizer", reason);
						});
				})
				.catch((reason) => {
					builder.fail("Failed to create cancellation token", reason);
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

	public recordSummaryAttempt?(summaryRefSeqNum?: number) {
		this._heuristicData?.recordAttempt(summaryRefSeqNum);
	}
}
