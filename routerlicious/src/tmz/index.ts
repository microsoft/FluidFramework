import { Provider } from "nconf";
import * as winston from "winston";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import { TmzLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(
        authEndpoint,
        config.get("worker:blobStorageUrl"));

    const minioConfig = config.get("minio");
    const agentUploader = services.createUploader("minio", minioConfig);
    const tmzConfig = config.get("tmz");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), tmzConfig);

    // Preps message sender and agent uploader.
    const messageSenderP = messageSender.initialize();
    const agentUploaderP = agentUploader.initialize();
    await Promise.all([messageSenderP, agentUploaderP]).catch((err) => {
        winston.error(err);
    });
    return new TmzLambdaFactory(messageSender, agentUploader, tenantManager, tmzConfig.permissions);
}
