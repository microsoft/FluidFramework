import * as io from "socket.io-client";
import * as api from "../api";
import { nativeTextAnalytics, resumeAnalytics, textAnalytics } from "../intelligence";
import * as socketStorage from "../socket-storage";
import * as messages from "../socket-storage/messages";
import * as shared from "./";

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private documentMap: { [docId: string]: api.ICollaborativeObject} = {};

    constructor(private serverUrl: string, private workerUrl: string, private config: any) {
        this.socket = io(this.workerUrl, { transports: ["websocket"] });
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
            type: "Client",
        };

        const deferred = new shared.Deferred<void>();
        // Subscribes to TMZ and starts receiving messages.
        this.socket.emit(
            "workerObject",
            clientDetail,
            (error, ack) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    // Check whether worker is ready to work.
                    this.socket.on("ReadyObject", (cId: string, id: string, response) => {
                        response(null, clientDetail);
                    });
                    // Start working on an object.
                    this.socket.on("TaskObject", (cId: string, id: string, response) => {
                        this.processDocument(id);
                        response(null, clientDetail);
                    });
                    // Stop working on an object.
                    this.socket.on("RevokeObject", (cId: string, id: string, response) => {
                        this.revokeWork(id);
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
                }
            });

        return deferred.promise;
    }

    private async processDocument(id: string) {
        const objectStorageService = new shared.ObjectStorageService(this.serverUrl);

        const services: api.ICollaborationServices = {
            deltaNotificationService: new socketStorage.DeltaNotificationService(this.serverUrl),
            deltaStorageService: new socketStorage.DeltaStorageService(this.serverUrl),
            objectStorageService,
        };

        const docManager = new shared.DocumentManager(this.serverUrl, services);
        docManager.load(id).then(async (doc) => {
            console.log(`Loaded a document...${doc.id}`);
            this.documentMap[id] = doc;
            const insightsMap = await docManager.createMap(`${id}-insights`);
            this.processWork(doc, insightsMap);
        });
    }

    private processWork(doc: api.ICollaborativeObject, insightsMap: api.IMap) {
        const serializer = new shared.Serializer(doc);

        const intelligenceManager = new shared.IntelligentServicesManager(insightsMap);
        // Temporary workaround. Passing url directly instead of config to use the REST API. Will fix once the
        // REST API is deployed.
        intelligenceManager.registerService(resumeAnalytics.factory.create(this.serverUrl + "/intelligence/"));
        intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));
        intelligenceManager.registerService(nativeTextAnalytics.factory.create(
                                            this.config.intelligence.nativeTextAnalytics));
        doc.on("op", (op) => {
            serializer.run();
            intelligenceManager.process(doc);
        });
    }

    private revokeWork(id: string) {
        if (id in this.documentMap) {
            this.documentMap[id].removeListener("op", (op) => {
                console.log(`Revoked listener from ${id}`);
            });
            delete this.documentMap[id];
        }
    }

}
