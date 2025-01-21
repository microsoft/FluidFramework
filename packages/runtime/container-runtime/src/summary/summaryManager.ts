/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	ISummarizerEvents,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import {
	IDisposable,
	IEvent,
	IEventProvider,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { DriverErrorTypes } from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { IThrottler } from "../throttler.js";

// eslint-disable-next-line import/no-deprecated
import { Summarizer } from "./summarizer.js";
import { ISummarizerClientElection } from "./summarizerClientElection.js";
import {
	EnqueueSummarizeResult,
	IEnqueueSummarizeOptions,
	IOnDemandSummarizeOptions,
	ISummarizeResults,
	ISummarizer,
} from "./summarizerTypes.js";
import { SummaryCollection } from "./summaryCollection.js";

const defaultInitialDelayMs = 5000;
const defaultOpsToBypassInitialDelay = 4000;

export enum SummaryManagerState {
	Off = 0,
	Starting = 1,
	Running = 2,
	Stopping = 3,
}

// Please note that all reasons in this list are not errors,
// and thus they are not raised today to parent container as error.
// If this needs to be changed in future, we should re-evaluate what and how we raise to summarizer
type StopReason = Extract<
	SummarizerStopReason,
	"parentNotConnected" | "notElectedParent" | "notElectedClient"
>;
type ShouldSummarizeState =
	| { shouldSummarize: true }
	| { shouldSummarize: false; stopReason: StopReason };

export interface IConnectedEvents extends IEvent {
	(event: "connected", listener: (clientId: string) => void);
	(event: "disconnected", listener: () => void);
}

/**
 * IConnectedState describes an object that SummaryManager can watch to observe connection/disconnection.
 *
 * Under current implementation, its role will be fulfilled by the ContainerRuntime, but this could be replaced
 * with anything else that fulfills the contract if we want to shift the layer that the SummaryManager lives at.
 */
export interface IConnectedState extends IEventProvider<IConnectedEvents> {
	readonly connected: boolean;

	/**
	 * Under current implementation this is undefined if we've never connected, otherwise it's the clientId from our
	 * latest connection (even if we've since disconnected!).  Although this happens to be the behavior we want in
	 * SummaryManager, I suspect that globally we may eventually want to modify this behavior (e.g. make clientId
	 * undefined while disconnected).  To protect against this, let's assume this field can't be trusted while
	 * disconnected and instead separately track "latest clientId" in SummaryManager.
	 */
	readonly clientId: string | undefined;
}

export interface ISummaryManagerConfig {
	initialDelayMs: number;
	opsToBypassInitialDelay: number;
}

/**
 * SummaryManager is created by parent container (i.e. interactive container with clientType !== "summarizer") only.
 * It observes changes in calculated summarizer and reacts to changes by either creating summarizer client or
 * stopping existing summarizer client.
 */
export class SummaryManager
	extends TypedEventEmitter<ISummarizerEvents>
	implements IDisposable
{
	private readonly logger: ITelemetryLoggerExt;
	private readonly opsToBypassInitialDelay: number;
	private readonly initialDelayMs: number;
	private latestClientId: string | undefined;
	private state = SummaryManagerState.Off;
	private summarizer?: ISummarizer;
	private _disposed = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public get currentState(): SummaryManagerState {
		return this.state;
	}

	constructor(
		private readonly clientElection: ISummarizerClientElection,
		private readonly connectedState: IConnectedState,
		private readonly summaryCollection: Pick<
			SummaryCollection,
			"opsSinceLastAck" | "addOpListener" | "removeOpListener"
		>,
		parentLogger: ITelemetryBaseLogger,
		/**
		 * Creates summarizer by asking interactive container to spawn summarizing container and
		 *get back its Summarizer instance.
		 */
		private readonly createSummarizerFn: () => Promise<ISummarizer>,
		private readonly startThrottler: IThrottler,
		{
			initialDelayMs = defaultInitialDelayMs,
			opsToBypassInitialDelay = defaultOpsToBypassInitialDelay,
		}: Readonly<Partial<ISummaryManagerConfig>> = {},
	) {
		super();

		this.logger = createChildLogger({
			logger: parentLogger,
			namespace: "SummaryManager",
			properties: {
				all: { clientId: () => this.latestClientId },
			},
		});

		this.connectedState.on("connected", this.handleConnected);
		this.connectedState.on("disconnected", this.handleDisconnected);
		this.latestClientId = this.connectedState.clientId;

		this.opsToBypassInitialDelay = opsToBypassInitialDelay;
		this.initialDelayMs = initialDelayMs;
	}

	/**
	 * Until start is called, the SummaryManager won't begin attempting to start summarization.  This ensures there's
	 * a window between construction and starting where the caller can attach listeners.
	 */
	public start(): void {
		this.clientElection.on("electedSummarizerChanged", this.refreshSummarizer);
		this.refreshSummarizer();
	}

	private readonly handleConnected = (clientId: string): void => {
		this.latestClientId = clientId;
		// If we have a summarizer, it should have been either cancelled on disconnected by now.
		// But because of lastSummary process, it can still hang around, so there is not much we can
		// check or assert.
		this.refreshSummarizer();
	};

	private readonly handleDisconnected = (): void => {
		this.refreshSummarizer();
	};

	private static readonly isStartingOrRunning = (
		state: SummaryManagerState,
	): state is SummaryManagerState.Starting | SummaryManagerState.Running =>
		state === SummaryManagerState.Starting || state === SummaryManagerState.Running;

	private getShouldSummarizeState(): ShouldSummarizeState {
		if (this.disposed) {
			return { shouldSummarize: false, stopReason: "parentNotConnected" };
		}

		// Note that if we're in the Running state, the electedClient may be a summarizer client, so we can't
		// enforce connectedState.clientId === clientElection.electedClientId. But once we're Running, we should
		// only transition to Stopping when the electedParentId changes. Stopping the summarizer without
		// changing the electedParent will just cause us to transition to Starting again.

		// New Parent has been elected and it is not the current client, or
		if (this.connectedState.clientId !== this.clientElection.electedParentId) {
			return { shouldSummarize: false, stopReason: "notElectedParent" };
		}

		// We are not already running the summarizer and we are not the current elected client id.
		if (
			this.state !== SummaryManagerState.Running &&
			this.connectedState.clientId !== this.clientElection.electedClientId
		) {
			return { shouldSummarize: false, stopReason: "notElectedClient" };
		}

		if (!this.connectedState.connected) {
			return { shouldSummarize: false, stopReason: "parentNotConnected" };
		}

		return { shouldSummarize: true };
	}

	private readonly refreshSummarizer = (): void => {
		// Transition states depending on shouldSummarize, which is a calculated property
		// that is only true if this client is connected and is the elected summarizer.
		const shouldSummarizeState = this.getShouldSummarizeState();
		switch (this.state) {
			case SummaryManagerState.Off: {
				if (shouldSummarizeState.shouldSummarize) {
					this.startSummarization();
				}
				return;
			}
			case SummaryManagerState.Starting: {
				// Cannot take any action until summarizer is created
				// state transition will occur after creation
				return;
			}
			case SummaryManagerState.Running: {
				if (shouldSummarizeState.shouldSummarize === false) {
					this.stop(shouldSummarizeState.stopReason);
				}
				return;
			}
			case SummaryManagerState.Stopping: {
				// Cannot take any action until running summarizer finishes
				// state transition will occur after it stops
				return;
			}
			default: {
				return;
			}
		}
	};

	private startSummarization(): void {
		assert(this.state === SummaryManagerState.Off, 0x261 /* "Expected: off" */);
		this.state = SummaryManagerState.Starting;

		assert(this.summarizer === undefined, 0x262 /* "Old summarizer is still working!" */);

		this.delayBeforeCreatingSummarizer()
			.then(async (startWithInitialDelay: boolean) => {
				if (this.disposed) {
					return "early exit (disposed)";
				}

				// Re-validate that it need to be running. Due to asynchrony, it may be not the case anymore
				// but only if creation was delayed. If it was not, then we want to ensure we always create
				// a summarizer to kick off lastSummary. Without that, we would not be able to summarize and get
				// document out of broken state if it has too many ops and ordering service keeps nacking main
				// container (and thus it goes into cycle of reconnects)
				// If we can't run the LastSummary, simply return as to avoid paying the cost of launching
				// the summarizer at all.
				const shouldSummarizeStateEarlyStage = this.getShouldSummarizeState();
				if (
					startWithInitialDelay &&
					shouldSummarizeStateEarlyStage.shouldSummarize === false
				) {
					return `early exit ${shouldSummarizeStateEarlyStage.stopReason}`;
				}

				// We transition to Running before requesting the summarizer, because after requesting we can't predict
				// when the electedClient will be replaced with the new summarizer client.
				// The alternative would be to let connectedState.clientId !== clientElection.electedClientId when
				// state === Starting || state === Running.
				assert(this.state === SummaryManagerState.Starting, 0x263 /* "Expected: starting" */);
				this.state = SummaryManagerState.Running;

				const summarizer = await this.createSummarizerFn();
				this.summarizer = summarizer;
				this.setupForwardedEvents();

				// Re-validate that it need to be running. Due to asynchrony, it may be not the case anymore
				// If we can't run the LastSummary, simply return as to avoid paying the cost of launching
				// the summarizer at all.
				const shouldSummarizeState = this.getShouldSummarizeState();
				if (shouldSummarizeState.shouldSummarize === false) {
					// In order to allow the last summary to run, we not only need a stop reason that would
					// allow it but also, startWithInitialDelay to be false (start the summarization immediately),
					// which would happen when we have a high enough number of unsummarized ops.
					if (
						startWithInitialDelay ||
						// eslint-disable-next-line import/no-deprecated
						!Summarizer.stopReasonCanRunLastSummary(shouldSummarizeState.stopReason)
					) {
						this.state = SummaryManagerState.Starting;
						summarizer.stop(shouldSummarizeState.stopReason);
						return `early exit after starting summarizer ${shouldSummarizeState.stopReason}`;
					}
					this.logger.sendTelemetryEvent({
						eventName: "LastAttemptToSummarize",
					});
				}

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const clientId = this.latestClientId!;

				return PerformanceEvent.timedExecAsync(
					this.logger,
					{ eventName: "RunningSummarizer", attempt: this.startThrottler.numAttempts },
					async () => summarizer.run(clientId),
				);
			})
			.then((reason: string) => {
				this.logger.sendTelemetryEvent({
					eventName: "EndingSummarizer",
					reason,
				});
			})
			.catch((error) => {
				this.logger.sendTelemetryEvent(
					{
						eventName: "EndingSummarizer",
						reason: "exception",
					},
					error,
				);

				// Most of exceptions happen due to container being closed while loading it, due to
				// summarizer container loosing connection while load.
				// Not worth reporting such errors as errors. That said, we might miss some real errors if
				// we ignore blindly, so try to narrow signature we are looking for - skip logging
				// error only if this client should no longer be a summarizer (which in practice
				// means it also lost connection), and error happened on load (we do not have summarizer).
				// We could annotate the error raised in Container.load where the container closed during load with no error
				// and check for that case here, but that does not seem to be necessary.
				if (this.getShouldSummarizeState().shouldSummarize || this.summarizer !== undefined) {
					// Report any failure as an error unless it was due to cancellation (like "disconnected" error)
					// If failure happened on container load, we may not yet realized that socket disconnected, so check
					// offlineError.
					const category =
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						error?.errorType === DriverErrorTypes.offlineError ? "generic" : "error";
					this.logger.sendTelemetryEvent(
						{
							eventName: "SummarizerException",
							category,
						},
						error,
					);
				}
			})
			.finally(() => {
				assert(this.state !== SummaryManagerState.Off, 0x264 /* "Expected: Not Off" */);
				this.state = SummaryManagerState.Off;

				this.cleanupForwardedEvents();
				this.summarizer?.close();
				this.summarizer = undefined;

				if (this.getShouldSummarizeState().shouldSummarize) {
					this.startSummarization();
				}
			});
	}

	private stop(reason: SummarizerStopReason): void {
		if (!SummaryManager.isStartingOrRunning(this.state)) {
			return;
		}
		this.state = SummaryManagerState.Stopping;

		// Stopping the running summarizer client should trigger a change
		// in states when the running summarizer closes
		this.summarizer?.stop(reason);
	}

	/**
	 * Implements initial delay before creating summarizer
	 * @returns `true`, if creation is delayed due to heuristics (not many ops to summarize).
	 * `false` if summarizer should start immediately due to too many unsummarized ops.
	 */
	private async delayBeforeCreatingSummarizer(): Promise<boolean> {
		// throttle creation of new summarizer containers to prevent spamming the server with websocket connections
		let delayMs = this.startThrottler.getDelay();

		// We have been elected the summarizer. Some day we may be able to summarize with a live document but for
		// now we play it safe and launch a second copy.
		this.logger.sendTelemetryEvent({
			eventName: "CreatingSummarizer",
			throttlerDelay: delayMs,
			initialDelay: this.initialDelayMs,
			startThrottlerMaxDelayMs: this.startThrottler.maxDelayMs,
			opsSinceLastAck: this.summaryCollection.opsSinceLastAck,
			opsToBypassInitialDelay: this.opsToBypassInitialDelay,
			electedParentId: this.clientElection.electedParentId,
			electedClientId: this.clientElection.electedClientId,
		});

		// This delay helps ensure that last summarizer that might be left from previous client
		// has enough time to complete its last summary and thus new summarizer not conflict with previous one.
		// If, however, there are too many unsummarized ops, try to resolve it as quickly as possible, with
		// understanding that we may see nacks because of such quick action.
		// A better design would be for summarizer election logic to always select current summarizer as
		// summarizing client (i.e. clientType === "summarizer" can be elected) to ensure that nobody else can
		// summarizer while it finishes its work and moves to exit.
		// It also helps with pure boot scenario (single client) to offset expensive work a bit out from
		// critical boot sequence.
		let startWithInitialDelay = false;
		if (this.summaryCollection.opsSinceLastAck < this.opsToBypassInitialDelay) {
			startWithInitialDelay = true;
			delayMs = Math.max(delayMs, this.initialDelayMs);
		}

		if (delayMs > 0) {
			let timer;
			let resolveOpPromiseFn: (value: void | PromiseLike<void>) => void;
			// Create a listener that will break the delay if we've exceeded the initial delay ops count.
			const opsListenerFn = (): void => {
				if (this.summaryCollection.opsSinceLastAck >= this.opsToBypassInitialDelay) {
					clearTimeout(timer);
					resolveOpPromiseFn();
				}
			};
			// Create a Promise that will resolve when the delay expires.
			const delayPromise = new Promise<void>((resolve) => {
				timer = setTimeout(() => resolve(), delayMs);
			});
			// Create a Promise that will resolve if the ops count passes the threshold.
			const opPromise = new Promise<void>((resolve) => {
				resolveOpPromiseFn = resolve;
			});
			this.summaryCollection.addOpListener(opsListenerFn);
			await Promise.race([delayPromise, opPromise]);
			this.summaryCollection.removeOpListener(opsListenerFn);
		}
		return startWithInitialDelay;
	}

	public summarizeOnDemand(options: IOnDemandSummarizeOptions): ISummarizeResults {
		if (this.summarizer === undefined) {
			throw Error("No running summarizer client");
			// TODO: could spawn a summarizer client temporarily.
		}
		return this.summarizer.summarizeOnDemand(options);
	}

	public enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult {
		if (this.summarizer === undefined) {
			throw Error("No running summarizer client");
			// TODO: could spawn a summarizer client temporarily.
		}
		return this.summarizer.enqueueSummarize(options);
	}

	public dispose(): void {
		this.clientElection.off("electedSummarizerChanged", this.refreshSummarizer);
		this.connectedState.off("connected", this.handleConnected);
		this.connectedState.off("disconnected", this.handleDisconnected);
		this.cleanupForwardedEvents();
		this._disposed = true;
	}

	private readonly forwardedEvents = new Map<string, () => void>();

	private setupForwardedEvents(): void {
		[
			"summarize",
			"summarizeAllAttemptsFailed",
			"summarizerStop",
			"summarizerStart",
			"summarizerStartupFailed",
		].forEach((event) => {
			const listener = (...args: any[]): void => {
				this.emit(event, ...args);
			};
			// TODO: better typing here
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.summarizer?.on(event as any, listener);
			this.forwardedEvents.set(event, listener);
		});
	}

	private cleanupForwardedEvents(): void {
		this.forwardedEvents.forEach((listener, event) =>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.summarizer?.off(event as any, listener),
		);
		this.forwardedEvents.clear();
	}
}
