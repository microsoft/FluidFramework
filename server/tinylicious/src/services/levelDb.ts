/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import level from "level";
import sublevel from "level-sublevel";
import { Collection, ICollectionProperty } from "./levelDbCollection";

const MaxFetchSize = 2000;

export class LevelDb extends EventEmitter implements IDb {
    private readonly db: any;

    constructor(private readonly path: string) {
        super();
        this.db = sublevel(level(this.path, {
            valueEncoding: "json",
        }));
    }

    public async close(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.db.close();
    }

    public collection<T>(name: string): ICollection<T> {
        const collectionDb = this.db.sublevel(name);
        return new Collection(collectionDb, this.getProperty(name));
    }

    // LevelDB is a pure key value storage so we need to know the fields prior to generate insertion key.
    // (similar to createIndex() call in mongodb)
    private getProperty(name: string): ICollectionProperty {
        switch (name) {
            case "deltas":
                return {
                    indexes: ["tenantId", "documentId", "operation.sequenceNumber"],
                    limit: MaxFetchSize,
                };
            case "documents":
                return {
                    indexes: ["tenantId", "documentId"],
                };
            case "nodes":
                return {
                    indexes: ["_id"],
                };
            case "scribeDeltas":
                return {
                    indexes: ["tenantId", "documentId", "operation.sequenceNumber"],
                    limit: MaxFetchSize,
                };
            case "content":
                return {
                    indexes: ["tenantId", "documentId", "sequenceNumber"],
                    limit: MaxFetchSize,
                };
            default:
                throw new Error(`Collection ${name} not implemented.`);
        }
    }
}
