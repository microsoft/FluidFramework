import * as io from "socket.io-client";
import * as api from "../api";
import * as messages from "./messages";

/**
 * The WorkerService manages the Socket.IO connection and manages work sent to it.
 */
export class WorkerService implements api.IWorkerService {
    private socket;

    constructor() {
        this.socket = io("http://localhost:4000", { transports: ["websocket"] });
    }

    public connect(doc: api.ICollaborativeObject): Promise<api.IDeltaConnection> {
        const clientId = "Client-" + Math.floor(Math.random() * 10000);
        const clientDetail: messages.IWorker = {
            clientId,
            type: "Client",
        };

        /*
        console.log(`Is Local: ${doc.isLocal()}`);

        // Display the initial values and then listen for updates
        doc.on("op", (op) => {
            console.log(JSON.stringify(op));
        });

        // Listen and process updates
        doc.on("valueChanged", async (changed) => {
            console.log(JSON.stringify(changed));
        });
        */

        return new Promise((resolve, reject) => {
            this.socket.emit(
                "workerObject",
                clientDetail,
                (error, ack) => {
                    if (error) {
                        return reject(error);
                    } else {
                        console.log(`${clientId} Successfully subscribed to TMZ: ${JSON.stringify(ack)}`);
                        this.socket.on("TaskObject", (client: string, msg: string, response) => {
                            console.log(`Received work for client: ${client}, object: ${msg}`);
                            response(null, clientDetail);
                        });
                    }
                });
        });
    }
}
