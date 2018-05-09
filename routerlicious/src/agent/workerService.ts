import * as queue from "async/queue";
import { EventEmitter } from "events";
import * as request from "request";
import * as url from "url";
import { core, MergeTree, socketIoClient as io, socketStorage, utils } from "../client-api";
import { AgentLoader, IAgent } from "./agentLoader";
import { IntelWork } from "./intelWork";
import { PingWork } from "./pingWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";
import { IWork } from "./work";

// Interface for queueing work
interface IWorkQueue {
    token: string;
    tenantId: string;
    documentId: string;
    workType: string;
    response: any;
    clientDetail: socketStorage.IWorker;
};

// Interface for queueing agent loading/unloading
interface IAgentQueue {
    name: string;
    action: string;
    response: any;
    clientDetail: socketStorage.IWorker;
};

export interface IDocumentServiceFactory {
    getService(tenantId: string): Promise<core.IDocumentService>;
}

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService extends EventEmitter implements core.IWorkerService {
    private socket;
    private documentMap: { [docId: string]: { [work: string]: IWork} } = {};
    private workTypeMap: { [workType: string]: boolean} = {};
    private dict = new MergeTree.TST<number>();
    private agentLoader: AgentLoader;

    private workQueue: any;
    private agentQueue: any;

    constructor(
        private serverUrl: string,
        private workerUrl: string,
        private serviceFactory: IDocumentServiceFactory,
        private config: any,
        private clientType: string,
        private agentModuleLoader: (id: string) => Promise<any>) {
        super();

        this.socket = io(this.workerUrl, { transports: ["websocket"] });
        for (let workType of config.permission[this.clientType]) {
            this.workTypeMap[workType] = true;
        }
        // Load dictionary only if you are allowed to spellcheck.
        if ("spell" in this.workTypeMap) {
            this.loadDict();
        }

        // async queue to process work.
        this.workQueue = queue( async (work: IWorkQueue, callback) => {
            this.processDocumentWork(work.tenantId, work.documentId, work.token, work.workType).then(() => {
                work.response(null, work.clientDetail);
                callback();
            }, (err) => {
                callback();
            });
        }, 1);

        // async queue to process agent loading.
        this.agentQueue = queue( async (agent: IAgentQueue, callback) => {
            this.processAgentWork(agent.name, agent.action).then(() => {
                agent.response(null, agent.clientDetail);
                callback();
            }, (err) => {
                callback();
            });
        }, 1);

        // Initialize Agent Loader
        const agentServer = this.clientType === "paparazzi" ? this.config.alfredUrl : this.serverUrl;
        this.agentLoader = new AgentLoader(this.agentModuleLoader, agentServer);
    }

    /**
     * Connects to socketio and subscribes for work. Returns a promise that will never resolve.
     * But will reject should an error occur so that the caller can reconnect.
     */
    public connect(type: string): Promise<void> {
        // Generates a random client id
        const clientId = type + Math.floor(Math.random() * 1000000);
        const clientDetail: socketStorage.IWorker = {
            clientId,
            type,
        };

        const deferred = new utils.Deferred<void>();
        // Subscribes to TMZ. Starts listening to messages if TMZ acked the subscribtion.
        // Otherwise just resolve. On any error, reject and caller will be responsible for reconnecting.
        this.socket.emit(
            "workerObject",
            clientDetail,
            async (error, ack) => {
                if (error) {
                    deferred.reject(error);
                } else if (ack === "Acked") {
                    // Check whether worker is ready to load a new agent.
                    this.socket.on("AgentObject", (cId: string, agentName: string, action: string, response) => {
                        const work: IAgentQueue = {
                            action,
                            clientDetail,
                            name: agentName,
                            response,
                        };
                        this.agentQueue.push(work);
                    });

                    // Check whether worker is allowed to run a requested work.
                    this.socket.on(
                        "ReadyObject",
                        (cId: string, tenantId: string, documentId: string, workType: string, response) => {
                            if (workType in this.workTypeMap) {
                                response(null, clientDetail);
                            } else {
                                response(`${clientId} not allowed to run ${workType}`, null);
                            }
                        });

                    // Start working on an object.
                    this.socket.on(
                        "TaskObject",
                        (cId: string,
                         tenantId: string,
                         documentId: string,
                         token: string,
                         workType: string,
                         response) => {
                            const work: IWorkQueue = {
                                clientDetail,
                                documentId,
                                response,
                                tenantId,
                                token,
                                workType,
                            };
                            this.workQueue.push(work);
                        });

                    // Stop working on an object.
                    this.socket.on(
                        "RevokeObject",
                        (cId: string, tenantId: string, documentId: string, workType: string, response) => {
                        this.revokeDocumentWork(tenantId, documentId, workType);
                        response(null, clientDetail);
                    });

                    // Periodically sends heartbeat to manager.
                    setInterval(() => {
                        this.socket.emit(
                            "heartbeatObject",
                            clientDetail,
                            (err, ackMessage) => {
                                if (err) {
                                    console.error(`Error sending heartbeat: ${err}`);
                                    deferred.reject(error);
                                }
                            });
                    }, this.config.intervalMSec);

                    // Load agents here since TMZ is ready now.
                    await this.agentLoader.loadUploadedAgents();
                } else {
                    deferred.resolve();
                }
        });
        // Handle connection errors.
        this.socket.on("connect_error", (err) => {
            console.log(`Couldn't connect to TMZ`);
            deferred.reject(err);
        });
        this.socket.on("connect_error", (err) => {
            console.log(`Connection timeout!`);
            deferred.reject(err);
        });

        return deferred.promise;
    }

    public close(): Promise<void> {
        // TODO (mdaumi) need to be able to iterate over tracked documents and close them
        this.socket.close();
        return Promise.resolve();
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

    private async processDocumentWork(tenantId: string, documentId: string, token: string, workType: string) {
        this.serviceFactory.getService(tenantId).then((services) => {
            switch (workType) {
                case "snapshot":
                    const snapshotWork = new SnapshotWork(documentId, token, this.config, services);
                    this.startTask(tenantId, documentId, workType, snapshotWork);
                    break;
                case "intel":
                    const intelWork = new IntelWork(documentId, token, this.config, services);
                    this.startTask(tenantId, documentId, workType, intelWork);
                    break;
                case "spell":
                    const spellcheckWork = new SpellcheckerWork(
                        documentId,
                        token,
                        this.config,
                        this.dict,
                        services);
                    this.startTask(tenantId, documentId, workType, spellcheckWork);
                    break;
                case "translation":
                    const translationWork = new TranslationWork(documentId, token, this.config, services);
                    this.startTask(tenantId, documentId, workType, translationWork);
                case "ping":
                    const pingWork = new PingWork(this.serverUrl);
                    this.startTask(tenantId, documentId, workType, pingWork);
                    break;
                default:
                    throw new Error("Unknown work type!");
            }
        }, (error) => {
            console.log(`Error getting service for ${tenantId}/${documentId}: ${error}`);
        });
    }

    private revokeDocumentWork(tenantId: string, documentId: string, workType: string) {
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

    private startTask(tenantId: string, documentId: string, workType: string, worker: IWork) {
        const fullId = this.getFullId(tenantId, documentId);

        if (worker) {
            if (!(fullId in this.documentMap)) {
                let emptyMap: { [work: string]: IWork } = {};
                this.documentMap[fullId] = emptyMap;
            }
            if (!(workType in this.documentMap[fullId])) {
                console.log(`Starting work ${workType} for document ${fullId}`);

                worker.start().then(() => {
                    console.log(`Started work ${workType} for document ${fullId}`);
                    this.documentMap[fullId][workType] = worker;

                    // Register existing intel agents to this document
                    if (workType === "intel") {
                        this.registerAgentsToNewDocument(fullId, workType);
                    }

                    // Lsiten to errors
                    worker.on("error", (error) => {
                        this.emit("error", error);
                    });
                }, (err) => {
                    console.log(`Error starting ${workType} for document ${fullId}: ${err}`);
                });
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

    private async processAgentWork(agentName: string, action: string) {
        if (action === "add") {
            console.log(`Received request to load agent ${agentName}!`);
            const agent = await this.agentLoader.loadNewAgent(agentName);
            this.registerAgentToExistingDocuments(agent);
        } else if (action === "remove") {
            console.log(`Received request to unload agent ${agentName}!`);
            this.agentLoader.unloadAgent(agentName);
        }
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
