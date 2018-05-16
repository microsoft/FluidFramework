import { api, core } from "../client-api";

export class BaseWork {

    protected document: api.Document;
    protected config: any;
    protected operation: (...args: any[]) => void;

    constructor(private id: string, private conf: any) {
        this.config = this.conf;
    }

    public loadDocument(options: Object, service: core.IDocumentService): Promise<void> {
        const documentP = api.load(this.id, options, null, true, api.defaultRegistry, service);
        return documentP.then(
            (doc) => {
                console.log(`Loaded document ${this.id}`);
                this.document = doc;
            }, (error) => {
                console.error("BaseWork:loadDocument failed", error);
                return Promise.reject(error);
            });
    }

    public stop(): Promise<void> {
        // Make sure the document is loaded first.
        if (this.document !== undefined) {
            this.document.removeListener("op", this.operation);
        }
        return Promise.resolve();
    }
}
