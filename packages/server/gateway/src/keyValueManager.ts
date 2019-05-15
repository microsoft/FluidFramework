import { ISharedMap } from "@prague/map";
import { IKeyValue } from "./interfaces";
import { KeyValueLoader } from "./keyValueLoader";

// Timeout while waiting to load the key value document.
const loadTimeoutMSec = 15000;

export class KeyValueManager {
    private keyValueLoader: KeyValueLoader;
    private readyP: Promise<void>;
    constructor(
        orderer: string,
        storage: string,
        tenantId: string,
        secret: string,
        jwtKey: string,
        documentId: string,
        codePackage: string) {
            this.keyValueLoader = new KeyValueLoader(
                orderer,
                storage,
                tenantId,
                secret,
                jwtKey,
                documentId,
                codePackage);
            this.readyP = this.loadContainer(loadTimeoutMSec);
    }
    public async entries(): Promise<IKeyValue[]> {
        const keyValues: IKeyValue[] = [];
        const rootMap = await this.getRootMap();
        rootMap.forEach((value: string, key: string) => {
            keyValues.push({ key, value});
        });
        return keyValues;
    }

    public async get(key: string): Promise<string> {
        const rootMap = await this.getRootMap();
        return rootMap.get(key);
    }

    private async getRootMap(): Promise<ISharedMap> {
        await this.readyP;
        return this.keyValueLoader.rootMap;
    }

    private loadContainer(timeoutMS: number) {
        return new Promise<void>((resolve, reject) => {
            const waitTimer = setTimeout(() => {
                clearTimeout(waitTimer);
                reject(`Timeout (${timeoutMS} ms) expired while loading key-value map`);
            }, timeoutMS);

            this.keyValueLoader.load().then(() => {
                clearTimeout(waitTimer);
                resolve();
            }, (err) => {
                clearTimeout(waitTimer);
                reject(err);
            });
        });
    }
}
