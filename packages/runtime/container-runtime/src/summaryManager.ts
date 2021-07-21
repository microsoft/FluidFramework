/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, IPromiseTimerResult, PromiseTimer, TypedEventEmitter } from "@fluidframework/common-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IFluidObject, IRequest } from "@fluidframework/core-interfaces";
import { IContainerContext, LoaderHeader } from "@fluidframework/container-definitions";
import { ISequencedClient } from "@fluidframework/protocol-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { createSummarizingWarning } from "./summarizer";
import { SummarizerClientElection, summarizerClientType } from "./summarizerClientElection";
import { Throttler } from "./throttler";
import { ISummarizer, ISummarizingWarning, SummarizerStopReason } from "./summarizerTypes";

const defaultInitialDelayMs = 5000;
const opsToBypassInitialDelay = 4000;

const defaultThrottleDelayWindowMs = 60 * 1000;
const defaultThrottleMaxDelayMs = 30 * 1000;
// default throttling function increases exponentially (0ms, 20ms, 60ms, 140ms, etc)
const defaultThrottleDelayFunction = (n: number) => 20 * (Math.pow(2, n) - 1);

enum SummaryManagerState {
    Off = 0,
    Starting = 1,
    Running = 2,
    Stopping = 3,
}

// Please note that all reasons in this list are not errors,
// and thus they are not raised today to parent container as error.
// If this needs to be changed in future, we should re-evaluate what and how we raise to summarizer
type StopReason = Extract<SummarizerStopReason, "parentNotConnected" | "parentShouldNotSummarize" | "disposed">;
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

export class SummaryManager extends TypedEventEmitter<ISummaryManagerEvents> implements IDisposable {
    private readonly logger: ITelemetryLogger;
    private readonly initialDelayP: Promise<IPromiseTimerResult | void>;
    private readonly initialDelayTimer?: PromiseTimer;
    private latestClientId: string | undefined;
    private state = SummaryManagerState.Off;
    private runningSummarizer?: ISummarizer;
    private _disposed = false;
    private readonly startThrottler = new Throttler(
        defaultThrottleDelayWindowMs,
        defaultThrottleMaxDelayMs,
        defaultThrottleDelayFunction,
    );
    private opsUntilFirstConnect = -1;

    public get disposed() {
        return this._disposed;
    }

    constructor(
        private readonly context: IContainerContext,
        private readonly clientElection: SummarizerClientElection,
        private readonly connectedState: IConnectedState,
        parentLogger: ITelemetryLogger,
        initialDelayMs: number = defaultInitialDelayMs,
    ) {
        super();

        this.logger = ChildLogger.create(
            parentLogger,
            "SummaryManager",
            {all:{ clientId: () => this.latestClientId }});

        this.connectedState.on("connected", this.handleConnected);
        this.connectedState.on("disconnected", this.handleDisconnected);
        this.latestClientId = this.connectedState.clientId;

        // Track ops until first (write) connect
        const opsUntilFirstConnectHandler = (clientId: string, details: ISequencedClient) => {
            if (this.opsUntilFirstConnect === -1 && clientId === this.connectedState.clientId) {
                context.quorum.off("addMember", opsUntilFirstConnectHandler);
                this.opsUntilFirstConnect = details.sequenceNumber - this.context.deltaManager.initialSequenceNumber;
            }
        };
        context.quorum.on("addMember", opsUntilFirstConnectHandler);

        this.initialDelayTimer = new PromiseTimer(initialDelayMs, () => { });
        this.initialDelayP = this.initialDelayTimer?.start() ?? Promise.resolve();
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
        this.runningSummarizer?.updateOnBehalfOf(clientId);
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
            return { shouldSummarize: false, stopReason: "disposed" };
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
        this.state = SummaryManagerState.Starting;

        // throttle creation of new summarizer containers to prevent spamming the server with websocket connections
        const delayMs = this.startThrottler.getDelay();
        if (delayMs >= defaultThrottleMaxDelayMs) {
            // we can't create a summarizer for some reason; raise error on container
            this.emit(
                "summarizerWarning",
                createSummarizingWarning("SummaryManager: CreateSummarizer Max Throttle Delay", false),
            );
        }

        this.createSummarizer(delayMs).then((summarizer) => {
            summarizer.on("summarizingError",
                (warning: ISummarizingWarning) => this.emit("summarizerWarning", warning));
            this.runSummarizer(summarizer);
        }, (error) => {
            this.logger.sendErrorEvent({
                eventName: "CreateSummarizerError",
                attempt: this.startThrottler.attempts,
            }, error);
            this.tryRestart();
        });
    }

    private runSummarizer(summarizer: ISummarizer) {
        this.state = SummaryManagerState.Running;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const clientId = this.latestClientId!;
        this.runningSummarizer = summarizer;

        PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "RunningSummarizer", attempt: this.startThrottler.attempts },
            async () => summarizer.run(clientId),
        ).finally(() => {
            this.runningSummarizer = undefined;
            this.tryRestart();
        });

        const shouldSummarizeState = this.getShouldSummarizeState();
        if (shouldSummarizeState.shouldSummarize === false) {
            this.stop(shouldSummarizeState.stopReason);
        }
    }

    private tryRestart(): void {
        const shouldSummarizeState = this.getShouldSummarizeState();
        if (shouldSummarizeState.shouldSummarize) {
            this.startSummarization();
        } else {
            this.state = SummaryManagerState.Off;
        }
    }

    private stop(reason: SummarizerStopReason) {
        this.state = SummaryManagerState.Stopping;

        if (this.runningSummarizer) {
            // Stopping the running summarizer client should trigger a change
            // in states when the running summarizer closes
            this.runningSummarizer.stop(reason);
        } else {
            // Should not be possible to hit this case
            this.logger.sendErrorEvent({ eventName: "StopCalledWithoutRunningSummarizer", reason });
            this.state = SummaryManagerState.Off;
        }
    }

    private async createSummarizer(delayMs: number): Promise<ISummarizer> {
        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        this.logger.sendTelemetryEvent({
            eventName: "CreatingSummarizer",
            delayMs,
            opsUntilFirstConnect: this.opsUntilFirstConnect,
        });

        const shouldDelay = delayMs > 0;
        const shouldInitialDelay = this.opsUntilFirstConnect < opsToBypassInitialDelay;
        if (shouldDelay || shouldInitialDelay) {
            await Promise.all([
                shouldInitialDelay ? this.initialDelayP : Promise.resolve(),
                shouldDelay ? delay(delayMs) : Promise.resolve(),
            ]);
        }

        const loader = this.context.loader;

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
                [LoaderHeader.sequenceNumber]: this.context.deltaManager.lastSequenceNumber,
            },
            url: "/_summarizer",
        };

        const response = await loader.request(request);

        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return Promise.reject(new Error("Invalid summarizer route"));
        }

        const rawFluidObject = response.value as IFluidObject;
        const summarizer = rawFluidObject.ISummarizer;

        if (!summarizer) {
            return Promise.reject(new Error("Fluid object does not implement ISummarizer"));
        }

        return summarizer;
    }

    public dispose() {
        this.clientElection.off("electedSummarizerChanged", this.refreshSummarizer);
        this.connectedState.off("connected", this.handleConnected);
        this.connectedState.off("disconnected", this.handleDisconnected);
        this.initialDelayTimer?.clear();
        this._disposed = true;
    }
}
