import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import { RotographLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {

    const rotographConfig = config.get("rotograph");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), rotographConfig);

    // Preps message sender.
    await messageSender.initialize();
    return new RotographLambdaFactory(messageSender, rotographConfig.permissions);
}
