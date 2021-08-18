# @fluidframework/server-services-ordering-rdkafka

Fluid server services rdkafka orderer implementation for [Fluid reference service](../routerlicious).

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

## SSL Setup
Fundamentally, to setup SSL/TLS for Kafka, both Kafka client and Kafka server changes are needed.

This implementation using `node-rdkafka` provides built-in support for SSL/TLS. But, by default, SSL is disabled in this implementation since the setup in routerlicious' docker-compose.yml does not configure SSL for the Kafka service.

If you wish to enable SSL for Kafka, please follow these instructions:

1. Configure SSL in the Kafka service. General instructions on how to do that can be found in the [official Kafka documentation](http://kafka.apache.org/documentation.html#security_ssl). But since we are using [`node-rdkafka`](https://github.com/blizzard/node-rdkafka), which is based on [`librdkafka`](https://github.com/edenhill/librdkafka), you can use `librdkafka`'s [`gen-ssl-certs.sh`](https://github.com/edenhill/librdkafka/blob/master/tests/gen-ssl-certs.sh) script to help you with the process. Instructions are available [here](https://github.com/edenhill/librdkafka/wiki/Using-SSL-with-librdkafka). An example of putting the instructions in practice can be found below. Please note that for this example we will be using self-signed certificates, plus Docker Kafka's service name as `BROKER`, and also the default passwords and values in the `gen-ssl-certs.sh` script. Finally, the example below only configures encryption, and not Kafka client authentication.

   1. Under `FluidFramework/server/routerlicious`, create a directory called `certs`. Open the directory.

      ```bash
      $ mkdir certs
      $ cd certs
      ```

   2. Save a copy of [`gen-ssl-certs.sh`](https://github.com/edenhill/librdkafka/blob/master/tests/gen-ssl-certs.sh) in `certs`.

   3. Run the following commands:

      ```bash
      $ ./gen-ssl-certs.sh ca ca-cert Kafka-Security-CA
      $ BROKER=kafka
      $ ./gen-ssl-certs.sh -k server ca-cert broker_${BROKER}_ ${BROKER}
      ```

   You should now have new files under `certs`, including a JKS Truststore, a JKS Keystore and the ca-cert file.

2. Update `docker-compose.yml` under `FluidFramework/server/routerlicious` to use the following setup for Kafka:

    ```yaml
    kafka:
        image: wurstmeister/kafka:2.11-1.1.1
        ports:
            - "9092:9092"
        environment:
            KAFKA_ADVERTISED_LISTENERS: "SSL://kafka:9092"
            KAFKA_LISTENERS: "SSL://0.0.0.0:9092"
            KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
            KAFKA_CREATE_TOPICS: "deltas:8:1,rawdeltas:8:1,testtopic:8:1,deltas2:8:1,rawdeltas2:8:1"
            KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
            KAFKA_SSL_KEYSTORE_TYPE: "JKS"
            KAFKA_SSL_KEYSTORE_LOCATION: "/certs/broker_kafka_server.keystore.jks"
            KAFKA_SSL_KEYSTORE_PASSWORD: "abcdefgh"
            KAFKA_SSL_KEY_PASSWORD: "abcdefgh"
            KAFKA_SSL_TRUSTSTORE_TYPE: "JKS"
            KAFKA_SSL_TRUSTSTORE_LOCATION: "/certs/broker_kafka_server.truststore.jks"
            KAFKA_SSL_TRUSTSTORE_PASSWORD: "abcdefgh"
            KAFKA_SSL_CLIENT_AUTH: "none"
            KAFKA_SECURITY_INTER_BROKER_PROTOCOL: "SSL"
        volumes:
            - ./certs:/certs
    ```

3. Update `docker-compose.dev.yml` under `FluidFramework/server/routerlicious` to use volume mapping and copy the `certs` folder to the different Docker services. Please note that `...` below means that the other volume mapping rules have been omitted.

    ```yaml
    version: '3.4'
    services:
        alfred:
            volumes:
                ...
                - ./certs:/certs
        deli:
            volumes:
                ...
                - ./certs:/certs
        scriptorium:
            volumes:
                ...
                - ./certs:/certs
        copier:
            volumes:
                ...
                - ./certs:/certs
        scribe:
            volumes:
                ...
                - ./certs:/certs
        foreman:
            volumes:
                ...
                - ./certs:/certs
        riddler:
            volumes:
                ...
                - ./certs:/certs
    ```

4. Update `config.json` under `FluidFramework/server/routerlicious/packages/routerlicious/config` to include the `sslCACertFilePath` property in `kafka.lib`. Example:

    ```json
    "kafka": {
            "lib": {
                "name": "rdkafka",
                "endpoint": "kafka:9092",
                "producerPollIntervalMs": 10,
                "numberOfPartitions": 8,
                "replicationFactor": 1,
                "rdkafkaOptimizedRebalance": true,
                "rdkafkaAutomaticConsume": true,
                "rdkafkaConsumeTimeout": 5,
                "rdkafkaMaxConsumerCommitRetries": 10,
                "sslCACertFilePath": "/certs/ca-cert"
            }
        },
    ```

5. Now, you can build and run routerlicious and it will use SSL/TLS for Kafka.
