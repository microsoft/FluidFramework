import { EventEmitter } from "events";
import * as api from "../api";

export class StorageObject implements api.IStorageObject {
    private emitter = new EventEmitter();

    constructor(
        public id: string,
        public type: string,
        public storage: api.IStorage,
        private socket: SocketIOClient.Socket) {
        this.socket.emit("hello");

        // TODO I want to listen for socket.io messages and then forward them to the server
    }

    public on(event: string, listener: Function): this {
        this.emitter.on(event, listener);
        return this;
    }

    public detach() {
        this.emitter.removeAllListeners();
    }
}
