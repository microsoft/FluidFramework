#!/bin/bash

set -eux -o pipefail

# This script is used in the "npm run test" step in our CI build pipelines.
# It runs the specified test steps in parallel.

TASK_TEST_STRING="$1"
BUILD_DIR="$2"
BUILD_REASON="$3"

IFS=' ' read -r -a TASK_TEST_ARRAY <<< "$TASK_TEST_STRING"

echo "Tests to run: ${TASK_TEST_ARRAY[*]}"
echo "Build Directory: $BUILD_DIR"
echo "Build Reason: $BUILD_REASON"

# Check if the taskTestSteps array is empty
if [[ ${#TASK_TEST_ARRAY[@]} -eq 0 ]]; then
  echo "Error: At least one taskTestStep is required."
  exit 1
fi

disable_tinylicious_colorization() {
  export logger__colorize="false"
  export logger__morganFormat="tiny"
  echo "Tinylicious log colorization disabled."
}

compute_test_coverage() {
  local task=$1
  if ([[ "$BUILD_REASON" != "PullRequest" ]] || \
      ([[ "$task" != *"realsvc:tinylicious"* ]] && [[ "$task" != *"stress:tinylicious"* ]])); then
    echo true
  else
    echo false
  fi
}

run_task_test() {
  local task_test_step=$1
  local build_directory=$2
  local test_coverage=$3

  local command="run $task_test_step"

  if [[ "$test_coverage" == "true" && "$task_test_step" == ci:test* ]]; then
    command="$command:coverage"
    echo "Running task with coverage: $task_test_step"
  else
    echo "Running task without coverage: $task_test_step"
  fi

  if [[ "$task_test_step" == *tinylicious* ]]; then
    disable_tinylicious_colorization
  fi

  echo "Executing: npm $command in $build_directory"
  pushd "$build_directory" > /dev/null
  npm run $command
  popd > /dev/null
}

if [[ "${startTest}" == "true" ]]; then
  echo "Starting tests in parallel..."

  # Loop through the array of test steps and run each in parallel
  for task_test_step in "${TASK_TEST_ARRAY[@]}"; do
    TEST_COVERAGE=$(compute_test_coverage "$task_test_step")
    run_task_test "$task_test_step" "$BUILD_DIR" "$TEST_COVERAGE" &
  done

  # Wait for all parallel tasks to complete
  wait

  echo "All tests completed."
else
  echo "startTest condition not met. Skipping tests."
fi
