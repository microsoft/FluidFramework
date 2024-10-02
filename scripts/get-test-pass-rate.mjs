// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

// This script is used in the "runAfterAll" stage in our E2E test pipeline. It's used
// to get timeline and metrics data so that the test pass rate can be calculated in a later step.

// The Build ID needed to fetch the desired data.
const BUILD_ID = process.env.BUILD_ID;
// The token need to make the API calls.
const ADO_API_TOKEN = process.env.ADO_API_TOKEN;
// The id of the stage for which to retrieve the test pass rate information
const STAGE_ID = process.env.STAGE_ID;
// The workspace where the new files/folder created in this script will be stored.
const WORK_FOLDER = process.env.WORK_FOLDER;

if (
	BUILD_ID === undefined ||
	STAGE_ID === undefined ||
	ADO_API_TOKEN === undefined ||
	WORK_FOLDER === undefined
) {
	throw new Error(
		"One or more required environment variables are undefined. Please specify 'BUILD_ID', 'STAGE_ID', 'ADO_API_TOKEN', and 'WORK_FOLDER' in order to run this script.",
	);
}
console.log("BUILD_ID:", BUILD_ID);
console.log("STAGE_ID:", STAGE_ID);
console.log("WORK_FOLDER:", WORK_FOLDER);

// Create output folder
import * as fs from "fs";
if (!fs.existsSync(WORK_FOLDER)) {
	fs.mkdirSync(WORK_FOLDER, { recursive: true });
	console.log(`Created folder '${WORK_FOLDER}'.`);
}

// Fetch test results for the specified build + stage and save to a file
console.log(`Fetching data for stage: ${STAGE_ID}`);
const testResultsApiUrl = `https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=${BUILD_ID}&stageName=${STAGE_ID}&api-version=7.1-preview.1`;
const stageResponse = await fetch(testResultsApiUrl, {
	headers: { Authorization: `Basic ${Buffer.from(":" + ADO_API_TOKEN).toString("base64")}` },
});
if (!stageResponse.ok) {
	throw new Error(`Error during API call to get test results. Status: ${response.status}`);
}

const stageData = await stageResponse.json();
fs.writeFileSync(`${WORK_FOLDER}/${STAGE_ID}.json`, JSON.stringify(stageData));
