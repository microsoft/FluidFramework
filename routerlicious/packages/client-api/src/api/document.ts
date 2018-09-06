import { ICollaborativeObject } from "@prague/api-definitions";
import * as cell from "@prague/cell";
import * as resources from "@prague/gitresources";
import * as pragueLoader from "@prague/loader";
import * as mapExtension from "@prague/map";
import {
    IClient,
    IDocumentService,
    IPlatform,
    IRuntime,
    IUser,
} from "@prague/runtime-definitions";
import * as sharedString from "@prague/shared-string";
import * as stream from "@prague/stream";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
import * as uuid from "uuid/v4";
import { IGenericBlob } from "../api-core";
import { CodeLoader } from "./codeLoader";
import { Platform } from "./platform";
import { TokenService } from "./tokenService";

// TODO: All these should be enforced by server as a part of document creation.
const rootMapId = "root";

// Registered services to use when loading a document
let defaultDocumentService: IDocumentService;

/**
 * Registers the default services to use for interacting with collaborative documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a collaborative object.
 */
export function registerDocumentService(service: IDocumentService) {
    defaultDocumentService = service;
}

export function getDefaultDocumentService(): IDocumentService {
    return defaultDocumentService;
}

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter {
    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get id(): string {
        return this.runtime.id;
    }

    public get tenantId(): string {
        return this.loader.tenantId;
    }

    public get deltaManager(): pragueLoader.IDeltaManager {
        return this.loader.deltaManager;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    public get options(): any {
        return this.runtime.options;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this.loader.parentBranch;
    }

    /**
     * Flag indicating whether this document is fully connected.
     */
    public get isConnected(): boolean {
        return this.loader.connected;
    }

    /**
     * Constructs a new document from the provided details
     */
    constructor(private loader: pragueLoader.Document, private runtime: IRuntime, private root: mapExtension.IMap) {
        super();
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid()): ICollaborativeObject {
        const channel = this.runtime.createChannel(id, type);
        return channel as ICollaborativeObject;
    }

    /**
     * Loads the specified distributed object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another distributed object.
     *
     * @param id Identifier of the object to load
     */
    public async get(id: string): Promise<ICollaborativeObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ICollaborativeObject;
    }

    /**
     * Creates a new collaborative map
     */
    public createMap(): mapExtension.IMap {
        return this.create(mapExtension.MapExtension.Type) as mapExtension.IMap;
    }

    /**
     * Creates a new collaborative cell.
     * TODO (tanvir): replace this with type class.
     */
    public createCell(): cell.ICell {
        return this.create(cell.CellExtension.Type) as cell.ICell;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): sharedString.SharedString {
        return this.create(sharedString.CollaborativeStringExtension.Type) as sharedString.SharedString;
    }

    /**
     * Creates a new ink collaborative object
     */
    public createStream(): stream.IStream {
        return this.create(stream.StreamExtension.Type) as stream.IStream;
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): mapExtension.IMap {
        return this.root;
    }

    /**
     * Returns the user id connected to the document.
     */
    public getUser(): IUser {
        return this.runtime.user;
    }

    public getClients(): Map<string, IClient> {
        // TODO return clients off of runtime/loader
        throw new Error("Not implemented");
    }

    /**
     * Called to snapshot the given document
     */
    public snapshot(tagMessage: string = ""): Promise<void> {
        throw new Error("Not implemented");
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not implemented");
    }

    /**
     * Flag indicating whether all submitted ops for this document is acked.
     */
    public get hasUnackedOps(): boolean {
        throw new Error("Not implemented");
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        throw new Error("Not implemented");
    }

    public async getBlob(sha: string): Promise<IGenericBlob> {
        throw new Error("Not implemented");
    }

    public getBlobMetadata(): Promise<IGenericBlob[]> {
        throw new Error("Not implemented");
    }

    public save(tag: string = null) {
        throw new Error("Not implemented");
    }
}

/**
 * Loads a specific version (commit) of the collaborative object
 */
export async function load(
    id: string,
    options: any = {},
    version: resources.ICommit = null,
    connect = true,
    service: IDocumentService = defaultDocumentService): Promise<Document> {

    const classicPlatform = new Platform();
    const tokenService = new TokenService();
    const runDeferred = new Deferred<{ runtime: IRuntime, platform: IPlatform }>();
    const loader = new CodeLoader(
        async (runtime, platform) => {
            this.runDeferred.resolve({ runtime, platform });
        });

    // Load the Prague document
    const loaderDoc = await pragueLoader.load(
        options.token,
        options,
        classicPlatform,
        service,
        loader,
        tokenService,
        version,
        connect);

    // Install ourselves as chaincode if there has been no consensus on it

    // Wait for loader to start us
    const run = await runDeferred.promise;

    // if (!runtime.existing) {
    //     root = runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
    //     root.attach();

    //     const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
    //     root.set(insightsMapId, insights);
    // } else {
    //     root = await runtime.getChannel("root") as IMap;
    // }

    // Return the document
    const root = await this.runtime.getChannel(rootMapId) as mapExtension.IMap;
    const document = new Document(loaderDoc, run.runtime, root);

    return document;
}
