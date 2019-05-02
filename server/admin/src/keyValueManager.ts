import { IKeyValue } from "./definitions";

export class KeyValueManager {

    private keyValues: IKeyValue[];
    constructor() {
        this.keyValues = [
            {
                key: "@chaincode/shared-text",
                value: "0.0.1",
            },
            {
                key: "@chaincode/monaco",
                value: "0.0.5",
            },
            {
                key: "@chaincode/pinpoint-editor",
                value: "0.0.10",
            },
            {
                key: "@chaincode/charts",
                value: "0.0.1",
            },
        ];
    }
    public getKeyValues(): IKeyValue[] {
        return this.keyValues;
    }

    public addKeyValue(keyValue: IKeyValue): IKeyValue {
        const index = this.keyValues.findIndex((value) => keyValue.key === value.key);
        if (index === -1) {
            this.keyValues.push(keyValue);
        } else {
            this.keyValues[index].value = keyValue.value;
        }
        return keyValue;
    }

    public removeKeyValue(key: string): string {
        const index = this.keyValues.findIndex((value) => key === value.key);
        if (index !== -1) {
            this.keyValues.splice(index, 1);
            return key;
        }
    }
}
