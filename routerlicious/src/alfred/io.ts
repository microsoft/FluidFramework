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

async function getOrCreateObject(id: string): Promise<boolean> {
    const db = await mongoManager.getDatabase();
    const collection = db.collection(documentsCollectionName);

    // TODO there is probably a bit of a race condition with the below between the find and the insert
    const dbObjectP = collection.findOne({ _id: id });
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                return true;
            } else {
                // TODO should I inject a "new document" message in the stream?
                return collection.insertOne({ _id: id }).then(() => false);
            }
        });
}

export interface IDocumentDetails {
    existing: boolean;

    version: string;

    sequenceNumber: number;

    distributedObjects: api.IDistributedObject[];

    pendingDeltas: api.ISequencedDocumentMessage[];
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

    const fetched = await Promise.all([docAttributesP, Promise.all(blobsP)]);
    const result: IDocumentSnapshot = {
        distributedObjects: fetched[1].map((fetch) => ({
                header: fetch[1],
                id: fetch[0],
                sequenceNumber: fetch[2].sequenceNumber,
                type: fetch[2].type,
        })),
        documentAttributes: fetched[0],
    };

    return result;
}

async function getOrCreateDocument(id: string): Promise<IDocumentDetails> {
    const existingP = getOrCreateObject(id);

    const gitManager = await git.getOrCreateRepository(historian, historianBranch);
    const revisions = await getRevisions(gitManager, id);
    const version = revisions.length > 0 ? revisions[0] : null;

    // If there has been a snapshot made use it to retrieve object state as well as any pending deltas. Otherwise
    // we just load all deltas
    let sequenceNumber: number;
    let distributedObjects: api.IDistributedObject[];

    if (version) {
        const details = await getDocumentDetails(gitManager, id, version);
        sequenceNumber = details.documentAttributes.sequenceNumber;
        distributedObjects = details.distributedObjects;
    } else {
        sequenceNumber = 0;
        distributedObjects = [];
    }

    const pendingDeltas = await getDeltas(id, sequenceNumber);
    const existing = await existingP;

    return {
        distributedObjects,
        existing,
        pendingDeltas,
        sequenceNumber,
        version,
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

        const documentDetailsP = getOrCreateDocument(message.id);
        documentDetailsP.then(
            (documentDetails) => {
                socket.join(message.id, (joinError) => {
                    if (joinError) {
                        return response(joinError, null);
                    }

                    const clientId = moniker.choose();
                    connectionsMap[clientId] = message.id;

                    const connectedMessage: socketStorage.IConnected = {
                        clientId,
                        distributedObjects: documentDetails.distributedObjects,
                        existing: documentDetails.existing,
                        pendingDeltas: documentDetails.pendingDeltas,
                        sequenceNumber: documentDetails.sequenceNumber,
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
});

export default io;
