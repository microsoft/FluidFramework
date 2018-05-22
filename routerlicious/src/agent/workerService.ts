import { EventEmitter } from "events";
import { core, socketIoClient as io, socketStorage, utils } from "../client-api";
import { IWorkManager } from "./definitions";

/**
 * The WorkerService manages the Socket.IO connection and work sent to it. On any error,
 * it notifies the caller and keep working.
 */
export class WorkerService extends EventEmitter implements core.IWorkerService {
    private socket;

    constructor(
        private workerUrl: string,
        private config: any,
        private workTypeMap: { [workType: string]: boolean},
        private workManager: IWorkManager) {
        super();

        this.socket = io(this.workerUrl, { transports: ["websocket"] });

        this.workManager.on("error", (error) => {
            this.emit("error", error);
        });
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
                    // Agent loading request.
                    this.socket.on("AgentObject", (cId: string, agentName: string, action: string, response) => {
                        if ("intel" in this.workTypeMap) {
                            this.workManager.processAgentWork(agentName, action).catch((err) => {
                                this.emit("error", err);
                            });
                        }
                        response(null, clientDetail);
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
                             this.workManager.processDocumentWork(tenantId, documentId, workType, "start", token)
                             .catch((err) => {
                                 this.emit("error", err);
                                });
                             response(null, clientDetail);
                        });

                    // Stop working on an object.
                    this.socket.on(
                        "RevokeObject",
                        (cId: string, tenantId: string, documentId: string, workType: string, response) => {
                            this.workManager.processDocumentWork(tenantId, documentId, workType, "stop")
                            .catch((err) => {
                                this.emit("error", err);
                               });
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
}
