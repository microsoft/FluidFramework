// This script is used in the "runAfterAll" stage in our E2E test pipeline. It's used 
// to get timeline and metrics data so that the test pass rate can be calculated in a later step.

const BUILD_ID = process.env.BUILD_ID;
const ADO_API_TOKEN = process.env.ADO_API_TOKEN;
const TEST_WORKSPACE = process.env.TEST_WORKSPACE;
const BUILD_SOURCES_DIRECTORY = process.env.BUILD_SOURCES_DIRECTORY;

// Create output folder - Note: This requires Node.js fs module
const fs = require('fs');

// Fetch data from API
const apiUrl = `https://dev.azure.com/fluidframework/internal/_apis/build/builds/${BUILD_ID}/timeline?api-version=7.1-preview.2`;
let stages = [];
fetch(apiUrl, {
    headers: {
        'Authorization': `Basic ${ADO_API_TOKEN}`
    }
})
.then(response => response.json())
.then(data => {
    stages = data.records.filter(record => record.type === "Stage").map(record => record.identifier);
    console.log(stages);
}).then(()=>{
        stages.forEach(stage => {
            if(stage =="runAfterAll") return;
            console.log(`Fetching data for stage: ${stage}`);
            // Fetch test rate data for each stage.
            const stageApiUrl = `https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=${BUILD_ID}&stageName=${stage}&api-version=7.1-preview.1`;
            fetch(stageApiUrl, {
                headers: {
                    'Authorization': `Basic ${ADO_API_TOKEN}`
                }
            })
            .then(response => response.json()
            )
            .then(stageData => {
                console.log(stageData);
                fs.writeFileSync(`${TEST_WORKSPACE}/stageFiles/${stage}.json`, JSON.stringify(stageData));
            });
        })
    }
)
.catch(error => console.error('Error:', error));

if (!fs.existsSync(`${TEST_WORKSPACE}/stageFiles`)) {
    fs.mkdirSync(`${TEST_WORKSPACE}/stageFiles`, { recursive: true });
}