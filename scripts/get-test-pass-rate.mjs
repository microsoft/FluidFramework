// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

// This script is used in the "runAfterAll" stage in our E2E test pipeline. It's used
// to get timeline and metrics data so that the test pass rate can be calculated in a later step.

// The Build ID needed to fetch the desired data.
const BUILD_ID = process.env.BUILD_ID;
// The token need to make the API calls.
const ADO_API_TOKEN = process.env.ADO_API_TOKEN;

// The workspace where the new files/folder created in this script will be stored.
const TEST_WORKSPACE = process.env.TEST_WORKSPACE;
console.log("BUILD_ID:", BUILD_ID);
console.log("TEST_WORKSPACE:", TEST_WORKSPACE);

// Create output folder - Note: This requires Node.js fs module
import * as fs from "fs";
if (!fs.existsSync(`${TEST_WORKSPACE}/stageFiles`)) {
        fs.mkdirSync(`${TEST_WORKSPACE}/stageFiles`, { recursive: true });
        console.log("Folder created");
}
const apiUrl = `https://dev.azure.com/fluidframework/internal/_apis/build/builds/${BUILD_ID}/timeline?api-version=7.1-preview.2`;

async function fetchData() {
        try {
                // Fetch data from Timeline API
                const response = await fetch(apiUrl, {
                        headers: {
                                Authorization: `Basic ${ADO_API_TOKEN}`,
                        },
                });
                console.log(response);
                if (!response.ok) {
                        throw new Error(`HTTP error, status: ${response.status}`);
                }
                const data = await response.json();
                console.log("Saving stage names");
                // Extract and save all stage names
                const stages = data.records
                        .filter((record) => record.type === "Stage")
                        .map((record) => record.identifier);
                for (const stage of stages) {
                        if (stage == "runAfterAll") continue;
                        console.log(`Fetching data for stage: ${stage}`);
                        // Fetch test rate data for each stage.
                        const stageApiUrl = `https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=${BUILD_ID}&stageName=${stage}&api-version=7.1-preview.1`;
                        const stageResponse = await fetch(stageApiUrl, {
                                headers: {
                                        Authorization: `Basic ${ADO_API_TOKEN}`,
                                },
                        });

                        const stageData = await stageResponse.json();
                        // Save the API data to a JSON file.
                        fs.writeFileSync(
                                `${TEST_WORKSPACE}/stageFiles/${stage}.json`,
                                JSON.stringify(stageData),
                        );
                }
        } catch (error) {
                console.error("Error:", error);
                process.exit(1);
        }
}
fetchData();