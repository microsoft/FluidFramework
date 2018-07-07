import * as async from "async";
import * as ws from "ws";
import { IOrdererSocket, IRawOperationMessage } from "../../core";
import { debug } from "../debug";
import { ISocketOrderer } from "./interfaces";

/**
 * Proxies ordering to an external service which does the actual ordering
 */
export class ProxyOrderer implements ISocketOrderer {
    private sockets: IOrdererSocket[] = [];
    private queue: async.AsyncQueue<IRawOperationMessage>;

    constructor(server: string, tenantId: string, documentId: string) {
        // connect to service
        const socket = new ws(`ws://${server}:4000`);
        socket.on(
            "open",
            () => {
                socket.send(
                    JSON.stringify({ op: "connect", tenantId, documentId }),
                    (error) => {
                        this.queue.resume();
                    });
            });

        socket.on(
            "error",
            (error) => {
                debug(error);
            });

        socket.on(
            "message",
            (data) => {
                const parsedData = JSON.parse(data as string);
                for (const clientSocket of this.sockets) {
                    clientSocket.send(parsedData.op, parsedData.id, parsedData.data);
                }
            });

        this.queue = async.queue<IRawOperationMessage, any>(
            (value, callback) => {
                socket.send(JSON.stringify({ op: "message", data: value }));
                callback();
            },
            1);
        this.queue.pause();
    }

    public async order(message: IRawOperationMessage, topic: string): Promise<void> {
        this.queue.push(message);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
    }
}
