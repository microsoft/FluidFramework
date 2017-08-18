import { RedisClient } from "redis";
import * as util from "util";
import { ICache } from "./definitions";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    private getAsync;
    private setAsync;

    constructor(client: RedisClient) {
        this.getAsync = util.promisify(client.get.bind(client));
        this.setAsync = util.promisify(client.set.bind(client));
    }

    public async get<T>(key: string): Promise<T> {
        const stringValue = await this.getAsync(key);
        return JSON.parse(stringValue) as T;
    }

    public async set<T>(key: string, value: T): Promise<void> {
        const result = await this.setAsync(key, JSON.stringify(value));
        if (result !== "OK") {
            return Promise.reject(result);
        }
    }
}
