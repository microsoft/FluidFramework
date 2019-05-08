import { ISharedMap } from "@prague/map";
import { IKeyValue } from "./interfaces";
import { KeyValueLoader } from "./keyValueLoader";

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
            this.readyP = this.keyValueLoader.load();
    }
    public async entries(): Promise<IKeyValue[]> {
        const keyValues: IKeyValue[] = [];
        const rootMap = await this.getRootMap();
        rootMap.forEach((value: string, key: string) => {
            keyValues.push({ key, value});
        });
        return keyValues;
    }

    public async get(key: string): Promise<IKeyValue> {
        const rootMap = await this.getRootMap();
        return {key, value: rootMap.get(key)};
    }

    private async getRootMap(): Promise<ISharedMap> {
        await this.readyP;
        return this.keyValueLoader.rootMap;
    }
}
