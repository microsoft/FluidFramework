import { GitManager, Historian } from "@prague/services-client";
import {
    ICollection,
    IContext,
    IDocument,
    IPartitionLambda,
    IPartitionLambdaFactory,
    MongoManager,
} from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import { ScribeLambda } from "./lambda";

export class ScribeLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: MongoManager,
        private collection: ICollection<IDocument>,
        private historianEndpoint: string,
    ) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const tenantId = config.get("tenantId");
        const documentId = config.get("documentId");

        winston.info(`New tenant storage ${tenantId}/${documentId}`);
        const endpoint = `${this.historianEndpoint}/repos/${encodeURIComponent(tenantId)}`;
        const historian = new Historian(endpoint, true, false);
        const gitManager = new GitManager(historian);

        winston.info(`Querying mongo for proposals ${tenantId}/${documentId}`);
        const document = await this.collection.findOne({ documentId, tenantId });

        winston.info(`Proposals ${tenantId}/${documentId}: ${JSON.stringify(document)}`);

        return new ScribeLambda(
            context,
            this.collection,
            document,
            gitManager);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
