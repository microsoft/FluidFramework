import * as _ from "lodash";
import { Collection, Db, MongoClient, MongoClientOptions } from "mongodb";
import * as core from "../core";

export class MongoCollection<T> implements core.ICollection<T> {
    constructor(private collection: Collection<T>) {
    }

    public find(query: any, sort: any): Promise<T[]> {
        return this.collection
            .find(query)
            .sort(sort)
            .toArray();
    }

    public findOne(id: string): Promise<T> {
        return this.collection.findOne({ _id: id });
    }

    public async upsert(id: string, values: any): Promise<void> {
        const $set = _.extend( { _id: id }, values);
        await this.collection.updateOne(
            {
                _id: id,
            },
            {
                $set,
            },
            {
                upsert: true,
            });
    }

    public async insertOne(id: string, values: any): Promise<void> {
        const value = _.extend( { _id: id }, values);
        await this.collection.insertOne(value);
    }

    public async insertMany(values: T[], ordered: boolean): Promise<void> {
        await this.collection.insertMany(values, { ordered: false });
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        await this.collection.createIndex(index, { unique });
    }
}

export class MongoDb implements core.IDb {
    constructor(private db: Db) {
    }

    public close(): Promise<void> {
        return this.db.close();
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.db.on(event, listener);
    }

    public collection<T>(name: string): core.ICollection<T> {
        const collection = this.db.collection<T>(name);
        return new MongoCollection<T>(collection);
    }
}

export class MongoDbFactory implements core.IDbFactory {
    constructor(private endpoint: string) {
    }

    public async connect(): Promise<core.IDb> {
        // Need to cast to any before MongoClientOptions due to missing properties in d.ts
        const options: MongoClientOptions = {
            autoReconnect: false,
            bufferMaxEntries: 0,
        } as any;

        const connection = await MongoClient.connect(this.endpoint, options);

        return new MongoDb(connection);
    }
}
