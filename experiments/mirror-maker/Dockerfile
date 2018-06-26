# A simple Kafka based Dockerfile heavily influenced by https://hub.docker.com/r/wurstmeister/kafka/~/dockerfile/
FROM openjdk:8u171-jre-stretch

ARG kafka_version=1.1.0
ARG scala_version=2.12

ENV KAFKA_VERSION=$kafka_version
ENV SCALA_VERSION=$scala_version
ENV KAFKA_HOME=/opt/kafka

ENV PATH=${PATH}:${KAFKA_HOME}/bin

RUN apt-get update

RUN wget -q http://mirrors.ocf.berkeley.edu/apache/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz -P /tmp
RUN tar xfz /tmp/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz -C /opt
RUN rm /tmp/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz
RUN ln -s /opt/kafka_${SCALA_VERSION}-${KAFKA_VERSION} /opt/kafka

COPY server.properties ${KAFKA_HOME}/config/server.properties

WORKDIR $KAFKA_HOME
CMD ["./bin/kafka-server-start.sh", "config/server.properties"]
