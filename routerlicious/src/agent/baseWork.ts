// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core } from "../client-api";
import { IDocumentTaskInfo } from "./definitions";
import { runAfterWait } from "./utils";

const leaderCheckerMS = 7500;

// This timer should be more than deli kick off timer.
const idleTimeoutMS = (5 * 60 * 1000) + (30 * 1000);

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected task: string;

    protected opHandler: (...args: any[]) => void;
    private idleHandler: (...args: any[]) => void;
    private errorHandler: (...args: any[]) => void;
    private disconnectHandler: (...args: any[]) => void;
    private leaveHandler: (...args: any[]) => void;

    private events = new EventEmitter();
    private leaderCheckerTimer = null;
    private idleTimer = null;

    constructor(private id: string, private conf: any) {
        super();
        this.config = this.conf;
    }

    public async loadDocument(options: Object, service: core.IDocumentService, task: string): Promise<void> {
        this.task = task;
        this.document = await api.load(this.id, options, null, true, api.defaultRegistry, service);
        this.attachListeners();
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
        // Deattach all listeners.
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    protected async start(task: string): Promise<void> {
        // Allows derived class to implement their own start.
    }

    private attachListeners() {
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);

        // On a disconnect or self client leave, close and restart the document.
        this.disconnectHandler = async () => {
            await this.closeAndRestart();
        };
        this.document.on("disconnect", this.disconnectHandler);

        this.leaveHandler = async (clientId: string) => {
            if (this.document.clientId === clientId) {
                await this.closeAndRestart();
            }
        };
        this.document.on("clientLeave", this.leaveHandler);

        // Close and restart if the document is idle for a while.
        this.idleHandler = () => {
            if (this.idleTimer) {
                clearTimeout(this.idleTimer);
            }
            this.idleTimer = setTimeout(async () => {
                await this.closeAndRestart();
            }, idleTimeoutMS);
        };
        this.document.on("op", this.idleHandler);
    }

    private async closeAndRestart(): Promise<void> {
        this.closeDocument(this.task);
        await this.start(this.task);
    }

    private closeDocument(task: string) {
        console.log(`Closing document ${this.document.tenantId}/${this.document.id} for task ${task}`);

        // Remove all listeners from the document.
        this.document.removeListener("op", this.opHandler);
        this.document.removeListener("error", this.errorHandler);
        this.document.removeListener("disconnect", this.disconnectHandler);
        this.document.removeListener("clientLeave", this.leaveHandler);
        this.document.removeAllListeners();

        // Close the document.
        this.document.close();

        // Clear all timers.
        if (this.leaderCheckerTimer) {
            clearInterval(this.leaderCheckerTimer);
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
    }

    // Periodically checks for leaders in the document. Emits a stop request if leader is not present.
    private checkForLeader(task) {
        this.leaderCheckerTimer = setInterval(() => {
            if (this.noLeader()) {
                const stopEvent: IDocumentTaskInfo = {
                    docId: this.document.id,
                    task,
                    tenantId: this.document.tenantId,
                };
                this.events.emit("stop", stopEvent);
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
