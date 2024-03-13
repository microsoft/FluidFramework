/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This tool cleans up a message.json file downloaded through fluid-fetch to remove
 * user content and user identifying information.  Enough information can be retained
 * to allow loading through Fluid Preview, or everything can be scrubbed so that only
 * replay-tool can read the result.  Anonymous identifying information such as client
 * IDs are always retained.  Object keys are NOT scrubbed, including those that are
 * nested within values (only leaf values are scrubbed).
 *
 * Note: While user content/information is scrubbed, it should not be assumed to be
 * fully anonymized because certain meta-information (such as word lengths and
 * consistent replacement) are preserved.
 *
 * Messages must match known structures when scrubbing for Fluid Preview.
 */

import fs from "fs";
import process from "process";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { Sanitizer } from "./sanitizer.js";

function printUsage() {
	console.log("Usage:");
	console.log("   node sanitize [--full | --noBail] <input>");
	console.log("Where");
	console.log("  [--full] - scrub fully (result cannot be loaded in Fluid Preview)");
	console.log(
		"  [--noBail] - don't bail out when encountering an unknown message format (it won't be scrubbed",
	);
	console.log("  <input> - file path to message.json - file downloaded by FluidFetch tool");
	console.log("Note: <input> is sanitized in place");
	process.exit(-1);
}

function Sanitize(msgPath: string, fullScrub: boolean, noBail: boolean) {
	const input = fs.readFileSync(msgPath, { encoding: "utf-8" });
	const messages = JSON.parse(input) as ISequencedDocumentMessage[];

	const sanitizer = new Sanitizer(messages, fullScrub, noBail, true);
	const cleanMessages = sanitizer.sanitize();

	fs.writeFileSync(msgPath, JSON.stringify(cleanMessages, undefined, 2));

	console.log("Done.");
}

function main() {
	if (process.argv.length === 3) {
		return Sanitize(process.argv[2], false, false);
	}
	if (process.argv.length === 4) {
		if (process.argv[2] === "--full") {
			return Sanitize(process.argv[3], true, false);
		}
		if (process.argv[2] === "--noBail") {
			return Sanitize(process.argv[3], false, true);
		}
	}
	printUsage();
}

main();
