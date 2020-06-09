# logger

## To run, build using docker

docker build -t logger .

## Test scribe

node routerlicious/dist/tools/scribe.js scribe-test -s http://praguekube.westus2.cloudapp.azure.com -t http://prague-historian.westus2.cloudapp.azure.com

## Upload logs

docker run logger {path/to/file.json} {EVENT_NAME}