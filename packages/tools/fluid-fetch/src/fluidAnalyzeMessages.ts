/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IBlob,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IAttachMessage, IEnvelope } from "@microsoft/fluid-runtime-definitions";
import * as assert from "assert";

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
    opCount: number;
    email: string;
    duration: number;
}

interface IMessageAnalyzer {
    processOp(op: ISequencedDocumentMessage, msgSize: number, filteredOutOp: boolean): void;
    reportAnalyzes(lastOpTimestamp: number): void;
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
            console.log(`${`All Others (${sorted.length - recordsToShow})`.padEnd(nameLength)} │ ${formatNumber(allOtherCount).padStart(fieldSizes[0])} ${formatNumber(allOtherSize).padStart(fieldSizes[1])}`);
        }
        console.log(`${"─".repeat(nameLength + 1)}┼${"─".repeat(fieldsLength + 1)}`);
        console.log(`${"Total".padEnd(nameLength)} │ ${formatNumber(totalCount).padStart(fieldSizes[0])} ${formatNumber(sizeTotal).padStart(fieldSizes[1])}`);
    }
}

function getObjectId(componentId: string, id: string) {
    return `[${componentId}]/${id}`;
}

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
            const noNameSession = ActiveSession.create(noClientName, message.timestamp);
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

    public reportAnalyzes(lastOpTimestamp: number): void {
        // Close any open sessions
        reportOpenSessions(
            lastOpTimestamp,
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
    private readonly  dataType = new Map<string, string>();
    private readonly  dataTypeStats = new Map<string, [number, number]>();
    private readonly  objectStats = new Map<string, [number, number]>();

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

    public reportAnalyzes(lastOpTimestamp: number): void {
        dumpStats(this.messageTypeStats, {
            title: "Message Type",
            headers: ["Op count", "Bytes"],
            lines: 15,
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

    public reportAnalyzes(lastOpTimestamp: number): void {
        if (this.filtered) {
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
    private readonly ranges = new Map<string, [number, number]>();

    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (message.sequenceNumber >= this.opLimit) {
            if (message.sequenceNumber !== 1) {
                const timeDiff = durationFromTime(message.timestamp - this.timeStart);
                this.ranges.set(`[${this.opLimit - this.opChunk}, ${this.opLimit - 1}]`, [timeDiff, this.size]);
            }
            this.opLimit += this.opChunk;
            this.size = 0;
            this.timeStart = message.timestamp;
        }
        if (!skipMessage) {
            this.size += msgSize;
        }
    }

    public reportAnalyzes(lastOpTimestamp: number): void {
        dumpStats(this.ranges, {
            title: "Fastest op ranges",
            headers: ["Duration(s)", "Bytes"],
            orderByFirstColumn: true,
            reverseSort: true,
            removeTotals: true,
            lines: 3,
        });
    }
}

/**
 * Helper class to dump messages to console
 */
class MessageDumper implements IMessageAnalyzer {
    public processOp(message: ISequencedDocumentMessage, msgSize: number, skipMessage: boolean): void {
        if (!skipMessage) {
            console.log(message);
        }
    }

    public reportAnalyzes(lastOpTimestamp: number): void {
    }
}

export async function printMessageStats(
        generator, // AsyncGenerator<ISequencedDocumentMessage[]>,
        dumpMessageStats: boolean,
        dumpMessages: boolean,
        messageTypeFilter: Set<string> = new Set<string>()) {
    let lastOpTimestamp: number | undefined;

    const analyzers: IMessageAnalyzer[] = [
        new FilteredMessageAnalyzer(), // should come first
        new SessionAnalyzer(),
        new DataStructureAnalyzer(),
        new MessageDensityAnalyzer(),
    ];

    if (dumpMessages) {
        analyzers.push(new MessageDumper());
    }

    for await (const messages of generator) {
        for (const message of (messages as ISequencedDocumentMessage[])) {
            const msgSize = JSON.stringify(message).length;
            lastOpTimestamp = message.timestamp;

            const skipMessage = messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type);

            for (const analyzer of analyzers) {
                analyzer.processOp(message, msgSize, skipMessage);
            }
        }
    }

    if (lastOpTimestamp !== undefined && dumpMessageStats) {
        for (const analyzer of analyzers) {
            analyzer.reportAnalyzes(lastOpTimestamp);
        }
    }
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
    if (message.type === MessageType.Attach) {
        const attachMessage = message.contents as IAttachMessage;
        processComponentAttachOp(attachMessage, dataType);

    } else if (message.type === MessageType.Operation) {
        let envelop = message.contents as IEnvelope;
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
        if (innerContent.type === MessageType.Attach) {
            const attachMessage = innerContent.content as IAttachMessage;
            let objectType = attachMessage.type;
            if (objectType.startsWith(objectTypePrefix)) {
                objectType = objectType.substring(objectTypePrefix.length);
            }
            dataType.set(getObjectId(address, attachMessage.id), objectType);
        } else if (innerContent.type === MessageType.Operation) {
            const innerEnvelop = innerContent.content as IEnvelope;
            const innerContent2 = innerEnvelop.contents as {
                type?: string;
                value?: any;
            };

            const objectId = getObjectId(address, innerEnvelop.address);
            incr(objectStats, objectId, msgSize);
            let objectType = dataType.get(objectId);
            if (objectType === undefined) {
                // somehow we do not have data...
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
            } else if (objectType === "mergeTree" && subType) {
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

function processComponentAttachOp(
        attachMessage: IAttachMessage,
        dataType: Map<string, string>) {
    // dataType.set(getObjectId(attachMessage.id), attachMessage.type);

    // That's component, and it brings a bunch of data structures.
    // Let's try to crack it.
    for (const entry of attachMessage.snapshot.entries) {
        if (entry.type === TreeEntry[TreeEntry.Tree]) {
            for (const entry2 of (entry.value as ITree).entries) {
                if (entry2.path === ".attributes" && entry2.type === TreeEntry[TreeEntry.Blob]) {
                    const attrib = JSON.parse((entry2.value as IBlob).contents);
                    let objectType = attrib.type;
                    if (objectType.startsWith(objectTypePrefix)) {
                        objectType = objectType.substring(objectTypePrefix.length);
                    }
                    dataType.set(getObjectId(attachMessage.id, entry.path), objectType);
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
            sessions.set(
                `${clientId} (${sessionInfo.email})`,
                [durationFromTime(sessionInfo.duration), sessionInfo.opCount]);
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
    return session;
}

function durationFromTime(time: number): number {
    return Math.floor(time / 1000);
}
