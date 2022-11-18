# Node Identifiers

## Overview

Node Identifiers are "references" or "handles" to nodes in the tree.

### Are Paths Identifiers

A node's identifier is related to, but not the same thing as, the path to that node in the tree. A path points to a location within a tree, but it does not necessarily capture any semantic meaning about the identity of the node it points to. Consider a node A which is deleted, and then consider a node B which is inserted in the same place. Node A and Node B have the same path (although they are in different revisions) but they are not the same node; they should therefore not share the same identifier. Likewise, consider a node A which is moved from location X to location Y in the tree. Node A has a different path after the move than it did before, but it is the "same node"; it should have the same identifier in both locations.
