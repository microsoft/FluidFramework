import * as request from "request";
import * as io from "socket.io-client";
import * as url from "url";
import * as api from "../api";
import * as Collections from "../merge-tree/collections";
import * as socketStorage from "../socket-storage";
import * as messages from "../socket-storage/messages";
import * as shared from "./";

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private documentMap: { [docId: string]: { [work: string]: shared.IWork} } = {};
    private dict = new Collections.TST<number>();

    constructor(
        private serverUrl: string,
        private workerUrl: string,
        private storageUrl: string,
        private repo: string,
        private config: any) {

        this.socket = io(this.workerUrl, { transports: ["websocket"] });
        this.loadDict();
        this.initializeServices();
    }

    /**
     * Connects to socketio and subscribes for work. Returns a promise that will never resolve.
     * But will reject should an error occur so that the caller can reconnect.
     */
    public connect(type: string): Promise<void> {
        // Generate random id since moniker does not work in client side.
        const clientId = type + Math.floor(Math.random() * 100000);
        const clientDetail: messages.IWorker = {
            clientId,
            type,
        };

        const deferred = new shared.Deferred<void>();
        // Subscribes to TMZ. Starts listening to messages if TMZ acked the subscribtion.
        // Otherwise just resolve. On any error, reject and caller will be responsible reconnecting.
        this.socket.emit(
            "workerObject",
            clientDetail,
            (error, ack) => {
                if (error) {
                    deferred.reject(error);
                } else if (ack === "Acked") {
                    // Check whether worker is ready to work.
                    this.socket.on("ReadyObject", (cId: string, id: string, workType: string, response) => {
                        response(null, clientDetail);
                    });
                    // Start working on an object.
                    this.socket.on("TaskObject", (cId: string, id: string, workType: string, response) => {
                        console.log(`Received ${workType} work for doc ${id}`);
                        this.processDocumentWork(id, workType);
                        response(null, clientDetail);
                    });
                    // Stop working on an object.
                    this.socket.on("RevokeObject", (cId: string, id: string, workType: string, response) => {
                        this.revokeDocumentWork(id, workType);
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

    private initializeServices() {
        // TODO for testing want to be able to pass in the services to use
        socketStorage.registerAsDefault(this.serverUrl, this.storageUrl, this.repo);
    }

    private processDocumentWork(docId: string, workType: string) {
        switch (workType) {
            case "snapshot":
                const snapshotWork: shared.IWork = new shared.SnapshotWork(docId, this.config);
                this.startTask(docId, workType, snapshotWork);
                break;
            case "intel":
                const intelWork: shared.IWork = new shared.IntelWork(docId, this.config);
                this.startTask(docId, workType, intelWork);
                break;
            case "spell":
                const spellcheckWork: shared.IWork = new shared.SpellcheckerWork(docId, this.config, this.dict);
                this.startTask(docId, workType, spellcheckWork);
                break;
            case "ping":
                const pingWork: shared.IWork = new shared.PingWork(this.serverUrl);
                this.startTask(docId, workType, pingWork);
                break;
            default:
                throw new Error("Unknown work type!");
        }
    }

    private revokeDocumentWork(docId: string, workType: string) {
        switch (workType) {
            case "snapshot":
                this.stopTask(docId, workType);
                break;
            case "intel":
                this.stopTask(docId, workType);
                break;
            case "spell":
                this.stopTask(docId, workType);
                break;
            case "ping":
                this.stopTask(docId, workType);
                break;
            default:
                throw new Error("Unknown work type!");
        }
    }

    private startTask(docId: string, workType: string, worker: shared.IWork) {
        if (!(docId in this.documentMap)) {
            let emptyMap: { [work: string]: shared.IWork } = {};
            this.documentMap[docId] = emptyMap;
        }
        if (!(workType in this.documentMap[docId])) {
            this.documentMap[docId][workType] = worker;
            worker.start();
        }
    }

    private stopTask(docId: string, workType: string) {
        if (docId in this.documentMap) {
            const taskMap = this.documentMap[docId];
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
}
