import * as queue from "async/queue";
import * as request from "request";
import * as url from "url";
import { core, MergeTree, socketIoClient as io, socketStorage, utils } from "../client-api";
import { IntelWork } from "./intelWork";
import { PingWork } from "./pingWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";
import { IWork } from "./work";

// Interface for a remote module.
interface IModule {

    name: string;

    code: any;
};

// Interface for uploaded module names
interface IAgents {
    names: string[];
};

// Interface for queueing work
export interface IWorkQueue {
    token: string;

    tenantId: string;

    documentId: string;

    workType: string;

    response: any;

    clientDetail: socketStorage.IWorker;
};

export interface IDocumentServiceFactory {
    getService(tenantId: string): Promise<core.IDocumentService>;
}

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService implements core.IWorkerService {
    private socket;
    private documentMap: { [docId: string]: { [work: string]: IWork} } = {};
    private workTypeMap: { [workType: string]: boolean} = {};
    private dict = new MergeTree.Collections.TST<number>();
    private workQueue: any;

    // List of modules added during the lifetime of this object.
    private runtimeModules: { [name: string]: IModule } = {};

    constructor(
        private serverUrl: string,
        private workerUrl: string,
        private serviceFactory: IDocumentServiceFactory,
        private config: any,
        private clientType: string,
        private moduleLoader: (id: string) => Promise<any>) {

        this.socket = io(this.workerUrl, { transports: ["websocket"] });
        for (let workType of config.permission[this.clientType]) {
            this.workTypeMap[workType] = true;
        }
        // Load dictionary only if you are allowed to spellcheck.
        if ("spell" in this.workTypeMap) {
            this.loadDict();
        }

        // async queue to process work one by one.
        this.workQueue = queue( async (work: IWorkQueue, callback) => {
            this.processDocumentWork(work.tenantId, work.documentId, work.token, work.workType).then(() => {
                work.response(null, work.clientDetail);
                callback();
            }, (err) => {
                callback();
            });
        }, 1);

        // Will need to take in the list of endpoints
    }

    /**
     * Connects to socketio and subscribes for work. Returns a promise that will never resolve.
     * But will reject should an error occur so that the caller can reconnect.
     */
    public connect(type: string): Promise<void> {
        // Generate random id since moniker does not work in client side.
        const clientId = type + Math.floor(Math.random() * 100000);
        const clientDetail: socketStorage.IWorker = {
            clientId,
            type,
        };

        const deferred = new utils.Deferred<void>();
        // Subscribes to TMZ. Starts listening to messages if TMZ acked the subscribtion.
        // Otherwise just resolve. On any error, reject and caller will be responsible reconnecting.
        this.socket.emit(
            "workerObject",
            clientDetail,
            (error, ack) => {
                if (error) {
                    deferred.reject(error);
                } else if (ack === "Acked") {
                    // Check whether worker is ready to load a new agent.
                    this.socket.on("AgentObject", (cId: string, moduleName: string, action: string, response) => {
                        // TODO: Need some rule here to deny a new agent loading.
                        if (action === "add") {
                            console.log(`Received request to load module: ${moduleName}!`);
                            this.loadNewModule( { name: moduleName, code: null } );
                            response(null, clientDetail);
                        } else if (action === "remove") {
                            console.log(`Received request to unload module: ${moduleName}!`);
                            this.unloadModule( { name: moduleName, code: null } );
                            response(null, clientDetail);
                        }
                    });
                    // Check whether worker is ready to work.
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

                    // TMZ is responsible for creating module storage. So we are loading here to avoid race condition.
                    const agentServer = this.clientType === "paparazzi" ? this.config.alfredUrl : this.serverUrl;
                    let tryCounter = 0;
                    this.loadUploadedModules(agentServer, tryCounter);
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
        // TODO need to be able to iterate over tracked documents and close them
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

    private loadNewModule(newModule: IModule) {
        this.moduleLoader(newModule.name).then((loadedCode) => {
            console.log(`Success loading module ${newModule.name} in worker!`);

            // Update the loaded module code.
            newModule.code = loadedCode;

            // Register the module for all active documents.
            for (const docId of Object.keys(this.documentMap)) {
                for (const workType of Object.keys(this.documentMap[docId])) {
                    if (workType === "intel") {
                        const intelWork = this.documentMap[docId][workType] as IntelWork;
                        console.log(`Registering new loaded ${newModule.name} to document ${docId}`);
                        intelWork.registerNewService(newModule.code);
                    }
                }
            }
            // Push the module for all future documents.
            this.runtimeModules[newModule.name] = newModule;
        }, (error) =>  {
            console.log(`${newModule.name}: ${error}`);
        });
    }

    // Unload the module for all future documents.
    private unloadModule(module: IModule) {
        if (module.name in this.runtimeModules) {
            delete this.runtimeModules[module.name];
        }
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

        if (worker !== undefined) {
            if (!(fullId in this.documentMap)) {
                let emptyMap: { [work: string]: IWork } = {};
                this.documentMap[fullId] = emptyMap;
            }
            if (!(workType in this.documentMap[fullId])) {
                console.log(`Starting work ${workType} for document ${fullId}`);
                this.documentMap[fullId][workType] = worker;
                if (workType !== "intel") {
                    worker.start().catch((err) => {
                        console.log(`Error starting ${workType} for document ${fullId}: ${err}`);
                    });
                } else {
                    // register all runtime added modules one by one.
                    const intelWork = this.documentMap[fullId][workType] as IntelWork;
                    intelWork.start().then(() => {
                        // tslint:disable-next-line
                        for (let name in this.runtimeModules) {
                            console.log(`Registering ${this.runtimeModules[name].name} for document ${fullId}`);
                            intelWork.registerNewService(this.runtimeModules[name].code);
                        }
                    }, (err) => {
                        console.log(`Error starting ${workType} for document ${fullId}: ${err}`);
                    });
                }
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

    private loadUploadedModules(agentServer: string, tryCounter: number) {
        ++tryCounter;
        this.loadUploadedModuleNames(agentServer).then((moduleNames: any) => {
            const modules = JSON.parse(moduleNames) as IAgents;
            for (const moduleName of modules.names) {
                // paparazzi just loads zipped module.
                if (this.clientType === "paparazzi" && moduleName.indexOf(".zip") !== -1) {
                    console.log(`Loading ${moduleName}`);
                    this.loadNewModule( { name: moduleName, code: null } );
                }
                // Anything else just loads .js file.
                if (this.clientType !== "paparazzi" && moduleName.indexOf(".js") !== -1) {
                    console.log(`Loading ${moduleName}`);
                    this.loadNewModule( { name: moduleName, code: null } );
                }
            }
        }, (err) => {
            console.log(`Error loading uploaded modules: ${err}`);
            // In case alfred is not ready, try to reconnect a few times.
            if (tryCounter <= 5) {
                setTimeout(() => {
                    this.loadUploadedModules(agentServer, tryCounter);
                }, 10000);
            }
        });
    }

    private loadUploadedModuleNames(agentServer: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            request.get(url.resolve(agentServer, `agent`), (error, response, body) => {
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
