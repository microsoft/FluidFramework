import { AsyncQueue, queue } from "async";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;

    constructor(factory: IPartitionLambdaFactory, config: Provider, id: string, public context: DocumentContext) {
        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.documentId = id;
        const documentConfig = new Provider({}).defaults(clonedConfig).use("memory");
        this.lambdaP = factory.create(documentConfig, context);

        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            this.processCore(message).then(
                () => {
                    callback();
                },
                (error) => {
                    // TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
                    winston.error("Error processing partition message", error);
                    callback(error);
                });
        }, 1);

        // Relay any processing errors back to the parent context
        this.q.error = (error) => {
            this.context.error(error, true);
        };
    }

    public process(message: utils.kafkaConsumer.IMessage) {
        this.q.push(message);
    }

    private async processCore(message: utils.kafkaConsumer.IMessage): Promise<void> {
        winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
        const lambda = await this.lambdaP;
        lambda.handler(message);
    }
}
