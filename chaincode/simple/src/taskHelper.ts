import { Browser, IClient, IClientJoin, IHelpMessage, IRuntime, MessageType } from "@prague/runtime-definitions";

export function runTaskAnalyzer(runtime: IRuntime) {
    const currentLeader = getLeader(runtime.getQuorum().getMembers());
    // tslint:disable-next-line:strict-boolean-expressions
    const isLeader = currentLeader && currentLeader.clientId === runtime.clientId;
    if (isLeader) {
        const remoteHelpMessage: IHelpMessage = {
            tasks: ["chaincode"],
        };
        runtime.submitSystemMessage(MessageType.RemoteHelp, remoteHelpMessage);
    }
}

function getLeader(clients: Map<string, IClient>): IClientJoin {
    for (const client of clients) {
        if (!isRobot(client[1])) {
            return {
                clientId: client[0],
                detail: client[1],
            };
        }
    }
}

function isRobot(client: IClient): boolean {
    return client && client.type !== Browser;
}
