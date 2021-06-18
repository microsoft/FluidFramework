# Developer Notes

## Merge Tree
### Node lengths
If a function reports a node's length as undefined, it means the node has been removed from the perspective of the client and/or reference sequence number.
Alternately, if a functions reports a nodes length as 0 it means that node is not yet visible  from the perspective client and/or reference sequence number.
Ths distinction is important, as a removed segment with undefined length may not exists on remote clients, as it could have already been zambonied.
However a not yet visible segment with 0 length may already exist, or will eventually exits on all clients.
These have implications for eventually consistent conflict resolution. Generally, we ignore removed segments, and special case invisible segments, like in the case
of conflicting insert as handled in the `breakTie` function
