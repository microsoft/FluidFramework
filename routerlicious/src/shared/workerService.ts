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
    private documentMap: { [docId: string]: api.Document} = {};
    private service: api.IDocumentService;

    constructor(private serverUrl: string, private workerUrl: string, private config: any) {
        this.socket = io(this.workerUrl, { transports: ["websocket"] });
        this.service = socketStorage.getDefaultService(serverUrl);
    }

    /**
     * Connects to socketio and subscribes for work.
     */
    public connect(type: string): Promise<any> {
        // Generate random id since moniker does not work in client side.
        const clientId = type + Math.floor(Math.random() * 100000);
        const clientDetail: messages.IWorker = {
            clientId,
            type: "Client",
        };

        // Subscribes to TMZ and starts receiving messages.
        return new Promise((resolve, reject) => {
            this.socket.emit(
                "workerObject",
                clientDetail,
                (error, ack) => {
                    if (error) {
                        reject(error);
                    } else {
                        // Check whether worker is ready to work.
                        this.socket.on("ReadyObject", (cId: string, id: string, response) => {
                            response(null, clientDetail);
                        });
                        // Start working on an object.
                        this.socket.on("TaskObject", (cId: string, documentId: string, id: string, response) => {
                            // TODO TODO TODO need to add in the documentID
                            this.processDocument(documentId, id);
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
                                    }
                                });
                        }, this.config.intervalMSec);

                        resolve(ack);
                    }
                });
        });
    }

    private async processDocument(documentId: string, id: string) {
        const document = await api.load(documentId, api.defaultRegistry, this.service);
        console.log(`Loaded a document...${documentId}`);
        this.documentMap[documentId] = document;
        const rootView = await document.getRoot().getView();
        if (!rootView.has("insights")) {
            rootView.set("insights", document.createMap());
        }

        // TODO fix below when ready
        const insightsMap = rootView.get("insights");
        // TODO the null below is wrong
        this.processWork(document, insightsMap);
    }

    private processWork(doc: api.Document, insightsMap: api.IMap) {
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
            // intelligenceManager.process(doc);
        });

        throw new Error("Not implemented");
    }

    private revokeWork(id: string) {
        if (id in this.documentMap) {
            // TODO fix below when ready
            throw new Error("Not implemented");
            // this.documentMap[id].removeListener("op", (op) => {
            //     console.log(`Revoked listener from ${id}`);
            // });
            // delete this.documentMap[id];
        }
    }

}
