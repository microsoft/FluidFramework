/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRunnable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { LoaderHeader } from "@microsoft/fluid-container-loader";
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

export class SummaryManager extends EventEmitter {
    private _summarizer: string;
    private readonly heap = new Heap<ITrackedClient>((new ClientComparer()));
    private readonly heapMembers = new Map<string, IHeapNode<ITrackedClient>>();
    private connected = false;
    private clientId: string;
    private runningSummarizer?: IComponentRunnable;
    private readonly logger: ITelemetryLogger;

    public get summarizer() {
        return this._summarizer;
    }

    private get shouldSummarize() {
        return this.connected && this.clientId === this.summarizer;
    }

    constructor(
        private readonly context: IContainerContext,
        private readonly generateSummaries: boolean,
        private readonly enableWorker: boolean,
        parentLogger: ITelemetryLogger,
    ) {
        super();

        this.logger = ChildLogger.create(parentLogger, "SummaryManager");

        const members = context.quorum.getMembers();
        for (const [clientId, member] of members) {
            this.addHeapNode(clientId, member);
        }

        context.quorum.on("addMember", (clientId: string, details: ISequencedClient) => {
            this.addHeapNode(clientId, details);
            this.computeSummarizer();
        });

        context.quorum.on("removeMember", (clientId: string) => {
            this.heap.remove(this.heapMembers.get(clientId));
            this.computeSummarizer();
        });
    }

    public on(event: "summarizer", listener: (clientId: string) => void): this;
    // tslint:disable-next-line:no-unnecessary-override
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public setConnected(clientId: string) {
        if (this.connected) {
            return;
        }

        this.connected = true;
        this.clientId = clientId;

        this.computeSummarizer(true);
    }

    public setDisconnected() {
        if (!this.connected) {
            return;
        }

        this.connected = false;
        this.clientId = undefined;
        if (this.runningSummarizer) {
            this.runningSummarizer.stop("parentDisconnected");
            this.runningSummarizer = undefined;
        }
    }

    private addHeapNode(clientId: string, client: ISequencedClient) {
        const heapNode = this.heap.add({ clientId, sequenceNumber: client.sequenceNumber });
        this.heapMembers.set(clientId, heapNode);
    }

    /**
     * Updates the current summarizer. In the case of force does not exit early in case the summarizer has not changed.
     * This is used when transitioning to a connected state where we want to start a new summarizer
     */
    private computeSummarizer(force = false) {
        const clientId = this.heap.count() > 0 ? this.heap.peek().value.clientId : undefined;

        // Do not start if we are already the summarizer, unless force is passed.
        // Force will be passed if we think we are not already summarizing, which might
        // happen if we are not yet connected the first time through computeSummarizer.
        if (!force && clientId === this._summarizer) {
            return;
        }

        this._summarizer = clientId;
        this.emit("summarizer", clientId);

        // To maintain back compat with snapshots we will not summarize unless asked. But will still run the
        // code to elect and detect the summarizer for testing + code coverage.
        if (!this.generateSummaries) {
            // summaries disabled
            return;
        }

        // Make sure that the summarizer client does not load another summarizer.
        if (this.context.clientType === "summarizer") {
            return;
        }

        // if we are connected and the elected summarizer client, start a summarizer
        if (this.shouldSummarize && !this.runningSummarizer) {
            const runSummarizerEvent = PerformanceEvent.start(this.logger, { eventName: "RunningSummarizer" });
            this.startSummarizer().then(
                (message: string) => {
                    runSummarizerEvent.end({ message });
                    this.computeSummarizer(this.connected);
                },
                (error) => {
                    runSummarizerEvent.cancel({}, error);
                    this.computeSummarizer(this.connected);
                });
        }
    }

    private async startSummarizer(): Promise<string> {
        const summarizer = await this.createSummarizer();

        // synchronous block where the summarizer actually runs
        if (!this.shouldSummarize) {
            summarizer.stop("parentShouldNotSummarize");
            return "shouldNotSummarize";
        }

        if (this.runningSummarizer) {
            summarizer.stop("parentAlreadyRunningSummarizer");
            return "alreadyRunningSummarizer";
        }

        this.runningSummarizer = summarizer;
        try {
            await summarizer.run(this.clientId);
        } finally {
            this.runningSummarizer = undefined;
        }

        return "runComplete";
    }

    private async createSummarizer(): Promise<ISummarizer> {
        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        this.logger.sendTelemetryEvent({ eventName: "CreatingSummarizer" });

        const loader = this.context.loader;

        // TODO eventually we may wish to spawn an execution context from which to run this
        const request: IRequest = {
            headers: {
                [LoaderHeader.cache]: false,
                [LoaderHeader.clientType]: "summarizer",
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
