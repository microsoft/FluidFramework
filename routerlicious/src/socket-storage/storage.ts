import * as api from "../api";
import { Document } from "./document";

export class Storage implements api.IStorage {
    constructor(private socket: SocketIOClient.Socket) {
    }

    public load(name: string): Promise<api.IDocumentDetails> {
        return new Promise<api.IDocumentDetails>((resolve, reject) => {
            this.socket.emit("join", name, (response) => {
                let details: api.IDocumentDetails = {
                    data: null,
                    document: new Document(this.socket),
                    existing: false,
                    type: null,
                };
                resolve(details);
            });
        });
    }
}