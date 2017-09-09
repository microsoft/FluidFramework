import * as _ from "lodash";
import { ICollection } from "../../deli/collection";

export class TestCollection implements ICollection<any> {
    constructor(private collection: { [key: string]: any }) {
    }

    public findOne(id: string): Promise<any> {
        const value = id in this.collection ? this.collection[id] : null;
        return Promise.resolve(value);
    }

    public async upsert(id: string, values: any): Promise<void> {
        let value = await this.findOne(id);
        if (!value) {
            value = {};
        }

        this.collection[id] = _.extend(value, values);
    }
}
