/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionMode,
    IClient,
    IDocumentService,
    ISequencedDocumentMessage,
    MessageType,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { IAttachMessage, IEnvelope } from "@microsoft/fluid-runtime-definitions";
import * as fs from "fs";
import * as util from "util";
import {
    dumpChannelStats,
    dumpDataTypeStats,
    dumpMessages,
    dumpMessageStats,
    dumpTotalStats,
    messageTypeFilter,
    paramSave,
} from "./fluidFetchArgs";

async function loadAllSequencedMessages(
    documentService: IDocumentService): Promise<ISequencedDocumentMessage[]> {
    const deltaStorage = await documentService.connectToDeltaStorage();
    const sequencedMessages: ISequencedDocumentMessage[] = [];
    let curr = 0;
    const batch = 2000;

    let timeStart = Date.now();
    while (true) {
        console.log(`Loading ops at ${curr}`);
        const messages = await deltaStorage.get(curr, curr + batch);
        if (messages.length === 0) {
            break;
        }

        sequencedMessages.push(...messages);
        curr = messages[messages.length - 1].sequenceNumber;
    }

    console.log(`${Math.floor((Date.now() - timeStart) / 1000)} seconds to retrieve ${sequencedMessages.length} ops`);

    const client: IClient = {
        permission: [],
        scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
        type: "browser",
        user: { id: "blah" },
     };
    console.log("Retrieving messages from web socket");
    timeStart = Date.now();
    const mode: ConnectionMode = "write";
    const deltaStream = await documentService.connectToDeltaStream(client, mode);
    const initialMessages = deltaStream.initialMessages;
    deltaStream.disconnect();
    console.log(`${Math.floor((Date.now() - timeStart) / 1000)} seconds to connect to web socket`);

    let logMsg = `)`;
    let allMessages = sequencedMessages;
    if (initialMessages) {
        const lastSequenceNumber = sequencedMessages.length === 0 ?
            0 : sequencedMessages[sequencedMessages.length - 1].sequenceNumber;
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

export async function fluidFetchMessages(documentService: IDocumentService) {

    const messageStats = dumpMessageStats || dumpChannelStats || dumpDataTypeStats || dumpTotalStats;
    if (dumpMessages || messageStats || paramSave !== undefined) {
        const sequencedMessages = await loadAllSequencedMessages(documentService);

        if (paramSave !== undefined) {
            const writeFile = util.promisify(fs.writeFile);
            console.log(`Saving messages`);
            await writeFile(`${paramSave}/messages.json`, JSON.stringify(sequencedMessages, undefined, 2));
        }
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
