import { IDbFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import registerDebug from "debug";

export const debug = registerDebug("fluid:backend");
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DbFactoryFactory {
    static async create(config: Provider): Promise<IDbFactory> {
        const BACKEND = process.env.DBBACKEND || "MONGODB";

        switch (BACKEND) {
            case "MONGODB": {
                debug("Using MongoDB Backend");
                const { MongoDbFactory } = await import("./mongodb");
                const mongoUrl = config.get("mongo:endpoint") as string;
                const bufferMaxEntries = config.get("mongo:bufferMaxEntries") as number | undefined;
                return new MongoDbFactory(mongoUrl, bufferMaxEntries);
            }
            case "DYNAMODB": {
                debug("Using DynamoDB Backend");
                const { DynamoDbFactory } = await import("./dynamodb");
                const dynamoTableName = config.get("dynamo:table") as string;
                const dynamoRegion = config.get("dynamo:region") as string;
                const dynamoEndpoint = config.get("dynamo:endpoint") as string;
                return new DynamoDbFactory(dynamoEndpoint, dynamoRegion, dynamoTableName);
            }
            default:
                throw new Error(`Unknown backend specified: ${BACKEND}`);
        }
    }
}
