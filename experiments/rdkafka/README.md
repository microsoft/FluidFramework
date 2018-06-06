# Kafka Test

node-rdkafka is a kafka implementation made by Blizzard, their implementation uses native code, so it's easier
to npm install directly into a container.

The docker run command attaches to local prague (start prague first) and opens shell in the container.

docker build . -t kafkatest  
docker run --rm -it --network=routerlicious_default kafkatest /bin/sh  