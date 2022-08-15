# SharedTree Semantic/Temporal Edit Format

This document describes the “Semantic” (a.k.a. “Temporal”) format for the
SharedTree history. It complements the “Structural” (a.k.a. “Spatial”) Changeset
format, with each format being the suitable choice for a different set of
scenarios.

"Semantic" edits are a serialized representation of a function call (Remote
Procedure Call style) that can be applied to a tree state. When a Semantic edit
is run it may modify the tree state by creating and applying sub-edits. All
Semantic edits, when applied, must eventually result in a sequence of low-level
edits that fully describe the modifications to the tree in primitives understood
by the Fluid SharedTree library. A Semantic edit can be optionally annotated
with its sub-edits, which allows someone running the edit to either apply the
top-level edit, or all of its sub-edits instead. This decision can be made
recursively, defining many possible cross sections of the Semantic edit tree
that can be played back, with SharedTree natively understanding the all-leaves
case, but also potentially some intermediate levels. Semantic edits capture not
only _what_ changed in the tree, but also _why_ the tree changed the way it did.

In contrast, “Structural” edits only capture _what_ changed between two states,
but the changes are organized as a sparse mirror of the tree itself. This allows
changes to be coalesced, and also filtered based on tree structure, for example
to transmit to a given client only those changes that apply to portions of the
tree to which it has been granted access.

The motivations for the Semantic format are as follows:

- It captures the intent of the user, allowing high-level commands to be
  replayed to rebase edits whose inputs/context have changed. This need can
  arise in at least three scenarios:

  - The common case of rebasing local edits against incoming edits that have
    been sequenced earlier

  - Out-of-order undo or redo operations (e.g. when one client undoes one of its
    own edits, subsequent edits from other clients need to be rebased to the
    revision before the undone edit)

  - Merging of branches in the history

  Replaying edits can yield high-quality merge outcomes without the need for
  merge-specific logic to be written by application authors.

- It preserves the most precise history of the user’s actions, allowing
  fine-grained branching and manipulation of the history.

- Semantic edits are simple and resilient to unrelated changes, since edits are
  expressed using only identities.

  - If there are no conflicts (i.e. need for anchor adjustment), the same edit
    can be shared across different branches.

  - There is no need to do an unbounded walk through the history to interpret
    the edit on a different branch.

  - By using only identities, Semantic edits can be very compact, which is
    useful in a local history or an “archive” region of a very large history.

- For edits that have sizable effects on the document, it can be far more
    efficient to transmit to clients the high-level command, rather than the
    resulting low-level changes (provided that the command is deterministic and
    available on all clients).

Semantic edits do require a reified tree, but this is anyway a requirement for
commands that may inspect the tree.

Here’s a quick comparison between the two formats:

| ***Semantic***                                                  | ***Structural***                                                                                |
|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| **Preserves all states between user actions**                   | **Omits intermediate states when desired**                                                      |
| Structural format used where “Squash” is desired                | Can represent outcome of explicit “Squash” by user to deliberately forget intermediate states   |
|                                                                 | Allows clients to quickly migrate tree snapshot (with no local changes) to a different revision |
|                                                                 | Can compactly represent a delta between two trees                                               |
| **Designed for best rebase outcomes**                           | **Designed to scale**                                                                           |
| Preserves intent of users                                       | Efficient filtering of transmitted operations based on permissions or partial checkouts         |
| Supports replay of commands, which may inspect surrounding tree | Does not require reified tree, even during rebasing                                             |
|                                                                 | o Reduces cost of server mediating live collaboration sessions                                  |
|                                                                 | o Allows server to cheaply mirror document in external database                                 |
| **Compact representation through use of identities**            | **Representation optimized for scale, speed**                                                   |
| Useful for local history, “archive history” on servers          |  Servers with stored Structural representation can enforce permissions without reifying tree    |
|                                                                 | Servers can store “mipmap” for very fast migration between revisions                            |

## Terminology

The following terminology is suggested for both code and discussion:

| ***Term***    | ***Definition***                                                                                                                                        |
| :-----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command**   | A block of application code that modifies a document; has a stable ID and type signature, and may be invoked directly by the user or by another command |
| **Edit**      | The recorded execution of a command in a document’s history, including both the command’s inputs and outcome; edits may nest                            |
| **Change**    | A description of the difference between two states of a document                                                                                        |
| **Changeset** | Multiple (mostly) unordered changes, often describing the difference between two revisions in a document’s history                                      |
| **Revision**  | A state of interest in the history; may also refer to the data structure in the history that describes how this state may be obtained from the previous revision in the history (includes a Changeset or Edit, plus metadata such as author and timestamp) |

## Commands

Commands are registered by the application, and include an identity and a
function to execute whenever the command is invoked (either by the user or
during a rebase).

Here’s an example of what a command definition may look like:

```TypeScript
const incrementDotColorCommand = {
    id: 'ada59364-b55c-4f35-95cf-867e93a141f5' as CommandId,
    run: (context: CommandContext, { dot }: { dot: Dot }) => {
        const color: NumberNode = dot.color;
        const newColor = (color[value] + 1) % dotColors.length;
        return color.setValue(newColor, context);
    }
}
```

And a possible pattern for registering commands:

```TypeScript
const canvasCommands: CommandRegistry = [ addDotCommand, incrementDotColorCommand ];
...
const checkout = await sharedTree.checkOut(canvasCommands);
```

The Checkout interface has a runCommand method:

```TypeScript
checkout.runCommand({
   command: incrementDotColorCommand,
   anchors: { dot }
});
```

The CommandContext method has the same method, allowing commands to call other commands. Helper functions can be used to simplify the syntax:

```TypeScript
checkout.runCommand(incrementDotColor(dot));
```

## Edits

Successful execution of a command (and the commands it calls) results in a
reversible Edit being created and appended to the history. If any command is
unable to complete, the partially complete edit may be used to roll back the
changes to the local state – if this happens with a nested command, a calling
command may potentially detect the error and choose an alternate code path.

An Edit record contains the following fields:


| ***Name***        | ***Type***    |
| :---------------: | :-----------: |
| **commandID**     | UUID          |
| **anchors**       | { any props } |
| **parameters?**   | { any props } |
| **constraints?**  | Constraint[]  |
| **reversalData?** | { any props } |
| **subEdits?**     | Edit[]        |

Only built-in “primitive” edits may contain reversalData. Only higher-level
commands may (and typically do) contain subEdits. (The array of subEdits may be
empty, if the command proves to be a no-op when executed. The same command may
perform subEdits when rebased, though.) The subEdits array records the temporal
order in which all sub-commands were called.

Anchors are locations in the tree that may be adjusted by SharedTree before
re-execution of a command during a rebase operation (or an edit rebase may fail
if the anchors cannot be successfully adjusted). Anchor types include specific
TreeNodes, places at the start or end of a trait or adjacent to nodes, or ranges
between places in the same trait. Custom anchors may be supported at some point,
but will require anchor adjustment hookpoints in the SharedTree rebasing logic.
There is one special kind of anchor: a detached range of trees – rather than
being specified in terms of the range nodes, these will store the identity of
the edit that produced the detached range and, when needed, a discriminator to
differentiate between output parameters. A command must be passed at least one
anchor parameter, or it cannot affect the document.

Parameters are simply serializable data, and will not be adjusted during
rebases. A create operation is a special case, as its parameter (a descriptor of
the tree to be created) is decorated with identities upon execution, and it is
this decorated tree that is serialized.

A constraint is a condition that must be met in order for the low-level edits of
the command to be applied as-is. A constraint specifies the action to take if
the condition is not met; possible actions include re-executing the command,
flagging it for user review, requiring user intervention, or simply failing.
SharedTree records some implicit constraints; for example, all TreeNode anchors
must be resolvable to a node or a command will fail, and if any node the command
could have observed may have changed since the edit was recorded, the command
must be re-executed.

This representation records the complete call graph of commands resulting from
each user action. The various edits in this hierarchy serve different purposes:

- The **top-level** edit records the user’s intent (modulo anchor adjustment,
  which attempts to preserve that intent), and allows the command to be called
  again during a rebase operation to determine what the application would do
  under the new circumstances.

- The **lowest-level** edits can be called directly in order to mutate the state
  if migrating forwards. They are reversible, so their inverses can be applied
  to return to the state before the edit, during a backwards migration or
  rebase.

- The **mid-level** commands are more nuanced. Their identities may be used when
  specifying detached trees as input anchors. They may also mitigate code
  availability problems to some degree (these can arise due to out-of-order
  Undo/Redo operations or a client merging branches that include other users’
  edits), as a client lacking the code for a top-level edit may have the code
  for some of the mid-level commands, in which case the user will get
  considerably better conflict resolution, both automatic and with manual
  intervention. (Mid-level commands may be available because they are defined in
  widely-used libraries, or an older version of the same application.)

One potential concern with storing these descriptions of commands and the
commands they call is the possibility of redundancy between the stored
parameters at the various levels of the hierarchy. (There may be redundancy
between the anchors, too, but they are quite bounded in size.) The most obvious
potential problem is large create operations. Even a simple Paste operation is a
“higher-level edit” if the primitive operations are “create a detached
tree/range” and “insert tree/range”. These can easily be deduplicated by
requiring that the “tree descriptors” passed to commands that create trees are
immutable, in which case reference equality can be the cue to store a reference
to a shared parameter instead of a copy of the parameter itself. Detecting
“overlap” of parameters is more challenging, but can be implemented if this
becomes a problem in practice. Note that the history can be compacted in this
manner at a later time, during idle moments.

Another scenario where deduplication might prove useful is a large reversible
destroy. If a portion of a destroyed tree is similar to a tree that was created
earlier, that portion of the destroyed tree can be expressed as a reference to
the created tree, plus a Changeset if the two subtrees are not identical.
Similarly, a snapshot of the tree can share subtrees with create or destroy
edits in the history, both on disk and in memory. Again, detecting or tracking
some of these opportunities will be non-trivial.

With sufficient deduplication, the encoding of a mid-level or low-level edit
should be fairly inexpensive. But there are a few ways in which the size of an
edit may be reduced:

- If the Structural representation of a given Semantic edit is also readily
  available, there is no need to make the lowest-level edits reversible.

  - Furthermore, for any higher-level edit in the hierarchy whose command is
    known to be available in all clients (ever – this is quite a strong
    requirement), then there is no need to store its sub-edits, as it can always
    be replayed when rebasing. (Note that this command does not need to be
    deterministic. We can ensure that a single client is always responsible for
    the rebase of a non-deterministic command.) If a much weaker requirement is
    met, namely that all clients currently in a session can run a given command,
    then this can be quite a valuable trick to reduce bandwidth for commands
    that make substantial changes to the tree.

  - Also, a large create operation may share its parameter between the
    Structural and Semantic representations. However, this shared parameter may
    contain semantic information (invariant “discriminators” in the tree
    descriptor that allow a re-execution of the command to re-use more
    identities) that the Structural representation does not need. Also, such
    sharing may require the Structural representation to preserve more
    intermediate states than it otherwise would have.

- An application could bet that a given mid-level edit will never be useful in
  any rebase scenario, perhaps because its command is in the same library as the
  command that called it, in which case its sub-edits can be inlined into those
  of the calling edit.

## History

A branching history may be efficiently represented as a set of Branch data
structures, each comprising a header with metadata about the branch creation
event (or document creation for the initial branch), plus an append-only
sequence of Revisions (i.e. serialized edits plus metadata). Revisions may have
any number of child Branches, i.e. Branches whose Revisions succeed that parent
Revision.

This representation can be easily represented using the SharedTree data
structure itself.  There are several motivations for doing so:

- There is a single body of code to maintain for serialization/deserialization.

- It is easy for applications to present the history to the user, as it is just
  another SharedTree instance.

- Stable, globally unique identities are automatically (and efficiently)
  assigned to all elements in the history, including Revision roots,
  facilitating intra-history references (see above notes on deduplication) and
  allowing user bookmarks into the history.

- Leveraging the tree snapshot implementation, the history can be chunked on
  disk and over the network and loaded on-demand. The mechanisms for loading
  portions of a snapshot asynchronously (e.g. Placeholders) can be reused.

- Permissions can be assigned to portions of the history (likely entire
  branches) using the same mechanisms as for snapshots.

If the user deliberately squashes a portion of a branch between two revisions,
those Semantic edits are replaced with a (Structural) Changeset.

Note that with the lazy loading and sharing of subtrees between snapshots and
create edits, it is possible for the transmission to clients of large created
trees to be mostly deferred until they demand more of the nodes.

## Open Questions

1.	How is code availability efficiently determined for clients in a session?

    - Are extra network round-trips tolerated the first time commands are run?

    - Is the information volunteered when a client first joins?

    - Are commands grouped into versioned libraries?

    - Or is it some combination of the above?

2.	Should we record a “Command schema” (i.e. type signature) in the document as
   a versioning precaution? Note that it is possible to deduce a subset of the
   signature by inspecting edits in the document history.
