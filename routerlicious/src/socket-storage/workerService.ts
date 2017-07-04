import * as io from "socket.io-client";
import * as api from "../api";
import * as shared from "../shared";
import * as messages from "./messages";

/**
 * The WorkerService manages the Socket.IO connection and manages work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private root: api.ICollaborativeObject;

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
                        console.log(`${clientId} subscribed to TMZ: ${JSON.stringify(ack)}`);
                        this.socket.on("TaskObject", (cId: string, msg: string, response) => {
                            this.processWork();
                            response(null, clientDetail);
                        });
                        resolve(ack);
                    }
                });
        });
    }

    private processWork(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.handleDocument();
            resolve();
        });

    }

    private handleDocument() {
        const serializer = new shared.Serializer(this.root);
        this.root.on("op", (op) => {
            serializer.run();
        });
    }

}
