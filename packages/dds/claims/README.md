# @fluidframework/claims-dds

A first-writer-wins **claims** distributed data structure for the Fluid Framework.

Use `SharedClaims` to wire up singleton entries (typically handles to child
DDSes or data stores) with first-writer-wins semantics. Once a key has been
sequenced on a `SharedClaims`, no other client can ever overwrite it for the
lifetime of the document. By contrast, writing to a key on a
last-writer-wins DDS (such as `SharedDirectory`) silently lets one client
overwrite another's write when two clients race.

`SharedClaims` is automatically attached to every
[`DataObject`](../../framework/aqueduct) under the channel id `claims`, and
the `DataObject` helpers `trySetClaim`, `getClaim`, and `hasClaim` delegate
to it.
