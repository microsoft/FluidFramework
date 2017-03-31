import * as uuid from "node-uuid";
import * as api from "../api";
import * as messages from "./messages";
import { StorageObject } from "./storageObject";

export class Storage implements api.IStorage {
    // TODO I'm cheating right now by allowing the client to generate its ID.
    //
    // For security we probably want the server generating this identifier so that it can validate incoming messages.
    // And so a malicious client can't disrupt other communication by forging the identifier, etc...
    //
    // The tricky case is how to handle a reconnect. We either force OT clients to handle an identifier change and
    // have the server provide a new one. Or need some way (secure cookie?) to ask for your previous identifier back.
    public clientId = uuid.v4();

    constructor(private socket: SocketIOClient.Socket) {
    }

    /**
     * Loads the object with the given ID from the server
     * @param id Id of the object to load
     */
    public loadObject(id: string, type: string, initial: any): Promise<api.ICollaborativeObjectDetails> {
        return new Promise<api.ICollaborativeObjectDetails>((resolve, reject) => {
            const loadObjectMessage: messages.ILoadObjectMessage = {
                clientId: this.clientId,
                initial,
                objectId: id,
                type,
            };

            this.socket.emit(
                "loadObject",
                loadObjectMessage,
                (response: messages.IResponse<messages.IObjectDetails>) => {

                let details: api.ICollaborativeObjectDetails = {
                    object: new StorageObject(
                        response.data.id,
                        response.data.type,
                        this,
                        this.socket),
                    snapshot: response.data.snapshot,
                };
                resolve(details);
            });
        });
    }
}
