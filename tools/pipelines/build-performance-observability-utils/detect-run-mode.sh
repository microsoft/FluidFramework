#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Detect run mode for build-performance-observability pipeline
# Determines whether to run in "public" (PR builds) or "internal" mode
# and whether the pipeline should skip (when schedule doesn't match project)
#
# Required environment variables:
#   IS_PUBLIC         - "True" if running in public project
#   BUILD_REASON      - ADO build reason (e.g., "Schedule", "Manual")
#   CRON_SCHEDULE_NAME - Display name of the cron schedule (if scheduled)
#
# Outputs (via ADO logging commands):
#   shouldRun - "true" or "false"
#   runMode   - "public" or "internal"

set -eu -o pipefail

# Validate required environment variables
: "${IS_PUBLIC:?IS_PUBLIC environment variable is required}"
: "${BUILD_REASON:?BUILD_REASON environment variable is required}"

# Determine mode: scheduled runs use schedule name, manual runs use project
if [ "$BUILD_REASON" = "Schedule" ]; then
    : "${CRON_SCHEDULE_NAME:?CRON_SCHEDULE_NAME is required for scheduled builds}"

    if [[ "$CRON_SCHEDULE_NAME" == *"PR build"* ]]; then
        MODE="public"
    else
        MODE="internal"
    fi

    # Check if project matches schedule mode
    if [ "$MODE" = "public" ] && [ "$IS_PUBLIC" != "True" ]; then
        echo "Skipping: Public builds schedule running in internal project"
        echo "##vso[task.setvariable variable=shouldRun;isoutput=true]false"
        exit 0
    elif [ "$MODE" = "internal" ] && [ "$IS_PUBLIC" = "True" ]; then
        echo "Skipping: Internal builds schedule running in public project"
        echo "##vso[task.setvariable variable=shouldRun;isoutput=true]false"
        exit 0
    fi
else
    # Manual run - use project to determine mode
    if [ "$IS_PUBLIC" = "True" ]; then
        MODE="public"
    else
        MODE="internal"
    fi
fi

echo "Mode: $MODE"
echo "##vso[task.setvariable variable=shouldRun;isoutput=true]true"
echo "##vso[task.setvariable variable=runMode;isoutput=true]$MODE"
