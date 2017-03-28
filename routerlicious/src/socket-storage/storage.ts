import * as api from "../api";
import { StorageObject } from "./storageObject";

export class Storage implements api.IStorage {
    constructor(private socket: SocketIOClient.Socket) {
    }

    /**
     * Loads the object with the given ID from the server
     * @param id Id of the object to load
     */
    public loadObject(id: string): Promise<api.ICollaborativeObjectDetails> {
        return new Promise<api.ICollaborativeObjectDetails>((resolve, reject) => {
            this.socket.emit("loadObject", name, (response) => {
                let details: api.ICollaborativeObjectDetails = {
                    object: new StorageObject(
                        response.id,
                        response.type,
                        response.storage,
                        this.socket),
                    snapshot: response.snapshot,
                };
                resolve(details);
            });
        });
    }
}
