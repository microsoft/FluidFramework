---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Refactor detached changeset model

Introduces a new editing model at the rebaser layer (higher/public layers will be updated to leverage this new model in a separate change). The purpose of this new editing model is to support the following new kinds of edits:
* Editing a detached tree (without attaching it first)
* Attaching a detached tree (under some conditions)

This is in contrast to the current editing model where, once a tree is known to be removed (i.e., detached), it cannot be reinserted (i.e., reattached) except by reverting the commit that removed/detached it (which only the issuer of that commit can do) and it cannot be edited until it is reinserted.

The new editing model aims to greatly simplify some editing scenarios. For example, moving a node from A to B currently requires a one-step move operation that humans and LLMs alike tend to get wrong. The new editing model will make it possible to move the node by first detaching it from location A and re-attaching it at location B.

New persisted formats have been introduced at multiple layers, but this change does not yet enable them for writing in production environments. This change does not therefore make new format commitments.

The new formats can be used for testing through `SharedTreeOptions.enableDetachedRootEditing`.

This change is not intended to have breaking changes but is worthy of scrutiny since it changes how existing formats are encoded and decoded.
