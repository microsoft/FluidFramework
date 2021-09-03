/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { assert } from "@fluidframework/common-utils";
import { MessageType, TreeEntry, } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, isRuntimeMessage, unpackRuntimeMessage, } from "@fluidframework/container-runtime";
import { DataStoreMessageType } from "@fluidframework/datastore";
const noClientName = "No Client";
const objectTypePrefix = "https://graph.microsoft.com/types/";
function incr(map, key, size) {
    const value = map.get(key);
    if (value === undefined) {
        map.set(key, [1, size]);
    }
    else {
        value[0]++;
        value[1] += size;
        map.set(key, value);
    }
}
/**
 * Helper class to track session statistics
 */
class ActiveSession {
    constructor(email, startMessage) {
        this.email = email;
        this.startMessage = startMessage;
        this.opCount = 0;
    }
    static create(email, message) {
        return new ActiveSession(email, message);
    }
    reportOp(timestamp) {
        this.opCount++;
    }
    leave(timestamp) {
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
export const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function dumpStats(map, props) {
    const fieldSizes = [10, 14];
    const nameLength = 72;
    const fieldsLength = fieldSizes[0] + fieldSizes[1] + 1;
    let headers = props.headers;
    let recordsToShow = props.lines ? props.lines : 10;
    if (map.size !== recordsToShow && !props.removeTotals && recordsToShow > 1) {
        recordsToShow--;
    }
    let sorted;
    const sortIndex = props.orderByFirstColumn ? 0 : 1;
    let add;
    if (props.reverseSort) {
        sorted = [...map.entries()].sort((a, b) => a[1][sortIndex] - b[1][sortIndex]);
        add = "↑";
    }
    else {
        sorted = [...map.entries()].sort((a, b) => b[1][sortIndex] - a[1][sortIndex]);
        add = "↓";
    }
    headers[sortIndex] = `${headers[sortIndex]} ${add}`;
    if (props.reverseColumnsInUI) {
        headers = [headers[1], headers[0]];
        const sorted2 = [];
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
        }
        else {
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
const getObjectId = (dataStoreId, id) => `[${dataStoreId}]/${id}`;
/**
 * Analyzer for sessions
 */
class SessionAnalyzer {
    constructor() {
        this.sessionsInProgress = new Map();
        this.sessions = new Map();
        this.users = new Map();
        this.first = true;
    }
    processOp(message, msgSize, skipMessage) {
        if (this.first) {
            this.first = false;
            // Start of the road.
            const noNameSession = ActiveSession.create(noClientName, message);
            this.sessionsInProgress.set(noClientName, noNameSession);
        }
        const session = processQuorumMessages(message, skipMessage, this.sessionsInProgress, this.sessions, this.users);
        if (!skipMessage && session) {
            session.reportOp(message.timestamp);
        }
    }
    reportAnalyzes(lastOp) {
        // Close any open sessions
        reportOpenSessions(lastOp.timestamp, this.sessionsInProgress, this.sessions, this.users);
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
class DataStructureAnalyzer {
    constructor() {
        this.messageTypeStats = new Map();
        this.dataType = new Map();
        this.dataTypeStats = new Map();
        this.objectStats = new Map();
    }
    processOp(message, msgSize, skipMessage) {
        if (!skipMessage) {
            processOp(message, this.dataType, this.objectStats, msgSize, this.dataTypeStats, this.messageTypeStats);
        }
    }
    reportAnalyzes(lastOp) {
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
class FilteredMessageAnalyzer {
    constructor() {
        this.sizeTotal = 0;
        this.opsTotal = 0;
        this.sizeFiltered = 0;
        this.opsFiltered = 0;
        this.filtered = false;
    }
    processOp(message, msgSize, skipMessage) {
        this.sizeTotal += msgSize;
        this.opsTotal++;
        if (!skipMessage) {
            this.sizeFiltered += msgSize;
            this.opsFiltered++;
        }
        else {
            this.filtered = true;
        }
    }
    reportAnalyzes(lastOp) {
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
class MessageDensityAnalyzer {
    constructor() {
        this.opChunk = 1000;
        this.opLimit = 1;
        this.size = 0;
        this.timeStart = 0;
        this.doctimerStart = 0;
        this.ranges = new Map();
    }
    processOp(message, msgSize, skipMessage) {
        if (message.sequenceNumber >= this.opLimit) {
            if (message.sequenceNumber !== 1) {
                const timeDiff = durationFromTime(message.timestamp - this.timeStart);
                const opsString = `ops = [${this.opLimit - this.opChunk}, ${this.opLimit - 1}]`.padEnd(26);
                // eslint-disable-next-line max-len
                const timeString = `time = [${durationFromTime(this.timeStart - this.doctimerStart)}, ${durationFromTime(message.timestamp - this.doctimerStart)}]`;
                this.ranges.set(`${opsString} ${timeString}`, [timeDiff, this.size]);
            }
            else {
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
    reportAnalyzes(lastOp) {
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
class CollabWindowSizeAnalyzer {
    constructor() {
        this.maxCollabWindow = 0;
        this.opSeq = 0;
    }
    processOp(message, msgSize, skipMessage) {
        const value = message.sequenceNumber - message.minimumSequenceNumber;
        if (value > this.maxCollabWindow) {
            this.maxCollabWindow = value;
            this.opSeq = message.sequenceNumber;
        }
    }
    reportAnalyzes(lastOp) {
        console.log(`\nMaximum collab window size: ${this.maxCollabWindow}, seq# ${this.opSeq}`);
    }
}
/**
 * Helper class to analyze frequency of summaries
 */
class SummaryAnalyzer {
    constructor() {
        this.lastSummaryOp = 0;
        this.maxDistance = 0;
        this.maxSeq = 0;
        this.minDistance = Number.MAX_SAFE_INTEGER;
        this.minSeq = 0;
        this.maxResponse = 0;
        this.maxResponseSeq = 0;
    }
    processOp(message, msgSize, skipMessage) {
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
            const contents = message.contents.summaryProposal;
            const distance = message.sequenceNumber - contents.summarySequenceNumber;
            if (distance > this.maxResponse) {
                this.maxResponse = distance;
                this.maxResponseSeq = message.sequenceNumber;
            }
        }
    }
    reportAnalyzes(lastOp) {
        const distance = lastOp.sequenceNumber - this.lastSummaryOp;
        if (this.maxDistance < distance) {
            this.maxDistance = distance;
            this.maxSeq = lastOp.sequenceNumber + 1;
        }
        console.log("");
        if (this.minDistance === Number.MAX_SAFE_INTEGER) {
            console.log("No summaries found in this document");
        }
        else {
            console.log(`Maximum distance between summaries: ${this.maxDistance}, seq# ${this.maxSeq}`);
            console.log(`Maximum server response for summary: ${this.maxResponse}, seq# ${this.maxResponseSeq}`);
            console.log(`Minimum distance between summaries: ${this.minDistance}, seq# ${this.minSeq}`);
        }
    }
}
/**
 * Helper class to dump messages to console
 */
class MessageDumper {
    processOp(message, msgSize, skipMessage) {
        if (!skipMessage) {
            console.log(JSON.stringify(message, undefined, 2));
        }
    }
    reportAnalyzes(lastOp) {
    }
}
export async function printMessageStats(generator, // AsyncGenerator<ISequencedDocumentMessage[]>,
dumpMessageStats, dumpMessages, messageTypeFilter = new Set()) {
    var e_1, _a;
    let lastMessage;
    const analyzers = [
        new FilteredMessageAnalyzer(),
        new SessionAnalyzer(),
        new DataStructureAnalyzer(),
        new MessageDensityAnalyzer(),
        new CollabWindowSizeAnalyzer(),
        new SummaryAnalyzer(),
    ];
    if (dumpMessages) {
        analyzers.push(new MessageDumper());
    }
    try {
        for (var generator_1 = __asyncValues(generator), generator_1_1; generator_1_1 = await generator_1.next(), !generator_1_1.done;) {
            const messages = generator_1_1.value;
            for (const message of messages) {
                const msgSize = JSON.stringify(message).length;
                lastMessage = message;
                const skipMessage = messageTypeFilter.size !== 0 && !messageTypeFilter.has(message.type);
                for (const analyzer of analyzers) {
                    analyzer.processOp(message, msgSize, skipMessage);
                }
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (generator_1_1 && !generator_1_1.done && (_a = generator_1.return)) await _a.call(generator_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    if (lastMessage !== undefined) {
        if (dumpMessageStats) {
            for (const analyzer of analyzers) {
                analyzer.reportAnalyzes(lastMessage);
            }
        }
        else {
            // Warn about filtered messages
            analyzers[0].reportAnalyzes(lastMessage);
        }
    }
    console.log("");
}
function processOp(message, dataType, objectStats, msgSize, dataTypeStats, messageTypeStats) {
    let type = message.type;
    let recorded = false;
    if (isRuntimeMessage(message)) {
        const runtimeMessage = unpackRuntimeMessage(message);
        switch (runtimeMessage.type) {
            case ContainerMessageType.Attach: {
                const attachMessage = runtimeMessage.contents;
                processDataStoreAttachOp(attachMessage, dataType);
                break;
            }
            // skip for now because these ops do not have contents
            case ContainerMessageType.BlobAttach: {
                break;
            }
            default: {
                let envelope = runtimeMessage.contents;
                // TODO: Legacy?
                if (envelope && typeof envelope === "string") {
                    envelope = JSON.parse(envelope);
                }
                const innerContent = envelope.contents;
                const address = envelope.address;
                type = `${type}/${innerContent.type}`;
                switch (innerContent.type) {
                    case DataStoreMessageType.Attach: {
                        const attachMessage = innerContent.content;
                        let objectType = attachMessage.type;
                        if (objectType.startsWith(objectTypePrefix)) {
                            objectType = objectType.substring(objectTypePrefix.length);
                        }
                        dataType.set(getObjectId(address, attachMessage.id), objectType);
                        break;
                    }
                    case DataStoreMessageType.ChannelOp:
                    default: {
                        const innerEnvelope = innerContent.content;
                        const innerContent2 = innerEnvelope.contents;
                        const objectId = getObjectId(address, innerEnvelope.address);
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
                        }
                        else if (objectType === "mergeTree" && subType !== undefined) {
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
function processDataStoreAttachOp(attachMessage, dataType) {
    // dataType.set(getObjectId(attachMessage.id), attachMessage.type);
    // That's data store, and it brings a bunch of data structures.
    // Let's try to crack it.
    let parsedAttachMessage;
    if (typeof attachMessage === "string") {
        parsedAttachMessage = JSON.parse(attachMessage);
    }
    else {
        parsedAttachMessage = attachMessage;
    }
    for (const entry of parsedAttachMessage.snapshot.entries) {
        if (entry.type === TreeEntry.Tree) {
            for (const entry2 of entry.value.entries) {
                if (entry2.path === ".attributes" && entry2.type === TreeEntry.Blob) {
                    const attrib = JSON.parse(entry2.value.contents);
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
function reportOpenSessions(lastOpTimestamp, sessionsInProgress, sessions, users) {
    const activeSessions = new Map();
    for (const [clientId, ses] of sessionsInProgress) {
        const sessionInfo = ses.leave(lastOpTimestamp);
        if (clientId !== noClientName) {
            const sessionName = `${clientId} (${sessionInfo.email})`;
            const sessionPayload = [durationFromTime(sessionInfo.duration), sessionInfo.opCount];
            sessions.set(sessionName, sessionPayload);
            activeSessions.set(sessionName, sessionPayload);
        }
        else {
            sessions.set(`Full file lifespan (noClient messages)`, [durationFromTime(sessionInfo.duration), sessionInfo.opCount]);
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
function calcChannelStats(dataType, objectStats) {
    const channelStats = new Map();
    for (const [objectId, type] of dataType) {
        let value = objectStats.get(objectId);
        if (value === undefined) {
            value = [0, 0];
        }
        if (type === objectId) {
            channelStats.set(`${objectId}`, value);
        }
        else {
            channelStats.set(`${objectId} (${type})`, value);
        }
    }
    return channelStats;
}
function processQuorumMessages(message, skipMessage, sessionsInProgress, sessions, users) {
    let session;
    const dataString = message.data;
    if (message.type === "join") {
        const data = JSON.parse(dataString);
        session = ActiveSession.create(data.detail.user.id, message);
        sessionsInProgress.set(data.clientId, session);
    }
    else if (message.type === "leave") {
        const clientId = JSON.parse(dataString);
        session = sessionsInProgress.get(clientId);
        sessionsInProgress.delete(clientId);
        assert(!!session, 0x1b7 /* "Bad session state for processing quorum messages" */);
        if (session) {
            if (!skipMessage) {
                session.reportOp(message.timestamp);
            }
            const sessionInfo = session.leave(message.timestamp);
            sessions.set(`${clientId} (${sessionInfo.email})`, [durationFromTime(sessionInfo.duration), sessionInfo.opCount]);
            incr(users, sessionInfo.email, sessionInfo.opCount);
            session = undefined; // Do not record it second time
        }
    }
    else {
        // message.clientId can be null
        session = sessionsInProgress.get(message.clientId);
        if (session === undefined) {
            session = sessionsInProgress.get(noClientName);
            assert(!!session, 0x1b8 /* "Bad session state for processing quorum messages" */);
        }
    }
    return session;
}
const durationFromTime = (time) => Math.floor(time / 1000);
//# sourceMappingURL=fluidAnalyzeMessages.js.map