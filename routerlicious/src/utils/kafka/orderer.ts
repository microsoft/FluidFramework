import { IOrderer, IRawOperationMessage } from "../../core";
import { IProducer } from "./definitions";

export class KafkaOrderer implements IOrderer {
    constructor(private producer: IProducer) {
    }

    public order(message: IRawOperationMessage, topic: string): Promise<void> {
        return this.producer.send(JSON.stringify(message), topic);
    }
}
