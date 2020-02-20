# Utils

## Kafka

We defined generic kafka interfaces (IProducer and IConsumer) that can be implemented using different libraries. We have two implementations right now ([kafka-node](https://github.com/SOHU-Co/kafka-node) and [kafka-rest](https://github.com/confluentinc/kafka-rest-node)). The implementations are easily swappable through simple config change - i.e.

```json
kafka": {
    "lib": {
        "name": "kafka-node",
        "endpoint": "kafka:9092"
    }
}
```