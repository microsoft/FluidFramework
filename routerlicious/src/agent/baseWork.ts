// tslint:disable:ban-types
import { EventEmitter } from "events";
import { api, core, types } from "../client-api";

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

    public async loadDocument(options: Object, service: core.IDocumentService, task: string): Promise<void> {
        this.document = await api.load(this.id, options, null, true, api.defaultRegistry, service);
        await this.updateTaskMap(task);
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded first.
        if (this.document !== undefined) {
            this.document.removeListener("op", this.operation);
            this.document.removeListener("error", this.errorHandler);
        }
    }

    private async updateTaskMap(task: string) {
        const rootMapView = await this.document.getRoot().getView();
        await this.waitForTaskMap(rootMapView);
        const taskMap = rootMapView.get("tasks") as types.IMap;
        taskMap.set(task, this.document.clientId);
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
}
