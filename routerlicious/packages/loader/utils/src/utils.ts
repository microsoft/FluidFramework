import { MessageType } from "@prague/container-definitions";

export function isSystemType(type: string) {
    return (
        type === MessageType.RemoteHelp ||
        type === MessageType.Integrate ||
        type === MessageType.ClientJoin ||
        type === MessageType.ClientLeave ||
        type === MessageType.Fork);
}
