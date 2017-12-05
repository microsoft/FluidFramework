import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import * as utils from "../../utils";

export class TestLambda implements IPartitionLambda {
    constructor(config: Provider, context: IContext) {
        // TODO will also fill this in
    }

    public async handler(message: utils.kafkaConsumer.IMessage): Promise<any> {
        // TODO will fill this in
    }
}

export class TestLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new TestLambda(config, context);
    }
}

export function create(): IPartitionLambdaFactory {
    return new TestLambdaFactory();
}

export const id = "test-lambda";

export function createTestPlugin() {
    return {
        create: () => new TestLambdaFactory(),
        id: "test-lambda",
    };
}