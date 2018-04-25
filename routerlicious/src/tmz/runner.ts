import * as request from "request";
import * as url from "url";
import * as winston from "winston";
import { ITenantManager } from "../api-core";
import { Deferred } from "../core-utils";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import * as messages from "./messages";
import * as workerFactory from "./workerFactory";

interface IThing {
    tenantId: string;
    documentId: string;
}

export class TmzRunner implements utils.IRunner {
    private deferred = new Deferred<void>();
    private foreman: messages.IForeman;
    private pendingWork: Set<string> = new Set();
    private checkerInterval: NodeJS.Timer;
    private workerJoined = false;
    private pendingAssignedMap: { [docId: string]: boolean} = {};

    constructor(
        private io: any,
        private alfredUrl: string,
        private port: any,
        private agentUploader: messages.IAgentUploader,
        schedulerType: string,
        private onlyServer: boolean,
        private checkerTimeout: number,
        private tasks: any,
        tenantManager: ITenantManager) {

        this.foreman = workerFactory.create(schedulerType, tenantManager);
    }

    public start(): Promise<void> {
        // Preps and start listening to agent uploader.
        this.agentUploader.initialize();
        this.agentUploader.on("agentAdded", (agent: messages.IAgent) => {
            if (agent.type === "server") {
                winston.info(`New module uploaded: ${agent.name}`);
                this.foreman.broadcastNewAgentModule(agent.name, agent.type, "add");
                const moduleUrl = url.resolve(this.alfredUrl, `/agent/js/${agent.name}`);
                request.post(moduleUrl);
            } else if (agent.type === "client") {
                winston.info(`Received a new webpacked scrtipt: ${agent.name}`);
                this.foreman.broadcastNewAgentModule(agent.name, agent.type, "add");
            }
        });
        this.agentUploader.on("agentRemoved", (agent: messages.IAgent) => {
            if (agent.type === "server") {
                winston.info(`Module deleted: ${agent.name}`);
                this.foreman.broadcastNewAgentModule(agent.name, agent.type, "remove");
            } else if (agent.type === "client") {
                // TODO: Implement removal from client.
            }
        });
        this.agentUploader.on("error", (err) => {
            winston.error(err);
        });

        // open a socketio connection and start listening for workers.
        this.io.on("connection", (socket) => {
            // On joining, add the worker to manager.
            socket.on("workerObject", async (message: socketStorage.IWorker, response) => {
                if (!(this.onlyServer && message.type === "Client")) {
                    const newWorker: messages.IWorkerDetail = {
                        worker: message,
                        socket,
                    };
                    winston.info(`New worker joined. ${socket.id} : ${message.clientId}`);
                    this.foreman.getManager().addWorker(newWorker);
                    // Process all pending tasks once the first worker joins.
                    if (!this.workerJoined) {
                        let workIds = Array.from(this.pendingWork).map((work) => JSON.parse(work) as IThing);
                        await this.processDocuments(workIds);
                        this.pendingWork.clear();
                        this.workerJoined = true;
                    }
                    response(null, "Acked");
                } else {
                    response(null, "Nacked");
                }

            });
            // On a heartbeat, refresh worker state.
            socket.on("heartbeatObject", async (message: socketStorage.IWorker, response) => {
                const worker: messages.IWorkerDetail = {
                    worker: message,
                    socket,
                };
                this.foreman.getManager().refreshWorker(worker);
                response(null, "Heartbeat");
            });
            // On disconnect, reassign the work to other workers.
            socket.on("disconnect", async () => {
                const worker = this.foreman.getManager().getWorker(socket.id);
                if (worker) {
                    winston.info(`Worker ${worker.worker.clientId} got disconnected.`);
                    const tasks = this.foreman.getManager().getDocuments(worker);
                    this.foreman.getManager().removeWorker(worker);
                    await this.processWork(tasks);
                }
            });

        });
        this.io.listen(this.port);

        // Periodically check and update work assigment.
        this.checkerInterval = setInterval(async () => {
            await this.adjustWorkAssignment();
        }, this.checkerTimeout);

        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        winston.info("Stop requested");
        clearInterval(this.checkerInterval);

        return this.deferred.promise;
    }

    public async trackDocument(tenantId: string, documentId: string): Promise<void> {
        const document: IThing = { documentId, tenantId };

        // Check if already requested. Update the Timestamp in the process.
        if (this.foreman.getManager().updateDocumentIfFound(tenantId, documentId)) {
            return;
        }

        // No worker joined yet. Store document to process later.
        if (!this.workerJoined) {
            this.pendingWork.add(JSON.stringify(document));
            return;
        }

        winston.info(`Requesting work for ${tenantId}/${documentId}`);
        await this.processDocuments([document]);
    }

    // Request subscribers to pick up the work for a new/expired document.
    private async processDocuments(ids: IThing[]) {
        function fullId(tenantId: string, documentId: string) {
            return `${tenantId}/${documentId}`;
        }

        let workToDo: messages.IDocumentWork[] = [];
        for (let docId of ids) {
            const fullDocId = fullId(docId.tenantId, docId.documentId);
            if (fullDocId in this.pendingAssignedMap) {
                continue;
            }
            this.pendingAssignedMap[fullDocId] = true;
            // tslint:disable-next-line:forin
            for (let task in this.tasks) {
                let work: messages.IWork = {
                    workType: task,
                    workerType: this.tasks[task],
                };
                workToDo.push({
                    documentId: docId.documentId,
                    tenantId: docId.tenantId,
                    work,
                });
            }
        }
        try {
            if (workToDo.length === 0) {
                return Promise.resolve();
            } else {
                await Promise.all(this.foreman.assignWork(workToDo));
                workToDo.map((work) => {
                    const fullDocId = fullId(work.tenantId, work.documentId);
                    if (fullDocId in this.pendingAssignedMap) {
                        delete this.pendingAssignedMap[fullDocId];
                    }
                });
                return Promise.resolve();
            }
        } catch (err) {
            return err;
        }
    }

    // Request subscribers to pick up the work.
    private async processWork(workToDo: messages.IDocumentWork[]) {
        try {
            return await Promise.all(this.foreman.assignWork(workToDo));
        } catch (err) {
            return err;
        }
    }

    private async adjustWorkAssignment() {
        // Get work form inactive workers and reassign them
        const documents = this.foreman.getManager().revokeDocumentsFromInactiveWorkers();
        if (documents.length > 0) {
            await this.processWork(documents);
        }
        // Check Expired documents and update the state.
        await Promise.all(this.foreman.revokeExpiredWork());
    }
}
