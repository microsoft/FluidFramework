import { AsyncQueue, queue } from "async";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { assertNotRejected } from "../core-utils";
import { IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;

    constructor(factory: IPartitionLambdaFactory, config: Provider, id: string, public context: DocumentContext) {
        // TODO extend existing type definition
        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.documentId = id;
        const documentConfig = new Provider({}).defaults(clonedConfig).use("memory");
        this.lambdaP = factory.create(documentConfig, context);

        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            const processedP = this.processCore(message).catch((error) => {
                    // TODO dead letter queue for bad messages, etc...
                    winston.error("Error processing partition message", error);
                });

            // Validate processedP only resolves - then call the next message
            assertNotRejected(processedP).then(() => callback());
        }, 1);
    }

    public process(message: utils.kafkaConsumer.IMessage) {
        this.q.push(message);
    }

    private async processCore(message: utils.kafkaConsumer.IMessage): Promise<void> {
        winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
        const lambda = await this.lambdaP;
        return lambda.handler(message);
    }
}
