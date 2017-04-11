import { Sender } from "azure-event-hubs";
import * as socketStorage from "../socket-storage";

/**
 * Class to handle distributing sequence numbers to a collaborative object
 */
export class TakeANumber {
    private sequenceNumber: number;

    constructor(private sender: Sender) {
    }

    /**
     * Assigns a number number to the given message at the provided offset
     */
    public ticket(message: socketStorage.ISubmitOpMessage, offset: string) {
        const ticketedMessage: socketStorage.IRoutedOpMessage = {
            clientId: message.clientId,
            objectId: message.objectId,
            op: message.op,
            sequenceNumber: this.getSequenceNumber(),
        };

        this.sender.send(ticketedMessage, ticketedMessage.objectId);
    }

    private getSequenceNumber(): number {
        return ++this.sequenceNumber;
    }
}
