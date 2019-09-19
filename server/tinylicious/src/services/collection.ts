/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "@microsoft/fluid-server-services-core";

export class Collection<T> implements ICollection<T> {
    public find(query: any, sort: any): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public findOne(query: any): Promise<T> {
        throw new Error("Method not implemented.");
    }

    public findAll(): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public findOrCreate(query: any, value: T): Promise<{ value: T; existing: boolean; }> {
        throw new Error("Method not implemented.");
    }

    public update(filter: any, set: any, addToSet: any): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public upsert(filter: any, set: any, addToSet: any): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public insertOne(value: T): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public insertMany(values: T[], ordered: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public deleteOne(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public deleteMany(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
