// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core } from "../client-api";

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected operation: (...args: any[]) => void;
    private events = new EventEmitter();
    private errorHandler: (...args: any[]) => void;

    constructor(private id: string, private conf: any) {
        super();
        this.config = this.conf;
    }

    public loadDocument(options: Object, service: core.IDocumentService): Promise<void> {
        const documentP = api.load(this.id, options, null, true, api.defaultRegistry, service);
        return documentP.then(
            (doc) => {
                console.log(`Loaded document ${this.id}`);
                this.document = doc;
                this.document.on("error", (error) => {
                    this.events.emit("error", error);
                });
            }, (error) => {
                console.error("BaseWork:loadDocument failed", error);
                return Promise.reject(error);
            });
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public stop(): Promise<void> {
        // Make sure the document is loaded first.
        if (this.document !== undefined) {
            this.document.removeListener("op", this.operation);
            this.document.removeListener("error", this.errorHandler);
        }
        return Promise.resolve();
    }
}
