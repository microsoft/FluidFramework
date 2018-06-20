import * as agent from "@prague/routerlicious/dist/agent";
import { EventEmitter } from "events";
import { WorkManager } from "./workManager";

/**
 * The WorkerService manages the Socket.IO connection and work sent to it. On any error,
 * it notifies the caller and keep working.
 */
export class WorkerService extends EventEmitter {

    private workManager: agent.IWorkManager;

    constructor(
        private serviceFactory: agent.IDocumentServiceFactory, private config: any) {
        super();
        this.workManager = new WorkManager(this.serviceFactory, this.config);
        this.workManager.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async startTasks(tenantId: string, documentId: string, tasks: string[], token: string) {
        const tasksP = [];
        for (const task of tasks) {
            tasksP.push(this.workManager.startDocumentWork(tenantId, documentId, task, token));
        }
        await Promise.all(tasksP);
    }

    public stopTasks(tenantId: string, documentId: string, tasks: string[]) {
        for (const task of tasks) {
            this.workManager.stopDocumentWork(tenantId, documentId, task);
        }
    }

    public async loadAgent(agentName: string) {
        await this.workManager.loadAgent(agentName);
    }

    public unloadAgent(agentName: string) {
        this.workManager.unloadAgent(agentName);
    }
}
