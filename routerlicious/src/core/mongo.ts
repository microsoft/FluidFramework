export interface IDb {
    close(): Promise<void>;

    on(event: string, listener: (...args: any[]) => void);

    collection<T>(name: string): ICollection<T>;
}

export interface IDbFactory {
    connect(): Promise<IDb>;
}

export interface ICollection<T> {
    find(query: any, sort: any): Promise<T[]>;

    findOne(query: any): Promise<T>;

    findAll(): Promise<T[]>;

    findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }>;

    update(filter: any, set: any, addToSet: any): Promise<void>;

    upsert(filter: any, set: any, addToSet: any): Promise<void>;

    insertOne(value: T): Promise<void>;

    insertMany(values: T[], ordered: boolean): Promise<void>;

    createIndex(index: any, unique: boolean): Promise<void>;
}
