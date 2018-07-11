import * as async from "async";
import { IOrdererSocket, IRawOperationMessage } from "../../core";
import { ISocketOrderer } from "./interfaces";

/**
 * Proxies ordering to an external service which does the actual ordering
 */
export class ProxyOrderer implements ISocketOrderer {
    private sockets: IOrdererSocket[] = [];
    private queue: async.AsyncQueue<IRawOperationMessage>;

    constructor(tenantId: string, documentId: string) {
        this.queue = async.queue<IRawOperationMessage, any>(
            (value, callback) => {
                // node.send(JSON.stringify({ op: "message", data: value }));
                callback();
            },
            1);
        this.queue.pause();
    }

    public send(message: any): void {
        // TODO implement me
        return;
    }

    public async order(message: IRawOperationMessage, topic: string): Promise<void> {
        this.queue.push(message);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
    }
}
