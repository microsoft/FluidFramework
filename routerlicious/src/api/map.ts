import { EventEmitter } from "events";
import * as uuid from "node-uuid";
import * as api from ".";

/**
 * Implementation of a map collaborative object
 */
class Map implements api.IMap {
    public id;

    private events = new EventEmitter();

    constructor(private snapshot: any, source?: api.IStorageObject) {
        this.id = source ? source.id : uuid.v4();
    }

    public get(key: string) {
        return this.snapshot[key];
    }

    public has(key: string): boolean {
        return key in this.snapshot;
    }

    public set(key: string, value: any): void {
        // TODO send updates to the server
        this.snapshot[key] = value;
    }

    public delete(key: string) {
        // TODO send updates to the server
        delete this.snapshot[key];
    }

    public clear() {
        // TODO send updates to the server
        this.snapshot = {};
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: Function): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
    }

    public attach(source: api.IStorage) {
        // TODO we need to go and create the object on the server and upload
        // the initial snapshot.
        // TODO should this be async or should we indirectly pull in this information or
        // just expose it via an error callback?
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public type: string = "https://graph.microsoft.com/types/map";

    public create(snapshot: any): api.ICollaborativeObject {
        return new Map(snapshot);
    }

    public load(details: api.ICollaborativeObjectDetails): api.ICollaborativeObject {
        return new Map(details.snapshot, details.object);
    }
}
