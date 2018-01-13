import * as assert from "assert";
import { Provider } from "nconf";
import * as core from "../../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import * as utils from "../../utils";

export class TestLambda implements IPartitionLambda {
    private documentId: string;

    constructor(config: Provider, private context: IContext) {
        this.documentId = config.get("documentId");
        assert(this.documentId);
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        const sequencedMessage = JSON.parse(message.value) as core.ISequencedOperationMessage;
        assert.equal(this.documentId, sequencedMessage.documentId);
        this.context.checkpoint(message.offset);
    }
}

export class TestLambdaFactory implements IPartitionLambdaFactory {
    public lambdas: TestLambda[] = [];

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const lambda = new TestLambda(config, context);
        this.lambdas.push(lambda);
        return lambda;
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export function create(config: Provider): IPartitionLambdaFactory {
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
