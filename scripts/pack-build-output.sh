#!/bin/bash
set -eux -o pipefail

echo WORKING_DIRECTORY=$WORKING_DIRECTORY
echo "Preparing build output for publishing..."

# Ensure the build_output_archive directory exists
mkdir -p build_output_archive

# Find all build output, excluding those in node_modules and .git.
# Alter the .gitignore files to only include node_modules and this
# temp build_output_archive folder, then leverage git to locate changes.
# .gitignore.files.txt contains the list of all .gitignore files that
#   were modified.
# build_output_to_publish.txt contains the list of all complete
#   directories and files to be published so they can be later used
#   in test jobs.
# This is in order to avoid running the build steps in test jobs too.
find $WORKING_DIRECTORY -type f -name ".gitignore" ! \( -path "*/node_modules/*" -or -path "*/.git/*" \) > build_output_archive/.gitignore.files.txt
(
	# Disable command echoing for this block
	set +x
	echo reducing .gitignores to only node_modules # and .npmrc
	for gitignore_filepath in $(cat build_output_archive/.gitignore.files.txt)
	do
		echo "node_modules" > $gitignore_filepath
		# Also ignore out temporary folder (only needed at root)
		echo "build_output_archive" >> $gitignore_filepath
	done
)
# Build the content list of unstaged, new files
git status --porcelain | grep -E '^\?\?' | awk '{print $2}' > build_output_archive/build_output_to_publish.txt

echo "Full directories to publish:"
grep '/$' build_output_archive/build_output_to_publish.txt

# Calculate the size of the directories + ecmascript files to be archived
echo "Calculating size of full directories to be archived..."
du -ch $(grep '/$' build_output_archive/build_output_to_publish.txt) | grep total
echo "Calculating size of one off ecmascript files to be archived..."
du -ch $(grep '[jt]s$' build_output_archive/build_output_to_publish.txt) | grep total

# Create the tarball in the build_output_archive folder
echo "Creating the tarball in the build_output_archive folder..."
tar --create --gzip --file build_output_archive/build_output_archive.tar.gz -T build_output_archive/build_output_to_publish.txt

# Restore .gitignore files
(
	# Disable command echoing for this block
	set +x
	git restore $(cat build_output_archive/.gitignore.files.txt)
)

# Clean up temporary files
rm -rf build_output_archive/.gitignore.files.txt build_output_archive/build_output_to_publish.txt

# Verify tarball size
echo "Tarball created. Inspecting its size..."
ls -lh build_output_archive/build_output_archive.tar.gz
