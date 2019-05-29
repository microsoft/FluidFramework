import { IMap, MapExtension } from "@prague/map";
import { IDistributedObjectServices, IRuntime, IUser } from "@prague/runtime-definitions";
import { ICollaborativeObject, IDocument } from "@prague/shared-object-common";
import { CollaborativeStringExtension, SharedString } from "@prague/shared-string";
import { IStream, StreamExtension } from "@prague/stream";
import { EventEmitter } from "events";
import * as uuid from "uuid/v4";

const rootMapId = "root";
const insightsMapId = "insights";

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter implements IDocument {
    public static async Load(runtime: IRuntime): Promise<Document> {
        let root: IMap;

        if (!runtime.existing) {
            root = runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            root.attach();

            const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
            root.set(insightsMapId, insights);
        } else {
            root = await runtime.getChannel("root") as IMap;
        }

        const document = new Document(runtime, root);

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

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(public runtime: IRuntime, private root: IMap) {
        super();
    }

    public getRoot(): IMap {
        return this.root;
    }

    /**
     * Creates a new collaborative map
     */
    public createMap(): IMap {
        return this.runtime.createChannel(uuid(), MapExtension.Type) as IMap;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): SharedString {
        return this.runtime.createChannel(uuid(), CollaborativeStringExtension.Type) as SharedString;
    }

    /**
     * Creates a new ink collaborative object
     */
    public createStream(): IStream {
        return this.runtime.createChannel(uuid(), StreamExtension.Type) as IStream;
    }

    public async get(id: string): Promise<ICollaborativeObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ICollaborativeObject;
    }

    public snapshot(message: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public attach(object: ICollaborativeObject): IDistributedObjectServices {
        return this.runtime.attachChannel(object);
    }

    public getUser(): IUser {
        return this.runtime.user;
    }
}
