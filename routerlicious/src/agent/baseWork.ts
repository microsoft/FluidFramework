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
        const documentP = api.load(this.id, options, null, true, api.defaultRegistry,
            service);
        return new Promise<void>((resolve, reject) => {
            documentP.then(async (doc) => {
                console.log(`Loaded document ${this.id}`);
                this.document = doc;
                this.errorHandler = (error: string) => {
                    this.events.emit("error", error);
                };
                this.document.on("error", this.errorHandler);
                resolve();
            }, (error) => {
                console.log(`Document ${this.id} not found!`);
                reject();
            });
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
