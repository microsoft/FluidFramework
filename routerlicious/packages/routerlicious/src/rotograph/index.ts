import { IPartitionLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { Provider } from "nconf";
import { RotographLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {

    const rotographConfig = config.get("rotograph");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), rotographConfig);

    const authEndpoint = config.get("auth:endpoint");
    const blobStorageUrl = config.get("worker:blobStorageUrl");
    const tenantManager = new services.TenantManager(
        authEndpoint,
        blobStorageUrl);

    // Preps message sender.
    await messageSender.initialize();
    return new RotographLambdaFactory(messageSender, tenantManager, rotographConfig);
}
