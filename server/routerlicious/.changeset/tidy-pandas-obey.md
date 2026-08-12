---
"@fluidframework/server-lambdas": patch
"@fluidframework/server-local-server": patch
"@fluidframework/server-memory-orderer": patch
"@fluidframework/server-services-core": patch
"tinylicious": patch
"__section": fix
---
Tinylicious now supports confirmed catch-up from the start of a document

Tinylicious' in-memory database treated a range query bound of `0` as "no bound". Because the ops REST API uses an
exclusive lower bound, a client asking for the ops of a document starting at sequence number 1 issues a
`{ $gt: 0 }` query, which was interpreted as an equality match and returned no ops at all.

The local server also did not populate the existing optional `checkpointSequenceNumber` field in connected messages.
Read-mode clients could fetch available ops but could not confirm how far they needed to catch up, causing
`waitContainerToCatchUp` to return `false`.

Tinylicious now handles zero-valued range bounds and reports the local orderer's latest sequence number through the
existing connected-message contract. Read-mode clients can retrieve all missing ops and confirm when they are caught
up. The shared Nexus path only forwards the checkpoint when its orderer manager provides one, so deployed
Routerlicious orderers that do not implement this optional capability retain their existing behavior.
