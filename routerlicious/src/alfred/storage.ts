import { ICommit } from "gitresources";
import * as moniker from "moniker";
import * as git from "../git-storage";
import * as utils from "../utils";

export interface IDocument {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
};

async function getOrCreateObject(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IDocument> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);

    // TODO there is probably a bit of a race condition with the below between the find and the insert
    const dbObjectP = collection.findOne(id);
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                return { existing: true, docPrivateKey: dbObject._privateKey, docPublicKey: dbObject._publicKey };
            } else {
                return collection
                    .insertOne(id, { _privateKey: privateKey, _publicKey: publicKey, forks: [] })
                    .then(() => {
                        return {existing: false, docPrivateKey: privateKey, docPublicKey: publicKey};
                    });
            }
        });
}

export async function getOrCreateDocument(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IDocument> {

    const getOrCreateP = getOrCreateObject(
        mongoManager,
        documentsCollectionName,
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
    const document = await collection.findOne(id);

    return document.forks || [];
}

export async function createFork(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<string> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    const name = moniker.choose();
    await collection.update(id, null, { forks: name });

    return name;
}
