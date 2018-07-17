// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core } from "../client-api";
import { IDocumentTaskInfo } from "./definitions";
import { runAfterWait } from "./utils";

const leaderCheckerMS = 7500;

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected operation: (...args: any[]) => void;
    private events = new EventEmitter();
    private errorHandler: (...args: any[]) => void;
    private leaderCheckerTimer: NodeJS.Timer;

    constructor(private id: string, private conf: any) {
        super();
        this.config = this.conf;
    }

    public async loadDocument(options: Object, service: core.IDocumentService, task: string): Promise<void> {
        this.document = await api.load(this.id, options, null, true, api.defaultRegistry, service);
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);
        this.checkForLeader(task);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async stop(task: string): Promise<void> {
        // Make sure the document is loaded first.
        if (this.document !== undefined) {
            await runAfterWait(
                this.document.hasUnackedOps,
                this.document,
                "processed",
                async () => {
                    this.closeDocument(task);
                });
        }
    }

    public removeListeners() {
        this.removeAllListeners();
    }

    private closeDocument(task: string) {
        console.log(`Closing document ${this.document.tenantId}/${this.document.id} for task ${task}`);
        this.document.removeListener("op", this.operation);
        this.document.removeListener("error", this.errorHandler);
        this.document.removeAllListeners();
        this.document.close();
        this.events.removeAllListeners();
        this.removeAllListeners();
        if (this.leaderCheckerTimer) {
            clearInterval(this.leaderCheckerTimer);
        }
    }

    // Periodically checks for leaders in the document. Emits a stop request if leader is not present.
    private checkForLeader(task) {
        this.leaderCheckerTimer = setInterval(() => {
            console.log(`Running leader checker for ${this.document.id}/${task}!`);
            if (this.noLeader()) {
                const stopEvent: IDocumentTaskInfo = {
                    docId: this.document.id,
                    task,
                    tenantId: this.document.tenantId,
                };
                this.events.emit("stop", stopEvent);
                console.log(`No leader for ${this.document.id}: ${task}`);
            }
        }, leaderCheckerMS);
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
