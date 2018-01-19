import * as assert from "assert";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import * as utils from "../../utils";

export class TestLambda implements IPartitionLambda {
    private lastOffset: number;

    constructor(private factory: TestPartitionLambdaFactory, private throwHandler: boolean, private context: IContext) {
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        if (this.throwHandler) {
            throw "Requested failure";
        }

        assert.ok((this.lastOffset === undefined) || (this.lastOffset + 1 === message.offset));
        this.lastOffset = message.offset;
        this.factory.handleCount++;
        this.context.checkpoint(message.offset);
    }

    public close(error: string, restart: boolean) {
        this.context.close(error, restart);
    }
}

export class TestPartitionLambdaFactory implements IPartitionLambdaFactory {
    public handleCount = 0;
    private failCreate = false;
    private throwHandler = false;
    private lambdas = new Array<TestLambda>();

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        if (this.failCreate) {
            return Promise.reject("Set to fail create");
        }

        const lambda = new TestLambda(this, this.throwHandler, context);
        this.lambdas.push(lambda);
        return lambda;
    }

    public async dispose(): Promise<void> {
        return;
    }

    public setFailCreate(value: boolean) {
        this.failCreate = value;
    }

    public setThrowHandler(value: boolean) {
        this.throwHandler = value;
    }

    /**
     * Closes all created lambdas
     */
    public closeLambdas(error: string, restart: boolean) {
        for (const lambda of this.lambdas) {
            lambda.close(error, restart);
        }
    }
}
