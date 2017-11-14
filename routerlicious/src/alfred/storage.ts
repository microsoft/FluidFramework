import { ICommit } from "gitresources";
import * as moniker from "moniker";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import * as git from "../git-storage";
import * as utils from "../utils";

const StartingSequenceNumber = 0;

/**
 * Retrieves database details for the given document
 */
export async function getDocument(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<any> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    return collection.findOne({ _id: id });
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
            clients: undefined,
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

    const integrateMessage: core.IRawOperationMessage = {
        clientId: null,
        documentId: id,
        operation: {
            clientSequenceNumber: -1,
            contents: {
                minSequenceNumber,
                name,
                sequenceNumber,
            },
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            traces: [],
            type: api.Fork,
        },
        timestamp: Date.now(),
        type: core.RawOperationType,
        userId: null,
    };
    await producer.send(JSON.stringify(integrateMessage), id);
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

export async function getLatestVersion(gitManager: git.GitManager, id: string): Promise<ICommit> {
    const commits = await gitManager.getCommits(id, 1);
    return commits.length > 0 ? commits[0] : null;
}

/**
 * Retrieves the forks for the given document
 */
export async function getForks(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<string[]> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    const document = await collection.findOne({ _id: id });

    return document.forks || [];
}

export async function createFork(
    producer: utils.kafkaProducer.IProducer,
    gitManager: git.GitManager,
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<string> {

    const name = moniker.choose();

    // Load in the latest snapshot
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

        // Need to load in the MSN, etc... off of this
        winston.info("There is a snapshot we can work off of");
    }

    // Get access to Mongo to update the route tables
    const db = await mongoManager.getDatabase();
    const collection = db.collection<core.IDocument>(documentsCollectionName);

    // Insert the fork entry and update the parent to prep storage for both objects
    const insertFork = collection.insertOne(
        {
            _id: name,
            clients: undefined,
            forks: [],
            logOffset: undefined,
            parent: {
                id,
                minimumSequenceNumber,
                sequenceNumber,
            },
            sequenceNumber,
        });
    const updateParent = await collection.update({ _id: id }, null, { forks: { id: name } });
    await Promise.all([insertFork, updateParent]);

    // Notify the parent branch of the fork and the desire to integrate changes
    await sendIntegrateStream(id, sequenceNumber, minimumSequenceNumber, name, producer);

    return name;
}
