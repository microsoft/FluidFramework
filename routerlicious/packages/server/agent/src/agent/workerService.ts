import { ICodeLoader, IHost } from "@prague/container-definitions";
import { EventEmitter } from "events";
import { IDocumentServiceFactory, IDocumentTaskInfo, IWorkManager } from "./definitions";
import { WorkManager } from "./workManager";

export class WorkerService extends EventEmitter {

    private workManager: IWorkManager;

    constructor(
        private serviceFactory: IDocumentServiceFactory,
        private config: any,
        private serverUrl: string,
        private agentModuleLoader: (id: string) => Promise<any>,
        private codeLoader?: ICodeLoader) {
        super();
        this.workManager = new WorkManager(
            this.serviceFactory,
            this.config,
            this.serverUrl,
            this.agentModuleLoader,
            this.codeLoader);
        this.listenToEvents();
    }

    public async startTasks(
        tenantId: string,
        documentId: string,
        tasks: string[],
        host: IHost) {
        const tasksP = [];
        for (const task of tasks) {
            tasksP.push(this.workManager.startDocumentWork(tenantId, documentId, task, host));
        }
        await Promise.all(tasksP);
    }

    public async stopTask(tenantId: string, documentId: string, task: string) {
        await this.workManager.stopDocumentWork(tenantId, documentId, task);
    }

    public async loadAgent(agentName: string) {
        await this.workManager.loadAgent(agentName);
    }

    public unloadAgent(agentName: string) {
        this.workManager.unloadAgent(agentName);
    }

    private listenToEvents() {
        this.workManager.on("error", (error) => {
            this.emit("error", error);
        });
        this.workManager.on("stop", (ev: IDocumentTaskInfo) => {
            this.emit("stop", ev);
        });
    }
}
