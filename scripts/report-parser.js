/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Parsing script which finds all test reports ending with "junit-report.json"
 * in a given directory and prints failed tests into the console
 */

var fs = require("fs");
var util = require("util");
var path = require("path");

var directory = process.argv.slice(2)[0];

let files = [];

const getJunitTestReports = (directory) => {
	const filesInDirectory = fs.readdirSync(directory);
	for (const file of filesInDirectory) {
		const absolute = path.join(directory, file);
		if (fs.statSync(absolute).isDirectory()) {
			getJunitTestReports(absolute);
		} else if (/junit-report.json$/.test(absolute)) {
			files.push(absolute);
		}
	}
};

getJunitTestReports(directory);

let output = [];
for (const filename of files) {
	const jsonData = fs.readFileSync(filename, "utf8");

	const failedTests = JSON.parse(jsonData).failures;

	if (failedTests.length > 0) output.push(failedTests);
}

console.log(util.inspect(output, false, null, true));
