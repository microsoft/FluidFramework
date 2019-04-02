import {
    IClient,
    IDocumentService,
    ISequencedDocumentMessage,
    ITokenProvider,
    MessageType,
} from "@prague/container-definitions";
import { IAttachMessage, IEnvelope } from "@prague/runtime-definitions";
import {
    dumpChannelStats,
    dumpDataTypeStats,
    dumpMessages,
    dumpMessageStats,
    dumpTotalStats,
    messageTypeFilter,
} from "./pragueDumpArgs";

async function loadAllSequencedMessages(
    tenantId: string,
    id: string,
    documentService: IDocumentService,
    tokenProvider: ITokenProvider): Promise<ISequencedDocumentMessage[]> {
    const deltaStorage = await documentService.connectToDeltaStorage(tenantId, id, tokenProvider);
    const sequencedMessages = new Array<ISequencedDocumentMessage>();
    let curr = 0;
    const batch = 2000;
    while (true) {
        const messages = await deltaStorage.get(curr, curr + batch);
        if (messages.length === 0) {
            break;
        }

        sequencedMessages.push(...messages);
        curr = messages[messages.length - 1].sequenceNumber;
        if (curr !== curr + batch - 1) {
            break;
        }
    }

    const client: IClient = { permission: [], type: "browser", user: { id: "blah" } };
    const deltaStream = await documentService.connectToDeltaStream(tenantId, id, tokenProvider, client);
    const initialMessages = deltaStream.initialMessages;
    deltaStream.disconnect();

    let logMsg = `)`;
    let allMessages = sequencedMessages;
    if (initialMessages) {
        const lastSequenceNumber = sequencedMessages[sequencedMessages.length - 1].sequenceNumber;
        const filtered = initialMessages.filter((a) => a.sequenceNumber > lastSequenceNumber);
        const sorted = filtered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        logMsg = `, ${initialMessages.length} initial ws messages, ${initialMessages.length - sorted.length} dup)`;
        allMessages = sequencedMessages.concat(sorted);
    }
    console.log(`${allMessages.length} total messages (${sequencedMessages.length} delta storage${logMsg}`);
    return allMessages;
}

function incr(map: Map<string, [number, number]>, key: string, opSize: number) {
    const value = map.get(key);
    if (value === undefined) {
        map.set(key, [1, opSize]);
    } else {
        value[0]++;
        value[1] += opSize;
        map.set(key, value);
    }
}

function dumpStats(title: string, map: Map<string, [number, number]>) {
    let totalCount = 0;
    let totalSize = 0;
    console.log(`${title.padEnd(72)} | Count      Bytes`);
    console.log("-".repeat(100));
    for (const [name, [count, size]] of map) {
        totalCount += count;
        totalSize += size;
        console.log(`${name.padEnd(72)} | ${count.toString().padStart(5)} ${size.toString().padStart(10)}`);
    }
    console.log("-".repeat(100));
    console.log(`${"Total".padEnd(72)} | ${totalCount.toString().padStart(5)} ${totalSize.toString().padStart(10)}`);
}

function getObjectId(componentId: string, id: string) {
    return `[${componentId}]/${id}`;
}

export async function pragueDumpMessages(
    documentService: IDocumentService,
    tokenProvider: ITokenProvider,
    tenantId: string,
    id: string) {

    const messageStats = dumpMessageStats || dumpChannelStats || dumpDataTypeStats || dumpTotalStats;
    if (dumpMessages || messageStats) {
        const sequencedMessages = await loadAllSequencedMessages(tenantId, id, documentService, tokenProvider);
        if (dumpMessages) {
            for (const message of sequencedMessages) {
                if (messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type)) {
                    continue;
                }
                console.log(message);
            }
            return;
        }

        if (messageStats) {
            const messageTypeStats = new Map<string, [number, number]>();
            const dataType = new Map<string, string>();
            const dataTypeStats = new Map<string, [number, number]>();
            const objectStats = new Map<string, [number, number]>();
            let totalSize = 0;
            for (const message of sequencedMessages) {
                if (messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type)) {
                    continue;
                }
                const msgSize = JSON.stringify(message).length;
                totalSize += msgSize;
                incr(messageTypeStats, message.type, msgSize);

                if (message.type === MessageType.Operation) {
                    try {
                        let envelop = message.contents as IEnvelope;

                        // TODO: Legacy?
                        if (envelop && typeof envelop === "string") {
                            envelop = JSON.parse(envelop);
                        }

                        const innerContent = envelop.contents as { content: any, type: string };
                        const address = envelop.address;

                        if (innerContent.type === MessageType.Attach) {
                            const attachMessage = innerContent.content as IAttachMessage;
                            let objectType = attachMessage.type;
                            if (objectType.startsWith("https://graph.microsoft.com/types/")) {
                                objectType = objectType.substring("https://graph.microsoft.com/types/".length);
                            }
                            dataType.set(getObjectId(address, attachMessage.id), objectType);
                        }
                        if (innerContent.type === MessageType.Operation) {
                            const innerEnvelop = innerContent.content as IEnvelope;
                            const objectId = getObjectId(address, innerEnvelop.address);
                            incr(objectStats, objectId, msgSize);

                            const objectType = dataType.get(objectId);
                            if (objectType === undefined) {
                                console.log(`WARNING: op on object with unknown type ${objectId}`);
                            } else {
                                incr(dataTypeStats, objectType, msgSize);
                            }
                        }
                    } catch (e) {
                        console.error(`ERROR: Unable to process operation message ${e}`);
                        console.error(message);
                        throw e;
                    }
                }
            }
            if (dumpMessageStats) {
                dumpStats(messageTypeFilter.size ? "Message Type (filtered)" : "Message Type (All)", messageTypeStats);
            }
            if (dumpDataTypeStats) {
                dumpStats("Data Type (Operations only)", dataTypeStats);
            }

            if (dumpChannelStats) {
                const channelStats = new Map<string, [number, number]>();
                for (const [objectId, type] of dataType) {
                    let value = objectStats.get(objectId);
                    if (value === undefined) {
                        value = [0, 0];
                    }
                    channelStats.set(`${objectId} (${type})`, value);
                }
                dumpStats("Channel name (Operations only)", channelStats);
            }
            if (dumpTotalStats) {
                console.log(`Total message size: ${totalSize}`);
            }
        }
    }
}
