mkdir -p ./testRuns

FLUID_TEST_LOGGER_PKG_PATH='/home/alex/code/FluidFramework/packages/test/test-end-to-end-tests/node_modules/@ff-internal/aria-logger'

STATUS=0
COUNTER=0
while [ $STATUS -eq 0 ]
do
	# Clean up log files so we don't keep increasing the used space. Ignore if it fails (if there are no files).
	rm ./testRuns/* > /dev/null
	#rm -rf /var/tmp/tinylicious/ > /dev/null

	COUNTER=$((COUNTER+1))
	export TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
	OUTPUT_FILE=$TIMESTAMP.log
	echo "Running tests ($COUNTER)...output file: ./testRuns/$OUTPUT_FILE";
	# npm run test:realsvc:tinylicious > ./testRuns/$OUTPUT_FILE 2>&1
	export FLUID_TEST_LOGGER_PKG_PATH='/home/alex/code/FluidFramework/packages/test/test-end-to-end-tests/node_modules/@ff-internal/aria-logger'; \
	export logger__colorize="false"; \
	export logger__morganFormat=tiny; \
	npm run test:realsvc:local:report:full > ./testRuns/$OUTPUT_FILE 2>&1
	STATUS=$?
done

echo "Tests failed with status $STATUS"
