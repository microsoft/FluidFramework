#!/bin/bash
set -euo pipefail

echo FF_BUILD_NUMBER=$FF_BUILD_NUMBER

# currentDate=$(date +'%Y-%m-%d')
currentDate=2024-05-10
echo $currentDate

# Function to handle errors
handle_error() {
    echo "An error occurred: $1"
    exit 1
}

if [ $FF_BUILD_NUMBER = "none" ]; then
	echo "Downloading manifest files by current date..."
	if ! curl -fsS -o "simpleManifest.json" "https://fluidframework.blob.core.windows.net/manifest-files/simpleManifest-${currentDate}.json"; then
		handle_error "Cannot download simple manifest file by current date"
	fi

  # Try downloading manifest.json by current date
	if ! curl -fsS -o "manifest.json" "https://fluidframework.blob.core.windows.net/manifest-files/manifest-${currentDate}.json"; then
		handle_error "Cannot download manifest file by current date"
	fi

else
	echo "Downloading manifest files by build number..."
	# Try downloading simpleManifest.json by build number
	if ! curl -fsS -o "simpleManifest.json" "https://fluidframework.blob.core.windows.net/manifest-files/simpleManifest-${FF_BUILD_NUMBER}.json"; then
		handle_error "Cannot download simple manifest file by FF build number"
	fi
	# Try downloading manifest.json by build number
	if ! curl -fsS -o "manifest.json" "https://fluidframework.blob.core.windows.net/manifest-files/manifest-${FF_BUILD_NUMBER}.json"; then
		handle_error "Cannot download manifest file by FF build number"
	fi

fi

ls

# Check if both files are downloaded successfully
if [ -f "simpleManifest.json" ] && [ -f "manifest.json" ]; then
    echo "Files downloaded successfully"
else
    handle_error "Files were not downloaded successfully"
fi
