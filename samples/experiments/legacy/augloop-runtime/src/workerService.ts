import * as agent from "@prague/routerlicious/dist/agent";
import { EventEmitter } from "events";
import { WorkManager } from "./workManager";

export class WorkerService extends EventEmitter {

    private workManager: agent.IWorkManager;

    constructor(
        private serviceFactory: agent.IDocumentServiceFactory, private config: any) {
        super();
        this.workManager = new WorkManager(this.serviceFactory, this.config);
        this.workManager.on("error", (error) => {
            this.emit("error", error);
        });
        this.listenToEvents();
    }

    public async startTasks(tenantId: string, documentId: string, tasks: string[], token: string) {
        const tasksP = [];
        for (const task of tasks) {
            tasksP.push(this.workManager.startDocumentWork(tenantId, documentId, task, token));
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
        this.workManager.on("stop", (ev: agent.IDocumentTaskInfo) => {
            this.emit("stop", ev);
        });
    }
}
