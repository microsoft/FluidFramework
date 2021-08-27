/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, TypedEventEmitter, assert } from "@fluidframework/common-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IFluidRouter, IRequest } from "@fluidframework/core-interfaces";
import { IDeltaManager, LoaderHeader } from "@fluidframework/container-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { createSummarizingWarning } from "./summarizer";
import { ISummarizerClientElection, summarizerClientType } from "./summarizerClientElection";
import { IThrottler } from "./throttler";
import { ISummarizer, ISummarizerOptions, ISummarizingWarning, SummarizerStopReason } from "./summarizerTypes";
import { SummaryCollection } from "./summaryCollection";

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
type StopReason = Extract<SummarizerStopReason, "parentNotConnected" | "parentShouldNotSummarize">;
type ShouldSummarizeState =
    | { shouldSummarize: true; }
    | { shouldSummarize: false; stopReason: StopReason; };

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

export interface ISummaryManagerEvents extends IEvent {
    (event: "summarizerWarning", listener: (warning: ISummarizingWarning) => void);
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
export class SummaryManager extends TypedEventEmitter<ISummaryManagerEvents> implements IDisposable {
    private readonly logger: ITelemetryLogger;
    private readonly opsToBypassInitialDelay: number;
    private readonly initialDelayMs: number;
    private latestClientId: string | undefined;
    private state = SummaryManagerState.Off;
    private runningSummarizer?: ISummarizer;
    private _disposed = false;

    public get disposed() {
        return this._disposed;
    }

    public get currentState() { return this.state; }

    constructor(
        private readonly clientElection: ISummarizerClientElection,
        private readonly connectedState: IConnectedState,
        private readonly summaryCollection: Pick<SummaryCollection, "opsSinceLastAck">,
        parentLogger: ITelemetryLogger,
        /** Creates summarizer by asking interactive container to spawn summarizing container and
         * get back its Summarizer instance. */
        private readonly requestSummarizerFn: () => Promise<ISummarizer>,
        private readonly startThrottler: IThrottler,
        {
            initialDelayMs = defaultInitialDelayMs,
            opsToBypassInitialDelay = defaultOpsToBypassInitialDelay,
        }: Readonly<Partial<ISummaryManagerConfig>> = {},
        private readonly summarizerOptions?: Readonly<Partial<ISummarizerOptions>>,
    ) {
        super();

        this.logger = ChildLogger.create(
            parentLogger,
            "SummaryManager",
            {all:{ clientId: () => this.latestClientId }});

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

    private readonly handleConnected = (clientId: string) => {
        this.latestClientId = clientId;
        // If we have a summarizer, it should have been either cancelled on disconnected by now.
        // But because of lastSummary process, it can still hang around, so there is not much we can
        // check or assert.
        this.refreshSummarizer();
    };

    private readonly handleDisconnected = () => {
        this.refreshSummarizer();
    };

    private getShouldSummarizeState(): ShouldSummarizeState {
        if (!this.connectedState.connected) {
            return { shouldSummarize: false, stopReason: "parentNotConnected" };
        } else if (this.connectedState.clientId !== this.clientElection.electedClientId) {
            return { shouldSummarize: false, stopReason: "parentShouldNotSummarize" };
        } else if (this.disposed) {
            assert(false, "Disposed should mean disconnected!");
        } else {
            return { shouldSummarize: true };
        }
    }

    private readonly refreshSummarizer = () => {
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

    private startSummarization() {
        assert(this.state === SummaryManagerState.Off, "Expected: off");
        this.state = SummaryManagerState.Starting;

        assert(this.runningSummarizer === undefined, "Old summarizer is still working!");

        this.delayBeforeCreatingSummarizer().then(async (startWithInitialDelay: boolean) => {
            // Re-validate that it need to be running. Due to asynchrony, it may be not the case anymore
            // but only if creation was delayed. If it was not, then we want to ensure we always create
            // a summarizer to kick off lastSummary. Without that, we would not be able to summarize and get
            // document out of broken state if it has too many ops and ordering service keeps nacking main
            // container (and thus it goes into cycle of reconnects)
            if (startWithInitialDelay && this.getShouldSummarizeState().shouldSummarize === false) {
                return;
            }

            const summarizer = await this.requestSummarizerFn();

            // Re-validate that it need to be running. Due to asynchrony, it may be not the case anymore
            const shouldSummarizeState = this.getShouldSummarizeState();
            if (shouldSummarizeState.shouldSummarize === false) {
                summarizer.stop(shouldSummarizeState.stopReason);
                return;
            }

            assert(this.state === SummaryManagerState.Starting, "Expected: starting");
            this.state = SummaryManagerState.Running;

            summarizer.on("summarizingError",
                (warning: ISummarizingWarning) => this.emit("summarizerWarning", warning));
            this.runningSummarizer = summarizer;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const clientId = this.latestClientId!;

            await PerformanceEvent.timedExecAsync(
                this.logger,
                { eventName: "RunningSummarizer", attempt: this.startThrottler.numAttempts },
                async () => summarizer.run(clientId, this.summarizerOptions),
            );
            // Follow-up: requires PR #7230 completion to enable this assert:
            // assert(summarizer.cancelled, "should be cancelled by now");
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "SummarizerException" }, error);
            this.emit("summarizerWarning", error);

            // Note that summarizer may keep going (like doing last summary).
            // Ideally we await stopping process, but this code path is due to a bug
            // that needs to be fixed either way.
            this.stop("summarizerException");
        }).finally(() => {
            assert(this.state !== SummaryManagerState.Off, "Expected: Not Off");
            this.state = SummaryManagerState.Off;

            this.runningSummarizer = undefined;

            if (this.getShouldSummarizeState().shouldSummarize) {
                this.startSummarization();
            }
        });
    }

    private stop(reason: SummarizerStopReason) {
        assert(this.state === SummaryManagerState.Running, "Expected: Running");
        this.state = SummaryManagerState.Stopping;

        if (this.runningSummarizer !== undefined) {
            // Stopping the running summarizer client should trigger a change
            // in states when the running summarizer closes
            this.runningSummarizer.stop(reason);
        } else {
            // Should not be possible to hit this case
            this.logger.sendErrorEvent({ eventName: "StopCalledWithoutRunningSummarizer", reason });
            this.state = SummaryManagerState.Off;
        }
    }

    /**
     * Implements initial delay before creating summarizer
     * @returns true, if creation is delayed due to heuristics (not many ops to summarize).
     *          False if summarizer should start immediately due to too many unsummarized ops.
     */
    private async delayBeforeCreatingSummarizer(): Promise<boolean> {
        // throttle creation of new summarizer containers to prevent spamming the server with websocket connections
        let delayMs = this.startThrottler.getDelay();
        if (delayMs > 0 && delayMs >= this.startThrottler.maxDelayMs) {
            this.emit(
                "summarizerWarning",
                createSummarizingWarning("SummaryManager: CreateSummarizer Max Throttle Delay", false),
            );
        }

        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        this.logger.sendTelemetryEvent({
            eventName: "CreatingSummarizer",
            throttlerDelay: delayMs,
            initialDelay: this.initialDelayMs,
            opsSinceLastAck: this.summaryCollection.opsSinceLastAck,
            opsToBypassInitialDelay: this.opsToBypassInitialDelay,
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
            await delay(delayMs);
        }
        return startWithInitialDelay;
    }

    public readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"] = (...args) => {
        if (this.runningSummarizer === undefined) {
            throw Error("No running summarizer client");
            // TODO: could spawn a summarizer client temporarily.
        }
        return this.runningSummarizer.summarizeOnDemand(...args);
    };

    public readonly enqueueSummarize: ISummarizer["enqueueSummarize"] = (...args) => {
        if (this.runningSummarizer === undefined) {
            throw Error("No running summarizer client");
            // TODO: could spawn a summarizer client temporarily.
        }
        return this.runningSummarizer.enqueueSummarize(...args);
    };

    public dispose() {
        this.clientElection.off("electedSummarizerChanged", this.refreshSummarizer);
        this.connectedState.off("connected", this.handleConnected);
        this.connectedState.off("disconnected", this.handleDisconnected);
        this._disposed = true;
    }
}

/**
 * Forms a function that will request a Summarizer.
 * @param loaderRouter - the loader acting as an IFluidRouter
 * @param deltaManager - delta manager to get last sequence number
 */
export const formRequestSummarizerFn = (
    loaderRouter: IFluidRouter,
    deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
) => async () => {
    // TODO eventually we may wish to spawn an execution context from which to run this
    const request: IRequest = {
        headers: {
            [LoaderHeader.cache]: false,
            [LoaderHeader.clientDetails]: {
                capabilities: { interactive: false },
                type: summarizerClientType,
            },
            [DriverHeader.summarizingClient]: true,
            [LoaderHeader.reconnect]: false,
            [LoaderHeader.sequenceNumber]: deltaManager.lastSequenceNumber,
        },
        url: "/_summarizer",
    };

    const fluidObject = await requestFluidObject(loaderRouter, request);
    const summarizer = fluidObject.ISummarizer;

    if (!summarizer) {
        return Promise.reject(new Error("Fluid object does not implement ISummarizer"));
    }

    return summarizer;
};
