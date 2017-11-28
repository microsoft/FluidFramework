import * as winston from "winston";
import * as core from "../core";
import { IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";

class ServiceGraphLambda implements IPartitionLambda {
    public handler(message: utils.kafkaConsumer.IMessage): Promise<any> {
        const baseMessage = JSON.parse(message.value) as core.IMessage;
        if (baseMessage.type === core.SystemType) {
            const systemMessage = baseMessage as core.ISystemMessage;
            winston.info(`System message ${systemMessage.operation} from ${systemMessage.id}:${systemMessage.group}`);
        }

        return Promise.resolve();
    }
}

export class ServiceGraphLambdaFactory implements IPartitionLambdaFactory {
    public create(): Promise<IPartitionLambda> {
        return Promise.resolve(new ServiceGraphLambda());
    }
}
