# Scribe

![Bartolomeo Passarotti - Portrait of a scribe](https://upload.wikimedia.org/wikipedia/commons/7/7f/Bartolomeo_Passarotti_-_Portrait_of_a_scribe.jpg)

[Bartolomeo Passarotti [Public domain], via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bartolomeo_Passarotti_-_Portrait_of_a_scribe.jpg)

Scribe is responsible for listening to inbound summary ops and then committing them to the public record.

This can happen in two ways:

1. Linking the Client Summary
2. Service Summary

## Linking the Client Summary

While the summary is uploaded directly from the client, Scribe validates the summary and appends additional information
to the summary before creating a git commit with the summary information.

Specifically, Scribe fetches the summary via the SHA included on the summary op, fetches the "log tail" of operations
between the summaryOp's reference sequence and the current sequence number, then adds the protocol, serviceProtocol,
and log tail to the summary. This summary is turned into a gitTree and committed to the summaryStorage.

## Service Summary

When there are no clients to write a summary, the service generates a summary without parsing any operations. The service
summary is a summary that only includes a list of the operations since the prior summary.

While clients can parse service summaries, service summaries do not provide the performance improvements of summarizing
the container on the client.

### Why Service Summary?

The service must write a summary because op storage is not guaranteed to be persistent. The service summary,
initiated by scribe, moves data from short term op storage to long term summary storage.

While there are typically clients available to write the summary, there are many scenarios where there are no clients
available. For example, there may be no clients to write a summary when there's an unexpected network outage or the
only connected client suddenly disconnects due to low battery.
