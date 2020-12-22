/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IBlob,
    ISequencedDocumentMessage,
    ISummaryProposal,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import { IAttachMessage, IEnvelope } from "@fluidframework/runtime-definitions";
import {
    ContainerMessageType,
    isRuntimeMessage,
    unpackRuntimeMessage,
} from "@fluidframework/container-runtime";
import { DataStoreMessageType } from "@fluidframework/datastore";

const noClientName = "No Client";
const objectTypePrefix = "https://graph.microsoft.com/types/";

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
    startSeq: number;
    opCount: number;
    email: string;
    duration: number;
}

interface IMessageAnalyzer {
    processOp(op: ISequencedDocumentMessage, msgSize: number, filteredOutOp: boolean): void;
    reportAnalyzes(lastOp: ISequencedDocumentMessage): void;
}

/**
 * Helper class to track session statistics
 */
class ActiveSession {
    public static create(email: string, message: ISequencedDocumentMessage) {
        return new ActiveSession(email, message);
    }

    private opCount = 0;

    constructor(private readonly email: string, private readonly startMessage: ISequencedDocumentMessage) {
    }

    public reportOp(timestamp: number) {
        this.opCount++;
    }

    public leave(timestamp: number): ISessionInfo {
        return {
            opCount: this.opCount,
            email: this.email,
            startSeq: this.startMessage.sequenceNumber,
            duration: timestamp - this.startMessage.timestamp,
        };
    }
}

// Format a number separating 3 digits by comma
// eslint-disable-next-line unicorn/no-unsafe-regex
export const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function dumpStats(
    map: Map<string, [number, number]>,
    props: {
        title: string;
        headers: [string, string];
        lines?: number;
        orderByFirstColumn?: boolean;
        reverseColumnsInUI?: boolean;
        removeTotals?: boolean;
        reverseSort?: boolean;
    }) {
    const fieldSizes = [10, 14];
    const nameLength = 72;
    const fieldsLength = fieldSizes[0] + fieldSizes[1] + 1;
    let headers = props.headers;

    let recordsToShow = props.lines ? props.lines : 10;
    if (map.size !== recordsToShow && !props.removeTotals && recordsToShow > 1) {
        recordsToShow--;
    }

    let sorted: [string, [number, number]][];
    const sortIndex = props.orderByFirstColumn ? 0 : 1;
    let add: string;
    if (props.reverseSort) {
        sorted = [...map.entries()].sort((a, b) => a[1][sortIndex] - b[1][sortIndex]);
        add = "↑";
    } else {
        sorted = [...map.entries()].sort((a, b) => b[1][sortIndex] - a[1][sortIndex]);
        add = "↓";
    }
    headers[sortIndex] = `${headers[sortIndex]} ${add}`;

    if (props.reverseColumnsInUI) {
        headers = [headers[1], headers[0]];
        const sorted2: [string, [number, number]][] = [];
        for (const [name, [count, size]] of sorted) {
            sorted2.push([name, [size, count]]);
        }
        sorted = sorted2;
    }

    let totalCount = 0;
    let sizeTotal = 0;

    props.title = `${props.title} (${sorted.length})`;
    const header0 = headers[0].padStart(fieldSizes[0]);
    let overflow = header0.length - fieldSizes[0];
    console.log(`\n\n${props.title.padEnd(nameLength)} │ ${header0} ${headers[1].padStart(fieldSizes[1] - overflow)}`);

    console.log(`${"─".repeat(nameLength + 1)}┼${"─".repeat(fieldsLength + 1)}`);
    let index = 0;
    let allOtherCount = 0;
    let allOtherSize = 0;
    for (const [name, [count, size]] of sorted) {
        index++;
        totalCount += count;
        sizeTotal += size;
        if (index <= recordsToShow) {
            const item = name.padEnd(nameLength);
            overflow = item.length - nameLength;
            const col1 = formatNumber(count).padStart(fieldSizes[0] - overflow);
            overflow += col1.length - fieldSizes[0];
            const col2 = formatNumber(size).padStart(fieldSizes[1] - overflow);
            console.log(`${item} │ ${col1} ${col2}`);
        } else {
            allOtherCount += count;
            allOtherSize += size;
        }
    }

    if (!props.removeTotals) {
        if (allOtherCount || allOtherSize) {
            // eslint-disable-next-line max-len
            console.log(`${`All Others (${sorted.length - recordsToShow})`.padEnd(nameLength)} │ ${formatNumber(allOtherCount).padStart(fieldSizes[0])} ${formatNumber(allOtherSize).padStart(fieldSizes[1])}`);
        }
        console.log(`${"─".repeat(nameLength + 1)}┼${"─".repeat(fieldsLength + 1)}`);
        // eslint-disable-next-line max-len
        console.log(`${"Total".padEnd(nameLength)} │ ${formatNumber(totalCount).padStart(fieldSizes[0])} ${formatNumber(sizeTotal).padStart(fieldSizes[1])}`);
    }
}

const getObjectId = (dataStoreId: string, id: string) => `[${dataStoreId}]/${id}`;

/**
 * Analyzer for sessions
 */
class SessionAnalyzer implements IMessageAnalyzer {
    private readonly sessionsInProgress = new Map<string, ActiveSession>();
    private readonly sessions = new Map<string, [number, number]>();
    private readonly users = new Map<string, [number, number]>();

    private first = true;

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (this.first) {
            this.first = false;
            // Start of the road.
            const noNameSession = ActiveSession.create(noClientName, message);
            this.sessionsInProgress.set(noClientName, noNameSession);
        }
        const session = processQuorumMessages(
            message,
            skipMessage,
            this.sessionsInProgress,
            this.sessions,
            this.users);
        if (!skipMessage && session) {
            session.reportOp(message.timestamp);
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        // Close any open sessions
        reportOpenSessions(
            lastOp.timestamp,
            this.sessionsInProgress,
            this.sessions,
            this.users);
        dumpStats(this.users, {
            title: "Users",
            headers: ["Sessions", "Op count"],
            reverseColumnsInUI: true,
            lines: 6,
        });
        dumpStats(this.sessions, {
            title: "Sessions",
            headers: ["Duration(s)", "Op count"],
            reverseColumnsInUI: true,
            lines: 6,
        });
        dumpStats(this.sessions, {
            title: "Sessions",
            headers: ["Duration(s)", "Op count"],
            orderByFirstColumn: true,
            reverseColumnsInUI: true,
            removeTotals: true,
            lines: 5,
        });
    }
}

/**
 * Analyzer for data structures
 */
class DataStructureAnalyzer implements IMessageAnalyzer {
    private readonly messageTypeStats = new Map<string, [number, number]>();
    private readonly dataType = new Map<string, string>();
    private readonly dataTypeStats = new Map<string, [number, number]>();
    private readonly objectStats = new Map<string, [number, number]>();

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (!skipMessage) {
            processOp(
                message,
                this.dataType,
                this.objectStats,
                msgSize,
                this.dataTypeStats,
                this.messageTypeStats);
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        dumpStats(this.messageTypeStats, {
            title: "Message Type",
            headers: ["Op count", "Bytes"],
            lines: 20,
        });
        dumpStats(calcChannelStats(this.dataType, this.objectStats), {
            title: "Channel name",
            headers: ["Op count", "Bytes"],
            lines: 7,
        });
        /*
        dumpStats(this.dataTypeStats, {
            title: "Channel type",
            headers: ["Op count", "Bytes"],
        });
        */
    }
}

/**
 * Helper class to report if we filtered out any messages.
 */
class FilteredMessageAnalyzer implements IMessageAnalyzer {
    private sizeTotal = 0;
    private opsTotal = 0;
    private sizeFiltered = 0;
    private opsFiltered = 0;
    private filtered = false;

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        this.sizeTotal += msgSize;
        this.opsTotal++;
        if (!skipMessage) {
            this.sizeFiltered += msgSize;
            this.opsFiltered++;
        } else {
            this.filtered = true;
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        if (this.filtered) {
            // eslint-disable-next-line max-len
            console.log(`\nData is filtered according to --filter:messageType argument(s):\nOp size: ${this.sizeFiltered} / ${this.sizeTotal}\nOp count ${this.opsFiltered} / ${this.opsTotal}`);
        }
        if (this.opsTotal === 0) {
            console.error("No ops were found");
        }
    }
}

/**
 * Helper class to find places where we generated too many ops
 */
class MessageDensityAnalyzer implements IMessageAnalyzer {
    private readonly opChunk = 1000;
    private opLimit = 1;
    private size = 0;
    private timeStart = 0;
    private doctimerStart = 0;
    private readonly ranges = new Map<string, [number, number]>();

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (message.sequenceNumber >= this.opLimit) {
            if (message.sequenceNumber !== 1) {
                const timeDiff = durationFromTime(message.timestamp - this.timeStart);
                const opsString = `ops = [${this.opLimit - this.opChunk}, ${this.opLimit - 1}]`.padEnd(26);
                // eslint-disable-next-line max-len
                const timeString = `time = [${durationFromTime(this.timeStart - this.doctimerStart)}, ${durationFromTime(message.timestamp - this.doctimerStart)}]`;
                this.ranges.set(
                    `${opsString} ${timeString}`,
                    [timeDiff, this.size]);
            } else {
                this.doctimerStart = message.timestamp;
            }
            this.opLimit += this.opChunk;
            this.size = 0;
            this.timeStart = message.timestamp;
        }
        if (!skipMessage) {
            this.size += msgSize;
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        dumpStats(this.ranges, {
            title: "Fastest 1000 op ranges",
            headers: ["Duration(s)", "Bytes"],
            orderByFirstColumn: true,
            reverseSort: true,
            removeTotals: true,
            lines: 3,
        });
    }
}

/**
 * Helper class to analyze collab window size
 */
class CollabWindowSizeAnalyzer implements IMessageAnalyzer {
    private maxCollabWindow = 0;
    private opSeq = 0;

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        const value = message.sequenceNumber - message.minimumSequenceNumber;
        if (value > this.maxCollabWindow) {
            this.maxCollabWindow = value;
            this.opSeq = message.sequenceNumber;
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        console.log(`\nMaximum collab window size: ${this.maxCollabWindow}, seq# ${this.opSeq}`);
    }
}

/**
 * Helper class to analyze frequency of summaries
 */
class SummaryAnalyzer implements IMessageAnalyzer {
    private lastSummaryOp = 0;
    private maxDistance = 0;
    private maxSeq = 0;
    private minDistance = Number.MAX_SAFE_INTEGER;
    private minSeq = 0;
    private maxResponse = 0;
    private maxResponseSeq = 0;

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (message.type === MessageType.SummaryAck) {
            const distance = message.sequenceNumber - this.lastSummaryOp - 1;
            if (this.maxDistance < distance) {
                this.maxDistance = distance;
                this.maxSeq = message.sequenceNumber;
            }
            if (this.minDistance > distance) {
                this.minDistance = distance;
                this.minSeq = message.sequenceNumber;
            }

            this.lastSummaryOp = message.sequenceNumber;
        }
        if (message.type === MessageType.SummaryAck || message.type === MessageType.SummaryNack) {
            const contents: ISummaryProposal = message.contents.summaryProposal;
            const distance = message.sequenceNumber - contents.summarySequenceNumber;
            if (distance > this.maxResponse) {
                this.maxResponse = distance;
                this.maxResponseSeq = message.sequenceNumber;
            }
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
        const distance = lastOp.sequenceNumber - this.lastSummaryOp;
        if (this.maxDistance < distance) {
            this.maxDistance = distance;
            this.maxSeq = lastOp.sequenceNumber + 1;
        }

        console.log("");
        if (this.minDistance === Number.MAX_SAFE_INTEGER) {
            console.log("No summaries found in this document");
        } else {
            console.log(`Maximum distance between summaries: ${this.maxDistance}, seq# ${this.maxSeq}`);
            console.log(`Maximum server response for summary: ${this.maxResponse}, seq# ${this.maxResponseSeq}`);
            console.log(`Minimum distance between summaries: ${this.minDistance}, seq# ${this.minSeq}`);
        }
    }
}

/**
 * Helper class to dump messages to console
 */
class MessageDumper implements IMessageAnalyzer {
    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (!skipMessage) {
            console.log(JSON.stringify(message, undefined, 2));
        }
    }

    public reportAnalyzes(lastOp: ISequencedDocumentMessage): void {
    }
}

export async function printMessageStats(
    generator, // AsyncGenerator<ISequencedDocumentMessage[]>,
    dumpMessageStats: boolean,
    dumpMessages: boolean,
    messageTypeFilter: Set<string> = new Set<string>()) {
    let lastMessage: ISequencedDocumentMessage | undefined;

    const analyzers: IMessageAnalyzer[] = [
        new FilteredMessageAnalyzer(), // Should come first
        new SessionAnalyzer(),
        new DataStructureAnalyzer(),
        new MessageDensityAnalyzer(),
        new CollabWindowSizeAnalyzer(),
        new SummaryAnalyzer(),
    ];

    if (dumpMessages) {
        analyzers.push(new MessageDumper());
    }

    for await (const messages of generator) {
        for (const message of (messages as ISequencedDocumentMessage[])) {
            const msgSize = JSON.stringify(message).length;
            lastMessage = message;

            const skipMessage = messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type);

            for (const analyzer of analyzers) {
                analyzer.processOp(message, msgSize, skipMessage);
            }
        }
    }

    if (lastMessage !== undefined) {
        if (dumpMessageStats) {
            for (const analyzer of analyzers) {
                analyzer.reportAnalyzes(lastMessage);
            }
        } else {
            // Warn about filtered messages
            analyzers[0].reportAnalyzes(lastMessage);
        }
    }
    console.log("");
}

function processOp(
    message: ISequencedDocumentMessage,
    dataType: Map<string, string>,
    objectStats: Map<string, [number, number]>,
    msgSize: number,
    dataTypeStats: Map<string, [number, number]>,
    messageTypeStats: Map<string, [number, number]>) {
    let type = message.type;
    let recorded = false;
    if (isRuntimeMessage(message)) {
        const runtimeMessage = unpackRuntimeMessage(message);
        if (runtimeMessage.type === ContainerMessageType.Attach) {
            const attachMessage = runtimeMessage.contents as IAttachMessage;
            processDataStoreAttachOp(attachMessage, dataType);
        } else {
            let envelop = runtimeMessage.contents as IEnvelope;
            // TODO: Legacy?
            if (envelop && typeof envelop === "string") {
                envelop = JSON.parse(envelop);
            }
            const innerContent = envelop.contents as {
                content: any;
                type: string;
            };
            const address = envelop.address;
            type = `${type}/${innerContent.type}`;
            if (innerContent.type === DataStoreMessageType.Attach) {
                const attachMessage = innerContent.content as IAttachMessage;
                let objectType = attachMessage.type;
                if (objectType.startsWith(objectTypePrefix)) {
                    objectType = objectType.substring(objectTypePrefix.length);
                }
                dataType.set(getObjectId(address, attachMessage.id), objectType);
            } else if (innerContent.type === DataStoreMessageType.ChannelOp) {
                const innerEnvelop = innerContent.content as IEnvelope;
                const innerContent2 = innerEnvelop.contents as {
                    type?: string;
                    value?: any;
                };

                const objectId = getObjectId(address, innerEnvelop.address);
                incr(objectStats, objectId, msgSize);
                let objectType = dataType.get(objectId);
                if (objectType === undefined) {
                    // Somehow we do not have data...
                    dataType.set(objectId, objectId);
                    objectType = objectId;
                }
                incr(dataTypeStats, objectType, msgSize);
                recorded = true;

                let subType = innerContent2.type;
                if (innerContent2.type === "set" &&
                    typeof innerContent2.value === "object" &&
                    innerContent2.value !== null) {
                    type = `${type}/${subType}`;
                    subType = innerContent2.value.type;
                } else if (objectType === "mergeTree" && subType !== undefined) {
                    const types = ["insert", "remove", "annotate", "group"];
                    if (types[subType]) {
                        subType = types[subType];
                    }
                }
                if (subType !== undefined) {
                    type = `${type}/${subType}`;
                }

                type = `${type} (${objectType})`;
            }
        }
    }

    incr(messageTypeStats, type, msgSize);
    if (!recorded) {
        // const objectId = `${type} (system)`;
        const objectId = `(system messages)`;
        const objectType = objectId;
        if (dataType.get(objectId) === undefined) {
            dataType.set(objectId, objectId);
        }
        incr(objectStats, objectId, msgSize);
        incr(dataTypeStats, objectType, msgSize);
    }
}

function processDataStoreAttachOp(
    attachMessage: IAttachMessage | string,
    dataType: Map<string, string>) {
    // dataType.set(getObjectId(attachMessage.id), attachMessage.type);

    // That's data store, and it brings a bunch of data structures.
    // Let's try to crack it.
    let parsedAttachMessage: IAttachMessage;
    if (typeof attachMessage === "string") {
        parsedAttachMessage = JSON.parse(attachMessage);
    } else {
        parsedAttachMessage = attachMessage;
    }
    for (const entry of parsedAttachMessage.snapshot.entries) {
        if (entry.type === TreeEntry.Tree) {
            for (const entry2 of (entry.value as ITree).entries) {
                if (entry2.path === ".attributes" && entry2.type === TreeEntry.Blob) {
                    const attrib = JSON.parse((entry2.value as IBlob).contents);
                    let objectType = attrib.type;
                    if (objectType.startsWith(objectTypePrefix)) {
                        objectType = objectType.substring(objectTypePrefix.length);
                    }
                    dataType.set(getObjectId(parsedAttachMessage.id, entry.path), objectType);
                }
            }
        }
    }
}

function reportOpenSessions(
    lastOpTimestamp: number,
    sessionsInProgress: Map<string, ActiveSession>,
    sessions: Map<string, [number, number]>,
    users: Map<string, [number, number]>) {
    const activeSessions = new Map<string, [number, number]>();

    for (const [clientId, ses] of sessionsInProgress) {
        const sessionInfo = ses.leave(lastOpTimestamp);
        if (clientId !== noClientName) {
            const sessionName = `${clientId} (${sessionInfo.email})`;
            const sessionPayload: [number, number] = [durationFromTime(sessionInfo.duration), sessionInfo.opCount];
            sessions.set(sessionName, sessionPayload);
            activeSessions.set(sessionName, sessionPayload);
        } else {
            sessions.set(
                `Full file lifespan (noClient messages)`,
                [durationFromTime(sessionInfo.duration), sessionInfo.opCount]);
        }
        incr(users, sessionInfo.email, sessionInfo.opCount);
    }

    if (activeSessions.size > 0) {
        dumpStats(activeSessions, {
            title: "Active sessions",
            headers: ["Duration", "Op count"],
            lines: 6,
            orderByFirstColumn: true,
            removeTotals: true,
        });
    }
}

function calcChannelStats(dataType: Map<string, string>, objectStats: Map<string, [number, number]>) {
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
    return channelStats;
}

function processQuorumMessages(
    message: ISequencedDocumentMessage,
    skipMessage: boolean,
    sessionsInProgress: Map<string, ActiveSession>,
    sessions: Map<string, [number, number]>,
    users: Map<string, [number, number]>) {
    let session: ActiveSession | undefined;
    const dataString = (message as any).data;
    if (message.type === "join") {
        const data = JSON.parse(dataString);
        session = ActiveSession.create(data.detail.user.id, message);
        sessionsInProgress.set(data.clientId, session);
    } else if (message.type === "leave") {
        const clientId = JSON.parse(dataString);
        session = sessionsInProgress.get(clientId);
        sessionsInProgress.delete(clientId);
        assert(!!session);
        if (session) {
            if (!skipMessage) {
                session.reportOp(message.timestamp);
            }
            const sessionInfo: ISessionInfo = session.leave(message.timestamp);
            sessions.set(
                `${clientId} (${sessionInfo.email})`,
                [durationFromTime(sessionInfo.duration), sessionInfo.opCount]);
            incr(users, sessionInfo.email, sessionInfo.opCount);
            session = undefined; // Do not record it second time
        }
    } else {
        // message.clientId can be null
        session = sessionsInProgress.get(message.clientId);
        if (session === undefined) {
            session = sessionsInProgress.get(noClientName);
            assert(!!session);
        }
    }
    return session;
}

const durationFromTime = (time: number): number => Math.floor(time / 1000);
