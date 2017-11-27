import * as winston from "winston";
import { IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";

class ServiceGraphLambda implements IPartitionLambda {
    public handler(message: utils.kafkaConsumer.IMessage): Promise<any> {
        winston.info(`Hey I got a message!!! ${message.offset}`);
        return Promise.resolve();
    }
}

export class ServiceGraphLambdaFactory implements IPartitionLambdaFactory {
    public create(): Promise<IPartitionLambda> {
        return Promise.resolve(new ServiceGraphLambda());
    }
}
