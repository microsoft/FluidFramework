import { ICollaborativeObject, ICollaborativeObjectExtension, IDocument } from "@prague/api-definitions";
import { IMap, MapExtension } from "@prague/map";
// import * as resources from "@prague/gitresources";
import { IDistributedObjectServices, IRuntime, IUser } from "@prague/runtime-definitions";
import { CollaborativeStringExtension, SharedString } from "@prague/shared-string";
import { IStream, StreamExtension } from "@prague/stream";
// import { Deferred } from "@prague/utils";
// import * as assert from "assert";
import { EventEmitter } from "events";
// import performanceNow = require("performance-now");
import * as uuid from "uuid/v4";
// import { debug } from "./debug";

const rootMapId = "root";

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter implements IDocument {
    public static async Load(runtime: IRuntime): Promise<Document> {
        const document = new Document(runtime);
        return document;
    }

    public get id(): string {
        return this.runtime.id;
    }

    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get options(): any {
        return this.runtime.options;
    }

    private modules = new Map<string, ICollaborativeObjectExtension>();

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(public runtime: IRuntime) {
        super();

        this.modules.set(MapExtension.Type, new MapExtension());
        this.modules.set(CollaborativeStringExtension.Type, new CollaborativeStringExtension());
        this.modules.set(StreamExtension.Type, new StreamExtension());
    }

    public getRoot(): IMap {
        return this.runtime.getChannel(rootMapId) as IMap;
    }

    /**
     * Creates a new collaborative map
     */
    public createMap(): IMap {
        return this.create(MapExtension.Type) as IMap;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): SharedString {
        return this.create(CollaborativeStringExtension.Type) as SharedString;
    }

    /**
     * Creates a new ink collaborative object
     */
    public createStream(): IStream {
        return this.create(StreamExtension.Type) as IStream;
    }

    public get(id: string): Promise<ICollaborativeObject> {
        throw new Error("Method not implemented.");
    }

    public snapshot(message: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public attach(object: ICollaborativeObject): IDistributedObjectServices {
        throw new Error("Method not implemented.");
    }

    public getUser(): IUser {
        throw new Error("Method not implemented.");
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid()): ICollaborativeObject {
        const extension = this.modules.get(type);
        const object = extension.create(this, id);

        return object;
    }
}
