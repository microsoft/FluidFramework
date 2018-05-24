/*
import { EventEmitter } from "events";
import * as request from "request";
import * as url from "url";
import { MergeTree } from "../client-api";
import { AgentLoader, IAgent } from "./agentLoader";
import { IWork, IWorkManager } from "./definitions";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements IWorkManager {

    private documentMap: { [docId: string]: { [work: string]: IWork} } = {};
    private events = new EventEmitter();

    constructor(private serviceFactory: any,
                private config: any,
                private serverUrl: string,
                private agentModuleLoader: (id: string) => Promise<any>,
                private clientType: string,
                private workTypeMap: { [workType: string]: boolean}) {
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
            case "snapshot":
                const snapshotWork = new SnapshotWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, snapshotWork);
                break;
            case "intel":
                const intelWork = new IntelWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, intelWork);
                break;
            case "spell":
                const spellcheckWork = new SpellcheckerWork(
                    documentId,
                    token,
                    this.config,
                    this.dict,
                    services);
                await this.startTask(tenantId, documentId, workType, spellcheckWork);
                break;
            case "translation":
                const translationWork = new TranslationWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, translationWork);
            case "ping":
                const pingWork = new PingWork(this.serverUrl);
                await this.startTask(tenantId, documentId, workType, pingWork);
                break;
            default:
                throw new Error("Unknown work type!");
        }

    }

    private stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        switch (workType) {
            case "snapshot":
                this.stopTask(tenantId, documentId, workType);
                break;
            case "intel":
                this.stopTask(tenantId, documentId, workType);
                break;
            case "spell":
                this.stopTask(tenantId, documentId, workType);
                break;
            case "translation":
                this.stopTask(tenantId, documentId, workType);
                break;
            case "ping":
                this.stopTask(tenantId, documentId, workType);
                break;
            default:
                throw new Error("Unknown work type!");
        }
    }

    private getFullId(tenantId: string, documentId: string): string {
        return `${tenantId}/${documentId}`;
    }

    private async startTask(tenantId: string, documentId: string, workType: string, worker: IWork) {
        const fullId = this.getFullId(tenantId, documentId);

        if (worker) {
            if (!(fullId in this.documentMap)) {
                const emptyMap: { [work: string]: IWork } = {};
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

    private async applyWork(fullId: string, workType: string, worker: IWork) {
        console.log(`Starting work ${workType} for document ${fullId}`);
        await worker.start();
        console.log(`Started work ${workType} for document ${fullId}`);
        this.documentMap[fullId][workType] = worker;
        // Register existing intel agents to this document
        if (workType === "intel") {
            this.registerAgentsToNewDocument(fullId, workType);
        }
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

}*/
