#!/bin/bash

FILE=/fluid-config-store/$FLUID_TEST_UID/${FLUID_TEST_UID}_Trigger.json
while [ ! -f "$FILE" ]
do
	echo "$FILE does not exist."
	sleep 5s
done
sleep 2s
cp /fluid-config-store/$FLUID_TEST_UID/${HOSTNAME}_PodConfig.json ./testUserConfig.json

rampupTimeInSeconds=`jq .rampup /app/packages/test/test-service-load/testUserConfig.json`
echo "Sleeping for: $rampupTimeInSeconds";
sleep $rampupTimeInSeconds

credentials=`jq -c '.credentials|to_entries|first as $x | { ($x.key): ($x.value) }' ./testUserConfig.json`
export login__odsp__test__accounts=$credentials
node ./dist/nodeStressTest.js -p $TEST_PROFILE -c ./testUserConfig.json -m > testscenario.logs 2>&1

echo "Test complete just keeping pod alive."
while true;
do
    sleep 3600s;
done
