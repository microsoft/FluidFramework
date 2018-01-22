import { Provider } from "nconf";
import * as core from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DocumentContextManager } from "./contextManager";
import { DocumentPartition } from "./documentPartition";

export class DocumentLambda implements IPartitionLambda {
    private documents = new Map<string, DocumentPartition>();
    private contextManager: DocumentContextManager;

    constructor(private factory: IPartitionLambdaFactory, private config: Provider, context: IContext) {
        this.contextManager = new DocumentContextManager(context);
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        this.contextManager.setHead(message.offset);
        this.handlerCore(message);
        this.contextManager.setTail(message.offset);
    }

    private handlerCore(kafkaMessage: utils.kafkaConsumer.IMessage): void {
        const message = JSON.parse(kafkaMessage.value) as core.IMessage;
        if (!("documentId" in message)) {
            return;
        }

        const sequencedMessage = message as core.ISequencedOperationMessage;

        // Create or update the DocumentPartition
        let document: DocumentPartition;
        if (!this.documents.has(sequencedMessage.documentId)) {
            // Create a new context and begin tracking it
            const documentContext = this.contextManager.createContext(kafkaMessage.offset);

            document = new DocumentPartition(
                this.factory,
                this.config,
                sequencedMessage.documentId,
                documentContext);
            this.documents.set(sequencedMessage.documentId, document);
        } else {
            document = this.documents.get(sequencedMessage.documentId);
            // setHead assumes it will always receive increasing offsets. So we need to split the creation case
            // from the update case.
            document.context.setHead(kafkaMessage.offset);
        }

        // Forward the message to the document queue and then resolve the promise to begin processing more messages
        document.process(kafkaMessage);
    }
}
