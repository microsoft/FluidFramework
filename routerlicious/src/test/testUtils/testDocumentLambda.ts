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
    public lambdas: TestLambda[] = [];

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const lambda = new TestLambda(config, context);
        this.lambdas.push(lambda);
        return lambda;
    }
}

export function create(): IPartitionLambdaFactory {
    return new TestLambdaFactory();
}

export const id = "test-lambda";

export interface ITestLambdaModule {
    create: () => TestLambdaFactory;
    factories: TestLambdaFactory[];
    id: string;
}

export function createTestModule(): ITestLambdaModule {
    const factories: TestLambdaFactory[] = [];
    return {
        create: () => {
            const factory = new TestLambdaFactory();
            factories.push(factory);
            return factory;
        },
        factories,
        id: "test-lambda",
    };
}