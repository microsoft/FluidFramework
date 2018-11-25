import * as core from "@prague/routerlicious/dist/core";
import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentContextManager } from "./contextManager";
import { DocumentPartition } from "./documentPartition";

export class DocumentLambda implements IPartitionLambda {
    private documents = new Map<string, DocumentPartition>();
    private contextManager: DocumentContextManager;

    constructor(private factory: IPartitionLambdaFactory, private config: Provider, context: IContext) {
        this.contextManager = new DocumentContextManager(context);
        this.contextManager.on("error", (error, restart) => {
            context.error(error, restart);
        });
    }

    public handler(message: utils.IMessage): void {
        this.contextManager.setHead(message.offset);
        this.handlerCore(message);
        this.contextManager.setTail(message.offset);
    }

    public close() {
        this.contextManager.close();
        for (const [, partition] of this.documents) {
            partition.close();
        }
    }

    private handlerCore(kafkaMessage: utils.IMessage): void {
        const parsedKafkaMessage = utils.safelyParseJSON(kafkaMessage.value);
        // kafkaMessage.value = parsedKafkaMessage;

        if (parsedKafkaMessage === undefined) {
            winston.error(`Invalid JSON input: ${kafkaMessage.value}`);
            return;
        }
        const message = parsedKafkaMessage as core.IMessage;
        if (!("documentId" in message) || !("tenantId" in message)) {
            return;
        }

        const sequencedMessage = message as core.ISequencedOperationMessage;

        // Create the routing key from tenantId + documentId
        const routingKey = `${sequencedMessage.tenantId}/${sequencedMessage.documentId}`;

        // Create or update the DocumentPartition
        let document: DocumentPartition;
        if (!this.documents.has(routingKey)) {
            // Create a new context and begin tracking it
            const documentContext = this.contextManager.createContext(kafkaMessage.offset);

            document = new DocumentPartition(
                this.factory,
                this.config,
                sequencedMessage.tenantId,
                sequencedMessage.documentId,
                documentContext);
            this.documents.set(routingKey, document);
        } else {
            document = this.documents.get(routingKey);
            // setHead assumes it will always receive increasing offsets. So we need to split the creation case
            // from the update case.
            document.context.setHead(kafkaMessage.offset);
        }

        // Forward the message to the document queue and then resolve the promise to begin processing more messages
        document.process(kafkaMessage);
    }
}
