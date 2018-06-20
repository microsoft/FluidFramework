import * as agent from "@prague/routerlicious/dist/agent";
import { EventEmitter } from "events";
import * as winston from "winston";
import { AugLoopRuntime } from "./augloop-runtime";
import { AugmentationWork } from "./augmentationWork";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements agent.IWorkManager {

    private documentMap: { [docId: string]: { [work: string]: agent.IWork} } = {};
    private events = new EventEmitter();
    private augRuntime: AugLoopRuntime;

    constructor(private serviceFactory: agent.IDocumentServiceFactory, private config: any) {
        super();
        this.augRuntime = new AugLoopRuntime();
    }

    public async startDocumentWork(tenantId: string, documentId: string, workType: string, token?: string) {
        const services = await this.serviceFactory.getService(tenantId);

        switch (workType) {
            case "augmentation":
                const augmentationWork = new AugmentationWork(
                    documentId,
                    token,
                    this.config,
                    services,
                    this.augRuntime);
                await this.startTask(tenantId, documentId, workType, augmentationWork);
                break;
            default:
                throw new Error("Unknown work type!");
        }

    }

    public stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId);
        if (fullId in this.documentMap) {
            const taskMap = this.documentMap[fullId];
            const task = taskMap[workType];
            if (task !== undefined) {
                task.stop(workType);
                delete taskMap[workType];
            }
        }
    }

    public async loadAgent(agentName: string): Promise<void> {
        // No implementation needed
    }

    public unloadAgent(agentName: string) {
        // No implementation needed
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
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

    private async applyWork(fullId: string, workType: string, worker: agent.IWork) {
        winston.info(`Starting work ${workType} for document ${fullId}`);
        await worker.start(workType);
        winston.info(`Started work ${workType} for document ${fullId}`);
        this.documentMap[fullId][workType] = worker;
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
        worker.on("stop", (ev: agent.IDocumentTaskInfo) => {
            this.stopDocumentWork(ev.tenantId, ev.docId, ev.task);
        });
    }
}
