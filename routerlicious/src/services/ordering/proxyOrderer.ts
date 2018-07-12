import { IOrdererSocket, IRawOperationMessage } from "../../core";
// import { debug } from "../debug";
import { IOpMessage, ISocketOrderer } from "./interfaces";

/**
 * Proxies ordering to an external service which does the actual ordering
 */
export class ProxyOrderer implements ISocketOrderer {
    private sockets: IOrdererSocket[] = [];

    constructor(
        tenantId: string,
        documentId: string,
        private sendFn: (message: IRawOperationMessage) => void) {
    }

    public order(message: IRawOperationMessage): void {
        // debug(`Received order message ${message.clientId}@${message.operation.clientSequenceNumber}`);
        this.sendFn(message);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
    }

    public broadcast(message: IOpMessage) {
        // debug(`Broadcast to ${this.sockets.length} sockets`);
        for (const socket of this.sockets) {
            socket.send(message.topic, message.op, message.id, message.data);
        }
    }
}
