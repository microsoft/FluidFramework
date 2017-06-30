import * as io from "socket.io-client";
import * as api from "../api";
import * as messages from "./messages";

/**
 * The WorkerService manages the Socket.IO connection and manages work sent to it.
 */
export class WorkerService implements api.IWorkerService {

    private socket;
    private root: api.ICollaborativeObject;
    private pendingSerializeMap: { [key: string]: boolean } = {};
    private dirtyMap: { [key: string]: boolean } = {};

    constructor() {
        this.socket = io("http://localhost:4000", { transports: ["websocket"] });
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
                        console.log(`${clientId} Successfully subscribed to TMZ: ${JSON.stringify(ack)}`);
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
        this.root.on("op", (op) => {
            this.serialize();
        });
    }

    private serialize() {
        if (this.pendingSerializeMap[this.root.id]) {
            this.dirtyMap[this.root.id] = true;
            return;
        }

        // Set a pending operation and clear any dirty flags
        this.pendingSerializeMap[this.root.id] = true;
        this.dirtyMap[this.root.id] = false;

        console.log(`Snapshotting ${this.root.id}.`);
        const snapshotP = this.root.snapshot().catch((error) => {
                // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
                if (error) {
                    console.error(error);
                }

                return Promise.resolve();
            });

        // Finally clause to start snapshotting again once we finish
        snapshotP.then(() => {
            this.pendingSerializeMap[this.root.id] = false;
            if (this.dirtyMap[this.root.id]) {
                this.serialize();
            }
        });
    }
}
