import { ISharedMap } from "@prague/map";
import { IKeyValue } from "./definitions";
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
    public async getKeyValues(): Promise<IKeyValue[]> {
        const keyValues: IKeyValue[] = [];
        const rootMap = await this.getRootMap();
        rootMap.forEach((value: string, key: string) => {
            keyValues.push({ key, value});
        });
        return keyValues;
    }

    public async addKeyValue(keyValue: IKeyValue): Promise<IKeyValue> {
        const rootMap = await this.getRootMap();
        rootMap.set(keyValue.key, keyValue.value);
        return keyValue;
    }

    public async removeKeyValue(key: string): Promise<string> {
        const rootMap = await this.getRootMap();
        rootMap.delete(key);
        return key;
    }

    private async getRootMap(): Promise<ISharedMap> {
        await this.readyP;
        return this.keyValueLoader.rootMap;
    }
}
