import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as uuid from "node-uuid";
import * as api from ".";
import * as socketStorage from "../socket-storage";

/**
 * Implementation of a map collaborative object
 */
class Map implements api.IMap {
    public id;

    private events = new EventEmitter();

    constructor(private snapshot: any, private source?: api.IStorageObject) {
        this.id = source ? source.id : uuid.v4();
        this.attach(source);
    }

    public keys(): string[] {
        return _.keys(this.snapshot);
    }

    public get(key: string) {
        return this.snapshot[key];
    }

    public has(key: string): boolean {
        return key in this.snapshot;
    }

    public set(key: string, value: any): void {
        if (this.source) {
            this.source.emit("submitOp", {
                clientId: this.source.storage.clientId,
                objectId: this.id,
                op: {
                    key,
                    type: "set",
                    value,
                },
            });
        }

        this.setCore(key, value);
    }

    public delete(key: string) {
        if (this.source) {
            this.source.emit("submitOp", {
                clientId: this.source.storage.clientId,
                objectId: this.id,
                op: {
                    key,
                    type: "delete",
                },
            });
        }

        this.deleteCore(key);
    }

    public clear() {
        if (this.source) {
            this.source.emit("submitOp", {
                clientId: this.source.storage.clientId,
                objectId: this.id,
                op: {
                    type: "clear",
                },
            });
        }

        this.clearCore();
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

    public attach(source: api.IStorageObject) {
        // TODO we need to go and create the object on the server and upload
        // the initial snapshot.
        // TODO should this be async or should we indirectly pull in this information or
        // just expose it via an error callback?
        this.source = source;

        // listen for specific events
        this.source.on("op", (message: socketStorage.IRoutedOpMessage) => {
            // The op message should be restricted to an individual room
            assert.equal(this.id, message.objectId);

            this.processOperation(message);
        });
    }

    private processOperation(message: socketStorage.IRoutedOpMessage) {
        // Process the message
        console.log(`Received a message from the server ${JSON.stringify(message)}`);

        // TODO We can use this message in the future to update our own sequence numbers
        if (message.clientId === this.source.storage.clientId) {
            return;
        }

        // Message has come from someone else - let's go and update now
        switch (message.op.type) {
            case "clear":
                this.clearCore();
                break;
            case "delete":
                this.deleteCore(message.op.key);
                break;
            case "set":
                this.setCore(message.op.key, message.op.value);
                break;
            default:
                throw new Error("Unknown operation");
        }
    }

    private setCore(key: string, value: any) {
        this.snapshot[key] = value;
        this.events.emit("valueChanged", { key });
    }

    private clearCore() {
        this.snapshot = {};
        this.events.emit("clear");
    }

    private deleteCore(key: string) {
        delete this.snapshot[key];
        this.events.emit("valueChanged", { key });
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public create(snapshot: any): api.ICollaborativeObject {
        return new Map(snapshot);
    }

    public load(details: api.ICollaborativeObjectDetails): api.ICollaborativeObject {
        return new Map(details.snapshot, details.object);
    }
}
