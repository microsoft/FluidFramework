# Event Hub Event Processor

Similar to its C# cousin the Event Hub Event Processor distributes workers across a cluster of machines. Each worker
takes ownership of an Event Hub partition and then checkpoints its progress through the messages coming from the
partition.