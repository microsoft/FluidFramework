/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

export let dumpMessages = false;
export let dumpMessageStats = false;
export let dumpSnapshotStats = false;
export let dumpSnapshotTrees = false;
export let dumpSnapshotVersions = false;
export let overWrite = false;
export let paramSnapshotVersionIndex: number | undefined;
export let paramNumSnapshotVersions = 10;
export let paramActualFormatting = false;

let paramForceTokenReauth = false;

// Only return true once, to reauth on first call.
export function getForceTokenReauth() {
	const result = paramForceTokenReauth;
	paramForceTokenReauth = false;
	return result;
}

export let paramSaveDir: string | undefined;
export const messageTypeFilter = new Set<string>();

export let paramURL: string | undefined;
export let paramJWT: string;

export let connectToWebSocket = false;

export let localDataOnly = false;

const optionsArray = [
	["--dump:rawmessage", "dump all messages"],
	["--dump:snapshotVersion", "dump a list of snapshot version"],
	["--dump:snapshotTree", "dump the snapshot trees"],
	["--forceTokenReauth", "Force reauthorize token (SPO only)"],
	["--stat:message", "show message type, channel type, data type statistics"],
	["--stat:snapshot", "show a table of snapshot path and blob size"],
	["--stat", "Show both messages & snapshot stats"],
	["--filter:messageType <type>", "filter message by <type>"],
	["--jwt <token>", "token to be used for routerlicious URLs"],
	["--numSnapshotVersions <number>", "Number of versions to load (default:10)"],
	[
		"--actualPayload",
		"Do not format json payloads nicely, preserve actual bytes / formatting in storage",
	],
	["--saveDir <outdir>", "Save data of the snapshots and messages"],
	["--snapshotVersionIndex <number>", "Index of the version to dump"],
	["--websocket", "Connect to web socket to download initial messages"],
	["--local", "Do not connect to storage, use earlier downloaded data. Requires --saveDir."],
];

function printUsage() {
	console.log("Usage: fluid-fetch [options] URL");
	console.log("URL: <ODSP URL>|<Routerlicious URL>");
	console.log("Options:");
	for (const i of optionsArray) {
		console.log(`  ${i[0].padEnd(32)}: ${i[1]}`);
	}
}

// Can be used in unit test to pass in customized argument values
// More argument options can be added when needed
export function setArguments(values: {
	saveDir: string;
	paramURL: string;
	dumpMessages?: boolean;
	dumpMessageStats?: boolean;
	dumpSnapshotStats?: boolean;
	dumpSnapshotTrees?: boolean;
	overWrite?: boolean;
}) {
	paramSaveDir = values.saveDir;
	paramURL = values.paramURL;
	dumpMessages = values.dumpMessages ?? dumpMessages;
	dumpMessageStats = values.dumpMessageStats ?? dumpMessageStats;
	dumpSnapshotStats = values.dumpSnapshotStats ?? dumpSnapshotStats;
	dumpSnapshotTrees = values.dumpSnapshotTrees ?? dumpSnapshotTrees;
	overWrite = values.overWrite ?? overWrite;
}

export function parseArguments() {
	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		switch (arg) {
			case "--dump:rawmessage":
				dumpMessages = true;
				break;
			case "--dump:rawmessage:overwrite":
				dumpMessages = true;
				overWrite = true;
				break;
			case "--stat:message":
				dumpMessageStats = true;
				break;
			case "--stat":
				dumpMessageStats = true;
				dumpSnapshotStats = true;
				break;
			case "--filter:messageType":
				messageTypeFilter.add(parseStrArg(i++, "type name for messageType filter"));
				break;
			case "--stat:snapshot":
				dumpSnapshotStats = true;
				break;
			case "--dump:snapshotVersion":
				dumpSnapshotVersions = true;
				break;
			case "--dump:snapshotTree":
				dumpSnapshotTrees = true;
				break;
			case "--help":
				printUsage();
				process.exit(0);
			case "--jwt":
				paramJWT = parseStrArg(i++, "jwt token");
				break;
			case "--forceTokenReauth":
				paramForceTokenReauth = true;
				break;
			case "--snapshotVersionIndex":
				paramSnapshotVersionIndex = parseIntArg(i++, "version index", true);
				break;
			case "--numSnapshotVersions":
				paramNumSnapshotVersions = parseIntArg(i++, "number of versions", false);
				break;
			case "--actualPayload":
				paramActualFormatting = true;
				break;
			case "--saveDir":
				paramSaveDir = parseStrArg(i++, "save data path");
				break;
			case "--websocket":
				connectToWebSocket = true;
				break;
			case "--local":
				localDataOnly = true;
				break;
			default:
				try {
					const url = new URL(arg);
					if (url.protocol === "https:") {
						paramURL = arg;
						break;
					}
					if (url.protocol === "http:" && url.hostname === "localhost") {
						paramURL = arg;
						break;
					}
				} catch (e) {
					console.error(e);
				}

				console.error(`ERROR: Invalid argument ${arg}`);
				printUsage();
				process.exit(-1);
				break;
		}
	}
	checkArgs();
}

function parseStrArg(i: number, name: string) {
	if (i + 1 >= process.argv.length) {
		console.error(`ERROR: Missing ${name}`);
		printUsage();
		process.exit(-1);
	}
	return process.argv[i + 1];
}
function parseIntArg(i: number, name: string, allowZero: boolean) {
	if (i + 1 >= process.argv.length) {
		console.error(`ERROR: Missing ${name}`);
		printUsage();
		process.exit(-1);
	}
	const numStr = process.argv[i + 1];
	const paramNumber = parseInt(numStr, 10);
	if (isNaN(paramNumber) || (allowZero ? paramNumber < 0 : paramNumber <= 0)) {
		console.error(`ERROR: Invalid ${name} ${numStr}`);
		printUsage();
		process.exit(-1);
	}
	return paramNumber;
}

function checkArgs() {
	if (paramSnapshotVersionIndex !== undefined) {
		paramNumSnapshotVersions = Math.max(
			paramSnapshotVersionIndex + 1,
			paramNumSnapshotVersions,
		);
	}

	if (paramURL === undefined) {
		if (paramSaveDir !== undefined) {
			const file = `${paramSaveDir}/info.json`;
			if (fs.existsSync(file)) {
				const info = JSON.parse(fs.readFileSync(file, { encoding: "utf-8" }));
				paramURL = info.url;
			} else {
				console.log(`Can't find file ${file}`);
			}
		}

		if (paramURL === undefined) {
			console.error("ERROR: Missing URL");
			printUsage();
			process.exit(-1);
		}
	}
}
