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
    private corrupt = false;

    constructor(
        factory: IPartitionLambdaFactory,
        config: Provider,
        tenantId: string,
        documentId: string,
        public context: DocumentContext) {

        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.tenantId = tenantId;
        clonedConfig.documentId = documentId;
        const documentConfig = new Provider({}).defaults(clonedConfig).use("memory");

        // Create the lambda to handle the document messages
        this.lambdaP = factory.create(documentConfig, context);
        this.lambdaP.catch((error) => {
            context.error(error, true);
            this.q.kill();
        });

        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
            this.lambdaP.then((lambda) => {
                try {
                    if (!this.corrupt) {
                        lambda.handler(message);
                    } else {
                        // Until we can dead letter - simply checkpoint as handled
                        this.context.checkpoint(message.offset);
                    }
                } catch (error) {
                    // TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
                    // for now we will simply continue on to keep the queue flowing
                    winston.error("Error processing partition message", error);
                    this.corrupt = true;
                }

                // handle the next message
                callback();
            });
        }, 1);
    }

    public process(message: utils.kafkaConsumer.IMessage) {
        this.q.push(message);
    }
}
