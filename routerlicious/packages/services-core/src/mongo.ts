import { ICollection } from "./database";

export interface IDb {
    close(): Promise<void>;

    on(event: string, listener: (...args: any[]) => void);

    collection<T>(name: string): ICollection<T>;
}

export interface IDbFactory {
    connect(): Promise<IDb>;
}
