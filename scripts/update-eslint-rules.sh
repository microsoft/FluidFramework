#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <path>"
  exit 1
fi

PATH_ARG="$1"

# Find all .ts, .tsx, .js, .jsx files and update them
fd -e ts -e tsx -e js -e jsx . "$PATH_ARG" -x sd 'import/' 'import-x/'
fd -e ts -e tsx -e js -e jsx . "$PATH_ARG" -x sd 'eslint-comments/' '@eslint-community/eslint-comments/'

echo "Updated import/ -> import-x/ and eslint-comments/ -> @eslint-community/eslint-comments/ in $PATH_ARG"
