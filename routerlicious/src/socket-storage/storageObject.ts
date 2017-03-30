import * as api from "../api";
import * as messages from "./messages";

export class StorageObject implements api.IStorageObject {
    constructor(
        public id: string,
        public type: string,
        public storage: api.IStorage,
        private socket: SocketIOClient.Socket) {
    }

    public on(event: string, listener: Function): this {
        // Listen for messages from socket.io
        this.socket.on(event, (message) => {
            // TODO probably a more efficient way to go about this
            // We won't be able to distinguish the event for us vs. others since we can't filter responses
            // to just a room here. So we need to check the objectId here before routing the message.
            // We should probably either namespace objects to avoid this. Or do the vent handling in the
            // storage object, which will own the socket, and route messages.
            if (this.id === message.objectId) {
                listener(message);
            }
        });
        return this;
    }

    public emit(event: string, ...args: any[]): boolean {
        // TODO need to figure out what our ack strategy is - and what to do upon error
        this.socket.emit(event, ...args, (response: messages.IResponse<boolean>) => {
            if (response.error) {
                console.error(`There was an error emitting a message: ${response.error}`);
            }
        });
        return true;
    }

    public detach() {
        this.socket.close();
    }
}
