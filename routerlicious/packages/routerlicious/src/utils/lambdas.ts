import { IBoxcar } from "../core";
import { IMessage } from "./kafka/definitions";
import { safelyParseJSON } from "./safeParser";

export function extractBoxcar(message: IMessage): IBoxcar {
    const messageContent = message.value.toString();

    const parsedMessage = safelyParseJSON(messageContent);
    if (!parsedMessage) {
        return { contents: [] };
    }

    return "contents" in parsedMessage
        ? parsedMessage as IBoxcar
        : { contents: [parsedMessage] };
}
