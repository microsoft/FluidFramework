import { INode } from "../services";
import { IDocument } from "./document";
import { ISequencedOperationMessage } from "./messages";

/**
 * Interface to abstract the backend database
 */
export interface IDatabaseManager {
    /**
     * Retrieves the node collection
     */
    getNodeCollection(): Promise<ICollection<INode>>;

    /**
     * Retrieves the document collection
     */
    getDocumentCollection(): Promise<ICollection<IDocument>>;

    /**
     * Retrieves the delta collection
     */
    getDeltaCollection(tenantId: string, documentId: string): Promise<ICollection<ISequencedOperationMessage>>;
}

export interface ICollection<T> {
    find(query: any, sort: any): Promise<T[]>;

    findOne(query: any): Promise<T>;

    findAll(): Promise<T[]>;

    findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }>;

    update(filter: any, set: any, addToSet: any): Promise<void>;

    upsert(filter: any, set: any, addToSet: any): Promise<void>;

    insertOne(value: T): Promise<any>;

    insertMany(values: T[], ordered: boolean): Promise<void>;

    createIndex(index: any, unique: boolean): Promise<void>;
}
