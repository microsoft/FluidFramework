import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import { TmzLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const minioConfig = config.get("minio");
    const uploader = services.createUploader("minio", minioConfig);
    const tmzConfig = config.get("tmz");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), tmzConfig);

    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(
        authEndpoint,
        config.get("worker:blobStorageUrl"));

    return new TmzLambdaFactory(messageSender, uploader, tenantManager, tmzConfig.permissions);

}
