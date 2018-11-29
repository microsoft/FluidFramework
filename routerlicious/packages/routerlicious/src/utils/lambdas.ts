import { BoxcarType, IBoxcarMessage, IMessage as ICoreMessage } from "../core";
import { IMessage } from "./kafka/definitions";
import { safelyParseJSON } from "./safeParser";

export function extractBoxcar(message: IMessage): IBoxcarMessage {
    if (typeof message.value !== "string") {
        return message.value;
    }

    const messageContent = message.value.toString();

    const rawMessage = safelyParseJSON(messageContent);
    const parsedMessage = rawMessage as ICoreMessage;

    if (!parsedMessage) {
        return {
            contents: [],
            documentId: null,
            tenantId: null,
            type: BoxcarType,
        };
    }

    return parsedMessage.type === BoxcarType
        ? parsedMessage as IBoxcarMessage
        : {
            contents: [parsedMessage],
            documentId: rawMessage.documentId,
            tenantId: rawMessage.tenantId,
            type: BoxcarType,
        };
}
