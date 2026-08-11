---
"tinylicious": patch
"__section": fix
---
Tinylicious now returns ops when they are requested from the start of a document

Tinylicious' in-memory database treated a range query bound of `0` as "no bound". Because the ops REST API uses an
exclusive lower bound, a client asking for the ops of a document starting at sequence number 1 issues a
`{ $gt: 0 }` query, which was interpreted as an equality match and returned no ops at all.

Clients that had to catch up from the beginning of a document (for example a read-mode connection to a document that
has no summary yet) therefore never received the missing ops. They either spun retrying the fetch and never reached
the last known sequence number - so anything waiting for catch-up, such as `waitContainerToCatchUp`, never resolved -
or eventually closed the container with "Failed to retrieve ops from storage (Too Many Retries)".
