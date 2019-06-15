import { IMap, MapExtension } from "@prague/map";
import { ISharedObjectServices, IRuntime, IUser } from "@prague/runtime-definitions";
import { ICollaborativeObject, IDocument } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import * as uuid from "uuid/v4";
import { runTaskAnalyzer } from "./taskHelper";

const rootMapId = "root";

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter implements IDocument {
    public static async load(runtime: IRuntime): Promise<Document> {
        let root: IMap;

        if (!runtime.existing) {
            root = runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            root.attach();
            root.set("clicks", 0);
        } else {
            root = await runtime.getChannel(rootMapId) as IMap;
        }

        const document = new Document(runtime, root);
        const quorum = runtime.getQuorum();
        runTaskAnalyzer(runtime);
        quorum.on("addMember", (clientId, details) => {
            console.log(`${clientId} : ${JSON.stringify(details)} joined!`);
            runTaskAnalyzer(runtime);
        });
        quorum.on("removeMember", (clientId) => {
            console.log(`${clientId} left`);
            runTaskAnalyzer(runtime);
        });
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

    public async get(id: string): Promise<ICollaborativeObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ICollaborativeObject;
    }

    public snapshot(message: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public attach(object: ICollaborativeObject): ISharedObjectServices {
        return this.runtime.attachChannel(object);
    }

    public getUser(): IUser {
        return this.runtime.user;
    }
}
