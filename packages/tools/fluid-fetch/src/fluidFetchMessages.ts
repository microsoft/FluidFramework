/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
} from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IClient,
    ISequencedDocumentMessage,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { printMessageStats } from "./fluidAnalyzeMessages";
import {
    connectToWebSocket,
    dumpMessages,
    dumpMessageStats,
    messageTypeFilter,
} from "./fluidFetchArgs";

// tslint:disable:non-literal-fs-path

function filenameFromIndex(index: number): string {
    return index === 0 ? "" : index.toString(); // support old tools...
}

async function loadChunk(from: number, to: number, deltaStorage: IDocumentDeltaStorageService) {
    console.log(`Loading ops at ${from}`);
    for (let iter = 0; iter < 3; iter++) {
        try {
            return await deltaStorage.get(from, to);
        } catch (error) {
            console.error("Hit error while downloading ops. Retrying");
            console.error(error);
        }
    }
    throw new Error("Giving up after 3 attempts to download chunk.");
}

async function* loadAllSequencedMessages(
    documentService?: IDocumentService,
    dir?: string,
    files?: string[]) {
    const batch = 2000;
    let lastSeq = 0;

    // If we have local save, read ops from there first
    if (files !== undefined) {
        for (let i = 0; i < files.length; i++) {
            const file = filenameFromIndex(i);
            try {
                console.log(`reading messages${file}.json`);
                const fileContent = fs.readFileSync(`${dir}/messages${file}.json`, { encoding: "utf-8" });
                const messages: ISequencedDocumentMessage[] = JSON.parse(fileContent);
                assert(messages[0].sequenceNumber === lastSeq + 1);
                yield messages;
                lastSeq = messages[messages.length - 1].sequenceNumber;
            } catch (e) {
                console.error(`Error reading / parsing messages from ${file}`);
                console.error(e);
                return;
            }
        }
        if (lastSeq !== 0) {
            console.log(`Read ${lastSeq} ops from local cache`);
        }
    }

    if (!documentService) {
        return;
    }

    const deltaStorage = await documentService.connectToDeltaStorage();

    let timeStart = Date.now();
    let requests = 0;
    let opsStorage = 0;
    while (true) {
        requests++;
        const messages = await loadChunk(lastSeq, lastSeq + batch, deltaStorage);
        if (messages.length === 0) {
            break;
        }
        yield messages;
        opsStorage += messages.length;
        lastSeq = messages[messages.length - 1].sequenceNumber;
    }

    if (requests > 0) {
        // eslint-disable-next-line max-len
        console.log(`\n${Math.floor((Date.now() - timeStart) / 1000)} seconds to retrieve ${opsStorage} ops in ${requests} requests`);
    }

    if (connectToWebSocket) {
        let logMsg = "";
        const client: IClient = {
            permission: [],
            scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
            details: {
                capabilities: { interactive: true },
            },
            user: { id: "blah" },
        };
        console.log("Retrieving messages from web socket");
        timeStart = Date.now();
        const mode: ConnectionMode = "write";
        const deltaStream = await documentService.connectToDeltaStream(client, mode);
        const initialMessages = deltaStream.initialMessages;
        deltaStream.disconnect();
        console.log(`${Math.floor((Date.now() - timeStart) / 1000)} seconds to connect to web socket`);

        if (initialMessages) {
            const lastSequenceNumber = lastSeq;
            const filtered = initialMessages.filter((a) => a.sequenceNumber > lastSequenceNumber);
            const sorted = filtered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
            lastSeq = sorted[sorted.length - 1].sequenceNumber;
            // eslint-disable-next-line max-len
            logMsg = ` (${opsStorage} delta storage, ${initialMessages.length} initial ws messages, ${initialMessages.length - sorted.length} dup)`;
            yield sorted;
        }
        console.log(`${lastSeq} total messages${logMsg}`);
    }
}

async function* saveOps(
    gen, // AsyncGenerator<ISequencedDocumentMessage[]>,
    dir: string,
    files: string[]) {
    // Split into 100K ops
    const chunk = 100 * 1000;

    // Figure out first file we want to write to
    let index = 0;
    if (files.length !== 0) {
        index = (files.length - 1);
    }
    let curr = index * chunk + 1;

    let sequencedMessages: ISequencedDocumentMessage[] = [];
    while (true) {
        const result: IteratorResult<ISequencedDocumentMessage[]> = await gen.next();
        if (!result.done) {
            let messages = result.value;
            yield messages;
            if (messages[messages.length - 1].sequenceNumber < curr) {
                // Nothing interesting.
                continue;
            }
            if (messages[0].sequenceNumber < curr) {
                messages = messages.filter((msg) => msg.sequenceNumber >= curr);
            }
            sequencedMessages = sequencedMessages.concat(messages);
            assert(sequencedMessages[0].sequenceNumber === curr);
            assert(sequencedMessages[sequencedMessages.length - 1].sequenceNumber
                === curr + sequencedMessages.length - 1);
        }

        // Time to write it out?
        while (sequencedMessages.length >= chunk || (result.done && sequencedMessages.length !== 0)) {
            const name = filenameFromIndex(index);
            const write = sequencedMessages.splice(0, chunk);
            console.log(`writing messages${name}.json`);
            fs.writeFileSync(`${dir}/messages${name}.json`, JSON.stringify(write, undefined, 2));
            curr += chunk;
            assert(sequencedMessages.length === 0 || sequencedMessages[0].sequenceNumber === curr);
            index++;
        }

        if (result.done) {
            break;
        }
    }
}

export async function fluidFetchMessages(documentService?: IDocumentService, saveDir?: string) {
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
        return printMessageStats(
            generator,
            dumpMessageStats,
            dumpMessages,
            messageTypeFilter);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let item;
        for await (item of generator) { }
    }

}
