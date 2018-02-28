import * as resources from "gitresources";
import cloneDeep = require("lodash/cloneDeep");
import performanceNow = require("performance-now");
import * as request from "request";
import * as io from "socket.io-client";
import * as api from "../api-core";
import { IAuthenticatedUser } from "../core-utils";
import { GitManager } from "../git-storage";
import { DocumentStorageService } from "./blobStorageService";
import { debug } from "./debug";
import { DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentDeltaConnection } from "./documentDeltaConnection";
import * as messages from "./messages";
import { NullDeltaConnection } from "./nullDeltaConnection";

// Type aliases for mapping from events, to the objects interested in those events, to the connections for those
// objects
type ConnectionMap = { [connectionId: string]: api.IDocumentDeltaConnection };
type ObjectMap = { [objectId: string]: ConnectionMap };
type EventMap = { [event: string]: ObjectMap };

/**
 * Document details extracted from the header
 */
interface IHeaderDetails {
    // Attributes for the document
    attributes: api.IDocumentAttributes;

    // Distributed objects contained within the document
    distributedObjects: api.IDistributedObject[];

    // The transformed messages between the minimum sequence number and sequenceNumber
    transformedMessages: api.ISequencedDocumentMessage[];

    // Tree representing all blobs in the snapshot
    tree: api.ISnapshotTree;
}

function getEmptyHeader(id: string): IHeaderDetails {
    const emptyHeader: IHeaderDetails = {
        attributes: {
            branch: id,
            minimumSequenceNumber: 0,
            sequenceNumber: 0,
        },
        distributedObjects: [],
        transformedMessages: [],
        tree: null,
    };

    return emptyHeader;
}

async function readAndParse<T>(storage: api.IBlobStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    return JSON.parse(decoded);
}

export class DocumentResource implements api.IDocumentResource {
    constructor(
        public documentId: string,
        public user: IAuthenticatedUser,
        public clientId: string,
        public existing: boolean,
        public version: resources.ICommit,
        public parentBranch: string,
        public deltaConnection: api.IDocumentDeltaConnection,
        public documentStorageService: api.IDocumentStorageService,
        public deltaStorageService: api.IDocumentDeltaStorageService,
        public distributedObjects: api.IDistributedObject[],
        public pendingDeltas: api.ISequencedDocumentMessage[],
        public transformedMessages: api.ISequencedDocumentMessage[],
        public snapshotOriginBranch: string,
        public sequenceNumber: number,
        public minimumSequenceNumber: number,
        public tree: api.ISnapshotTree) {
    }
}

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private eventMap: EventMap = {};
    private socket;

    constructor(
        private url: string,
        private deltaStorage: api.IDeltaStorageService,
        private blobStorge: api.IBlobStorageService,
        private gitManager: GitManager) {

        debug(`Creating document service ${performanceNow()}`);
        this.socket = io(url, { transports: ["websocket"] });
    }

    public async connect(
        id: string,
        version: resources.ICommit,
        connect: boolean,
        encrypted: boolean,
        token?: string): Promise<api.IDocumentResource> {
        debug(`Connecting to ${id} - ${performanceNow()}`);

        if (!connect && !version) {
            return Promise.reject("Must specify a version if connect is set to false");
        }

        const connectMessage: messages.IConnect = {
            encrypted,
            id,
            privateKey: null,
            publicKey: null,
            token,  // token is going to indicate tenant level information, etc...
        };

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        if (version === undefined) {
            const commits = await this.gitManager.getCommits(id, 1);
            version = commits.length > 0 ? this.translateCommit(commits[0]) : null;
        }

        // Kick off three async operations to load the document state
        // ...get the header which provides access to the 'first page' of the document
        const headerP = this.getHeader(id, version);

        // ...connect to the op stream
        const connectionP = connect
            ? new Promise<messages.IConnected>((resolve, reject) => {
                    this.socket.emit(
                        "connectDocument",
                        connectMessage,
                        (error, response: messages.IConnected) => {
                            if (error) {
                                return reject(error);
                            } else {
                                return resolve(response);
                            }
                        });
                })
            : Promise.resolve<messages.IConnected>(null);

        // ...load in all deltas later than the sequence number specified in the header
        const pendingDeltasP = headerP.then((header) => {
            return connect ? this.deltaStorage.get(id, header ? header.attributes.sequenceNumber : 0) : [];
        });

        // ...and then await all three being resolved
        const [header, connection, pendingDeltas] = await Promise.all([headerP, connectionP, pendingDeltasP]);

        debug(`Connected to ${id} - ${performanceNow()}`);
        let deltaConnection: api.IDocumentDeltaConnection;
        if (connect) {
            deltaConnection = new DocumentDeltaConnection(
                this,
                id,
                connection.clientId,
                encrypted,
                connection.privateKey,
                connection.publicKey);
        } else {
            deltaConnection = new NullDeltaConnection(id);
        }
        const deltaStorage = new DocumentDeltaStorageService(id, this.deltaStorage);
        const documentStorage = new DocumentStorageService(id, version, this.blobStorge);

        const document = new DocumentResource(
            id,
            connection ? connection.user : null,
            deltaConnection.clientId,
            connection ? connection.existing : true,
            version,
            connection ? connection.parentBranch : (header.attributes.branch !== id ? header.attributes.branch : null),
            deltaConnection,
            documentStorage,
            deltaStorage,
            header.distributedObjects,
            pendingDeltas,
            header.transformedMessages,
            header.attributes.branch,
            header.attributes.sequenceNumber,
            header.attributes.minimumSequenceNumber,
            header.tree);
        return document;
    }

    public async branch(id: string): Promise<string> {
        const forkId = await this.createFork(id);
        return forkId;
    }

    /**
     * Emits a message on the socket
     */
    public emit(event: string, ...args: any[]) {
        this.socket.emit(event, ...args);
    }

    /**
     * Registers the given connection to receive events of the given type
     */
    public registerForEvent(event: string, connection: api.IDocumentDeltaConnection) {
        // See if we're already listening for the given event - if not start
        if (!(event in this.eventMap)) {
            this.eventMap[event] = {};
            this.socket.on(
                event,
                (documentId: string, message: any) => {
                    this.handleMessage(event, documentId, message);
                });
        }

        // Register the object for the given event
        const objectMap = this.eventMap[event];
        if (!(connection.documentId in objectMap)) {
            objectMap[connection.documentId] = {};
        }

        // And finally store the connection as interested in the given event
        objectMap[connection.documentId][connection.clientId] = connection;
    }

    private async getHeader(id: string, version: resources.ICommit): Promise<IHeaderDetails> {
        if (!version) {
            return getEmptyHeader(id);
        }

        const tree = await this.blobStorge.getSnapshotTree(id, version);

        const messagesP = readAndParse<api.ISequencedDocumentMessage[]>(this.blobStorge, tree.blobs[".messages"]);
        const attributesP = readAndParse<api.IDocumentAttributes>(this.blobStorge, tree.blobs[".attributes"]);

        const distributedObjectsP = Array<Promise<api.IDistributedObject>>();
        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const objectAttributesP = readAndParse<api.IObjectAttributes>(
                this.blobStorge,
                tree.trees[path].blobs[".attributes"]);
            const objectDetailsP = objectAttributesP.then((attributes) => {
                return {
                    id: path,
                    sequenceNumber: attributes.sequenceNumber,
                    type: attributes.type,
                };
            });
            distributedObjectsP.push(objectDetailsP);
        }

        const [messages, attributes, distributedObjects] = await Promise.all(
            [messagesP, attributesP, Promise.all(distributedObjectsP)]);

        return {
            attributes,
            distributedObjects,
            transformedMessages: messages,
            tree,
        };
    }

    /**
     * Handles a message received from the other side of the socket. This message routes it to the connection
     * that has registered to receive events of that type.
     */
    private handleMessage(event: string, documentId: string, message: any) {
        const objectMap = this.eventMap[event];
        if (!objectMap) {
            return;
        }

        const connectionMap = objectMap[documentId];
        if (!connectionMap) {
            return;
        }

        // Route message to all registered clients
        for (const clientId in connectionMap) {
            if (connectionMap[clientId]) {
                const clone = cloneDeep(message);
                connectionMap[clientId].dispatchEvent(event, clone);
            }
        }
    }

    private createFork(id: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            request.post(
                { url: `${this.url}/documents/${id}/forks`, json: true },
                (error, response, body) => {
                    if (error) {
                        reject(error);
                    } else if (response.statusCode !== 201) {
                        reject(response.statusCode);
                    } else {
                        resolve(body);
                    }
                });
        });
    }

    private translateCommit(details: resources.ICommitDetails): resources.ICommit {
        return {
            author: details.commit.author,
            committer: details.commit.committer,
            message: details.commit.message,
            parents: details.parents,
            sha: details.sha,
            tree: details.commit.tree,
            url: details.commit.url,
        };
    }
}
