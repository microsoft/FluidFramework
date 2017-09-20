export interface IDb {
    close(): Promise<void>;

    on(event: string, listener: (...args: any[]) => void);

    collection<T>(name: string): ICollection<T>;
}

export interface IDbFactory {
    connect(): Promise<IDb>;
}

// TODO Do I want to expose the _id field or abstract it?

export interface ICollection<T> {
    find(query: any, sort: any): Promise<T[]>;

    findOne(id: string): Promise<T>;

    upsert(id: string, values: any): Promise<void>;

    insertOne(id: string, values: any): Promise<void>;

    insertMany(values: T[], ordered: boolean): Promise<void>;

    createIndex(index: any, unique: boolean): Promise<void>;
}
