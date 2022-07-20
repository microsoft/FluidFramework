# Developer Notes

## Merge Tree
### Node lengths
If a function reports a node's length as undefined, it means the node has been removed from the perspective of the client and/or reference sequence number.
Alternately, if a functions reports a nodes length as 0 it means that node is not yet visible  from the perspective client and/or reference sequence number.
Ths distinction is important, as a removed segment with undefined length may not exists on remote clients, as it could have already been zambonied.
However a not yet visible segment with 0 length may already exist, or will eventually exits on all clients.
These have implications for eventually consistent conflict resolution. Generally, we ignore removed segments, and special case invisible segments, like in the case
of conflicting insert as handled in the `breakTie` function

### Zamboni
Zamboni is the garbage collection process in the merge tree. As segment change due to inserts and deletes, we add them to a heap which keeps the segment with the lowest sequence number at the head. These segments drive the zamboni process which is also run on every change. The zamboni process peeks at the heap to determine if the head is below the min sequence, then the segment is eligible. The minimum sequence number is important here, as the minimum sequence number is a sequence seen by all clients, and all clients will specify their reference sequence number as above the minimum sequence number. This mean that no new operations can come in that reference anything at or below the minimum sequence number, so we are safe to clean up anything we would need to applying incoming. Eligible segments are collected, and then a few different operations are done, superficially, merge, remove, and tree rebalance. Zamboni is incremental, and only collects a constant number of segments at each change so as not to introduce performance issues.

Merge is done if two adjacent segments are of the same type like text, that type is mergable (markers are not), neither are deleted, and all the properties match. The merge process reduces the number of segments, which are leaf nodes of the merge tree. For instance a user may type `c`, `a`, and `t` with each character being it's own operation therefore segment. The user could then highlight that range, and set a property on on all the characters indicating that they are bold, `{bold: true}`. At some later point, these segments would move to the top of th heap, and their sequence numbers would move below the minium sequence number. At that point zamboni could take those individual segments, and merge the into a single segment, `cat` with the property  `{bold: true}`

Remove is a bit simpler. On removal of a segment, we track it's removed sequence number. When the segment's removed sequence number drops below the minimum sequence number it can be safely removed from the tree.

Rebalance is a bit different from merge and remove, as it has to do with maintaining the tree itself.  After merge or removal there are fewer segments aka leaf nodes in the tree. This allows us to more efficiently pack the non-leaf node of the tree, and potentially remove layers from the tree. This keeps the tree compact, which has both memory and cpu performance implications.
