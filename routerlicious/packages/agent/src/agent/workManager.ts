import * as MergeTree from "@prague/merge-tree";
import { EventEmitter } from "events";
import { AgentLoader, IAgent } from "./agentLoader";
import { IDocumentServiceFactory, IDocumentTaskInfo, IWork, IWorkManager } from "./definitions";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements IWorkManager {

    private dict: MergeTree.TST<number>;
    private agentLoader: AgentLoader;
    private documentMap = new Map<string, IWork>();
    private events = new EventEmitter();
    private agentsLoaded: boolean = false;

    constructor(private serviceFactory: IDocumentServiceFactory,
                private config: any,
                private serverUrl: string,
                private agentModuleLoader: (id: string) => Promise<any>) {
        super();
        this.loadUploadedAgents().catch((err) => {
            this.emit("error", err);
        });
    }

    public async startDocumentWork(tenantId: string, documentId: string, workType: string, token: string) {
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
                await this.loadSpellings().catch((err) => {
                    this.events.emit(err);
                });
                if (this.dict) {
                    const spellcheckWork = new SpellcheckerWork(
                        documentId,
                        token,
                        this.config,
                        this.dict,
                        services);
                    await this.startTask(tenantId, documentId, workType, spellcheckWork);
                }
                break;
            case "translation":
                const translationWork = new TranslationWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, translationWork);
                break;
            default:
                throw new Error(`Unknown work type: ${workType}`);
        }

    }

    public async stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId, workType);
        if (this.documentMap.has(fullId)) {
            const task = this.documentMap.get(fullId);
            await this.stopTask(task);
            this.documentMap.delete(fullId);
        }
    }

    public async loadAgent(agentName: string): Promise<void> {
        const agent = await this.agentLoader.loadNewAgent(agentName);
        this.registerAgentToExistingDocuments(agent);
    }

    public unloadAgent(agentName: string) {
        this.agentLoader.unloadAgent(agentName);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    private getFullId(tenantId: string, documentId: string, workType: string): string {
        return `${tenantId}/${documentId}/${workType}`;
    }

    private async startTask(tenantId: string, documentId: string, workType: string, worker: IWork) {
        const fullId = this.getFullId(tenantId, documentId, workType);

        if (!this.documentMap.has(fullId) && worker) {
            this.documentMap.set(fullId, worker);
            await this.applyWork(fullId, workType, worker);
        }
    }

    private async applyWork(fullId: string, workType: string, worker: IWork) {
        await worker.start(workType);
        console.log(`Started work ${workType} for document ${fullId}`);
        // Register existing intel agents to this document
        if (workType === "intel") {
            this.registerAgentsToNewDocument(fullId);
        }
        // Listen for errors and future stop events.
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
        worker.on("stop", (ev: IDocumentTaskInfo) => {
            this.events.emit("stop", ev);
        });
    }

    private async stopTask(task: IWork) {
        if (task) {
            task.removeListeners();
            await task.stop();
        }
    }

    // Register a new agent to all active documents.
    private registerAgentToExistingDocuments(agent: IAgent) {
        for (const doc of this.documentMap) {
            const taskName = doc[0].split("/")[2];
            if (taskName === "intel") {
                const intelWork = doc[1] as IntelWork;
                intelWork.registerNewService(agent.code);
                console.log(`Registered newly loaded ${agent.name} to document ${doc[0]}`);
            }
        }
    }

    // Register all agents to a new document.
    private registerAgentsToNewDocument(fullId: string) {
        const intelWork = this.documentMap.get(fullId) as IntelWork;
        const agents = this.agentLoader.getAgents();
        // tslint:disable-next-line
        for (const name in agents) {
            console.log(`Registering ${name} to document ${fullId}`);
            intelWork.registerNewService(agents[name].code);
        }
    }

    private async loadSpellings() {
        if (!this.dict) {
            this.dict = new MergeTree.TST<number>();
            this.dict = await loadDictionary(this.serverUrl);
        }
    }

    private async loadUploadedAgents() {
        if (!this.agentsLoaded) {
            this.agentLoader = new AgentLoader(this.agentModuleLoader, this.config.alfredUrl);
            await this.agentLoader.loadUploadedAgents();
            this.agentsLoaded = true;
        }

    }
}
