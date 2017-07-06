import * as io from "socket.io-client";
import * as api from "../api";
import * as shared from "../shared";
import * as socketStorage from "../socket-storage";
import * as messages from "./messages";

/**
 * The WorkerService manages the Socket.IO connection and manages work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private root: api.ICollaborativeObject;
    private documentMap: { [docId: string]: api.ICollaborativeObject} = {};

    constructor(url: string) {
        this.socket = io(url, { transports: ["websocket"] });
    }

    public connect(doc: api.ICollaborativeObject): Promise<any> {
        this.root = doc;

        // Generate random id since moniker does not work in client side.
        const clientId = "Client-" + Math.floor(Math.random() * 10000);
        const clientDetail: messages.IWorker = {
            clientId,
            type: "Client",
        };

        return new Promise((resolve, reject) => {
            this.socket.emit(
                "workerObject",
                clientDetail,
                (error, ack) => {
                    if (error) {
                        reject(error);
                    } else {
                        console.log(`${clientId} subscribed to TMZ for doc ${doc.id}: ${JSON.stringify(ack)}`);
                        this.socket.on("ReadyObject", (cId: string, id: string, response) => {
                            console.log(`${clientId} acked that it's ready for work: ${id}: ${JSON.stringify(ack)}`);
                            response(null, clientDetail);
                        });
                        this.socket.on("TaskObject", (cId: string, id: string, response) => {
                            console.log(`${clientId} acked work from TMZ for doc ${id}: ${JSON.stringify(ack)}`);
                            this.processWork(id);
                            response(null, clientDetail);
                        });
                        this.socket.on("revokeObject", (cId: string, id: string, response) => {
                            console.log(`${clientId} Revoking work from TMZ doc ${id}: ${JSON.stringify(ack)}`);
                            this.revokeWork(id);
                            response(null, clientDetail);
                        });
                        setInterval(() => {
                            this.socket.emit(
                                "heartbeatObject",
                                clientDetail,
                                (err, ackMessage) => {
                                    if (err) {
                                        console.error(`Error sending heartbeat: ${err}`);
                                    } else {
                                        console.log(`${clientId} sent heartbeat: ${JSON.stringify(ackMessage)}`);
                                    }
                                });
                        }, 10000);

                        resolve(ack);
                    }
                });
        });
    }

    // TODO (mdaumi): Need to fix this.
    private async processWork(id: string) {
        const objectStorageService = new shared.ObjectStorageService("http://localhost:3000");
        await objectStorageService.create("snapshots");

        const services: api.ICollaborationServices = {
            deltaNotificationService: new socketStorage.DeltaNotificationService("http://localhost:3000"),
            deltaStorageService: new socketStorage.DeltaStorageService("http://localhost:3000"),
            objectStorageService,
        };

        const docManager = new shared.DocumentManager("http://localhost:3000", services);
        console.log(`Loaded a new doc...${id}`);

        docManager.load(id).then(async (doc) => {
            console.log(`Loaded another doc...${doc.id}`);
            this.documentMap[doc.id] = doc;
            this.processDocument(doc);
        });
    }

    private revokeWork(id: string) {
        if (id in this.documentMap) {
            this.documentMap[id].removeListener("op", (op) => {
                console.log(`Done revoking listener from ${id}`);
                delete this.documentMap[id];
            });
        }
    }

    private processDocument(doc: api.ICollaborativeObject) {
        const serializer = new shared.Serializer(doc);
        console.log(`Handling serialization: ${doc.id}`);
        doc.on("op", (op) => {
            serializer.run();
        });
    }

}
