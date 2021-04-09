# Scribe

![Bartolomeo Passarotti - Portrait of a scribe](https://upload.wikimedia.org/wikipedia/commons/7/7f/Bartolomeo_Passarotti_-_Portrait_of_a_scribe.jpg)

[Bartolomeo Passarotti [Public domain], via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bartolomeo_Passarotti_-_Portrait_of_a_scribe.jpg)

Scribe is responsible for listening to inbound summary ops and then committing them to the public record.

This can happen in two ways:

1. Linking the Client Summary
2. Service Summary

## Linking the Client Summary

While the summary is uploaded directly from the client, scribe validates the summary and appends additional information
to the summary before creating a git commit with the summary information.

Specifically, Scribe fetches the summary via the SHA included on the summary op, fetches the "log tail" of operations
between the summaryOp and the summaryAck, then adds the protocol, serviceProtocol, and log tail to the summary. This
summary is turned into a gitTree and committed to the summaryStorage.

## Service Summary

When there are no clients to write a summary, the service generates a summary without parsing any operations. The service
summary is a summary that only includes a list of the operations since the prior summary.

While clients can parse service summaries, service summaries do not provide the performance improvements of summarizing
the container on the client.

The service summary manages the case where there are no clients to write a summary.
