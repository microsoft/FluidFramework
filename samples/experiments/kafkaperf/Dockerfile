# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM maven:3.5.0-jdk-8-alpine

# Copy over and build the server
WORKDIR /home/kafkaperf
COPY . .
RUN mvn package

CMD ["java", "-cp", "target/kafkaperf-1.0-SNAPSHOT.jar:target/kafka-clients-0.10.0.1.jar:target/lz4-1.3.0.jar:target/slf4j-api-1.7.21.jar:target/snappy-java-1.1.2.6.jar", "prague.io.ConsumerLoop"]
