import { EventEmitter } from "events";
import * as api from "../api";

export class Document implements api.IDocument {
    private emitter = new EventEmitter();

    constructor(private socket: SocketIOClient.Socket) {
        this.socket.emit("hello");
    }

    public on(event: api.DocumentEvents, listener: Function): this {
        this.emitter.on(api.DocumentEvents[event], listener);
        return this;
    }

    public detach() {
        this.emitter.removeAllListeners();
    }
}
