/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager, IDocumentMessage, ISequencedDocumentMessage } from "@prague/container-definitions";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

export interface IDocumentDeltaEvent {
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

export class DocumentDeltaEventManager {

    public static async yieldEventLoop(): Promise<void> {
        await new Promise<void>((resolve) => {
            // tslint:disable-next-line no-string-based-set-timeout
            setTimeout(resolve, 0);
        });
    }

    private readonly documents: Set<IDocumentDeltaEvent> =
        new Set<IDocumentDeltaEvent>();

    private isNormalProcessingPaused = false;

    /*
    * Is processing being deterministically controlled, or are changes allowed to flow freely?
    */
    public get isProcessingControlled() {
        return this.isNormalProcessingPaused;
    }

    public constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) { }

    public registerDocuments(...docs: IDocumentDeltaEvent[]) {
        docs.forEach((doc) => {
            this.documents.add(doc);
        });
    }

    public async process(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            await Promise.all([doc.deltaManager.inbound.resume(), doc.deltaManager.outbound.resume()]);
        }
        await this.yieldWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle || !doc.deltaManager.outbound.idle);
    }

    public async processIncoming(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            await doc.deltaManager.inbound.resume();
        }
        await this.yieldWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle);
    }

    public async processOutgoing(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = await this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            await doc.deltaManager.outbound.resume();
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
    public async resumeProcessing(...docs: IDocumentDeltaEvent[]) {
        await Promise.all(docs.map((doc) => this.resumeDocument(doc)));
        this.isNormalProcessingPaused = false;
    }

    private async pauseAndValidateDocs(...docs: IDocumentDeltaEvent[]): Promise<Iterable<IDocumentDeltaEvent>> {
        await Promise.all(Array.from(this.documents).map((doc) => this.pauseDocument(doc)));
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
            working = await this.testDeltaConnectionServer.hasPendingWork();
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
                await this.pauseDocument(doc);
            }
        }
    }

    private async pauseDocument(doc: IDocumentDeltaEvent) {
        await Promise.all([doc.deltaManager.inbound.pause(), doc.deltaManager.outbound.pause()]);
    }

    private async resumeDocument(doc: IDocumentDeltaEvent) {
        await Promise.all([doc.deltaManager.inbound.resume(), doc.deltaManager.outbound.resume()]);
    }
}
