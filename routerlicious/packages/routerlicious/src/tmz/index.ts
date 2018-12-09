import * as services from "@prague/services";
import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { TmzLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(
        authEndpoint,
        config.get("worker:blobStorageUrl"));

    const tmzConfig = config.get("tmz");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), tmzConfig);

    // Preps message sender.
    await messageSender.initialize();
    return new TmzLambdaFactory(messageSender, tenantManager, tmzConfig.permissions);
}
