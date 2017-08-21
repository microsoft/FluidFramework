import * as assert from "assert";
import * as resources from "gitresources";
import * as path from "path";
import * as api from "../api";
import * as git from "../git-storage";
import * as utils from "../utils";
import { getDeltas } from "./routes/deltas";

interface IGetOrCreateDBResponse {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
};

async function getOrCreateObject(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IGetOrCreateDBResponse> {

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

    version: resources.ICommit;

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

function buildHierarchy(flatTree: resources.ITree): ITree {
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
async function getRevisions(gitManager: git.GitManager, id: string): Promise<resources.ICommit[]> {
    const commits = await gitManager.getCommits(id, 1);

    return commits;
}

export interface IDocumentSnapshot {
    documentAttributes: api.IDocumentAttributes;

    distributedObjects: api.IDistributedObject[];

    messages: api.ISequencedDocumentMessage[];
}

export async function getDocumentDetails(
    gitManager: git.GitManager,
    id: string,
    version: resources.ICommit): Promise<IDocumentSnapshot> {

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
        return JSON.parse(messagesJSON) as api.ISequencedDocumentMessage[];
    });

    // Fetch the attributes and distirbuted object headers
    const docAttributesP = gitManager.getBlob(docAttributesSha).then((docAttributes) => {
        const attributes = Buffer.from(docAttributes.content, "base64").toString();
        return JSON.parse(attributes) as api.IDocumentAttributes;
    });

    const blobsP: Array<Promise<any>> = [];
    for (const blob of objectBlobs) {
        const headerP = gitManager.getBlob(blob.headerSha).then((header) => header.content);
        const attributesP = gitManager.getBlob(blob.attributesSha).then((objectType) => {
            const attributes = Buffer.from(objectType.content, "base64").toString();
            return JSON.parse(attributes) as api.IObjectAttributes;
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

export async function getOrCreateDocument(
    historian: string,
    historianBranch: string,
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IDocumentDetails> {

    const getOrCreateP = getOrCreateObject(
        mongoManager,
        documentsCollectionName,
        id,
        privateKey,
        publicKey);

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
