/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IRequest } from "@prague/component-core-interfaces";
import { IContainerContext } from "@prague/container-definitions";
import { ISequencedClient } from "@prague/protocol-definitions";
import { Heap, IComparer, IHeapNode } from "@prague/utils";
import { EventEmitter } from "events";
import { debug } from "./debug";
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

    public get summarizer() {
        return this._summarizer;
    }

    private get shouldSummarize() {
        return this.connected && this.clientId === this.summarizer;
    }

    constructor(private readonly context: IContainerContext, private readonly generateSummaries: boolean) {
        super();

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
        if (!force && clientId === this._summarizer) {
            return;
        }

        this._summarizer = clientId;
        this.emit("summarizer", clientId);

        if (this._summarizer !== this.clientId || !this.connected) {
            return;
        }

        // To maintain back compat with snapshots we will not summarize unless asked. But will still run the
        // code to elect and detect the summarizer for testing + code coverage.
        if (!this.generateSummaries) {
            return;
        }

        // Create and run the new summarizer. On disconnect if we should still summarize launch another instance.
        const doneP = this.createSummarizer()
            .then((summarizer) => {
                if (this.shouldSummarize) {
                    return summarizer.run(this.clientId);
                }
            });
        doneP.then(
            () => {
                // In the future we will respawn the summarizer - for now we simply stop
                // this.computeSummarizer(this.connected)
                debug("summary generation complete");
            },
            (error) => {
                debug("summary generation error", error);
            });
    }

    private async createSummarizer() {
        // We have been elected the summarizer. Some day we may be able to summarize with a live document but for
        // now we play it safe and launch a second copy.
        debug(`${this.clientId} elected summarizer`);

        const loader = this.context.loader;

        // TODO eventually we may wish to spawn an execution context from which to run this
        const request: IRequest = {
            headers: {
                "fluid-cache": false,
                "fluid-reconnect": false,
                "fluid-sequence-number": this.context.deltaManager.referenceSequenceNumber,
            },
            url: "/_summarizer",
        };

        const response = await loader.request(request);

        if (response.status !== 200 || response.mimeType !== "prague/component") {
            return Promise.reject<ISummarizer>("Invalid summarizer route");
        }

        const rawComponent = response.value as IComponent;
        const summarizer = rawComponent.ISummarizer;

        if (!summarizer) {
            return Promise.reject<ISummarizer>("Component does not implement ISummarizer");
        }

        return summarizer;
    }
}
