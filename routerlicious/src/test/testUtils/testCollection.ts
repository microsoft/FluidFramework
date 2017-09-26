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

    public findOne(id: string): Promise<any> {
        return Promise.resolve(this.findOneInternal(id));
    }

    public async upsert(id: string, values: any): Promise<void> {
        let value = this.findOneInternal(id);
        if (!value) {
            value = {
                _id: id,
            };
            this.collection.push(value);
        }

        _.extend(value, values);
    }

    public async insertOne(id: string, values: any): Promise<any> {
        if (this.findOneInternal(id) !== null) {
            return Promise.resolve("existing object");
        }

        let value = {
            _id: id,
        };
        value = _.extend(value, values);
        this.collection.push(value);
    }

    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        this.collection = this.collection.concat(values);
    }

    public createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private findOneInternal(id: string): any {
        const returnValue = this.collection.find((value) => value._id === id);
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
