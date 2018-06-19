// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core, types } from "../client-api";
import { IDocumentTaskInfo } from "./definitions";

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
        await this.updateTaskMap(task, this.document.clientId);
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
            // Reset the task map, remove doc listener and self listeners.
            console.log(`Removing ${task} task for document ${this.document.tenantId}/${this.document.id}`);
            this.updateTaskMap(task, undefined);
            this.document.removeListener("op", this.operation);
            this.document.removeListener("error", this.errorHandler);
            this.events.removeAllListeners();
            this.removeAllListeners();
        }
    }

    private async updateTaskMap(task: string, clientId: string) {
        const rootMapView = await this.document.getRoot().getView();
        await this.waitForTaskMap(rootMapView);
        const taskMap = rootMapView.get("tasks") as types.IMap;
        taskMap.set(task, clientId);
    }

    private pollTaskMap(root: types.IMapView, resolve, reject) {
        if (root.has("tasks")) {
            resolve();
        } else {
            const pauseAmount = 50;
            console.log(`Did not find taskmap - waiting ${pauseAmount}ms`);
            setTimeout(() => this.pollTaskMap(root, resolve, reject), pauseAmount);
        }
    }

    private waitForTaskMap(root: types.IMapView): Promise<void> {
        return new Promise<void>((resolve, reject) => this.pollTaskMap(root, resolve, reject));
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
