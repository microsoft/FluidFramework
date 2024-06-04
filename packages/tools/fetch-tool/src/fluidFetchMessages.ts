/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import { assert } from "@fluidframework/core-utils/internal";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	MessageType,
	ScopeType,
} from "@fluidframework/driver-definitions/internal";

import { printMessageStats } from "./fluidAnalyzeMessages.js";
import {
	connectToWebSocket,
	dumpMessageStats,
	dumpMessages,
	messageTypeFilter,
	overWrite,
	paramActualFormatting,
} from "./fluidFetchArgs.js";

function filenameFromIndex(index: number): string {
	return index === 0 ? "" : index.toString(); // support old tools...
}

let firstAvailableDelta = 1;
async function* loadAllSequencedMessages(
	documentService?: IDocumentService,
	dir?: string,
	files?: string[],
) {
	let lastSeq = 0;
	// flag for mismatch between last sequence number read and new one to be read
	let seqNumMismatch = false;

	// If we have local save, read ops from there first
	if (files !== undefined) {
		for (let i = 0; i < files.length; i++) {
			const file = filenameFromIndex(i);
			try {
				console.log(`reading messages${file}.json`);
				const fileContent = fs.readFileSync(`${dir}/messages${file}.json`, {
					encoding: "utf-8",
				});
				const messages: ISequencedDocumentMessage[] = JSON.parse(fileContent);
				// check if there is mismatch
				seqNumMismatch = messages[0].sequenceNumber !== lastSeq + 1;
				assert(
					!seqNumMismatch,
					0x1b9 /* "Unexpected value for sequence number of first message in file" */,
				);
				lastSeq = messages[messages.length - 1].sequenceNumber;
				yield messages;
			} catch (e) {
				if (seqNumMismatch) {
					if (overWrite) {
						// with overWrite option on, we will delete all exisintg message.json files
						for (let index = 0; index < files.length; index++) {
							const name = filenameFromIndex(index);
							fs.unlinkSync(`${dir}/messages${name}.json`);
						}
						break;
					}
					// prompt user to back up and delete existing files
					console.error(
						"There are deleted ops in the document being requested," +
							" please back up the existing messages.json file and delete it from its directory." +
							" Then try fetch tool again.",
					);
					console.error(e);
					return;
				} else {
					console.error(`Error reading / parsing messages from ${files}`);
					console.error(e);
					return;
				}
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

	// reading only 1 op to test if there is mismatch
	const teststream = deltaStorage.fetchMessages(lastSeq + 1, lastSeq + 2);

	let statusCode;
	let innerMostErrorCode;
	let response;

	try {
		await teststream.read();
	} catch (error: any) {
		statusCode = error.getTelemetryProperties().statusCode;
		innerMostErrorCode = error.getTelemetryProperties().innerMostErrorCode;
		// if there is gap between ops, catch the error and check it is the error we need
		if (statusCode !== 410 || innerMostErrorCode !== "fluidDeltaDataNotAvailable") {
			throw error;
		}
		// get firstAvailableDelta from the error response, and set current sequence number to that
		response = JSON.parse(error.getTelemetryProperties().response);
		firstAvailableDelta = response.error.firstAvailableDelta;
		lastSeq = firstAvailableDelta - 1;
	}

	// continue reading rest of the ops
	const stream = deltaStorage.fetchMessages(
		lastSeq + 1, // inclusive left
		undefined, // to
	);

	while (true) {
		const result = await stream.read();
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
			if (
				typeof message.contents === "string" &&
				message.contents !== "" &&
				message.type !== MessageType.ClientLeave
			) {
				message.contents = JSON.parse(message.contents);
			}
		}

		opsStorage += messages.length;
		lastSeq = messages[messages.length - 1].sequenceNumber;
		yield messages;
	}

	console.log(
		`\n${Math.floor(
			(Date.now() - timeStart) / 1000,
		)} seconds to retrieve ${opsStorage} ops in ${requests} requests`,
	);

	if (connectToWebSocket) {
		let logMsg = "";
		const client: IClient = {
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
		const deltaStream = await documentService.connectToDeltaStream(client);
		const initialMessages = deltaStream.initialMessages;
		deltaStream.dispose();
		console.log(
			`${Math.floor((Date.now() - timeStart) / 1000)} seconds to connect to web socket`,
		);

		if (initialMessages !== undefined) {
			const lastSequenceNumber = lastSeq;
			const filtered = initialMessages.filter((a) => a.sequenceNumber > lastSequenceNumber);
			const sorted = filtered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
			lastSeq = sorted[sorted.length - 1].sequenceNumber;
			logMsg = ` (${opsStorage} delta storage, ${
				initialMessages.length
			} initial ws messages, ${initialMessages.length - sorted.length} dup)`;
			yield sorted;
		}
		console.log(`${lastSeq} total messages${logMsg}`);
	}
}

async function* saveOps(
	gen, // AsyncGenerator<ISequencedDocumentMessage[]>,
	dir: string,
	files: string[],
) {
	// Split into 100K ops
	const chunk = 100 * 1000;

	let sequencedMessages: ISequencedDocumentMessage[] = [];

	// Figure out first file we want to write to
	let index = 0;
	let curr: number = 1;
	if (files.length !== 0) {
		index = files.length - 1;
		const name = filenameFromIndex(index);
		const fileContent = fs.readFileSync(`${dir}/messages${name}.json`, { encoding: "utf-8" });
		const messages: ISequencedDocumentMessage[] = JSON.parse(fileContent);
		curr = messages[0].sequenceNumber;
	}

	while (true) {
		const result: IteratorResult<ISequencedDocumentMessage[]> = await gen.next();
		if (files.length === 0) {
			curr = firstAvailableDelta;
		}
		if (result.done !== true) {
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
			assert(
				sequencedMessages[0].sequenceNumber === curr,
				0x1bb /* "Unexpected sequence number on first of messages to save" */,
			);
			assert(
				sequencedMessages[sequencedMessages.length - 1].sequenceNumber ===
					curr + sequencedMessages.length - 1,
				0x1bc /* "Unexpected sequence number on last of messages to save" */,
			);
		}

		// Time to write it out?
		while (
			sequencedMessages.length >= chunk ||
			(result.done === true && sequencedMessages.length !== 0)
		) {
			const name = filenameFromIndex(index);
			const write = sequencedMessages.splice(0, chunk);
			console.log(`writing messages${name}.json`);
			fs.writeFileSync(
				`${dir}/messages${name}.json`,
				JSON.stringify(write, undefined, paramActualFormatting ? 0 : 2),
			);
			// increment curr by chunk
			curr += chunk;
			assert(
				sequencedMessages.length === 0 || sequencedMessages[0].sequenceNumber === curr,
				0x1bd /* "Stopped writing at unexpected sequence number" */,
			);
			index++;
		}

		if (result.done === true) {
			break;
		}
	}
}

export async function fluidFetchMessages(documentService?: IDocumentService, saveDir?: string) {
	const messageStats = dumpMessageStats || dumpMessages;
	if (!messageStats && (saveDir === undefined || documentService === undefined)) {
		return;
	}

	const files =
		saveDir === undefined
			? undefined
			: fs
					.readdirSync(saveDir)
					.filter((file) => {
						if (!file.startsWith("messages")) {
							return false;
						}
						return true;
					})
					.sort((a, b) => a.localeCompare(b));

	let generator = loadAllSequencedMessages(documentService, saveDir, files);

	if (saveDir !== undefined && files !== undefined && documentService) {
		generator = saveOps(generator, saveDir, files);
	}

	if (messageStats) {
		return printMessageStats(generator, dumpMessageStats, dumpMessages, messageTypeFilter);
	} else {
		let item;
		for await (item of generator) {
		}
	}
}
