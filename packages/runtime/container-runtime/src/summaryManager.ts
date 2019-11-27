/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRunnable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, ITelemetryLogger, LoaderHeader } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Heap, IComparer, IHeapNode, PerformanceEvent } from "@microsoft/fluid-core-utils";
import { ISequencedClient } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

interface ITrackedClient {
    clientId: string;
    sequenceNumber: number;
}

class ClientComparer implements IComparer<ITrackedClient> {
    public readonly min: ITrackedClient = {
        clientId: null,
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

const defaultMaxRestarts = 5;

export class SummaryManager extends EventEmitter {
    private readonly logger: ITelemetryLogger;
    private readonly quorumHeap = new QuorumHeap();
    private summarizerClientId?: string;
    private clientId?: string;
    private connected = false;
    private state = SummaryManagerState.Off;
    private runningSummarizer?: IComponentRunnable;

    public get summarizer() {
        return this.summarizerClientId;
    }

    private get shouldSummarize() {
        return this.connected && this.clientId === this.summarizer;
    }

    constructor(
        private readonly context: IContainerContext,
        private readonly summariesEnabled: boolean,
        private readonly enableWorker: boolean,
        parentLogger: ITelemetryLogger,
        private readonly maxRestarts: number = defaultMaxRestarts,
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

        this.refreshSummarizer();
    }

    public setConnected(clientId: string) {
        this.updateConnected(true, clientId);
    }

    public setDisconnected() {
        this.updateConnected(false);
    }

    public on(event: "summarizer", listener: (clientId: string) => void): this;
    // tslint:disable-next-line:no-unnecessary-override
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
            return `parentShouldNotSummarize:${this.summarizer}`;
        } else {
            return undefined;
        }
    }

    private refreshSummarizer() {
        // compute summarizer
        const newSummarizerClientId = this.quorumHeap.getFirstClientId();
        if (newSummarizerClientId !== this.summarizerClientId) {
            this.summarizerClientId = newSummarizerClientId;
            this.emit("summarizer", newSummarizerClientId);
        }

        // transition states depending on shouldSummarize, which is a calculated
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
                // cannot take any action until summarizer is created
                // state transition will occur after creation
                return;
            }
            case SummaryManagerState.Running: {
                if (!this.shouldSummarize) {
                    // only need to check defined in case we are between
                    // finally and then states; stopping should trigger
                    // a change in states when the running summarizer closes
                    if (this.runningSummarizer) {
                        this.runningSummarizer.stop(this.getStopReason());
                    }
                }
                return;
            }
            default: {
                return;
            }
        }
    }

    private start(attempt: number = 1) {
        if (attempt > this.maxRestarts) {
            this.logger.sendErrorEvent({ eventName: "MaxRestarts", maxRestarts: this.maxRestarts });
            this.state = SummaryManagerState.Off;
            return;
        }

        this.state = SummaryManagerState.Starting;

        // if we should never summarize, lock in starting state
        if (!this.summariesEnabled) {
            return;
        }

        if (this.context.clientDetails.type === "summarizer") {
            // Make sure that the summarizer client does not load another summarizer.
            return;
        }

        this.createSummarizer().then((summarizer) => {
            if (this.shouldSummarize) {
                this.run(summarizer);
            } else {
                summarizer.stop(this.getStopReason());
                this.state = SummaryManagerState.Off;
            }
        }, (error) => {
            this.logger.sendErrorEvent({ eventName: "CreateSummarizerError", attempt }, error);
            if (this.shouldSummarize) {
                this.start(attempt + 1);
            } else {
                this.state = SummaryManagerState.Off;
            }
        });
    }

    private run(summarizer: IComponentRunnable) {
        this.state = SummaryManagerState.Running;

        const runningSummarizerEvent = PerformanceEvent.start(this.logger, { eventName: "RunningSummarizer" });
        this.runningSummarizer = summarizer;
        // tslint:disable-next-line: no-floating-promises
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

    private async createSummarizer(): Promise<IComponentRunnable> {
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
            return Promise.reject<IComponentRunnable>("Invalid summarizer route");
        }

        const rawComponent = response.value as IComponent;
        const summarizer = rawComponent.IComponentRunnable;

        if (!summarizer) {
            return Promise.reject<IComponentRunnable>("Component does not implement IComponentRunnable");
        }

        return summarizer;
    }
}
