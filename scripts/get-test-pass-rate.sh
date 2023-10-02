# This script is used in the "runAfterAll" stage in our E2E test pipeline. It's used 
# to get timeline and metrics data so that the test pass rate can be calculated in a later step.

echo BUILD_ID=$BUILD_ID
echo ADO_API_TOKEN=$ADO_API_TOKEN
echo TEST_WORKSPACE=$TEST_WORKSPACE
echo BUILD_SOURCES_DIRECTORY=$BUILD_SOURCES_DIRECTORY

echo "Creating output folder"
mkdir -p "$TEST_WORKSPACE/passRateOutput"
sudo apt-get install -y jq
echo "Executing curl command ..."
echo "curl -u ':<REDACTED>' 'https://dev.azure.com/fluidframework/internal/_apis/build/builds/$BUILD_ID/timeline'"
response=$(curl -s -u ":$ADO_API_TOKEN" "https://dev.azure.com/fluidframework/internal/_apis/build/builds/$BUILD_ID/timeline?api-version=6.0-preview.1" > "$TEST_WORKSPACE/passRateOutput/output.json")
echo "$response"
pwd;
ls -laR "$TEST_WORKSPACE/passRateOutput/output.json"
stages=($(jq -r '.records[] | select(.type == "Stage") | .identifier' "$TEST_WORKSPACE/passRateOutput/output.json"))

mkdir -p "$TEST_WORKSPACE/passRateOutput/stageFiles"
for stage in "${stages[@]}"; do
    echo "Fetching data for stage: $stage"
    curl -s -u ":$ADO_API_TOKEN" "https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=$BUILD_ID&stageName=$stage&api-version=7.1-preview.1" > "$TEST_WORKSPACE/passRateOutput/stageFiles/${stage}.json"
done
node --require @ff-internal/aria-logger bin/run --handlerModule "$BUILD_SOURCESDIRECTORY/tools/telemetry-generator/dist/handlers/testPassRate.js" --dir "$TEST_WORKSPACE/passRateOutput/stageFiles"
pwd
ls -laR "$TEST_WORKSPACE/passRateOutput/stageFiles"