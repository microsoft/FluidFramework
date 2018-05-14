import { EventEmitter } from "events";
import * as request from "request";
import * as url from "url";
import { core, MergeTree } from "../client-api";
import { AgentLoader, IAgent } from "./agentLoader";
import { IntelWork } from "./intelWork";
import { PingWork } from "./pingWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";
import { IWork } from "./work";

export interface IDocumentServiceFactory {
    getService(tenantId: string): Promise<core.IDocumentService>;
}

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter {

    private dict = new MergeTree.TST<number>();
    private agentLoader: AgentLoader;

    constructor(private serviceFactory: IDocumentServiceFactory,
                private config: any,
                private serverUrl: string,
                private documentMap: { [docId: string]: { [work: string]: IWork} },
                private agentModuleLoader: (id: string) => Promise<any>,
                private clientType: string,
                private loadDictionary: boolean,
                private loadAgents: boolean) {
        super();

        // Load dictionary if you are allowed.
        if (this.loadDictionary) {
            this.loadDict();
        }

        // Load agents if you are allowed.
        if (this.loadAgents) {
            // Agent Loader to load runtime uploaded agents.
            const agentServer = this.clientType === "paparazzi" ? this.config.alfredUrl : this.serverUrl;
            this.agentLoader = new AgentLoader(this.agentModuleLoader, agentServer);

            // Start loading all uploaded agents.
            this.agentLoader.loadUploadedAgents(this.clientType).then(() => {
                console.log(`Loaded all uploaded agents`);
            }, (err) => {
                console.log(`Could not load agent: ${err}`);
                this.emit("error", err);
            });
        }
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
        if (action === "add") {
            console.log(`Received request to load agent ${agentName}!`);
            const agent = await this.agentLoader.loadNewAgent(agentName);
            this.registerAgentToExistingDocuments(agent);
        } else if (action === "remove") {
            console.log(`Received request to unload agent ${agentName}!`);
            this.agentLoader.unloadAgent(agentName);
        }
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
                let emptyMap: { [work: string]: IWork } = {};
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
            this.emit("error", error);
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

    private loadDict() {
        this.downloadRawText("/public/literature/dictfreq.txt").then((text: string) => {
            let splitContent = text.split("\n");
            for (let entry of splitContent) {
                let splitEntry = entry.split(";");
                this.dict.put(splitEntry[0], parseInt(splitEntry[1], 10));
            }
            console.log(`Loaded dictionary`);
        }, (err) => {
            // On error, try to request alfred again after a timeout.
            setTimeout(() => {
                this.loadDict();
            }, 100);
        });
    }

    private downloadRawText(textUrl: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            request.get(url.resolve(this.serverUrl, textUrl), (error, response, body: string) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                } else {
                    resolve(body);
                }
            });
        });
    }

}
