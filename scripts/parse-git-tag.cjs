/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used in CI to parse a git tag into the release group (rg) and version it represents.
 */

const process = require("process");

const prefix = "refs/tags/";

function parseTag(input) {
	const tag = input.startsWith(prefix) ? input.slice(prefix.length) : input;
	const [rg, version] = tag.split("_v");

	return [rg, version, tag];
}

const args = process.argv.slice(2);
const [tagString, prop] = args;

const [rg, version, tag] = parseTag(tagString);

if (prop === "rg") {
	console.log(rg);
} else if (prop === "tag") {
	console.log(tag);
} else {
	console.log(version);
}
