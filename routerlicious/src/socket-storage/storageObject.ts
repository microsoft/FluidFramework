import { EventEmitter } from "events";
import * as api from "../api";

export class StorageObject implements api.IStorageObject {
    private emitter = new EventEmitter();

    constructor(
        public id: string,
        public type: string,
        public storage: api.IStorage,
        private socket: SocketIOClient.Socket) {

        // Listen for messages from the server
        this.socket.on("message", () => {
            console.log("Server said hello");
        });
    }

    public on(event: string, listener: Function): this {
        this.emitter.on(event, listener);
        return this;
    }

    public emit(event: string, ...args: any[]): boolean {
        return true;
    }

    public detach() {
        this.emitter.removeAllListeners();
    }
}
