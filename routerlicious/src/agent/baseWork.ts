// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core } from "../client-api";
import { IDocumentTaskInfo } from "./definitions";
import { getTaskMapView } from "./utils";

const leaderCheckerMS = 20000;

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
        await this.updateTaskMap(this.document, task, this.document.clientId);
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
            // Reset the task map, remove listeners, and close the document.
            console.log(`Removing ${task} task for document ${this.document.tenantId}/${this.document.id}`);
            await this.updateTaskMap(this.document, task, undefined);
            this.document.removeListener("op", this.operation);
            this.document.removeListener("error", this.errorHandler);
            // This should be called after close event is received.
            this.document.close();
            this.events.removeAllListeners();
            this.removeAllListeners();
        }
    }

    private async updateTaskMap(doc: api.Document, task: string, clientId: string) {
        const taskMapView = await getTaskMapView(doc);
        taskMapView.set(task, clientId);
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
                clearInterval(this.leaderCheckerTimer);
            }
        }, leaderCheckerMS);
    }

    // A leader is any non-robot client connected to the document.
    private noLeader(): boolean {
        for (const client of this.document.getClients()) {
            if (!client[1] || client[1].type !== core.Robot) {
                return false;
            }
        }
        return true;
    }
}
