// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core } from "../client-api";
import { IDocumentTaskInfo } from "./definitions";
import { runAfterWait } from "./utils";

const leaderCheckerTimeout = 60 * 60 * 1000;

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected task: string;

    protected opHandler: (...args: any[]) => void;
    private errorHandler: (...args: any[]) => void;
    private leaveHandler: (...args: any[]) => void;

    private events = new EventEmitter();
    private leaderCheckerTimer = null;
    private readonlyMode = false;

    constructor(private id: string, private conf: any) {
        super();
        this.config = this.conf;
    }

    public async loadDocument(options: Object, service: core.IDocumentService, task: string): Promise<void> {
        this.task = task;
        this.document = await api.load(this.id, options, null, true, api.defaultRegistry, service);

        // Make sure the document is fully connected.
        if (this.document.isConnected) {
            this.attachListeners();
        } else {
            console.log(`Waiting for the document to fully connected before running spellcheck!`);
            this.document.on("connected", () => {
                this.attachListeners();
            });
        }

        this.checkForLeader();

    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async stop(task: string): Promise<void> {
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

    private attachListeners() {
        // Emits document relared errors to caller.
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);

        // On a self client leave, mark yourself as readonly and emits a stop message.
        // If other client leaves, run the leader checker first.
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
        this.document.removeListener("op", this.opHandler);
        this.document.removeListener("error", this.errorHandler);
        this.document.removeListener("clientLeave", this.leaveHandler);
        this.document.removeAllListeners();

        // Close the document.
        this.document.close();

        // Clear timers.
        if (this.leaderCheckerTimer) {
            clearInterval(this.leaderCheckerTimer);
        }
        this.leaderCheckerTimer = undefined;
    }

    // In case a client leave message is missed, a fallback timer is used to check for leader.
    private checkForLeader() {
        this.leaderCheckerTimer = setInterval(() => {
            if (this.noLeader()) {
                this.requestStop();
            }
        }, leaderCheckerTimeout);
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
