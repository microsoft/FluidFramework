To build

`docker build --build-arg NPM_TOKEN=${NPM_TOKEN} -t rdkdeli .`

node dist/jarvis/www.js
node dist/kafka-service/index.js deli ../deli/index.js
node dist/kafka-service/index.js scriptorium ../scriptorium/index.js
node dist/kafka-service/index.js bbc ../bbc/index.js

docker run --rm -it -e NPM_TOKEN=$NPM_TOKEN -v $(pwd):/usr/src/server --network routerlicious_default rdkdeli /bin/sh