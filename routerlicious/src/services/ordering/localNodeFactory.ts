import * as uuid from "uuid/v4";
import { TmzRunner } from "../../tmz/runner";
import { MongoManager } from "../../utils";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
    constructor(
        private hostname: string,
        private address: string,
        private mongoManager: MongoManager,
        private nodeCollectionName: string,
        private documentsCollectionName: string,
        private deltasCollectionName: string,
        private tmzRunner: TmzRunner,
        private timeoutLength: number) {
    }

    public async create(): Promise<LocalNode> {
        const node = LocalNode.Connect(
            `${this.hostname}-${uuid()}`,
            this.address,
            this.mongoManager,
            this.nodeCollectionName,
            this.documentsCollectionName,
            this.deltasCollectionName,
            this.tmzRunner,
            this.timeoutLength);

        return node;
    }
}
