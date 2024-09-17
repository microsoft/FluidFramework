mkdir -p ./testRuns
rm ./testRuns/* > /dev/null

STATUS=0
COUNTER=0
while [ $STATUS -eq 0 ]
do
	# Clean up log files so we don't keep increasing the used space. Ignore if it fails (if there are no files).
	# rm ./testRuns/* > /dev/null
	#rm -rf /var/tmp/tinylicious/ > /dev/null

	# Clean up the installed old compat versions
	# rm -rf /home/alex/code/FluidFramework/packages/test/test-version-utils/node_modules/.legacy/* > /dev/null

	COUNTER=$((COUNTER+1))
	export TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
	OUTPUT_FILE=$TIMESTAMP.log
	echo "Running tests ($COUNTER)...output file: ./testRuns/$OUTPUT_FILE";
	echo "Running tests ($COUNTER)" > ./testRuns/$OUTPUT_FILE
	# npm run test:realsvc:tinylicious > ./testRuns/$OUTPUT_FILE 2>&1
	# export FLUID_TEST_LOGGER_PKG_PATH='/home/alex/code/FluidFramework/packages/test/test-end-to-end-tests/node_modules/@ff-internal/aria-logger'; \
	export logger__colorize="false"; \
	export logger__morganFormat=tiny; \
	export FLUID_TEST_VERBOSE=1; \
	#export DEBUG=wait:*,fluid:telemetry:fluid:telemetry:*; \
	# Running the :full version causes things to hang because something is trying to load mocha-test-setup by folder
	# and seemingly can't because it's ESM so it needs the whole path to a js file. Not sure why that causes mocha to
	# hang after swallowing the exceptions for that. But I managed to run it once, not sure why it worked that time.
	npm run test:realsvc:local:report:full >> ./testRuns/$OUTPUT_FILE 2>&1
	STATUS=$?
done

echo "Tests failed with status $STATUS"
