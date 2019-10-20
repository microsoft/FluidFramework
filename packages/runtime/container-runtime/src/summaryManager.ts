/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRunnable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Heap, IComparer, IHeapNode } from "@microsoft/fluid-core-utils";
import { ISequencedClient } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";
import { ISummarizer } from "./summarizer";

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
    private runningSummarizer?: ISummarizer;
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
            this.runningSummarizer.stop("parent disconnected");
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

        // do not start if we are not the summarizer or not connected
        if (this._summarizer !== this.clientId || !this.connected) {
            return;
        }

        // To maintain back compat with snapshots we will not summarize unless asked. But will still run the
        // code to elect and detect the summarizer for testing + code coverage.
        if (!this.generateSummaries) {
            return;
        }

        // Make sure that the summarizer client does not load another summarizer.
        if (this.context.configuration === undefined || this.context.configuration.canReconnect) {
            // Create and run the new summarizer. On disconnect if we should still summarize launch another instance.
            const doneP = this.createSummarizer()
                .then((summarizer) => {
                    if (this.shouldSummarize) {
                        this.runningSummarizer = summarizer as ISummarizer;
                        return summarizer.run(this.clientId);
                    }
                });
            doneP.then(
                () => {
                    // In the future we will respawn the summarizer - for now we simply stop
                    // this.computeSummarizer(this.connected)
                    this.logger.sendTelemetryEvent({ eventName: "RunningSummarizerCompleted" });
                },
                (error) => {
                    this.logger.sendErrorEvent({ eventName: "RunningSummarizerFailed" }, error);
                });
        }

    }

    private async createSummarizer() {
        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        this.logger.sendTelemetryEvent({ eventName: "CreatingSummarizer" });

        const loader = this.context.loader;

        // TODO eventually we may wish to spawn an execution context from which to run this
        const request: IRequest = {
            headers: {
                "fluid-cache": false,
                "fluid-reconnect": false,
                "fluid-sequence-number": this.context.deltaManager.referenceSequenceNumber,
                "execution-context": this.enableWorker ? "thread" : "self",
            },
            url: "/_summarizer",
        };

        const response = await loader.request(request);

        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return Promise.reject<ISummarizer>("Invalid summarizer route");
        }

        const rawComponent = response.value as IComponent;
        const summarizer = rawComponent.IComponentRunnable;

        if (!summarizer) {
            return Promise.reject<IComponentRunnable>("Component does not implement ISummarizer");
        }

        return summarizer;
    }
}
