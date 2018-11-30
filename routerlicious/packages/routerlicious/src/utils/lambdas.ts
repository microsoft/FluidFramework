import { BoxcarType, IBoxcarMessage, IMessage as ICoreMessage, IParsedBoxcarMessage } from "../core";
import { IMessage } from "./kafka/definitions";
import { safelyParseJSON } from "./safeParser";

export function extractBoxcar(message: IMessage): IParsedBoxcarMessage {
    if (typeof message.value !== "string" && !Buffer.isBuffer(message.value)) {
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

    if (parsedMessage.type === BoxcarType) {
        const boxcarMessage = parsedMessage as IBoxcarMessage;
        return {
            contents: boxcarMessage.contents.map((json) => JSON.parse(json)),
            documentId: boxcarMessage.documentId,
            tenantId: boxcarMessage.tenantId,
            type: boxcarMessage.type,
        };
    } else {
        return {
            contents: [parsedMessage],
            documentId: rawMessage.documentId,
            tenantId: rawMessage.tenantId,
            type: BoxcarType,
        };
    }
}
