import { BoxcarType, IBoxcarMessage, IMessage as ICoreMessage } from "@prague/services-core";
import { IMessage } from "./kafka/definitions";
import { safelyParseJSON } from "./safeParser";

export function extractBoxcar(message: IMessage): IBoxcarMessage {
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

        // Contents used to be a string - handle accordingly
        const contents = boxcarMessage.contents.length > 0 && typeof boxcarMessage.contents[0] === "string"
            ? boxcarMessage.contents.map((content: any) => JSON.parse(content))
            : boxcarMessage.contents;

        return {
            contents,
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
