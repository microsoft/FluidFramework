// tslint:disable

import * as fs from "fs";
import * as path from "path";
import * as io from "socket.io-client";
import * as api from "../api";
import { nativeTextAnalytics, resumeAnalytics, textAnalytics } from "../intelligence";
// import * as mergeTree from "../merge-tree";
import * as Collections from "../merge-tree/collections";
import * as socketStorage from "../socket-storage";
import * as messages from "../socket-storage/messages";
import * as shared from "./";

function clock() {
    return process.hrtime();
}

function elapsedMilliseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000) + (end[1] / 1000000));
    return duration;
}

/**
 * The WorkerService manages the Socket.IO connection and work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private documentMap: { [docId: string]: api.ICollaborativeObject} = {};
    private services: api.ICollaborationServices;
    private dict = new Collections.TST<number>();

    constructor(private serverUrl: string, private workerUrl: string, private config: any) {
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

    loadDict() {
        let clockStart = clock();
        let dictFilename = path.join(__dirname, "../../public/literature/dictfreq.txt");
        let dictContent = fs.readFileSync(dictFilename, "utf8");
        let splitContent = dictContent.split("\n");
        for (let entry of splitContent) {
            let splitEntry = entry.split(";");
            this.dict.put(splitEntry[0], parseInt(splitEntry[1]));
        }
        console.log(`size: ${this.dict.size()}; load time ${elapsedMilliseconds(clockStart)}ms`);
    }

    private initializeServices() {
        const objectStorageService = new shared.ObjectStorageService(this.serverUrl);
        this.services = {
            deltaNotificationService: new socketStorage.DeltaNotificationService(this.serverUrl),
            deltaStorageService: new socketStorage.DeltaStorageService(this.serverUrl),
            objectStorageService,
        };
    }

    private async processDocument(id: string) {
        if (id.length === 0) {
            return;
        }

        const docManager = new shared.DocumentManager(this.serverUrl, this.services);
        docManager.load(id).then(async (doc) => {
            console.log(`Loaded the document ${id}`);
            this.documentMap[id] = doc;
            const insightsMap = await docManager.createMap(`${id}-insights`);
            this.processWork(doc, insightsMap);
        }, (error) => {
            console.log(`Document ${id} not found!`);
            return;
        });
    }

    private processWork(doc: api.ICollaborativeObject, insightsMap: api.IMap) {
        const serializer = new shared.Serializer(doc);

        const intelligenceManager = new shared.IntelligentServicesManager(insightsMap);
        intelligenceManager.registerService(resumeAnalytics.factory.create(this.config.intelligence.resume));
        intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));
        intelligenceManager.registerService(nativeTextAnalytics.factory.create(
                                            this.config.intelligence.nativeTextAnalytics));

        // if (doc.type === mergeTree.CollaboritiveStringExtension.Type) {
        //     const spellcheckerClient = spellcheckerService.factory.create(this.config.intelligence.spellchecker);
        //     const spellchecker = new shared.Spellcheker(doc as mergeTree.SharedString, this.dict, spellcheckerClient);
        //     spellchecker.run();
        // }

        doc.on("op", (op) => {
            serializer.run(op);
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
