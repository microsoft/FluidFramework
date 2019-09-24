/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISequencedDocumentMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IAttachMessage, IEnvelope } from "@microsoft/fluid-runtime-definitions";
import * as assert from "assert";

function incr(map: Map<string, [number, number]>, key: string, size: number) {
    const value = map.get(key);
    if (value === undefined) {
        map.set(key, [1, size]);
    } else {
        value[0]++;
        value[1] += size;
        map.set(key, value);
    }
}

interface ISessionInfo {
    opCount: number;
    email: string;
    duration: number;
}

/**
 * Helper class to track session statistics
 */
class ActiveSession {
    public static create(email: string, timestamp: number) {
        return new ActiveSession(email, timestamp);
    }

    private opCount = 0;

    constructor(private readonly email: string, private readonly startTime: number) {
    }

    public reportOp(timestamp: number) {
        this.opCount++;
    }

    public leave(timestamp: number): ISessionInfo {
        return {opCount: this.opCount, email: this.email, duration: Math.floor((timestamp - this.startTime) / 1000) };
    }
}

// Format a number separating 3 digits by comma
function formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function dumpStats(
        map: Map<string, [number, number]>,
        props: {
            title: string;
            headers?: [string, string];
            lines?: number;
            orderByFirstColumn?: boolean;
            reverseColumnsInUI?: boolean;
            removeTotals?: boolean;
        }) {
    let fieldSizes = [9, 14];
    let header = props.headers ? props.headers : ["Count", "Bytes"];
    const recordsToShow = props.lines ? props.lines : 10;

    let sorted: [string, [number, number]][];
    if (props.orderByFirstColumn) {
        sorted = [...map.entries()].sort((a, b) => b[1][0] - a[1][0]);
        header[0] = `${header[0]} (↓)`;
    } else {
        sorted = [...map.entries()].sort((a, b) => b[1][1] - a[1][1]);
        header[1] = `${header[1]} (↓)`;
    }

    if (props.reverseColumnsInUI) {
        fieldSizes = [fieldSizes[1], fieldSizes[0]];
        header = [header[1], header[0]];
        for (const [name, [count, size]] of sorted) {
            sorted[name] = [size, count];
        }
    }

    let totalCount = 0;
    let sizeTotal = 0;

    console.log(`\n${props.title.padEnd(72)} | ${header[0].padStart(fieldSizes[0])} ${header[1].padStart(fieldSizes[1])}`);
    console.log("-".repeat(100));
    let index = 0;
    let allOtherCount = 0;
    let allOtherSize = 0;
    for (const [name, [count, size]] of sorted) {
        index++;
        totalCount += count;
        sizeTotal += size;
        if (recordsToShow > 1 && index < recordsToShow || sorted.length === recordsToShow) {
            console.log(`${name.padEnd(72)} | ${formatNumber(count).padStart(fieldSizes[0])} ${formatNumber(size).padStart(fieldSizes[1])}`);
        } else {
            allOtherCount += count;
            allOtherSize += size;
        }
    }

    if (!props.removeTotals && recordsToShow > 1 && sorted.length > recordsToShow) {
        console.log(`${"All Others".padEnd(72)} | ${formatNumber(allOtherCount).padStart(fieldSizes[0])} ${formatNumber(allOtherSize).padStart(fieldSizes[1])}`);
    }

    console.log("-".repeat(100));
    if (!props.removeTotals) {
        console.log(`${"Total".padEnd(72)} | ${formatNumber(totalCount).padStart(fieldSizes[0])} ${formatNumber(sizeTotal).padStart(fieldSizes[1])}`);
    }
}

function getObjectId(componentId: string, id: string) {
    return `[${componentId}]/${id}`;
}

// tslint:disable-next-line:max-func-body-length
export async function printMessageStats(
        generator, // AsyncGenerator<ISequencedDocumentMessage[]>,
        dumpMessageStats: boolean,
        dumpMessages: boolean,
        messageTypeFilter: Set<string> = new Set<string>()) {
    const messageTypeStats = new Map<string, [number, number]>();
    const dataType = new Map<string, string>();
    const dataTypeStats = new Map<string, [number, number]>();
    const objectStats = new Map<string, [number, number]>();
    const sessionsInProgress = new Map<string, ActiveSession>();
    const sessions = new Map<string, [number, number]>();
    const users = new Map<string, [number, number]>();
    const noClientName = "No Client";
    let sizeTotal = 0;
    let opsTotal = 0;
    let sizeFiltered = 0;
    let opsFiltered = 0;
    let lastOpTimestamp = 0;

    for await (const messages of generator) {
        for (const message of (messages as ISequencedDocumentMessage[])) {
            if (opsTotal === 0) {
                // Start of the road.
                const noNameSession = ActiveSession.create(noClientName, message.timestamp);
                sessionsInProgress.set(noClientName, noNameSession);
            }

            const msgSize = JSON.stringify(message).length;
            sizeTotal += msgSize;
            opsTotal++;
            lastOpTimestamp = message.timestamp;

            const skipMessage = messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type);

            let session: ActiveSession | undefined;
            const dataString = (message as any).data;
            if (message.type === "join") {
                const data = JSON.parse(dataString);
                session = ActiveSession.create(data.detail.user.id, message.timestamp);
                sessionsInProgress.set(data.clientId, session);
            } else if (message.type === "leave") {
                const clientId = JSON.parse(dataString);
                session = sessionsInProgress.get(clientId);
                sessionsInProgress.delete(clientId);
                assert(session);
                if (session) {
                    if (!skipMessage) {
                        session.reportOp(message.timestamp);
                    }
                    const sessionInfo: ISessionInfo = session.leave(message.timestamp);
                    sessions.set(`${clientId} / ${sessionInfo.email}`, [sessionInfo.duration, sessionInfo.opCount]);
                    incr(users, sessionInfo.email, sessionInfo.opCount);
                    session = undefined; // do not record it second time
                }
            } else {
                // message.clientId can be null
                session = sessionsInProgress.get(message.clientId);
                if (session === undefined) {
                    session = sessionsInProgress.get(noClientName);
                    assert(session);
                }
            }

            if (skipMessage) {
                continue;
            }

            sizeFiltered += msgSize;
            opsFiltered++;

            if (session) {
                session.reportOp(message.timestamp);
            }

            if (dumpMessages) {
                console.log(message);
            }

            let type = message.type;
            let recorded = false;

            if (message.type === MessageType.Operation) {
                try {
                    let envelop = message.contents as IEnvelope;

                    // TODO: Legacy?
                    if (envelop && typeof envelop === "string") {
                        envelop = JSON.parse(envelop);
                    }

                    const innerContent = envelop.contents as { content: any, type: string };
                    const address = envelop.address;
                    type = `${type}/${innerContent.type}`;

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

                        const innerContent2 = innerEnvelop.contents as { type?: string, value?: any };
                        type = `${type}/${innerContent2.type}`;

                        if (innerContent2.type === "set" &&
                                typeof innerContent2.value === "object" &&
                                innerContent2.value !== null) {
                            if (innerContent2.value.type) {
                                type = `${type}/${innerContent2.value.type}`;
                            }
                        }

                        const objectId = getObjectId(address, innerEnvelop.address);
                        incr(objectStats, objectId, msgSize);

                        let objectType = dataType.get(objectId);
                        if (objectType === undefined) {
                            // Attach can be at component level, so we have not havd a chance to see
                            // attach op for this channel.
                            dataType.set(objectId, objectId);
                            objectType = objectId;
                        }
                        incr(dataTypeStats, objectType, msgSize);

                        recorded = true;
                    }
                } catch (e) {
                    console.error(`ERROR: Unable to process operation message ${e}`);
                    console.error(message);
                    throw e;
                }
            }

            incr(messageTypeStats, type, msgSize);

            if (!recorded) {
                const objectId = `Other: ${type}`;
                const objectType = objectId;
                if (dataType.get(objectId) === undefined) {
                    dataType.set(objectId, objectId);
                }

                incr(objectStats, objectId, msgSize);
                incr(dataTypeStats, objectType, msgSize);
            }
        }
    }

    if (messageTypeFilter.size !== 0) {
        console.log(`\nData is filtered according to --filter:messageType argument(s):\nOp size: ${sizeFiltered} / ${sizeTotal}\nOp count ${opsFiltered} / ${opsTotal}`);
    }

    if (opsTotal === 0) {
        console.log("No ops were found");
        return;
    }

    if (!dumpMessageStats) {
        return;
    }

    // Close any open sessions
    // noClientName is one of the sessions
    const time = lastOpTimestamp;
    if (sessionsInProgress.size > 0) {
        console.log(`\n${sessionsInProgress.size - 1} sessions are active at the end of this file`);
    }
    for (const [clientId, ses] of sessionsInProgress) {
        const sessionInfo = ses.leave(time);
        if (clientId !== noClientName) {
            sessions.set(`${clientId} / ${sessionInfo.email}`, [sessionInfo.duration, sessionInfo.opCount]);
            console.log(`    ${clientId} / ${sessionInfo.email}:   Ops = ${sessionInfo.opCount}, Duration = ${sessionInfo.duration}`);
        } else {
            sessions.set(`Ful file lifespan (no client)`, [sessionInfo.duration, sessionInfo.opCount]);
        }
        incr(users, sessionInfo.email, sessionInfo.opCount);
    }

    dumpStats(users, {
        title: "Sessions",
        headers: ["Count", "Op count"],
        lines: 6,
    });

    dumpStats(sessions, {
        title: "Sessions",
        headers: ["Duration", "Op count"],
        lines: 6,
        removeTotals: true,
    });

    dumpStats(sessions, {
        title: "Sessions",
        headers: ["Duration", "Op count"],
        lines: 6,
        orderByFirstColumn: true,
        removeTotals: true,
        // reverseColumnsInUI: true,
    });

    dumpStats(messageTypeStats, { title: "Message Type" });

    const channelStats = new Map<string, [number, number]>();
    for (const [objectId, type] of dataType) {
        let value = objectStats.get(objectId);
        if (value === undefined) {
            value = [0, 0];
        }
        if (type === objectId) {
            channelStats.set(`${objectId}`, value);
        } else {
            channelStats.set(`${objectId} (${type})`, value);
        }
    }
    dumpStats(channelStats, { title: "Channel name" });
}
