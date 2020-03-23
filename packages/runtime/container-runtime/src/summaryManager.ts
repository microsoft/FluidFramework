/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger, IDisposable } from "@microsoft/fluid-common-definitions";
import { IComponent, IComponentRunnable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, LoaderHeader } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Heap, IComparer, IHeapNode, PerformanceEvent, PromiseTimer } from "@microsoft/fluid-common-utils";
import { ISequencedClient } from "@microsoft/fluid-protocol-definitions";
import { ISummarizer, Summarizer } from "./summarizer";

interface ITrackedClient {
    clientId: string;
    sequenceNumber: number;
}

class ClientComparer implements IComparer<ITrackedClient> {
    public readonly min: ITrackedClient = {
        clientId: "",
        sequenceNumber: -1,
    };

    public compare(a: ITrackedClient, b: ITrackedClient): number {
        return a.sequenceNumber - b.sequenceNumber;
    }
}

class QuorumHeap {
    private readonly heap = new Heap<ITrackedClient>((new ClientComparer()));
    private readonly heapMembers = new Map<string, IHeapNode<ITrackedClient>>();

    public addClient(clientId: string, client: ISequencedClient) {
        const heapNode = this.heap.add({ clientId, sequenceNumber: client.sequenceNumber });
        this.heapMembers.set(clientId, heapNode);
    }

    public removeClient(clientId: string) {
        const member = this.heapMembers.get(clientId);
        if (member) {
            this.heap.remove(member);
            this.heapMembers.delete(clientId);
        }
    }

    public getFirstClientId(): string | undefined {
        return this.heap.count() > 0 ? this.heap.peek().value.clientId : undefined;
    }
}

enum SummaryManagerState {
    Off = 0,
    Starting = 1,
    Running = 2,
}

const defaultInitialDelayMs = 5000;

export class SummaryManager extends EventEmitter implements IDisposable {
    private readonly logger: ITelemetryLogger;
    private readonly quorumHeap = new QuorumHeap();
    private readonly initialDelayP: Promise<void>;
    private readonly initialDelayTimer?: PromiseTimer;
    private summarizerClientId?: string;
    private clientId?: string;
    private connected = false;
    private state = SummaryManagerState.Off;
    private runningSummarizer?: IComponentRunnable;
    private _disposed = false;
    private readonly startTimes: number[] = [];

    public get summarizer() {
        return this.summarizerClientId;
    }

    public get disposed() {
        return this._disposed;
    }

    private get shouldSummarize() {
        return this.connected && !this.disposed && this.clientId === this.summarizer;
    }

    constructor(
        private readonly context: IContainerContext,
        private readonly summariesEnabled: boolean,
        private readonly enableWorker: boolean,
        parentLogger: ITelemetryLogger,
        private readonly setNextSummarizer: (summarizer: Promise<Summarizer>) => void,
        private readonly nextSummarizerP?: Promise<Summarizer>,
        immediateSummary: boolean = false,
        initialDelayMs: number = defaultInitialDelayMs,
    ) {
        super();

        this.logger = ChildLogger.create(parentLogger, "SummaryManager");

        this.connected = context.connected;
        if (this.connected) {
            this.clientId = context.clientId;
        }

        const members = context.quorum.getMembers();
        for (const [clientId, client] of members) {
            this.quorumHeap.addClient(clientId, client);
        }

        context.quorum.on("addMember", (clientId: string, details: ISequencedClient) => {
            this.quorumHeap.addClient(clientId, details);
            this.refreshSummarizer();
        });

        context.quorum.on("removeMember", (clientId: string) => {
            this.quorumHeap.removeClient(clientId);
            this.refreshSummarizer();
        });

        this.initialDelayTimer = immediateSummary ? undefined : new PromiseTimer(initialDelayMs, () => { });
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.initialDelayP = this.initialDelayTimer?.start().catch(() => { }) ?? Promise.resolve();

        this.refreshSummarizer();
    }

    public setConnected(clientId: string) {
        this.updateConnected(true, clientId);
    }

    public setDisconnected() {
        this.updateConnected(false);
    }

    public on(event: "summarizer", listener: (clientId: string) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    private updateConnected(connected: boolean, clientId?: string) {
        if (this.connected === connected) {
            return;
        }

        this.connected = connected;
        this.clientId = connected ? clientId : undefined;
        this.refreshSummarizer();
    }

    private getStopReason(): string | undefined {
        if (!this.connected) {
            return "parentNotConnected";
        } else if (this.clientId !== this.summarizer) {
            return "parentShouldNotSummarize";
        } else if (this.disposed) {
            return "disposed";
        } else {
            return undefined;
        }
    }

    private refreshSummarizer() {
        // Compute summarizer
        const newSummarizerClientId = this.quorumHeap.getFirstClientId();
        if (newSummarizerClientId !== this.summarizerClientId) {
            this.summarizerClientId = newSummarizerClientId;
            this.emit("summarizer", newSummarizerClientId);
        }

        // Transition states depending on shouldSummarize, which is a calculated
        // property that is only true if this client is connected and has the
        // computed summarizer client id
        switch (this.state) {
            case SummaryManagerState.Off: {
                if (this.shouldSummarize) {
                    this.start();
                }
                return;
            }
            case SummaryManagerState.Starting: {
                // Cannot take any action until summarizer is created
                // state transition will occur after creation
                return;
            }
            case SummaryManagerState.Running: {
                if (!this.shouldSummarize) {
                    // Only need to check defined in case we are between
                    // finally and then states; stopping should trigger
                    // a change in states when the running summarizer closes

                    if (this.runningSummarizer) {
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
                        this.runningSummarizer.stop!(this.getStopReason());
                    }
                }
                return;
            }
            default: {
                return;
            }
        }
    }

    private start() {
        this.state = SummaryManagerState.Starting;

        // If we should never summarize, lock in starting state
        if (!this.summariesEnabled) {
            return;
        }

        if (this.context.clientDetails.type === "summarizer") {
            // Make sure that the summarizer client does not load another summarizer.
            return;
        }

        // Throttle creation of new summarizer containers to prevent spamming the server with websocket connections.
        // Ideally we want throttleDelayWindow >= throttleMaxDelay * ceil(finv(throttleMaxDelay)) (where
        // f:start count in window -> delay time is our function to calculate delay). This makes the delay increase
        // monotonically up to the max, rather than older start times falling out of the window causing shorter delays.
        // e.g. in this case, with throttleMaxDelay = 30 seconds and f(x) = 20(2^x - 1), finv(30000) = log2(1501)
        // ~= 10.552 so we want throttleDelayWindow >= 30000 * 11 = 5.5 minutes.
        const throttleMaxDelayMs = 30 * 1000;
        const throttleDelayWindowMs = 6 * 60 * 1000;
        const now = Date.now();
        while (this.startTimes.length && now - this.startTimes[0] > throttleDelayWindowMs) {
            this.startTimes.shift();
        }
        const delayMs = Math.min(20 * (Math.pow(2, this.startTimes.length) - 1), throttleMaxDelayMs);
        this.startTimes.push(now);

        this.createSummarizer(delayMs).then((summarizer) => {
            if (summarizer === undefined) {
                if (this.shouldSummarize) {
                    this.start();
                } else {
                    this.state = SummaryManagerState.Off;
                }
            } else if (this.shouldSummarize) {
                this.setNextSummarizer(summarizer.setSummarizer());
                this.run(summarizer);
            } else {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
                summarizer.stop!(this.getStopReason());
                this.state = SummaryManagerState.Off;
            }
        }, (error) => {
            this.logger.sendErrorEvent({ eventName: "CreateSummarizerError", attempt: this.startTimes.length }, error);
            if (this.shouldSummarize) {
                this.start();
            } else {
                this.state = SummaryManagerState.Off;
            }
        });
    }

    private run(summarizer: IComponentRunnable) {
        this.state = SummaryManagerState.Running;

        const runningSummarizerEvent = PerformanceEvent.start(this.logger, { eventName: "RunningSummarizer" });
        this.runningSummarizer = summarizer;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.runningSummarizer.run(this.clientId).then(() => {
            runningSummarizerEvent.end();
        }, (error) => {
            runningSummarizerEvent.cancel({}, error);
        }).finally(() => {
            this.runningSummarizer = undefined;
            if (this.shouldSummarize) {
                this.start();
            } else {
                this.state = SummaryManagerState.Off;
            }
        });
    }

    private async createSummarizer(delayMs: number): Promise<ISummarizer | undefined> {
        await Promise.all([
            this.initialDelayP,
            delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve(),
        ]);

        if (!this.shouldSummarize) {
            return undefined;
        }

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (this.nextSummarizerP) {
            return this.nextSummarizerP;
        }

        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        this.logger.sendTelemetryEvent({ eventName: "CreatingSummarizer" });

        const loader = this.context.loader;

        // TODO eventually we may wish to spawn an execution context from which to run this
        const request: IRequest = {
            headers: {
                [LoaderHeader.cache]: false,
                [LoaderHeader.clientDetails]: {
                    capabilities: { interactive: false },
                    type: "summarizer",
                },
                [LoaderHeader.reconnect]: false,
                [LoaderHeader.sequenceNumber]: this.context.deltaManager.referenceSequenceNumber,
                [LoaderHeader.executionContext]: this.enableWorker ? "worker" : undefined,
            },
            url: "/_summarizer",
        };

        const response = await loader.request(request);

        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return Promise.reject<ISummarizer>("Invalid summarizer route");
        }

        const rawComponent = response.value as IComponent;
        const summarizer = rawComponent.ISummarizer;

        if (!summarizer) {
            return Promise.reject<ISummarizer>("Component does not implement ISummarizer");
        }

        return summarizer;
    }

    public dispose() {
        this.initialDelayTimer?.clear();
        this._disposed = true;
    }
}
