/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Parsing script which finds all test reports ending with "junit-report.json"
 * in a given directory and prints ADO pipeline errors into the console
 */

var fs = require("fs");
var path = require("path");

var directory = process.argv.slice(2)[0];

const getJunitTestReports = (directory) => {
	if (!fs.existsSync(directory)) {
		throw new Error(`Directory '${directory}' does not exist`);
	}
	const files = [];
	const filesInDirectory = fs.readdirSync(directory);
	for (const file of filesInDirectory) {
		const absolute = path.join(directory, file);
		if (fs.statSync(absolute).isDirectory()) {
			getJunitTestReports(absolute);
		} else if (/junit-report.json$/.test(absolute)) {
			files.push(absolute);
		}
	}
	return files;
};

const files = getJunitTestReports(directory);

for (const filename of files) {
	const content = fs.readFileSync(filename, "utf8");
	const json = JSON.parse(content);
	const failedTests = json.failures;

	if (failedTests.length > 0) {
		console.log(
			failedTests
				.map((e) => `##vso[task.logissue type=error;sourcepath=${e.file}]${e.fullTitle}`)
				.join("\n"),
		);
	}
}
