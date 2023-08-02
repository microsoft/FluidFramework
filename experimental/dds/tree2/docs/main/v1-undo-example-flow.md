# V1 Undo Example Flow

**Legend**:

```mermaid
flowchart
    remote{{Denotes commits by a remote session}}
    local[Denotes commits by the local session]
```

This example starts with a trunk and single local branch with a few normal commits and a single undo commit.
The [undo commit tree](./v1-undo.md#the-undo-commit-tree) contains `A1` and `B2`.
The head undo commit for the trunk branch is `A1` because it is the latest edit from the local session (and has not been undone).
`B2` is the head undo commit for the local branch.
There is nothing in the [redo commit tree](./v1-undo.md#the-redo-commit-tree) because a normal edit, `B2`, clears the redo-able edits.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    TrunkRH[Trunk]:::trunk -.-> NullR(( ))
    LocalRH[Local]:::local-.->NullR
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->B2U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    Trunk:::trunk-.->A3
    Local:::local-.->B2
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

[Forking a branch](./v1-undo.md#forking) from the local branch creates a child branch that is initialized with the same commit pointers.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    TrunkRH[Trunk]:::trunk -.-> NullR(( ))
    LocalRH[Local]:::local-.->NullR
    ChildRH[Child]:::child-.->NullR
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->B2U
    ChildUH[Child]:::child-.->B2U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    Trunk:::trunk-.->A3
    Local:::local-.->B2
    Child:::child-.->B2
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

Adding a normal (i.e., non-undo, non-redo) commit, `C1`, to the child branch also adds it to the [undo commit tree](./v1-undo.md#the-undo-commit-tree) and moves the child branch's head undo commit pointer to `C1`. See [reacting to local edits](./v1-undo.md#reacting-to-local-edits) for a description of how edits affect the separate trees.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    TrunkRH[Trunk]:::trunk -.-> NullR(( ))
    LocalRH[Local]:::local-.->NullR
    ChildRH[Child]:::child-.->NullR
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    C1U[C1]-->B2U
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->B2U
    ChildUH[Child]:::child-.->C1U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    C1-->B2
    Trunk:::trunk-.->A3
    Local:::local-.->B2
    Child:::child-.->C1
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

Adding a commit that undoes `C1` to the child branch will remove `C1` from the [undo commit tree](./v1-undo.md#the-undo-commit-tree) and add the undo commit, `C2`, to the redo tree.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    NullR(( ))
    C2U[C2]-->NullR
    TrunkRH[Trunk]:::trunk -.-> NullR
    LocalRH[Local]:::local-.->NullR
    ChildRH[Child]:::child-.->C2U
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->B2U
    ChildUH[Child]:::child-.->B2U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    C1-->B2
    C2[C2: Undoes C1]-->C1
    Trunk:::trunk-.->A3
    Local:::local-.->B2
    Child:::child-.->C2
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

Adding a commit that undoes `B2` to the local branch will move the local branch's undo head pointer to the null pointer to indicate there is nothing to undo and add the undo commit, `B3`, to the redo tree.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    NullR(( ))
    C2U[C2]-->NullR
    B3U[B3]-->NullR
    TrunkRH[Trunk]:::trunk -.-> NullR
    LocalRH[Local]:::local-.->B3U
    ChildRH[Child]:::child-.->C2U
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->NullU
    ChildUH[Child]:::child-.->B2U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    B3[B3: Undoes B2]-->B2
    C1-->B2
    C2[C2: Undoes C1]-->C1
    Trunk:::trunk-.->A3
    Local:::local-.->B3
    Child:::child-.->C2
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

Adding a commit that redoes `C1` (aka undoes `C2`) to the child branch will remove `C2` from the [redo commit tree](./v1-undo.md#the-redo-commit-tree) and add the redo commit, `C3`, to the redo tree.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    NullR(( ))
    B3U[B3]-->NullR
    TrunkRH[Trunk]:::trunk -.-> NullR
    LocalRH[Local]:::local-.->B3U
    ChildRH[Child]:::child-.->NullR
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    B2U[B2]-->NullU
    C3U[C3]-->B2U
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->NullU
    ChildUH[Child]:::child-.->C3U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    B3[B3: Undoes B2]-->B2
    C1-->B2
    C2[C2: Undoes C1]-->C1
    C3[C3: Redoes C1 aka Undoes C2]-->C2
    Trunk:::trunk-.->A3
    Local:::local-.->B3
    Child:::child-.->C3
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```

[Pulling](./v1-undo.md#pulling) the local branch into the child branch removes `B2` from the [undo commit tree](./v1-undo.md#the-undo-commit-tree) since it gets undone by `B3`.

```mermaid
flowchart TB
    subgraph Redo Commit Tree
    direction BT
    NullR(( ))
    B3U[B3]-->NullR
    TrunkRH[Trunk]:::trunk -.-> NullR
    LocalRH[Local]:::local-.->B3U
    ChildRH[Child]:::child-.->NullR
    end
    subgraph Undo Commit Tree
    direction BT
    NullU(( ))
    A1U[A1]-->NullU
    C3U[C3]-->NullU
    TrunkUH[Trunk]:::trunk-.->A1U
    LocalUH[Local]:::local-.->NullU
    ChildUH[Child]:::child-.->C3U
    end
    subgraph Edits
    direction BT
    A2{{A2}}-->A1
    A3{{A3}}-->A2
    B1[B1: Undoes A1]-->A2
    B2-->B1
    B3[B3: Undoes B2]-->B2
    C1-->B3
    C2[C2: Undoes C1]-->C1
    C3[C3: Redoes C1 aka Undoes C2]-->C2
    Trunk:::trunk-.->A3
    Local:::local-.->B3
    Child:::child-.->C3
    end
    classDef trunk fill:#fe6d73;
    classDef local fill:#339989;
    classDef child fill:#227c9d;
```
