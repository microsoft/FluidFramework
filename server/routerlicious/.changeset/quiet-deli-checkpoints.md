---
"@fluidframework/server-lambdas": minor
"__section": fix
---
Deli no longer checkpoints after a failed Kafka send

Deli waits for every pending Kafka send to settle before it writes a checkpoint, and skips any checkpoint that covers a failed send.
After the resulting restart, Deli reprocesses the affected messages from the last successful checkpoint instead of skipping them.
