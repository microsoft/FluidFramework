import * as assert from "assert";
import * as _ from "lodash";
import * as moniker from "moniker";
import * as nconf from "nconf";
import * as path from "path";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as api from "../api";
import * as core from "../core";
import * as git from "../git-storage";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { logger } from "../utils";
import { getDeltas } from "./routes/deltas";

let io = socketIo();

// Group this into some kind of an interface
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const kafkaClientId = nconf.get("alfred:kafkaClientId");
const topic = nconf.get("alfred:topic");

const historian = nconf.get("git:historian");
const historianBranch = nconf.get("git:repository");

// Setup redis
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);

let pub = redis.createClient(port, host, pubOptions);
let sub = redis.createClient(port, host, subOptions);
io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const documentsCollectionName = nconf.get("mongo:collectionNames:documents");

const mongoManager = new utils.MongoManager(mongoUrl);

interface IGetOrCreateDBResponse {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
};

async function getOrCreateObject(id: string, privateKey: string, publicKey: string):
    Promise<IGetOrCreateDBResponse> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection(documentsCollectionName);

    // TODO there is probably a bit of a race condition with the below between the find and the insert
    const dbObjectP = collection.findOne({ _id: id });
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                return {existing: true, docPrivateKey: dbObject._privateKey, docPublicKey: dbObject._publicKey};
            } else {
                return collection.insertOne({ _id: id, _privateKey: privateKey, _publicKey: publicKey})
                .then(() => {
                    return {existing: false, docPrivateKey: privateKey, docPublicKey: publicKey};
                });
            }
        });
}

export interface IDocumentDetails {
    existing: boolean;

    version: string;

    minimumSequenceNumber: number;

    sequenceNumber: number;

    distributedObjects: api.IDistributedObject[];

    transformedMessages: api.ISequencedDocumentMessage[];

    pendingDeltas: api.ISequencedDocumentMessage[];

    docPrivateKey: string;

    docPublicKey: string;
}

/**
 * Interface used to go from the flat tree structure returned by the git manager to a hierarchy for easier
 * processing
 */
interface ITree {
    blobs: { [path: string]: string };
    trees: { [path: string]: ITree };
}

function buildHierarchy(flatTree: any): ITree {
    const lookup: { [path: string]: ITree } = {};
    const root: ITree = { blobs: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const entryPath = path.parse(entry.path);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPath.dir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { blobs: {}, trees: {} };
            node.trees[entryPath.base] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[entryPath.base] = entry.sha;
        }
    }

    return root;
}

/**
 * Retrieves revisions for the given document
 */
async function getRevisions(gitManager: git.GitManager, id: string): Promise<any[]> {
    const commits = await gitManager.getCommits(id, 1);

    return commits;
}

interface IDocumentSnapshot {
    documentAttributes: api.IDocumentAttributes;

    distributedObjects: api.IDistributedObject[];

    messages: api.ISequencedDocumentMessage[];
}

async function getDocumentDetails(
    gitManager: git.GitManager,
    id: string,
    version: any): Promise<IDocumentSnapshot> {

    assert(version);

    // NOTE we currently grab the entire repository. Should this ever become a bottleneck we can move to manually
    // walking and looking for entries. But this will requre more round trips.
    const rawTree = await gitManager.getTree(version.tree.sha);
    const tree = buildHierarchy(rawTree);

    // Pull out the root attributes file
    const docAttributesSha = tree.blobs[".attributes"];
    const objectBlobs: Array<{ id: string, headerSha: string, attributesSha: string }> = [];
    // tslint:disable-next-line:forin
    for (const path in tree.trees) {
        const entry = tree.trees[path];
        objectBlobs.push({ id: path, headerSha: entry.blobs.header, attributesSha: entry.blobs[".attributes"] });
    }

    // Pull in transformed messages between the msn and the reference
    const messagesSha = tree.blobs[".messages"];
    const messagesP = gitManager.getBlob(messagesSha).then((messages) => {
        const messagesJSON = Buffer.from(messages.content, "base64").toString();
        return JSON.parse(messagesJSON);
    });

    // Fetch the attributes and distirbuted object headers
    const docAttributesP = gitManager.getBlob(docAttributesSha).then((docAttributes) => {
        const attributes = Buffer.from(docAttributes.content, "base64").toString();
        return JSON.parse(attributes);
    });

    const blobsP: Array<Promise<any>> = [];
    for (const blob of objectBlobs) {
        const headerP = gitManager.getBlob(blob.headerSha).then((header) => header.content);
        const attributesP = gitManager.getBlob(blob.attributesSha).then((objectType) => {
            const attributes = Buffer.from(objectType.content, "base64").toString();
            return JSON.parse(attributes);
        });
        blobsP.push(Promise.all([Promise.resolve(blob.id), headerP, attributesP]));
    }

    const fetched = await Promise.all([docAttributesP, Promise.all(blobsP), messagesP]);
    const result: IDocumentSnapshot = {
        distributedObjects: fetched[1].map((fetch) => ({
                header: fetch[1],
                id: fetch[0],
                sequenceNumber: fetch[2].sequenceNumber,
                type: fetch[2].type,
        })),
        documentAttributes: fetched[0],
        messages: fetched[2],
    };

    return result;
}

async function getOrCreateDocument(id: string, privateKey: string, publicKey: string): Promise<IDocumentDetails> {
    const getOrCreateP = getOrCreateObject(id, privateKey, publicKey);

    const gitManager = await git.getOrCreateRepository(historian, historianBranch);
    const revisions = await getRevisions(gitManager, id);
    const version = revisions.length > 0 ? revisions[0] : null;

    // If there has been a snapshot made use it to retrieve object state as well as any pending deltas. Otherwise
    // we just load all deltas
    let sequenceNumber: number;
    let minimumSequenceNumber: number;
    let distributedObjects: api.IDistributedObject[];
    let transformedMessages: api.ISequencedDocumentMessage[];

    if (version) {
        const details = await getDocumentDetails(gitManager, id, version);
        sequenceNumber = details.documentAttributes.sequenceNumber;
        minimumSequenceNumber = details.documentAttributes.minimumSequenceNumber;
        distributedObjects = details.distributedObjects;
        transformedMessages = details.messages;
    } else {
        minimumSequenceNumber = 0;
        sequenceNumber = 0;
        distributedObjects = [];
        transformedMessages = [];
    }

    const pendingDeltas = await getDeltas(id, sequenceNumber);
    const {existing, docPrivateKey, docPublicKey} = await getOrCreateP;

    return {
        distributedObjects,
        existing,
        minimumSequenceNumber,
        pendingDeltas,
        sequenceNumber,
        transformedMessages,
        version,
        docPrivateKey,
        docPublicKey,
    };
}

// Producer used to publish messages
const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);
const throughput = new utils.ThroughputCounter(logger.info);

io.on("connection", (socket) => {
    // Map from client IDs on this connection to the object ID for them
    const connectionsMap: { [clientId: string]: string } = {};

    // Note connect is a reserved socket.io word so we use connectDocument to represent the connect request
    socket.on("connectDocument", (message: socketStorage.IConnect, response) => {
        // Join the room first to ensure the client will start receiving delta updates
        logger.info(`Client has requested to load ${message.id}`);

        /**
         * NOTE: Should there be an extra check to verify that if 'encrypted' is false, the passed keys are empty?
         * Food for thought: what should the correct behavior be if someone requests an encrypted connection to a
         * document that mongoDB has marked as unencrypted (or vice-versa)?
         */

        const documentDetailsP = getOrCreateDocument(message.id, message.privateKey, message.publicKey);
        documentDetailsP.then(
            (documentDetails) => {
                socket.join(message.id, (joinError) => {
                    if (joinError) {
                        return response(joinError, null);
                    }

                    const clientId = moniker.choose();
                    connectionsMap[clientId] = message.id;

                    const encrypted = documentDetails.docPrivateKey ? true : false;

                    const connectedMessage: socketStorage.IConnected = {
                        clientId,
                        distributedObjects: documentDetails.distributedObjects,
                        encrypted,
                        existing: documentDetails.existing,
                        minimumSequenceNumber: documentDetails.minimumSequenceNumber,
                        pendingDeltas: documentDetails.pendingDeltas,
                        privateKey: documentDetails.docPrivateKey,
                        publicKey: documentDetails.docPublicKey,
                        sequenceNumber: documentDetails.sequenceNumber,
                        transformedMessages: documentDetails.transformedMessages,
                        version: documentDetails.version,
                    };
                    response(null, connectedMessage);
                });
            }, (error) => {
                logger.error("Error fetching", error);
                response(error, null);
            });
    });

    // Message sent when a new operation is submitted to the router
    socket.on("submitOp", (clientId: string, message: api.IDocumentMessage, response) => {
        // Verify the user has connected on this object id
        if (!connectionsMap[clientId]) {
            return response("Invalid client ID", null);
        }

        const documentId = connectionsMap[clientId];
        const rawMessage: core.IRawOperationMessage = {
            clientId,
            documentId,
            operation: message,
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: null,
        };

        throughput.produce();
        producer.send(JSON.stringify(rawMessage), documentId).then(
            (responseMessage) => {
                response(null, responseMessage);
                throughput.acknolwedge();
            },
            (error) => {
                logger.error(error);
                response(error, null);
                throughput.acknolwedge();
            });
    });

    // Message sent when a shadow client wants to collaborate on the document.
    socket.on("connectShadowClient", (message: socketStorage.IConnect, response) => {
        logger.info(`Shadow client has requested to collaborate on ${message.id}`);

        const documentDetailsP = getOrCreateDocument(message.id, message.privateKey, message.publicKey);
        documentDetailsP.then(
            (documentDetails) => {
                socket.join(message.id, (joinError) => {
                    if (joinError) {
                        return response(joinError, null);
                    }

                    const clientId = moniker.choose();
                    connectionsMap[clientId] = message.id;

                    const connectedMessage: socketStorage.IShadowConnected = {
                        clientId,
                    };
                    response(null, connectedMessage);
                });
            }, (error) => {
                logger.error("Error fetching", error);
                response(error, null);
            });
    });

});

export default io;
