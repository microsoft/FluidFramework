# Fluid Framework Compatibility Considerations

## Overview

Fluid Framework is a distributed system where multiple clients collaborate on shared documents in real-time. To understand why we need different types of compatibility, we must first recognize the two fundamental parts of the Fluid software:

1. **Code**: APIs (public and internal) and Behavior (or logic)
2. **Data**: Ops and Summaries (or snapshots)

The interaction between code and data, combined with Fluid's distributed architecture, creates four distinct dimensions of compatibility that must be carefully managed:

```mermaid
flowchart TD
    A[Code] --APIs--> B[Public APIs]
        B --API stability--> C[API compatibility]
    A --API/Behavior--> D[Layered architecture]
        D --Interactions between layers--> E[Layer compatibility]

    F[Data] --Ops--> G[Multi-client collaboration]
        G --Collaboration via ops--> J[Cross-client compatibility]
    F --Ops/Snapshots--> I[Persistence]
        I --Read saved files--> H[Data-at-rest compatibility]
```

### How Code and Data create Compatibility Dimensions

**From Code:**
- **API compatibility** arises because applications depend on public APIs that are released across versions (including alpha and beta APIs). Applications need a stable, predictable upgrade path as Fluid releases new package versions.
- **Layer compatibility** arises because Fluid's modular design consists of four distinct layers (Driver, Loader, Runtime, and Datastore), each of which can be versioned independently. These layers must interoperate at runtime even when they're at different versions. They interact by calling APIs (mostly internal) on other layers and the signatures and behavior of these APIs must be compatible.


**From Data:**
- **Data-at-rest compatibility** arises because documents (stored as summaries/snapshots) may be dormant for extended periods and then reopened by clients running newer versions of Fluid.
- **Cross-client compatibility** arises because multiple clients collaborating on the same document in real-time by exchanging ops may be running different versions of Fluid during rolling upgrades or version transitions.

This document defines and explains each compatibility type in detail, describing what it means, why it matters, and the scenarios it enables. Understanding these distinctions helps both Fluid Framework maintainers and application developers reason about version compatibility and upgrade strategies.

> **Note:** This document does not specify the policies around what version compatibility matrix and guarantees we provide — it focuses on defining the compatibility types themselves.

## API compatibility

API compatibility implies that we cannot break existing APIs within the supported set of versions. For example, if we were to say we support compatibility of public APIs where the major version matches, we can only break them when releasing a major version (with reasonable documentation) but we cannot break them in minor or patch releases.

### Motivation

Application developers need a clear, predictable upgrade path to newer Fluid versions. When API changes occur, documented and well-communicated breaking changes allow teams to plan and execute upgrades with confidence.

## Layer compatibility

Layer compatibility implies that a single client can have different versions for different compatibility layers we support - Driver, Loader, Runtime and Datastore. For example, Driver is v1.0, Loader is v2.0, Runtime is v3.0 and Datastore is v3.1 on the same client. The APIs at the boundaries of these layers have strict compatibility requirements at _runtime_ (distinct from API compatibility, which is about in-code dependencies), to support the full range of versions that may be calling them from another layer.

### Motivation

See [Fluid Framework Layer Compatibility](./LayerCompatibility.md) for motivation and other details about layer compatibility.


### Architecture diagram

```mermaid
graph TD
    subgraph Application
        Driver[Driver - version A]
        Loader[Loader - version B]
        subgraph Runtime[Runtime - version C]
            subgraph DataStore[DataStore - version D]
                DDSes[DDSes]
            end
        end
    end
    FFS[Fluid Service]

    Driver --> Loader
    Driver --> FFS
    Loader --> Runtime

    style Driver fill:#4472c4,stroke:#2f5496,color:#fff
    style Loader fill:#548235,stroke:#3d5c28,color:#fff
    style Runtime fill:#c55a11,stroke:#a04a0e,color:#fff
    style DataStore fill:#5b9bd5,stroke:#4a8bc4,color:#fff
    style DDSes fill:#5b9bd5,stroke:#2f5496,color:#fff,stroke-width:1px
    style FFS fill:#7030a0,stroke:#5a2680,color:#fff
```

This diagram shows different Fluid layers with different versions in a client:
- **Driver layer**: Fluid package version A.
- **Loader layer**: Fluid package version B.
- **Runtime layer**: Fluid package version C.
- **Datastore layer**: Fluid package version D.

## Cross-client compatibility

Cross-client compatibility implies that clients within a supported set of versions should be able to fully collaborate with each other. For example: say we support N / N-1 for cross-client compatibility. This means that there could be clients running runtime versions N and N-1 in the same collaboration session and they should be able to successfully read incoming changes while writing their own with confidence. What makes this different from data-at-rest compatibility promise is that lower-version clients can read content written by a higher-version collaborator, not just the other way around.

### Motivation

1. **Rolling upgrades**: During version upgrades, there is an unavoidable transition window when clients running different versions must coexist and collaborate. This compatibility ensures users can continue working together seamlessly, whether or not their application instance has been updated yet.

2. **Multi-application ecosystems**: Different applications with different deployment schedules may host the same Fluid content. In such ecosystems, all applications integrating Fluid-based experiences must coordinate to respect the cross-client compatibility window. This avoids requiring all applications to be on exactly the same version, which would be impractical.

### Architecture diagram

```mermaid
graph LR
    subgraph Client2[Client 2 - Newer Version B]
        Driver2[Driver]
        Loader2[Loader]
        subgraph Runtime2[Runtime]
            subgraph DataStore2[DataStore]
                DDSes2[DDSes]
            end
        end
    end

    subgraph Client1[Client 1 - Older Version A]
        Driver1[Driver]
        Loader1[Loader]
        subgraph Runtime1[Runtime]
            subgraph DataStore1[Datastore]
                DDSes1[DDSes]
            end
        end
    end

    FFS[Fluid Service]

    Driver1 --> Loader1
    Loader1 --> Runtime1

    Driver2 --> Loader2
    Loader2 --> Runtime2

    Client1 --A ops--> FFS
    Client2 --B ops--> FFS
    FFS --A+B ops--> Client1
    FFS --A+B ops--> Client2

    style Driver1 fill:#4472c4,stroke:#2f5496,color:#fff
    style Loader1 fill:#548235,stroke:#3d5c28,color:#fff
    style Runtime1 fill:#c55a11,stroke:#a04a0e,color:#fff
    style DataStore1 fill:#5b9bd5,stroke:#4a8bc4,color:#fff
    style DDSes1 fill:#5b9bd5,stroke:#4a8bc4,color:#fff,stroke-width:1px

    style Driver2 fill:#4472c4,stroke:#2f5496,color:#fff
    style Loader2 fill:#548235,stroke:#3d5c28,color:#fff
    style Runtime2 fill:#c55a11,stroke:#a04a0e,color:#fff
    style DataStore2 fill:#5b9bd5,stroke:#4a8bc4,color:#fff
    style DDSes2 fill:#5b9bd5,stroke:#4a8bc4,color:#fff,stroke-width:1px

    style FFS fill:#7030a0,stroke:#5a2680,color:#fff
```

This diagram shows two clients collaborating on the same document:
- **Client 1** runs Fluid package version A (older version)
- **Client 2** runs Fluid package version B (newer version)
- Both clients communicate through the **Fluid Service**
- Cross-client compatibility ensures these different versions can successfully collaborate (read and write) on the same document.
- For example, client 1 sends version A ops to client 2 that it must understand and vice-versa. This means that client 2 (being the newer client) must not write an op in format that client 1 cannot read. Also, client 2 must not update its op read logic such that it cannot read client 1's ops.

### Interaction with Layer Compatibility

Note that each client here may have a different set of versions on each layer.  Cross-client compatibility actually applies between like layers. So the version of each layer must satisfy layer-compat requirements with the other layers on that client, _and_ cross-client compat requirements with the other clients that may join the collaboration session.

## Data-at-rest compatibility

Data-at-rest compatibility implies that all Fluid data (ops and summaries under the hood) generated by a client must be readable by a client running another supported version. For example, if we say that FF data is readable forever by all subsequent clients, that a client running the latest Fluid version must be able to load documents created by v1.0 and so on.

### Motivation

Applications need to open documents that have been dormant for extended periods without requiring explicit data conversions or loading through intermediate versions. Such limitations create significant friction for application developers and end users who expect seamless access to their historical documents.
