import * as agent from "@prague/routerlicious/dist/agent";
import { EventEmitter } from "events";
import { AugmentationWork } from "./augmentationWork";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements agent.IWorkManager {

    private documentMap: { [docId: string]: { [work: string]: agent.IWork} } = {};
    private events = new EventEmitter();

    constructor(private serviceFactory: any,
                private config: any,
                serverUrl: string,
                agentModuleLoader: (id: string) => Promise<any>,
                clientType: string,
                workTypeMap: { [workType: string]: boolean}) {
        super();
    }

    public async processDocumentWork(tenantId: string, documentId: string, workType: string,
                                     action: string, token?: string) {
        if (action === "start") {
            await this.startDocumentWork(tenantId, documentId, token, workType);
        } else {
            this.stopDocumentWork(tenantId, documentId, workType);
        }
    }

    public async processAgentWork(agentName: string, action: string) {
        return;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    private async startDocumentWork(tenantId: string, documentId: string, token: string, workType: string) {
        const services = await this.serviceFactory.getService(tenantId);

        switch (workType) {
            case "augmentation":
                const augmentationWork = new AugmentationWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, augmentationWork);
                break;
            default:
                throw new Error("Unknown work type!");
        }

    }

    private stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        switch (workType) {
            case "augmentation":
                this.stopTask(tenantId, documentId, workType);
                break;
            default:
                throw new Error("Unknown work type!");
        }
    }

    private getFullId(tenantId: string, documentId: string): string {
        return `${tenantId}/${documentId}`;
    }

    private async startTask(tenantId: string, documentId: string, workType: string, worker: agent.IWork) {
        const fullId = this.getFullId(tenantId, documentId);

        if (worker) {
            if (!(fullId in this.documentMap)) {
                const emptyMap: { [work: string]: agent.IWork } = {};
                this.documentMap[fullId] = emptyMap;
            }
            if (!(workType in this.documentMap[fullId])) {
                await this.applyWork(fullId, workType, worker);
            }
        }
    }

    private stopTask(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId);

        if (fullId in this.documentMap) {
            const taskMap = this.documentMap[fullId];
            const task = taskMap[workType];
            if (task !== undefined) {
                task.stop();
                delete taskMap[workType];
            }
        }
    }

    private async applyWork(fullId: string, workType: string, worker: agent.IWork) {
        console.log(`Starting work ${workType} for document ${fullId}`);
        await worker.start();
        console.log(`Started work ${workType} for document ${fullId}`);
        this.documentMap[fullId][workType] = worker;
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
    }
}
