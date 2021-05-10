#!/bin/bash

set +f
for f in doc/*.html ; do 
    echo 'Stripping in_ off of documentation' $f
    # Avoid using -i or the + operator; they aren't portable
    sed 's/in_\([a-zA-Z0-9]*\)/\1/g' $f > $f.new
    mv $f.new $f 
done
