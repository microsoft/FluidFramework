# Move Composition

A move of a node in a sequence field is represented by a pair of marks:
a MoveOut at the initial location of the node to be moved, and a MoveIn at the location the node will be moved to.
Each of these move pairs is identified by a ChangeAtomId.

For various reasons, we preserve the intermediate move steps when composing a series of moves of the same node.
Note the cell IDs are changed at the intermediate locations, so it is necessary to record some information about the intermediate steps.
The composition of move1, moving a node from A to B, with move2, moving the same node from B to C (where A, B, and C are distinct cells),
is represented with MoveOut1 at A, MoveIn2 at C, and AttachAndDetach(MoveIn1, MoveOut2) at B.
We say that the composite change in this example contains a single move chain which consists of move1 and move2 as its move atoms.
Note that a move chain may have only a single move atom.
Composition of move chains may lead to the creation of arbitrarily long move chains.

To allow efficient processing a move chain without having to traverse all its elements,
in a chain consisting of more than one atom each endpoint (the first MoveOut and last MoveIn of the chain)
will have its `finalEndpoint` field set to the ID of the other endpoint.

When composing a move chain which starts at A and ends at B with a move chain which starts at B and ends at C, we call cell B the pivot of the chains.
Each of the chains will have a endpoint at B, which we call the inner endpoint. The other endpoint of each chain is called the outer endpoint.

In the common case when composing chains we notice that the chains are moving the same node when we encounter the inner endpoints.
Each inner endpoint stores the ID of the corresponding outer endpoint.
We set `MoveEffect.endpoint` for each outer endpoint to be the other outer endpoint.
When we encounter each outer endpoint we update its `finalEndpoint` to `MoveEffect.endpoint`,
unless `MoveEffect.truncatedEndpoint` is also defined (see below), in which case we use that instead.

A special case arises when the location outer endpoint of one of the move chains is the location of an intermediate move in the other move chain.
For example, the first chain might consist of move1 from A to B, and the second chain consist of move2 from B to A and move3 from B to C.
The endpoints of the composed move are at the locations of the outer endpoints (A and C) as usual,
but the starting endpoint of the composed move will be the second chain's MoveOut (move3) at A instead of the first chain's outer endpoint at A (the MoveOut from move1).
This follows from the rules for composing attach and detach marks at the same cell (A in this case).
We can think of the composed move chain as truncating from `A -move1-> B -move2-> A -move3-> C` to `A -move3-> C`.
We call the MoveOut from move3 the truncated endpoint and the MoveOut from move1 the redundant endpoint.
We call the MoveIn from move3 the ordinary endpoint.

We detect that we are in such a scenario when processing the location of the redundant and truncated endpoints.
We set `MoveEffect.truncatedEndpointForInner` for the inner endpoint from the redundant move chain to the ID of the truncated endpoint.
If we already know the ordinary endpoint (because we already processed the pivot and have `MoveEffect.endpoint` for the redundant endpoint)
we also set `MoveEffect.truncatedEndpoint` for the ordinary endpoint.

When processing the pivot, if `MoveEffect.truncatedEndpoint` is defined for an inner endpoint,
we copy its value into `MoveEffect.truncatedEndpoint` for the corresponding outer endpoint (which will be the ordinary endpoint).

Note that there are two places where we may set `truncatedEndpoint` on the ordinary endpoint.
This is necessary for composition to complete with a single amend pass regardless of whether we happen to process the pivot or the truncation point first.
