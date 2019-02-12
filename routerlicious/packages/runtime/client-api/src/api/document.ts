import { ISharedObject } from "@prague/api-definitions";
import * as cell from "@prague/cell";
import {
    IDeltaManager,
    IDocumentService,
    IGenericBlob,
    IPlatform,
    ISequencedClient,
    ITokenProvider,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import * as resources from "@prague/gitresources";
import { ISharedMap, MapExtension } from "@prague/map";
import { IRuntime } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import { CodeLoader } from "./codeLoader";
import { debug } from "./debug";

// tslint:disable-next-line:no-var-requires no-require-imports no-unsafe-any
const apiVersion = require("../../package.json").version;

// TODO: All these should be enforced by server as a part of document creation.
const rootMapId = "root";
const insightsMapId = "insights";

// Registered services to use when loading a document
let defaultDocumentService: IDocumentService;

/**
 * Registers the default services to use for interacting with shared documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a shared object.
 */
export function registerDocumentService(service: IDocumentService) {
    defaultDocumentService = service;
}

export function getDefaultDocumentService(): IDocumentService {
    return defaultDocumentService;
}

// The below are temporary calls to register loader specific data. Do not take a dependency on them.
let defaultCredentials: { tenant: string; key: string };
export function registerDefaultCredentials(credentials: { tenant: string; key: string }) {
    defaultCredentials = credentials;
}

export function getDefaultCredentials(): { tenant: string; key: string } {
    return defaultCredentials;
}

let chaincodeRepo: string;
export function registerChaincodeRepo(repo: string) {
    chaincodeRepo = repo;
}

export function getChaincodeRepo(): string {
    return chaincodeRepo;
}
// End temporary calls

/**
 * A document is a collection of shared types.
 */
export class Document extends EventEmitter {

    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get id(): string {
        return this.runtime.id;
    }

    public get tenantId(): string {
        return this.runtime.tenantId;
    }

    public get deltaManager(): IDeltaManager {
        return this.runtime.deltaManager;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /* tslint:disable:no-unsafe-any */
    public get options(): any {
        return this.runtime.options;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this.runtime.parentBranch;
    }

    /**
     * Flag indicating whether this document is fully connected.
     */
    public get isConnected(): boolean {
        return this.runtime.connected;
    }

    /**
     * Constructs a new document from the provided details
     */
    constructor(public readonly runtime: IRuntime, private root: ISharedMap) {
        super();

        this.on("clientLeave", (leftClientId) => {
            // Switch to read only mode if a client receives it's own leave message.
            if (this.clientId === leftClientId) {
                this.runtime.deltaManager.enableReadonlyMode();
            }
        });
    }

    /**
     * Constructs a new shared object that can be attached to the document
     * @param type the identifier for the shared object type
     */
    public create(type: string, id = uuid()): ISharedObject {
        const channel = this.runtime.createChannel(id, type);
        return channel as ISharedObject;
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.runtime.on(event, listener);
        return this;
    }

    /**
     * Loads the specified distributed object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another distributed object.
     *
     * @param id Identifier of the object to load
     */
    public async get(id: string): Promise<ISharedObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ISharedObject;
    }

    /**
     * Creates a new shared map
     */
    public createMap(): ISharedMap {
        return this.create(MapExtension.Type) as ISharedMap;
    }

    /**
     * Creates a new shared cell.
     * TODO (tanvir): replace this with type class.
     */
    public createCell(): cell.ICell {
        return this.create(cell.CellExtension.Type) as cell.ICell;
    }

    /**
     * Creates a new shared string
     */
    public createString(): sequence.SharedString {
        return this.create(sequence.SharedStringExtension.Type) as sequence.SharedString;
    }

    /**
     * Creates a new ink shared object
     */
    public createStream(): stream.IStream {
        return this.create(stream.StreamExtension.Type) as stream.IStream;
    }

    /**
     * Retrieves the root shared object that the document is based on
     */
    public getRoot(): ISharedMap {
        return this.root;
    }

    public getClients(): Map<string, ISequencedClient> {
        const quorum = this.runtime.getQuorum();
        return quorum.getMembers();
    }

    public getClient(clientId: string): ISequencedClient {
        const quorum = this.runtime.getQuorum();
        return quorum.getMember(clientId);
    }

    /**
     * Flag indicating whether all submitted ops for this document is acked.
     */
    public get hasUnackedOps(): boolean {
        return this.runtime.hasUnackedOps();
    }

    /* tslint:disable:promise-function-async */
    /**
     * Called to snapshot the given document
     */
    public snapshot(tagMessage: string = ""): Promise<void> {
        return this.runtime.snapshot(tagMessage);
    }

    public save(tag: string = null) {
        this.runtime.save(tag);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        this.runtime.close();
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        return this.runtime.uploadBlob(file);
    }

    public async getBlob(sha: string): Promise<IGenericBlob> {
        return this.runtime.getBlob(sha);
    }

    public getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.runtime.getBlobMetadata();
    }
}

async function initializeChaincode(container: Container, pkg: string): Promise<void> {
    const quorum = container.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        // tslint:disable-next-line
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    debug(`Code is ${quorum.get("code2")}`);
}

/**
 * Loads a specific version (commit) of the shared object
 */
export async function load(
    id: string,
    tenantId: string,
    tokenProvider: ITokenProvider,
    options: any = {},
    version: resources.ICommit = null,
    connect = true,
    service: IDocumentService = defaultDocumentService): Promise<Document> {

    // const classicPlatform = new PlatformFactory();
    const runDeferred = new Deferred<{ runtime: IRuntime; platform: IPlatform }>();
    const codeLoader = new CodeLoader(
        async (r, p) => {
            debug("Code loaded and resolved");
            runDeferred.resolve({ runtime: r, platform: p });
            return null;
        });

    // TODO need both of these
    //     version,
    //     connect);

    // Load the Prague document
    // For legacy purposes we currently fill in a default domain
    const baseUrl =
        `prague://prague.com/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;
    const loader = new Loader({ tokenProvider }, service, codeLoader, options);
    const container = await loader.resolve({ url: baseUrl });

    if (!container.existing) {
        initializeChaincode(container, `@prague/client-api@${apiVersion}`)
            .catch((error) => {
                debug("chaincode error", error);
            });
    }

    // Wait for loader to start us
    const { runtime } = await runDeferred.promise;

    // Initialize core data structures
    let root: ISharedMap;
    if (!runtime.existing) {
        root = runtime.createChannel(rootMapId, MapExtension.Type) as ISharedMap;
        root.attach();

        const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
        root.set(insightsMapId, insights);
    } else {
        root = await runtime.getChannel("root") as ISharedMap;
    }

    // Return the document
    const document = new Document(runtime, root);

    return document;
}
