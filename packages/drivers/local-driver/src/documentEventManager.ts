/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@microsoft/fluid-container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";

/**
 * Document delta event which must at least provide access
 * to the delta manager.
 */
export interface IDocumentDeltaEvent {
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

/**
 * Class with access to the delta connection server that can handle document delta events.
 */
export class DocumentDeltaEventManager {
    /**
     * Yields control in the JavaScript event loop.
     */
    public static async yieldEventLoop(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    private readonly documents: Set<IDocumentDeltaEvent> = new Set<IDocumentDeltaEvent>();

    private isNormalProcessingPaused = false;

    /*
    * Is processing being deterministically controlled, or are changes allowed to flow freely?
    */
    public get isProcessingControlled(): boolean {
        return this.isNormalProcessingPaused;
    }

    /**
     * @param localDeltaConnectionServer - instance of delta connection server
     */
    public constructor(private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer) { }

    /**
     * Registers a collection of document delta events by adding them to
     * the local collection.
     * @param docs - array of document delta events to register
     */
    public registerDocuments(...docs: IDocumentDeltaEvent[]) {
        docs.forEach((doc) => {
            this.documents.add(doc);
        });
    }

    /**
     * Processes a collection of document delta events by pausing their
     * delta managers, validating them, resuming them, and yielding them
     * while they have work.
     * @param docs - array of document delta events to process
     */
    public async process(...docs: IDocumentDeltaEvent[]): Promise<void> {
        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.inbound.resume();
            doc.deltaManager.outbound.resume();
        }
        await this.yieldWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle || !doc.deltaManager.outbound.idle);
    }

    /**
     * Processes a collection of incoming document delta events by pausing their
     * delta managers, validating them, resuming their inbound only, and yielding them
     * while they have work.
     * @param docs - incoming document delta events to process
     */
    public async processIncoming(...docs: IDocumentDeltaEvent[]): Promise<void> {
        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.inbound.resume();
        }
        await this.yieldWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle);
    }

    /**
     * Processes a collection of outgoing document delta events by pausing their
     * delta managers, validating them, resuming their outbound only, and yielding them
     * while they have work.
     * @param docs - outgoing document delta events to process
     */
    public async processOutgoing(...docs: IDocumentDeltaEvent[]): Promise<void> {
        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.outbound.resume();
        }
        await this.yieldWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.outbound.idle);
    }

    /**
     * Pause normal delta event processing for controlled testing.
     * Should be called upfront during automated testing.
     */
    public async pauseProcessing(...docs: IDocumentDeltaEvent[]) {
        await this.pauseAndValidateDocs(...docs);
    }

    /**
     * Resume normal delta event processing after a pauseProcessing call.
     * Useful when called from a manual test utility, but not for automated testing.
     */
    public resumeProcessing(...docs: IDocumentDeltaEvent[]) {
        docs.map(DocumentDeltaEventManager.resumeDocument);
        this.isNormalProcessingPaused = false;
    }

    private async pauseAndValidateDocs(...docs: IDocumentDeltaEvent[]): Promise<Iterable<IDocumentDeltaEvent>> {
        await Promise.all(Array.from(this.documents).map(DocumentDeltaEventManager.pauseDocument));
        this.isNormalProcessingPaused = true;

        if (docs && docs.length > 0) {
            docs.forEach((doc) => {
                if (!this.documents.has(doc)) {
                    throw new Error(
                        "All documents must be registered with test server to deterministically control processing");
                }
            });
            return docs;
        }
        return this.documents;
    }

    private async yieldWhileDocumentsHaveWork(
        docs: Iterable<IDocumentDeltaEvent>,
        hasWork: (doc: IDocumentDeltaEvent) => boolean,
    ): Promise<void> {
        let working: boolean;
        do {
            await DocumentDeltaEventManager.yieldEventLoop();
            working = await this.localDeltaConnectionServer.hasPendingWork();
            if (!working) {
                for (const doc of docs) {
                    if (hasWork(doc)) {
                        working = true;
                        break;
                    }
                }
            }
        } while (working);

        // If deterministically controlling events, need to pause before continuing
        if (this.isNormalProcessingPaused) {
            for (const doc of docs) {
                await DocumentDeltaEventManager.pauseDocument(doc);
            }
        }
    }

    private static async pauseDocument(doc: IDocumentDeltaEvent) {
        await Promise.all([doc.deltaManager.inbound.pause(), doc.deltaManager.outbound.pause()]);
    }

    private static resumeDocument(doc: IDocumentDeltaEvent) {
        doc.deltaManager.inbound.resume();
        doc.deltaManager.outbound.resume();
    }
}
