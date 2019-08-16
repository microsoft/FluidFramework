/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Provider } from "nconf";
import { IKeyValue } from "./definitions";
import { IKeyValue as IKV, KeyValueLoader } from "./keyValueLoader";

export class KeyValueManager {
    public static async load(config: Provider) {
        const keyValueLoader = await KeyValueLoader.load(config);
        const cache = await keyValueLoader.cache;
        return new KeyValueManager(cache);
    }
    constructor(private readonly cache: IKV) {
    }

    public getKeyValues(): IKeyValue[] {
        const keyValues: IKeyValue[] = [];
        for (const [key, value] of this.cache.entries()) {
            keyValues.push({key, value});
        }
        return keyValues;
    }

    public addKeyValue(keyValue: IKeyValue): IKeyValue {
        this.cache.set(keyValue.key, keyValue.value);
        return keyValue;
    }

    public removeKeyValue(key: string): string {
        this.cache.delete(key);
        return key;
    }
}
