import { ICommit, ICommitDetails } from "gitresources";
import * as moniker from "moniker";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import * as utils from "../utils";
import { getFullId } from "./utils";

const StartingSequenceNumber = 0;

/**
 * Retrieves database details for the given document
 */
export async function getDocument(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    tenantId: string,
    documentId: string): Promise<any> {

    const id = getFullId(tenantId, documentId);
    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    return collection.findOne({ _id: id });
}

export async function getOrCreateDocument(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    producer: utils.kafkaProducer.IProducer,
    id: string,
    privateKey: string,
    publicKey: string): Promise<{existing: boolean, value: core.IDocument }> {

    const getOrCreateP = getOrCreateObject(
        mongoManager,
        documentsCollectionName,
        producer,
        id,
        privateKey,
        publicKey);

    return getOrCreateP;
}

export async function getLatestVersion(
    tenantManager: api.ITenantManager,
    tenantId: string,
    documentId: string): Promise<ICommitDetails> {

    const commits = await getVersions(tenantManager, tenantId, documentId, 1);
    return commits.length > 0 ? commits[0] : null;
}

export async function getVersions(
    tenantManager: api.ITenantManager,
    tenantId: string,
    documentId: string,
    count: number): Promise<ICommitDetails[]> {

    const fullId = getFullId(tenantId, documentId);
    const tenant = await tenantManager.getTenant(tenantId).catch((err) => {
        return Promise.reject(err);
    });
    const gitManager = tenant.gitManager;
    return await gitManager.getCommits(fullId, count);
}

export async function getVersion(
    tenantManager: api.ITenantManager,
    tenantId: string,
    documentId: string,
    sha: string): Promise<ICommit> {

    const tenant = await tenantManager.getTenant(tenantId).catch((err) => {
        return Promise.reject(err);
    });
    const gitManager = tenant.gitManager;
    return await gitManager.getCommit(sha);
}

/**
 * Retrieves the forks for the given document
 */
export async function getForks(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    tenantId: string,
    documentId: string): Promise<string[]> {

    const id = getFullId(tenantId, documentId);
    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    const document = await collection.findOne({ _id: id });

    return document.forks || [];
}

export async function createFork(
    producer: utils.kafkaProducer.IProducer,
    tenantManager: api.ITenantManager,
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    tenantId: string,
    id: string): Promise<string> {

    const name = moniker.choose();
    const fullId = getFullId(tenantId, id);
    const fullName = getFullId(tenantId, name);

    const tenant = await tenantManager.getTenant(tenantId).catch((err) => {
        return Promise.reject(err);
    });
    // Load in the latest snapshot
    const gitManager = tenant.gitManager;
    const head = await gitManager.getRef(id);
    winston.info(JSON.stringify(head));

    let sequenceNumber: number;
    let minimumSequenceNumber: number;
    if (head === null) {
        // Set the Seq# and MSN# to StartingSequenceNumber
        minimumSequenceNumber = StartingSequenceNumber;
        sequenceNumber = StartingSequenceNumber;
    } else {
        // Create a new commit, referecing the ref head, but swap out the metadata to indicate the branch details
        const attributesContentP = gitManager.getContent(head.object.sha, ".attributes");
        const branchP = gitManager.upsertRef(name, head.object.sha);
        const [attributesContent] = await Promise.all([attributesContentP, branchP]);

        const attributesJson = Buffer.from(attributesContent.content, "base64").toString("utf-8");
        const attributes = JSON.parse(attributesJson) as api.IDocumentAttributes;
        minimumSequenceNumber = attributes.minimumSequenceNumber;
        sequenceNumber = attributes.sequenceNumber;
    }

    // Get access to Mongo to update the route tables
    const db = await mongoManager.getDatabase();
    const collection = db.collection<core.IDocument>(documentsCollectionName);

    // Insert the fork entry and update the parent to prep storage for both objects
    const insertFork = collection.insertOne(
        {
            _id: fullName,
            branchMap: undefined,
            clients: undefined,
            createTime: Date.now(),
            forks: [],
            logOffset: undefined,
            parent: {
                id: fullId,
                minimumSequenceNumber,
                sequenceNumber,
            },
            sequenceNumber,
        });
    const updateParent = await collection.update({ _id: fullId }, null, { forks: { id: fullName } });
    await Promise.all([insertFork, updateParent]);

    // Notify the parent branch of the fork and the desire to integrate changes
    await sendIntegrateStream(id, sequenceNumber, minimumSequenceNumber, fullName, producer);

    return name;
}

async function getOrCreateObject(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    producer: utils.kafkaProducer.IProducer,
    id: string,
    privateKey: string,
    publicKey: string): Promise<{ existing: boolean, value: core.IDocument }> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<core.IDocument>(documentsCollectionName);
    const result = await collection.findOrCreate(
        {
            _id: id,
        },
        {
            _id: id,
            branchMap: undefined,
            clients: undefined,
            createTime: Date.now(),
            forks: [],
            logOffset: undefined,
            parent: null,
            privateKey,
            publicKey,
            sequenceNumber: StartingSequenceNumber,
        });

    return result;
}

/**
 * Sends a stream integration message which will forward messages after sequenceNumber from id to name.
 */
async function sendIntegrateStream(
    id: string,
    sequenceNumber: number,
    minSequenceNumber: number,
    name: string,
    producer: utils.kafkaProducer.IProducer): Promise<void> {

    const contents: core.IForkOperation = {
        minSequenceNumber,
        name,
        sequenceNumber,
    };

    const integrateMessage: core.IRawOperationMessage = {
        clientId: null,
        documentId: id,
        operation: {
            clientSequenceNumber: -1,
            contents,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            traces: [],
            type: api.Fork,
        },
        timestamp: Date.now(),
        type: core.RawOperationType,
        user: null,
    };
    await producer.send(JSON.stringify(integrateMessage), id);
}
