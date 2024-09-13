// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

// This script is used in the "runAfterAll" stage in our E2E test pipeline. It's used
// to get timeline and metrics data so that the test pass rate can be calculated in a later step.

// The Build ID needed to fetch the desired data.
const BUILD_ID = process.env.BUILD_ID;
// The token need to make the API calls.
const ADO_API_TOKEN = process.env.ADO_API_TOKEN;

// The workspace where the new files/folder created in this script will be stored.
const BASE_OUTPUT_FOLDER = process.env.BASE_OUTPUT_FOLDER;
if (
	BUILD_ID === undefined ||
	ADO_API_TOKEN === undefined ||
	BASE_OUTPUT_FOLDER === undefined
) {
	throw new Error(
		"One or more required environment variables are undefined. Please specify 'BUILD_ID', 'ADO_API_TOKEN', and 'BASE_OUTPUT_FOLDER' in order to run this script.",
	);
}
console.log("BUILD_ID:", BUILD_ID);
console.log("BASE_OUTPUT_FOLDER:", BASE_OUTPUT_FOLDER);

// Create output folder - Note: This requires Node.js fs module
import * as fs from "fs";
if (!fs.existsSync(`${BASE_OUTPUT_FOLDER}/stageFiles`)) {
	fs.mkdirSync(`${BASE_OUTPUT_FOLDER}/stageFiles`, { recursive: true });
	console.log("Folder created");
}
const apiUrl = `https://dev.azure.com/fluidframework/internal/_apis/build/builds/${BUILD_ID}/timeline?api-version=7.1-preview.2`;
// Fetch data from Timeline API
const response = await fetch(apiUrl, {
	headers: {
		Authorization: `Basic ${Buffer.from(":" + ADO_API_TOKEN).toString("base64")}`,
	},
});
console.log(response);
if (!response.ok) {
	throw new Error(`Error during API call to get build timeline. Status: ${response.status}`);
}
const data = await response.json();
console.log("Saving stage names");
// Extract and save all stage names
const stages = data.records
	.filter((record) => record.type === "Stage")
	.map((record) => record.identifier);
for (const stage of stages) {
	if (stage === "runAfterAll") {
		continue;
	}
	console.log(`Fetching data for stage: ${stage}`);
	// Fetch test rate data for each stage.
	const stageApiUrl = `https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=${BUILD_ID}&stageName=${stage}&api-version=7.1-preview.1`;
	const stageResponse = await fetch(stageApiUrl, {
		headers: {
			Authorization: `Basic ${Buffer.from(":" + ADO_API_TOKEN).toString("base64")}`,
		},
	});
	if (!stageResponse.ok) {
		throw new Error(`Error during API call to get build metrics. Status: ${response.status}`);
	}

	const stageData = await stageResponse.json();
	// Save the API data to a JSON file.
	fs.writeFileSync(
		`${BASE_OUTPUT_FOLDER}/stageFiles/${stage}.json`,
		JSON.stringify(stageData),
	);
}
