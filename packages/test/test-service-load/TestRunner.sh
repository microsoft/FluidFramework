#!/bin/bash

FILE=/fluid-config-store/$FLUID_TEST_UID/${FLUID_TEST_UID}_Trigger.json
while [ ! -f "$FILE" ]
do
	echo "$FILE does not exist."
	sleep 5s
done
sleep 2s
cp /fluid-config-store/$FLUID_TEST_UID/${HOSTNAME}_PodConfig.json /app/packages/test/test-service-load/PodConfig.json
jq .credentials /app/packages/test/test-service-load/PodConfig.json > /app/packages/test/test-service-load/testUserConfig.json
rampupTimeInSeconds=`jq .rampup /app/packages/test/test-service-load/PodConfig.json`
echo "Sleeping for: $rampupTimeInSeconds";
sleep $rampupTimeInSeconds
FLUID_TEST_UID=$FLUID_TEST_UID node ./dist/nodeStressTestMultiUser.js -p $TEST_PROFILE > testscenario.logs 2>&1 &
while true;
do
	echo "Test is running on pod: $HOSTNAME";
	sleep 3600s;
done
