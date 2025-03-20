#!/bin/bash
set -eux -o pipefail

echo WORKING_DIRECTORY=$WORKING_DIRECTORY
echo "Preparing nested lib/dist directories for publishing..."

# Ensure the nested_lib_dist directory exists and navigate to it
mkdir -p nested_lib_dist

# Find all lib/dist directories, excluding those in node_modules
# directories_to_publish.txt contains the list of all lib and dist directories to be published
# so they can be later used on test jobs.
# This is in order to avoid running the build job on test jobs and parallelize them.
find $WORKING_DIRECTORY -type d \( -name "lib" -o -name "dist" \) ! -path "*/node_modules/*" > nested_lib_dist/directories_to_publish.txt

echo "Directories to publish:"
cat nested_lib_dist/directories_to_publish.txt

# Calculate the size of the directories to be archived
echo "Calculating size of directories to be archived..."
du -ch $(cat nested_lib_dist/directories_to_publish.txt) | grep total

# Create the tarball in the nested_lib_dist folder
echo "Creating the tarball in the nested_lib_dist folder..."
tar --create --gzip --file nested_lib_dist/nested_lib_dist.tar.gz -T nested_lib_dist/directories_to_publish.txt

# Clean up temporary files
rm -rf nested_lib_dist/directories_to_publish.txt

# Verify tarball size
echo "Tarball created. Inspecting its size..."
ls -lh nested_lib_dist/nested_lib_dist.tar.gz
