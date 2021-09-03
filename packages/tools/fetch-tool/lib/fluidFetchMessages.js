/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import fs from "fs";
import { assert } from "@fluidframework/common-utils";
import { MessageType, ScopeType, } from "@fluidframework/protocol-definitions";
import { printMessageStats } from "./fluidAnalyzeMessages";
import { connectToWebSocket, dumpMessages, dumpMessageStats, paramActualFormatting, messageTypeFilter, } from "./fluidFetchArgs";
function filenameFromIndex(index) {
    return index === 0 ? "" : index.toString(); // support old tools...
}
let currSeq;
function loadAllSequencedMessages(documentService, dir, files, sequenceNumber = 0) {
    return __asyncGenerator(this, arguments, function* loadAllSequencedMessages_1() {
        let lastSeq = sequenceNumber;
        currSeq = sequenceNumber + 1;
        let seqNumMismatch = false;
        // If we have local save, read ops from there first
        if (files !== undefined) {
            for (let i = 0; i < files.length; i++) {
                const file = filenameFromIndex(i);
                try {
                    console.log(`reading messages${file}.json`);
                    const fileContent = fs.readFileSync(`${dir}/messages${file}.json`, { encoding: "utf-8" });
                    const messages = JSON.parse(fileContent);
                    seqNumMismatch = messages[0].sequenceNumber !== lastSeq + 1;
                    assert(!seqNumMismatch, 0x1b9 /* "Unexpected value for sequence number of first message in file" */);
                    yield yield __await(messages);
                    lastSeq = messages[messages.length - 1].sequenceNumber;
                    currSeq = lastSeq;
                }
                catch (e) {
                    console.error(`Error reading / parsing messages from ${files}`);
                    if (seqNumMismatch) {
                        console.error("There are deleted ops in the document being requested," +
                            " please back up the existing messages.json file and delete it from its directory." +
                            " Then try fetch tool again.");
                    }
                    console.error(e);
                    return yield __await(void 0);
                }
            }
            if (lastSeq !== 0) {
                console.log(`Read ${lastSeq} ops from local cache`);
            }
        }
        if (!documentService) {
            return yield __await(void 0);
        }
        const deltaStorage = yield __await(documentService.connectToDeltaStorage());
        let timeStart = Date.now();
        let requests = 0;
        let opsStorage = 0;
        const teststream = deltaStorage.fetchMessages(lastSeq + 1, lastSeq + 2);
        let statusCode;
        let innerMostErrorCode;
        let response;
        try {
            yield __await(teststream.read());
        }
        catch (error) {
            statusCode = error.getTelemetryProperties().statusCode;
            innerMostErrorCode = error.getTelemetryProperties().innerMostErrorCode;
            if (statusCode !== 410 || innerMostErrorCode !== "fluidDeltaDataNotAvailable") {
                throw error;
            }
            response = JSON.parse(error.getTelemetryProperties().response);
            currSeq = response.error.firstAvailableDelta;
            lastSeq = currSeq - 1;
        }
        const stream = deltaStorage.fetchMessages(lastSeq + 1, // inclusive left
        undefined);
        while (true) {
            const result = yield __await(stream.read());
            if (result.done) {
                break;
            }
            requests++;
            const messages = result.value;
            // Empty buckets should never be returned
            assert(messages.length !== 0, 0x1ba /* "should not return empty buckets" */);
            // console.log(`Loaded ops at ${messages[0].sequenceNumber}`);
            // This parsing of message contents happens in delta manager. But when we analyze messages
            // for message stats, we skip that path. So parsing of json contents needs to happen here.
            for (const message of messages) {
                if (typeof message.contents === "string"
                    && message.contents !== ""
                    && message.type !== MessageType.ClientLeave) {
                    message.contents = JSON.parse(message.contents);
                }
            }
            opsStorage += messages.length;
            lastSeq = messages[messages.length - 1].sequenceNumber;
            yield yield __await(messages);
        }
        // eslint-disable-next-line max-len
        console.log(`\n${Math.floor((Date.now() - timeStart) / 1000)} seconds to retrieve ${opsStorage} ops in ${requests} requests`);
        if (connectToWebSocket) {
            let logMsg = "";
            const client = {
                mode: "write",
                permission: [],
                scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
                details: {
                    capabilities: { interactive: true },
                },
                user: { id: "blah" },
            };
            console.log("Retrieving messages from web socket");
            timeStart = Date.now();
            const deltaStream = yield __await(documentService.connectToDeltaStream(client));
            const initialMessages = deltaStream.initialMessages;
            deltaStream.close();
            console.log(`${Math.floor((Date.now() - timeStart) / 1000)} seconds to connect to web socket`);
            if (initialMessages) {
                const lastSequenceNumber = lastSeq;
                const filtered = initialMessages.filter((a) => a.sequenceNumber > lastSequenceNumber);
                const sorted = filtered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                lastSeq = sorted[sorted.length - 1].sequenceNumber;
                // eslint-disable-next-line max-len
                logMsg = ` (${opsStorage} delta storage, ${initialMessages.length} initial ws messages, ${initialMessages.length - sorted.length} dup)`;
                yield yield __await(sorted);
            }
            console.log(`${lastSeq} total messages${logMsg}`);
        }
    });
}
function saveOps(gen, // AsyncGenerator<ISequencedDocumentMessage[]>,
dir, files) {
    return __asyncGenerator(this, arguments, function* saveOps_1() {
        // Split into 100K ops
        const chunk = 100 * 1000;
        // Figure out first file we want to write to
        let index = 0;
        if (files.length !== 0) {
            index = (files.length - 1);
        }
        let sequencedMessages = [];
        while (true) {
            const result = yield __await(gen.next());
            let curr = index * chunk + currSeq;
            if (!result.done) {
                let messages = result.value;
                yield yield __await(messages);
                if (messages[messages.length - 1].sequenceNumber < curr) {
                    // Nothing interesting.
                    continue;
                }
                if (messages[0].sequenceNumber < curr) {
                    messages = messages.filter((msg) => msg.sequenceNumber >= curr);
                }
                sequencedMessages = sequencedMessages.concat(messages);
                assert(sequencedMessages[0].sequenceNumber === curr, 0x1bb /* "Unexpected sequence number on first of messages to save" */);
                assert(sequencedMessages[sequencedMessages.length - 1].sequenceNumber
                    === curr + sequencedMessages.length - 1, 0x1bc /* "Unexpected sequence number on last of messages to save" */);
            }
            // Time to write it out?
            while (sequencedMessages.length >= chunk || (result.done && sequencedMessages.length !== 0)) {
                const name = filenameFromIndex(index);
                const write = sequencedMessages.splice(0, chunk);
                console.log(`writing messages${name}.json`);
                fs.writeFileSync(`${dir}/messages${name}.json`, JSON.stringify(write, undefined, paramActualFormatting ? 0 : 2));
                curr += chunk;
                assert(sequencedMessages.length === 0 || sequencedMessages[0].sequenceNumber === curr, 0x1bd /* "Stopped writing at unexpected sequence number" */);
                index++;
            }
            if (result.done) {
                break;
            }
        }
    });
}
export async function fluidFetchMessages(documentService, saveDir) {
    var e_1, _a;
    const messageStats = dumpMessageStats || dumpMessages;
    if (!messageStats && (saveDir === undefined || documentService === undefined)) {
        return;
    }
    const files = !saveDir ?
        undefined :
        fs.readdirSync(saveDir)
            .filter((file) => {
            if (!file.startsWith("messages")) {
                return false;
            }
            return true;
        })
            .sort((a, b) => a.localeCompare(b));
    let generator = loadAllSequencedMessages(documentService, saveDir, files);
    if (saveDir && files !== undefined && documentService) {
        generator = saveOps(generator, saveDir, files);
    }
    if (messageStats) {
        return printMessageStats(generator, dumpMessageStats, dumpMessages, messageTypeFilter);
    }
    else {
        let item;
        try {
            for (var generator_1 = __asyncValues(generator), generator_1_1; generator_1_1 = await generator_1.next(), !generator_1_1.done;) {
                item = generator_1_1.value;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (generator_1_1 && !generator_1_1.done && (_a = generator_1.return)) await _a.call(generator_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
}
//# sourceMappingURL=fluidFetchMessages.js.map