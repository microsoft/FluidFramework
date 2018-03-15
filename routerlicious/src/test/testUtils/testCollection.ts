import { EventEmitter } from "events";
import * as _ from "lodash";
import { ICollection, IDb, IDbFactory } from "../../core";

export class TestCollection implements ICollection<any> {
    constructor(public collection: any[]) {
    }

    public async find(query: any, sort: any): Promise<any[]> {
        // TODO - need to actually filter here
        return this.collection;
    }

    public async findAll(): Promise<any[]> {
        // TODO - need to actually filter here
        return this.collection;
    }

    public findOne(query: any): Promise<any> {
        return Promise.resolve(this.findOneInternal(query));
    }

    public async update(filter: any, set: any, addToSet: any): Promise<void> {
        let value = this.findOneInternal(filter);
        if (!value) {
            return Promise.reject("Not found");
        }
        _.extend(value, set);
    }

    public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
        let value = this.findOneInternal(filter);
        if (!value) {
            this.collection.push(set);
        }

        _.extend(value, set);
    }

    public async insertOne(value: any): Promise<any> {
        if (this.findOneInternal(value) !== null) {
            return Promise.resolve("existing object");
        }

        return this.insertOneInternal(value);
    }

    public async findOrCreate(query: any, value: any): Promise<{ value: any, existing: boolean }> {
        const existing = this.findOneInternal(query);
        if (existing) {
            return { value: existing, existing: true };
        }

        return { value: this.insertOneInternal(value), existing: false };
    }

    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        this.collection = this.collection.concat(values);
    }

    public createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private insertOneInternal(value: any): any {
        this.collection.push(value);
        return value;
    }

    private findOneInternal(query: any): any {
        const returnValue = this.collection.find((value) => value._id === query._id);
        return returnValue === undefined ? null : returnValue;
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
        if (!(name in this.collections)) {
            this.collections[name] = [];
        }

        const collection = this.collections[name];
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
