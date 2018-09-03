import { api, core } from "@prague/client-api";
import { IDocumentService } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { IDocumentTaskInfo } from "./definitions";
import { runAfterWait } from "./utils";

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected task: string;

    protected opHandler: (...args: any[]) => void;
    private errorHandler: (...args: any[]) => void;
    private leaveHandler: (...args: any[]) => void;

    private events = new EventEmitter();
    private readonlyMode = false;

    constructor(private id: string, private conf: any) {
        super();
        this.config = this.conf;
    }

    public async loadDocument(options: any, service: IDocumentService, task: string): Promise<void> {
        this.task = task;
        this.document = await api.load(this.id, options, null, true, api.defaultRegistry, service);

        await runAfterWait(
            !this.document.isConnected,
            this.document,
            "connected",
            async () => {
                this.attachPostListeners();
            });
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded.
        if (this.document !== undefined) {
            // For read only mode, just close the document. Otherwise wait for ops to acked first.
            if (this.readonlyMode) {
                this.closeDocument();
            } else {
                await runAfterWait(
                    this.document.hasUnackedOps,
                    this.document,
                    "processed",
                    async () => {
                        this.closeDocument();
                    });
            }
        }
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    protected async start(task: string): Promise<void> {
        // Allows derived class to implement their own start.
    }

    private attachPostListeners() {
        // Emits document relared errors to caller.
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);

        // On a self client leave, mark yourself as readonly and request stop.
        // Otherwise check leader.
        this.leaveHandler = async (clientId: string) => {
            if (this.document.clientId === clientId) {
                this.readonlyMode = true;
                this.requestStop();
            } else {
                if (this.noLeader()) {
                    this.requestStop();
                }
            }
        };
        this.document.on("clientLeave", this.leaveHandler);
    }

    private closeDocument() {
        console.log(`Closing document ${this.document.tenantId}/${this.document.id} for task ${this.task}`);

        // Remove all listeners from the document.
        this.document.removeAllListeners();

        // Close the document.
        this.document.close();

    }

    // Emits a stop request message to the caller.
    private requestStop() {
        const stopEvent: IDocumentTaskInfo = {
            docId: this.document.id,
            task: this.task,
            tenantId: this.document.tenantId,
        };
        this.events.emit("stop", stopEvent);
    }

    // A leader is any browser client connected to the document.
    private noLeader(): boolean {
        for (const client of this.document.getClients()) {
            if (!client[1] || client[1].type === core.Browser) {
                return false;
            }
        }
        return true;
    }
}
