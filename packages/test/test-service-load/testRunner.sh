#!/bin/bash

# Wait for test trigger (until file exists.)
FILE=/fluid-config-store/$FLUID_TEST_UID/${FLUID_TEST_UID}_Trigger.json
while [ ! -f "$FILE" ]
do
	echo "$FILE does not exist."
	sleep 5s
done
sleep 2s
cp /fluid-config-store/$FLUID_TEST_UID/${HOSTNAME}_PodConfig.json ./testUserConfig.json

# Wait for test rampup time to avoid all instances starting at once.
rampupTimeInSeconds=`jq .rampup /app/packages/test/test-service-load/testUserConfig.json`
echo "Sleeping for: $rampupTimeInSeconds";
sleep $rampupTimeInSeconds

# Credentials for orchestrator
credentials=`jq -c '.credentials|to_entries|first as $x | { ($x.key): ($x.value) }' ./testUserConfig.json`
export login__odsp__test__accounts=$credentials

docId=`jq -c .docId ./testUserConfig.json | xargs`
node ./dist/nodeStressTest.js -p $TEST_PROFILE -c ./testUserConfig.json -id $docId -m > loadTestRun.log

echo "Test complete. Exiting."

sleep 60s;
