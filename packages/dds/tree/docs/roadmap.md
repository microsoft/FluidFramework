# SharedTree DDS Roadmap

This document tracks the delivery of a new Fluid DDS for efficiently modeling tree structured data, such as JSON and XML. See the [tree readme](../README.md) for a high-level description of the DDS and the goals of the project.

## Milestones

### M0: Concurrent design work for M1 deliverables

By convention, design deliverables are listed in the milestone preceding the dependent implementation work items. Therefore, we've informally introduced M0 to track M1's design dependencies, even though execution on M0 and M1 are happening concurrently.

#### Deliverables

-   [Merge/rebase design](https://github.com/microsoft/FluidFramework/issues/9658)
-   [Data model design](../docs/data-model/README.md)

### M1: Basic Data Synchronization

M1 enables early adopters to begin using SharedTree for transient data synchronization scenarios. The op and storage formats will not yet be finalized and no data migration path will be provided. However, the basic Insert/Delete/Modify operations will be sufficiently robust to preview with non-persistent Fluid sessions.

At this stage, the designs for slices, move and durable Ids are understood, but may not yet be fully implemented. Undo/Redo may at this point not be integrated into the DDS.

#### Requirements:

-   Construct a changeset comprised of insert, delete, and modify operations
-   Commit a changeset to the local tree
-   Observe changes committed by local and remote clients

#### Deliverables

-   Changeset (operations)
    -   Insert new subtrees
    -   Modify node values
    -   Delete set ranges
    -   Builder (Accumulation)
    -   Reader / Writer (Serialization)
-   Rebase
    -   Insert / Delete / Modify
    -   Squash (if sandwich, else MT)
-   In-memory representation
    -   Apply changeset
    -   Serialize to changeset
-   DDS
    -   Collab window management
    -   Rebase management
    -   Change notification
    -   Summarization (esp. attach workflow for perf)
-   Design
    -   Move, Slice and Ids are understood
    -   Forward compatible summarization & op formats
    -   Understanding of where "lossy" squashes fit into roadmap
    -   JSON API

### M1.5: JSON Editing

M1.5 enables users to collaboratively edit JSONish[^1] data using the SharedTree. M1.5 happens concurrently with the end of M1 and beginning of M2.

JSONish editing is exposed through a specialized API layer that ensures that tree edits are constrained to the JSONish domain. The underlying types and constraints used to implement this are hard coded. Support for custom schemas is planned for a future milestone.

[^1]: JSONish is a pragmatic interpretation of the JSON spec with respect to the JS type system. It includes objects, arrays, strings, float64, bool, and null.

#### Requirements

-   JSONish data losslessly round-trips to/from SharedTree
-   Edits are constrained to JSONish domain

#### Deliverables

-   Bijective mapping between SharedTree data model and JSONish
-   JSON types:
    -   map: object
    -   seq: array and string
    -   scalar: number (as F64), bool, null
-   Schema enforcement
-   API
    -   Reified nodes
    -   property: get/set
    -   array/string: insert/remove set/slice

### M2: SharedTree MVP

M2 enables general use of SharedTree in persistent Fluid sessions for moderately sized trees of maps and sequences. It also delivers performance and size improvements based on real-world data gathered from early adopters, especially focusing on those that impact the persisted ops and summary formats.

Public APIs are still subject to change, but the tree data model will have settled and code can be mechanically migrated to future versions.

Tree size continues to be limited by client memory and bandwidth. Move and durable Ids are robust, and the operation and summary formats are finalized at v1. The tree may not yet be suitable for editing of high-density data, such as strings and numeric arrays.

#### Requirements

-   Application code can be mechanically migrated to future versions of SharedTree w/o data migration.
-   Atomically delete a slice range of nodes.
-   Atomically move a set/slice of nodes to a new location in the tree preserving their identity
-   Durable unique IDs per node, suitable for permalinks, etc.
-   Integrated Undo/Redo

#### Deliverables

-   Changeset:
    -   Move set
    -   Move slice
    -   Delete slice
    -   Invert
    -   Perf / size improvements
        -   Squash (also req. to cancel changes if using sandwich rebase)
-   Rebase:
    -   Move set
    -   Move slice
    -   Delete slice
-   In-memory representation:
    -   Id <-> node map
-   DDS
    -   Look up node by id
    -   Id management
    -   Undo management
    -   A stable data model API
-   Runtime
    -   Id compression
-   Design
    -   Summary and constraints are understood

### M3: Schema and Constraints

M3 helps developers tame the complexity of their applications by introducing schemas and constraints that reduce the number of incoherent data states that can arise from concurrent edits.

Schemas declaratively state what must be true before and after each operation. Constraints declaratively state what must remain true during the interval between when the client created the edit to when it is sequenced.

In both cases, a conflict prevents the operation from being applied, resulting in remote clients discarding the edit and the local client reverting it and notifying the application.

#### Requirements

-   Declarative schema language
-   Supported constraints:
    -   Subtree unchanged
    -   Input/output types

#### Deliverables

-   Changeset:
    -   Encode constraints
    -   Encode type info
    -   Encode semantic info (hierarchical edits)
-   Constraints
    -   'Subtree unchanged'
-   Schema
    -   Parser
    -   Repository
-   DDS
    -   Conflict management
        -   Detection
        -   Revert
        -   Handler

### M4+: API and Modeling

M4 expands the audience for SharedTree by introducing higher level abstractions.

### M5+: History and Branching

M5 enables applications to create and merge branches from arbitrary points in history.

### M6+: Partial Checkout

M6 enables a SharedTree to scale beyond the memory and bandwith constraints of the client though partial views of the tree.

### M7+: Non-fluid clients (e.g., GraphQL, Open API, etc.)

M7 provides services APIs for isolated reads and writes of the chunked tree storage. This makes it convenient to implement providers for GraphQL, Open API, and other REST-like APIs for non-Fluid clients to access the underlying data.

### M8+: Indexed queries

M8 adds service-side support for building and maintaining indices into the tree data.

### M9+: Fine-grained access control

M9 provides mechanisms for restricting access to subsets of the tree data.
