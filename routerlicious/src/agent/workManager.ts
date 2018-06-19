import { EventEmitter } from "events";
import { MergeTree } from "../client-api";
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
    private documentMap: { [docId: string]: { [work: string]: IWork} } = {};
    private events = new EventEmitter();
    private agentsLoaded: boolean = false;

    constructor(private serviceFactory: IDocumentServiceFactory,
                private config: any,
                private serverUrl: string,
                private agentModuleLoader: (id: string) => Promise<any>) {
        super();
    }

    public async startDocumentWork(tenantId: string, documentId: string, workType: string, token?: string) {
        const services = await this.serviceFactory.getService(tenantId);

        switch (workType) {
            case "snapshot":
                const snapshotWork = new SnapshotWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, snapshotWork);
                break;
            case "intel":
                await this.loadUploadedAgents();
                const intelWork = new IntelWork(documentId, token, this.config, services);
                await this.startTask(tenantId, documentId, workType, intelWork);
                break;
            case "spell":
                await this.loadSpellings().catch((err) => {
                    this.events.emit(err);
                });
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
                break;
            default:
                throw new Error(`Unknown work type: ${workType}`);
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

    private async applyWork(fullId: string, workType: string, worker: IWork) {
        console.log(`Starting work ${workType} for document ${fullId}`);
        await worker.start(workType);
        console.log(`Started work ${workType} for document ${fullId}`);
        this.documentMap[fullId][workType] = worker;
        // Register existing intel agents to this document
        if (workType === "intel") {
            this.registerAgentsToNewDocument(fullId, workType);
        }
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
        worker.on("stop", (ev: IDocumentTaskInfo) => {
            this.stopDocumentWork(ev.tenantId, ev.docId, ev.task);
        });
    }

    // Register a new agent to all active documents.
    private registerAgentToExistingDocuments(agent: IAgent) {
        for (const docId of Object.keys(this.documentMap)) {
            for (const workType of Object.keys(this.documentMap[docId])) {
                if (workType === "intel") {
                    const intelWork = this.documentMap[docId][workType] as IntelWork;
                    intelWork.registerNewService(agent.code);
                    console.log(`Registered newly loaded ${agent.name} to document ${docId}`);
                }
            }
        }
    }

    // Register all agents to a new document.
    private registerAgentsToNewDocument(fullId: string, workType: string) {
        const intelWork = this.documentMap[fullId][workType] as IntelWork;
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
