import { ICollaborativeObject } from "@prague/api-definitions";
import { IMap, MapExtension } from "@prague/map";
// import * as resources from "@prague/gitresources";
import { IRuntime } from "@prague/runtime-definitions";
import { CollaborativeStringExtension, SharedString } from "@prague/shared-string";
import { IStream, StreamExtension } from "@prague/stream";
// import { Deferred } from "@prague/utils";
// import * as assert from "assert";
import { EventEmitter } from "events";
// import performanceNow = require("performance-now");
import * as uuid from "uuid/v4";
// import { debug } from "./debug";

// const rootMapId = "root";

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter /* implements IDocument */ {
    public static async Load(runtime: IRuntime): Promise<Document> {
        const document = new Document(runtime);
        return document;
    }

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    // private messagesSinceMSNChange = new Array<api.ISequencedDocumentMessage>();
    // private helpRequested: Set<string> = new Set<string>();
    // private pendingAttach = new Map<string, api.IAttachMessage>();
    // private lastMinSequenceNumber;
    // private loaded = false;
    // private lastLeaderClientId: string;

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(private runtime: IRuntime) {
        super();
    }

    // public getRoot(): IMap {
    //     return this.distributedObjects.get(rootMapId).object as IMap;
    // }

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

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid()): ICollaborativeObject {
        // const extension = this.registry.getExtension(type);
        // const object = extension.create(this, id);

        // return object;
        return null;
    }
}
