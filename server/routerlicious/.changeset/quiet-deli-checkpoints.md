---
"@fluidframework/server-lambdas": minor
"__section": fix
---
Deli no longer checkpoints after a failed Kafka send

When a Kafka send failure causes Deli to restart, Deli now reprocesses the affected messages from its last checkpoint instead of skipping them.
