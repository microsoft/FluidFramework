import * as io from "socket.io-client";
import * as api from "../api";
import { Storage } from "./storage";

const socket = io();

export class StorageProvider implements api.IStorageProvider {
    public connect(options: api.IOptions): Promise<api.IStorage> {
        const storage = new Storage(socket);
        return Promise.resolve(storage);
    }
}
