import { IDeltaManager } from "@prague/runtime-definitions";

export interface IDocumentDeltaEvent {
    deltaManager: IDeltaManager;
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

    public registerDocuments(...docs: IDocumentDeltaEvent[]) {
        docs.forEach((doc) => {
            this.documents.add(doc);
        });
    }

    public async process(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.inbound.resume();
            doc.deltaManager.outbound.resume();
        }
        await this.yeildWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle || !doc.deltaManager.outbound.idle);
    }

    public async processIncoming(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.inbound.resume();
        }
        await this.yeildWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.inbound.idle);
    }

    public async processOutgoing(...docs: IDocumentDeltaEvent[]): Promise<void> {

        const documents = this.pauseAndValidateDocs(...docs);
        for (const doc of documents) {
            doc.deltaManager.outbound.resume();
        }
        await this.yeildWhileDocumentsHaveWork(
            documents,
            (doc) => !doc.deltaManager.outbound.idle);
    }

    public pauseProcessing(...docs: IDocumentDeltaEvent[]) {
        this.pauseAndValidateDocs(...docs);
    }

    private pauseAndValidateDocs(...docs: IDocumentDeltaEvent[]):
        Iterable<IDocumentDeltaEvent>  {

        for (const doc of this.documents) {
            this.pauseDocument(doc);
        }

        if (docs && docs.length > 0) {
            docs.forEach((doc) => {
                if (!this.documents.has(doc)) {
                    throw new Error(
                        "All documents must be registerd with the test server to deterministically control processing");
                }
            });
            return docs;
        }
        return this.documents;
    }

    private async yeildWhileDocumentsHaveWork(
        docs: Iterable<IDocumentDeltaEvent>,
        hasWork: (doc: IDocumentDeltaEvent) => boolean,
    ): Promise<void> {
        let working: boolean;
        do {
            await DocumentDeltaEventManager.yieldEventLoop();
            working = false;
            for (const doc of docs) {
                if (hasWork(doc)) {
                    working = true;
                }
            }
        } while (working);

        for (const doc of docs) {
            this.pauseDocument(doc);
        }
    }

    private pauseDocument(doc: IDocumentDeltaEvent) {
        doc.deltaManager.inbound.pause();
        doc.deltaManager.outbound.pause();
    }
}
