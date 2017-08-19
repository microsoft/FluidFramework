import * as request from "request";
import * as io from "socket.io-client";
import * as url from "url";
import * as api from "../api";
import { nativeTextAnalytics, resumeAnalytics, textAnalytics } from "../intelligence";
import * as Collections from "../merge-tree/collections";
import * as socketStorage from "../socket-storage";
import * as messages from "../socket-storage/messages";
import * as shared from "./";

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private documentSnapshotMap: { [docId: string]: api.Document} = {};
    private documentIntelMap: { [docId: string]: api.Document} = {};
    private snapshotHandlerMap: { [docId: string]: (op: any) => void} = {};
    private intelHandlerMap: { [docId: string]: (op: any) => void} = {};
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
                } else {
                    deferred.resolve();
                }
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
        socketStorage.registerAsDefault(this.serverUrl, this.storageUrl, this.repo);
    }

    private async processDocument(id: string) {
        if (id.length === 0) {
            return;
        }
        this.processSnapshot(id);
        this.processIntelligenceServices(id);
    }

    private async processSnapshot(id: string) {
        api.load(id, { encrypted: undefined, localMinSeq: 0 }).then(async (doc) => {
            console.log(`Loaded snapshot document ${id}`);
            this.documentSnapshotMap[id] = doc;
            const serializer = new shared.Serializer(doc);

            const eventHandler = (op: api.ISequencedDocumentMessage) => {
                serializer.run(op);
            };
            this.snapshotHandlerMap[doc.id] = eventHandler;
            doc.on("op", eventHandler);
        }, (error) => {
            console.log(`Document ${id} not found!`);
            return;
        });
    }

    private async processIntelligenceServices(id: string) {
        api.load(id, { blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined }).then(async (doc) => {
            console.log(`Loaded intelligence document ${id}`);
            this.documentIntelMap[id] = doc;
            const root = await doc.getRoot().getView();
            if (!root.has("insights")) {
                root.set("insights", doc.createMap());
            }
            const insightsMap = root.get("insights") as api.IMap;
            const insightsMapView = await insightsMap.getView();
            this.processIntelligenceWork(doc, insightsMapView);
        }, (error) => {
            console.log(`Document ${id} not found!`);
            return;
        });
    }

    private processIntelligenceWork(doc: api.Document, insightsMap: api.IMapView) {
        const intelligenceManager = new shared.IntelligentServicesManager(doc, insightsMap, this.config, this.dict);
        intelligenceManager.registerService(resumeAnalytics.factory.create(this.config.intelligence.resume));
        intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));

        if (this.config.intelligence.nativeTextAnalytics.enable) {
            intelligenceManager.registerService(
                nativeTextAnalytics.factory.create(this.config.intelligence.nativeTextAnalytics));
        }

        const eventHandler = (op: api.ISequencedDocumentMessage) => {

            if (op.type === api.ObjectOperation) {
                const objectId = op.contents.address;
                const object = doc.get(objectId);
                intelligenceManager.process(object);
            } else if (op.type === api.AttachObject) {
                const object = doc.get(op.contents.id);
                intelligenceManager.process(object);
            }
        };

        this.intelHandlerMap[doc.id] = eventHandler;
        doc.on("op", eventHandler);
    }

    private revokeWork(id: string) {
        if (id in this.documentSnapshotMap) {
            this.documentSnapshotMap[id].removeListener("op", this.snapshotHandlerMap[id]);
            delete this.documentSnapshotMap[id];
            delete this.snapshotHandlerMap[id];
        }
        if (id in this.documentIntelMap) {
            this.documentIntelMap[id].removeListener("op", this.intelHandlerMap[id]);
            delete this.documentIntelMap[id];
            delete this.intelHandlerMap[id];
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
