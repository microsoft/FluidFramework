import * as io from "socket.io-client";
import * as api from "../api";
import { Storage } from "./storage";

export class StorageProvider implements api.IStorageProvider {
    private socket;

    constructor(url?: string) {
        this.socket = io(url);
    }

    public connect(options: api.IOptions): Promise<api.IStorage> {
        const storage = new Storage(this.socket);
        return Promise.resolve(storage);
    }
}
