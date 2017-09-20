import { EventEmitter } from "events";
import * as _ from "lodash";
import { ICollection, IDb, IDbFactory } from "../../core";

export class TestCollection implements ICollection<any> {
    constructor(private collection: any[]) {
    }

    public async find(query: any, sort: any): Promise<any[]> {
        // TODO - need to actually filter here
        return this.collection;
    }

    public findOne(id: string): Promise<any> {
        const returnValue = this.collection.find((value) => value._id === id);
        return Promise.resolve(returnValue === undefined ? null : returnValue);
    }

    public async upsert(id: string, values: any): Promise<void> {
        let value = await this.findOne(id);
        if (!value) {
            value = {
                _id: id,
            };
        }

        this.collection[id] = _.extend(value, values);
    }

    public insertOne(id: string, values: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public insertMany(values: any[], ordered: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

export class TestDb implements IDb {
    private emitter = new EventEmitter();

    constructor(private collections: { [key: string]: any[] }) {
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.emitter.on(event, listener);
    }

    public collection<T>(name: string): ICollection<T> {
        const collection = name in this.collections ? this.collections[name] : [];
        return new TestCollection(collection);
    }
}

export class TestDbFactory implements IDbFactory {
    constructor(private collections: { [key: string]: any[] }) {
    }

    public connect(): Promise<IDb> {
        return Promise.resolve(new TestDb(this.collections));
    }
}
