{
  "title": "@fluid-experimental/tree Package",
  "summary": "Fluid DDS storing a tree.",
  "kind": "Package",
  "members": {
    "TypeAlias": {
      "AttributionId": "/docs/apis/tree#attributionid-typealias",
      "BadPlaceValidationResult": "/docs/apis/tree#badplacevalidationresult-typealias",
      "BadRangeValidationResult": "/docs/apis/tree#badrangevalidationresult-typealias",
      "BuildNode": "/docs/apis/tree#buildnode-typealias",
      "BuildNodeInternal_0_0_2": "/docs/apis/tree#buildnodeinternal_0_0_2-typealias",
      "BuildNodeInternal": "/docs/apis/tree#buildnodeinternal-typealias",
      "Change": "/docs/apis/tree#change-typealias",
      "ChangeInternal": "/docs/apis/tree#changeinternal-typealias",
      "ChangeNode_0_0_2": "/docs/apis/tree#changenode_0_0_2-typealias",
      "CompressedId": "/docs/apis/tree#compressedid-typealias",
      "Definition": "/docs/apis/tree#definition-typealias",
      "DetachedSequenceId": "/docs/apis/tree#detachedsequenceid-typealias",
      "EditApplicationOutcome": "/docs/apis/tree#editapplicationoutcome-typealias",
      "EditCommittedHandler": "/docs/apis/tree#editcommittedhandler-typealias",
      "EditId": "/docs/apis/tree#editid-typealias",
      "FinalCompressedId": "/docs/apis/tree#finalcompressedid-typealias",
      "LocalCompressedId": "/docs/apis/tree#localcompressedid-typealias",
      "NodeId": "/docs/apis/tree#nodeid-typealias",
      "Payload": "/docs/apis/tree#payload-typealias",
      "PlaceIndex": "/docs/apis/tree#placeindex-typealias",
      "RangeValidationResult": "/docs/apis/tree#rangevalidationresult-typealias",
      "Revision": "/docs/apis/tree#revision-typealias",
      "SequencedEditAppliedHandler": "/docs/apis/tree#sequencededitappliedhandler-typealias",
      "SessionSpaceCompressedId": "/docs/apis/tree#sessionspacecompressedid-typealias",
      "SharedTreeArgs": "/docs/apis/tree#sharedtreeargs-typealias",
      "SharedTreeOptions": "/docs/apis/tree#sharedtreeoptions-typealias",
      "StableNodeId": "/docs/apis/tree#stablenodeid-typealias",
      "TraitLabel": "/docs/apis/tree#traitlabel-typealias",
      "TraitNodeIndex": "/docs/apis/tree#traitnodeindex-typealias",
      "TreeNodeSequence": "/docs/apis/tree#treenodesequence-typealias",
      "UuidString": "/docs/apis/tree#uuidstring-typealias"
    },
    "Interface": {
      "Build": "/docs/apis/tree/build-interface",
      "BuildInternal_0_0_2": "/docs/apis/tree/buildinternal_0_0_2-interface",
      "BuildInternal": "/docs/apis/tree/buildinternal-interface",
      "BuildTreeNode": "/docs/apis/tree/buildtreenode-interface",
      "Constraint": "/docs/apis/tree/constraint-interface",
      "ConstraintInternal_0_0_2": "/docs/apis/tree/constraintinternal_0_0_2-interface",
      "ConstraintInternal": "/docs/apis/tree/constraintinternal-interface",
      "Delta": "/docs/apis/tree/delta-interface",
      "Detach": "/docs/apis/tree/detach-interface",
      "DetachInternal_0_0_2": "/docs/apis/tree/detachinternal_0_0_2-interface",
      "DetachInternal": "/docs/apis/tree/detachinternal-interface",
      "Edit": "/docs/apis/tree/edit-interface",
      "EditBase": "/docs/apis/tree/editbase-interface",
      "EditCommittedEventArguments": "/docs/apis/tree/editcommittedeventarguments-interface",
      "EditingResultBase": "/docs/apis/tree/editingresultbase-interface",
      "ForestNode": "/docs/apis/tree/forestnode-interface",
      "HasTraits": "/docs/apis/tree/hastraits-interface",
      "HasVariadicTraits": "/docs/apis/tree/hasvariadictraits-interface",
      "ICheckoutEvents": "/docs/apis/tree/icheckoutevents-interface",
      "Insert": "/docs/apis/tree/insert-interface",
      "InsertInternal_0_0_2": "/docs/apis/tree/insertinternal_0_0_2-interface",
      "InsertInternal": "/docs/apis/tree/insertinternal-interface",
      "InternalizedChange": "/docs/apis/tree/internalizedchange-interface",
      "ISharedTreeEvents": "/docs/apis/tree/isharedtreeevents-interface",
      "LogViewer": "/docs/apis/tree/logviewer-interface",
      "NodeData": "/docs/apis/tree/nodedata-interface",
      "NodeIdBrand": "/docs/apis/tree/nodeidbrand-interface",
      "NodeIdContext": "/docs/apis/tree/nodeidcontext-interface",
      "NodeIdConverter": "/docs/apis/tree/nodeidconverter-interface",
      "NodeIdGenerator": "/docs/apis/tree/nodeidgenerator-interface",
      "OrderedEditSet": "/docs/apis/tree/orderededitset-interface",
      "ParentData": "/docs/apis/tree/parentdata-interface",
      "ReconciliationChange": "/docs/apis/tree/reconciliationchange-interface",
      "ReconciliationEdit": "/docs/apis/tree/reconciliationedit-interface",
      "ReconciliationPath": "/docs/apis/tree/reconciliationpath-interface",
      "SequencedEditAppliedEventArguments": "/docs/apis/tree/sequencededitappliedeventarguments-interface",
      "SessionUnique": "/docs/apis/tree/sessionunique-interface",
      "SetValue": "/docs/apis/tree/setvalue-interface",
      "SetValueInternal_0_0_2": "/docs/apis/tree/setvalueinternal_0_0_2-interface",
      "SetValueInternal": "/docs/apis/tree/setvalueinternal-interface",
      "SharedTreeBaseOptions": "/docs/apis/tree/sharedtreebaseoptions-interface",
      "SharedTreeOptions_0_0_2": "/docs/apis/tree/sharedtreeoptions_0_0_2-interface",
      "SharedTreeOptions_0_1_1": "/docs/apis/tree/sharedtreeoptions_0_1_1-interface",
      "SharedTreeSummaryBase": "/docs/apis/tree/sharedtreesummarybase-interface",
      "StablePlace": "/docs/apis/tree/stableplace-interface",
      "StablePlaceInternal_0_0_2": "/docs/apis/tree/stableplaceinternal_0_0_2-interface",
      "StablePlaceInternal": "/docs/apis/tree/stableplaceinternal-interface",
      "StableRange": "/docs/apis/tree/stablerange-interface",
      "StableRangeInternal_0_0_2": "/docs/apis/tree/stablerangeinternal_0_0_2-interface",
      "StableRangeInternal": "/docs/apis/tree/stablerangeinternal-interface",
      "StashedLocalOpMetadata": "/docs/apis/tree/stashedlocalopmetadata-interface",
      "SucceedingTransactionState": "/docs/apis/tree/succeedingtransactionstate-interface",
      "TraitLocation": "/docs/apis/tree/traitlocation-interface",
      "TraitLocationInternal_0_0_2": "/docs/apis/tree/traitlocationinternal_0_0_2-interface",
      "TraitLocationInternal": "/docs/apis/tree/traitlocationinternal-interface",
      "TraitMap": "/docs/apis/tree/traitmap-interface",
      "TransactionEvents": "/docs/apis/tree/transactionevents-interface",
      "TreeNode": "/docs/apis/tree/treenode-interface",
      "TreeViewNode": "/docs/apis/tree/treeviewnode-interface",
      "TreeViewPlace": "/docs/apis/tree/treeviewplace-interface",
      "TreeViewRange": "/docs/apis/tree/treeviewrange-interface",
      "ValidEditingResult": "/docs/apis/tree/valideditingresult-interface"
    },
    "Variable": {
      "Change": "/docs/apis/tree#change-variable",
      "ChangeInternal": "/docs/apis/tree#changeinternal-variable",
      "initialTree": "/docs/apis/tree#initialtree-variable",
      "StablePlace": "/docs/apis/tree#stableplace-variable",
      "StablePlaceInternal": "/docs/apis/tree#stableplaceinternal-variable",
      "StableRange": "/docs/apis/tree#stablerange-variable",
      "StableRangeInternal": "/docs/apis/tree#stablerangeinternal-variable"
    },
    "Enum": {
      "ChangeType": "/docs/apis/tree/changetype-enum",
      "ChangeTypeInternal": "/docs/apis/tree/changetypeinternal-enum",
      "CheckoutEvent": "/docs/apis/tree/checkoutevent-enum",
      "ConstraintEffect": "/docs/apis/tree/constrainteffect-enum",
      "EditStatus": "/docs/apis/tree/editstatus-enum",
      "EditValidationResult": "/docs/apis/tree/editvalidationresult-enum",
      "PlaceValidationResult": "/docs/apis/tree/placevalidationresult-enum",
      "RangeValidationResultKind": "/docs/apis/tree/rangevalidationresultkind-enum",
      "SharedTreeEvent": "/docs/apis/tree/sharedtreeevent-enum",
      "Side": "/docs/apis/tree/side-enum",
      "TransactionEvent": "/docs/apis/tree/transactionevent-enum",
      "WriteFormat": "/docs/apis/tree/writeformat-enum"
    },
    "Class": {
      "Checkout": "/docs/apis/tree/checkout-class",
      "EagerCheckout": "/docs/apis/tree/eagercheckout-class",
      "Forest": "/docs/apis/tree/forest-class",
      "RevisionView": "/docs/apis/tree/revisionview-class",
      "SharedTree": "/docs/apis/tree/sharedtree-class",
      "SharedTreeFactory": "/docs/apis/tree/sharedtreefactory-class",
      "Transaction": "/docs/apis/tree/transaction-class",
      "TransactionView": "/docs/apis/tree/transactionview-class",
      "TreeView": "/docs/apis/tree/treeview-class"
    },
    "Function": {
      "comparePayloads": "/docs/apis/tree#comparepayloads-function"
    },
    "Namespace": {
      "TransactionInternal": "/docs/apis/tree/transactioninternal-namespace"
    }
  },
  "package": "@fluid-experimental/tree",
  "unscopedPackageName": "tree"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

Fluid DDS storing a tree.

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Interface
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree/build-interface'>Build</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes. Does not modify the document.
        </p>
        <p>
          Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination), and all Nodes' identifiers are previously unused.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/buildinternal_0_0_2-interface'>BuildInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes. Does not modify the document.
        </p>
        <p>
          Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination), and all Nodes' identifiers are previously unused.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/buildinternal-interface'>BuildInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes. Does not modify the document.
        </p>
        <p>
          Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination), and all Nodes' identifiers are previously unused.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/buildtreenode-interface'>BuildTreeNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Node for use in a Build change, which is composed of a definition describing what this nodes type, an identifier identifying this node within the tree, and a payload containing an opaque serializable piece of data. An identifier can be provided explicitly if the node must be referred to before the results of the <code>Change</code> containing this BuildTreeNode can be observed. If <code>identifier</code> is not supplied, one will be generated for it in an especially efficient manner that allows for compact storage and transmission and thus this property should be omitted if convenient. See the SharedTree readme for more on the tree format.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/constraint-interface'>Constraint</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A set of constraints on the validity of an Edit. A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing). Does not modify the document.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/constraintinternal_0_0_2-interface'>ConstraintInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A set of constraints on the validity of an Edit. A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing). Does not modify the document.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/constraintinternal-interface'>ConstraintInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A set of constraints on the validity of an Edit. A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing). Does not modify the document.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/delta-interface'>Delta</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Differences from one forest to another.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/detach-interface'>Detach</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Removes a sequence of nodes from the tree. If a destination is specified, the detached sequence is associated with that ID and held for possible reuse by later changes in this same Edit (such as by an Insert). A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/detachinternal_0_0_2-interface'>DetachInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Removes a sequence of nodes from the tree. If a destination is specified, the detached sequence is associated with that ID and held for possible reuse by later changes in this same Edit (such as by an Insert). A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/detachinternal-interface'>DetachInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Removes a sequence of nodes from the tree. If a destination is specified, the detached sequence is associated with that ID and held for possible reuse by later changes in this same Edit (such as by an Insert). A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/edit-interface'>Edit</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A collection of changes to the tree that are applied atomically along with a unique identifier for the edit. If any individual change fails to apply, the entire Edit will fail to apply.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/editbase-interface'>EditBase</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The information included in an edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/editcommittedeventarguments-interface'>EditCommittedEventArguments</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The arguments included when the EditCommitted SharedTreeEvent is emitted.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/editingresultbase-interface'>EditingResultBase</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Basic result of applying a transaction.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/forestnode-interface'>ForestNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A node that can be contained within a Forest
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/hastraits-interface'>HasTraits</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An object which may have traits with children of the given type underneath it
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/hasvariadictraits-interface'>HasVariadicTraits</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An object which may have traits with children of the given type underneath it
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/icheckoutevents-interface'>ICheckoutEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Events which may be emitted by <code>Checkout</code>. See <a href='/docs/apis/tree/checkoutevent-enum'>CheckoutEvent</a> for documentation of event semantics.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/insert-interface'>Insert</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Inserts a sequence of nodes at the specified destination. The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a &quot;move&quot; operation).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/insertinternal_0_0_2-interface'>InsertInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Inserts a sequence of nodes at the specified destination. The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a &quot;move&quot; operation).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/insertinternal-interface'>InsertInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Inserts a sequence of nodes at the specified destination. The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a &quot;move&quot; operation).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/internalizedchange-interface'>InternalizedChange</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        This type should be used as an opaque handle in the public API for <code>ChangeInternal</code> objects. This is useful for supporting public APIs which involve working with a tree's edit history, which will involve changes that have already been internalized.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/isharedtreeevents-interface'>ISharedTreeEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Events which may be emitted by <code>SharedTree</code>. See <a href='/docs/apis/tree/sharedtreeevent-enum'>SharedTreeEvent</a> for documentation of event semantics.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/logviewer-interface'>LogViewer</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Creates <code>RevisionView</code>s for the revisions in an <code>EditLog</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/nodedata-interface'>NodeData</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The fields required by a node in a tree
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/nodeidbrand-interface'>NodeIdBrand</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/nodeidcontext-interface'>NodeIdContext</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An object which can generate node IDs and convert node IDs between compressed and stable variants
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/nodeidconverter-interface'>NodeIdConverter</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An object which can convert node IDs between compressed and stable variants
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/nodeidgenerator-interface'>NodeIdGenerator</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An object which can generate node IDs
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/orderededitset-interface'>OrderedEditSet</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>sealed</code>
      </td>
      <td>
        An ordered set of Edits associated with a SharedTree. Supports fast lookup of edits by ID and enforces idempotence.
        <br>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/parentdata-interface'>ParentData</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Information about a ForestNode's parent
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/reconciliationchange-interface'>ReconciliationChange</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A change in the <code>ReconciliationPath</code>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/reconciliationedit-interface'>ReconciliationEdit</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An edit in the <code>ReconciliationPath</code>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/reconciliationpath-interface'>ReconciliationPath</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The path of edits from the revision view where a change was meant to have been applied to the view where the edit that contains the change is actually applied. The path only contains edits that were successfully applied. This path is always empty for a change that has no concurrent edits.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sequencededitappliedeventarguments-interface'>SequencedEditAppliedEventArguments</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The arguments included when the <a href='/docs/apis/tree/sharedtreeevent-enum#sequencededitapplied-enummember'>SequencedEditApplied</a> SharedTreeEvent is emitted.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sessionunique-interface'>SessionUnique</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A brand for identity types that are unique within a particular session (SharedTree instance).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/setvalue-interface'>SetValue</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Modifies the payload of a node.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/setvalueinternal_0_0_2-interface'>SetValueInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Modifies the payload of a node.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/setvalueinternal-interface'>SetValueInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Modifies the payload of a node.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreebaseoptions-interface'>SharedTreeBaseOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Configuration options for SharedTree that are independent of write format versions.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreeoptions_0_0_2-interface'>SharedTreeOptions_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Configuration options for a SharedTree with write format 0.0.2
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreeoptions_0_1_1-interface'>SharedTreeOptions_0_1_1</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Configuration options for a SharedTree with write format 0.1.1
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreesummarybase-interface'>SharedTreeSummaryBase</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The minimal information on a SharedTree summary. Contains the summary format version.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stableplace-interface'>StablePlace</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          A location in a trait. This is NOT the location of a node, but a location where a node could be inserted: it is next to a sibling or at one end of the trait.
        </p>
        <p>
          To be well formed, either <code>sibling</code> or <code>trait</code> must be defined, but not both.
        </p>
        <p>
          Any given insertion location can be described by two <code>StablePlace</code> objects, one with <code>Side.After</code> and one with <code>Side.Before</code>. For example, in a trait containing two strings &quot;foo&quot; and &quot;bar&quot;, there are 6 different <code>StablePlace</code>s corresponding to 3 locations in the trait a new node could be inserted: at the start, before &quot;foo&quot;, after &quot;foo&quot;, before &quot;bar&quot;, after &quot;bar&quot;, and at the end. Neither of the two ways to specify the same location are considered to be after each other.
        </p>
        <p>
          The anchor (<code>referenceSibling</code> or <code>referenceTrait</code>) used for a particular <code>StablePlace</code> can have an impact in collaborative scenarios.
        </p>
        <p>
          <code>StablePlace</code> objects can be conveniently constructed with the helper methods exported on a constant of the same name.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stableplaceinternal_0_0_2-interface'>StablePlaceInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          A location in a trait. This is NOT the location of a node, but a location where a node could be inserted: it is next to a sibling or at one end of the trait.
        </p>
        <p>
          To be well formed, either <code>sibling</code> or <code>trait</code> must be defined, but not both.
        </p>
        <p>
          Any given insertion location can be described by two <code>StablePlace</code> objects, one with <code>Side.After</code> and one with <code>Side.Before</code>. For example, in a trait containing two strings &quot;foo&quot; and &quot;bar&quot;, there are 6 different <code>StablePlace</code>s corresponding to 3 locations in the trait a new node could be inserted: at the start, before &quot;foo&quot;, after &quot;foo&quot;, before &quot;bar&quot;, after &quot;bar&quot;, and at the end. Neither of the two ways to specify the same location are considered to be after each other.
        </p>
        <p>
          The anchor (<code>referenceSibling</code> or <code>referenceTrait</code>) used for a particular <code>StablePlace</code> can have an impact in collaborative scenarios.
        </p>
        <p>
          <code>StablePlace</code> objects can be conveniently constructed with the helper methods exported on a constant of the same name.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stableplaceinternal-interface'>StablePlaceInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          A location in a trait. This is NOT the location of a node, but a location where a node could be inserted: it is next to a sibling or at one end of the trait.
        </p>
        <p>
          To be well formed, either <code>sibling</code> or <code>trait</code> must be defined, but not both.
        </p>
        <p>
          Any given insertion location can be described by two <code>StablePlace</code> objects, one with <code>Side.After</code> and one with <code>Side.Before</code>. For example, in a trait containing two strings &quot;foo&quot; and &quot;bar&quot;, there are 6 different <code>StablePlace</code>s corresponding to 3 locations in the trait a new node could be inserted: at the start, before &quot;foo&quot;, after &quot;foo&quot;, before &quot;bar&quot;, after &quot;bar&quot;, and at the end. Neither of the two ways to specify the same location are considered to be after each other.
        </p>
        <p>
          The anchor (<code>referenceSibling</code> or <code>referenceTrait</code>) used for a particular <code>StablePlace</code> can have an impact in collaborative scenarios.
        </p>
        <p>
          <code>StablePlace</code> objects can be conveniently constructed with the helper methods exported on a constant of the same name.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stablerange-interface'>StableRange</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Specifies the range of nodes from <code>start</code> to <code>end</code> within a trait. Valid iff start and end are valid and are within the same trait and the start does not occur after the end in the trait.
        </p>
        <p>
          See <a href='/docs/apis/tree/stableplace-interface'>StablePlace</a> for what it means for a place to be &quot;after&quot; another place.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stablerangeinternal_0_0_2-interface'>StableRangeInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Specifies the range of nodes from <code>start</code> to <code>end</code> within a trait. Valid iff start and end are valid and are within the same trait and the start does not occur after the end in the trait.
        </p>
        <p>
          See <a href='/docs/apis/tree/stableplace-interface'>StablePlace</a> for what it means for a place to be &quot;after&quot; another place.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stablerangeinternal-interface'>StableRangeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Specifies the range of nodes from <code>start</code> to <code>end</code> within a trait. Valid iff start and end are valid and are within the same trait and the start does not occur after the end in the trait.
        </p>
        <p>
          See <a href='/docs/apis/tree/stableplace-interface'>StablePlace</a> for what it means for a place to be &quot;after&quot; another place.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/stashedlocalopmetadata-interface'>StashedLocalOpMetadata</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Contains information resulting from processing stashed shared tree ops
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/succeedingtransactionstate-interface'>SucceedingTransactionState</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        The state of a transaction that has not encountered an error.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/traitlocation-interface'>TraitLocation</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Specifies the location of a trait (a labeled sequence of nodes) within the tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/traitlocationinternal_0_0_2-interface'>TraitLocationInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Specifies the location of a trait (a labeled sequence of nodes) within the tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/traitlocationinternal-interface'>TraitLocationInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Specifies the location of a trait (a labeled sequence of nodes) within the tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/traitmap-interface'>TraitMap</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Json compatible map as object. Keys are TraitLabels, Values are the content of the trait specified by the key.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/transactionevents-interface'>TransactionEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Events which may be emitted by <code>Transaction</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/treenode-interface'>TreeNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Satisfies <code>NodeData</code> and may contain children under traits (which may or may not be <code>TreeNodes</code>)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/treeviewnode-interface'>TreeViewNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An immutable view of a distributed tree node.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/treeviewplace-interface'>TreeViewPlace</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A place within a particular <code>TreeView</code> that is anchored relative to a specific node in the tree, or relative to the outside of the trait. Valid iff 'trait' is valid and, if provided, sibling is in the Location specified by 'trait'.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/treeviewrange-interface'>TreeViewRange</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Specifies the range of nodes from <code>start</code> to <code>end</code> within a trait within a particular <code>TreeView</code>. Valid iff start and end are valid and are within the same trait.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/valideditingresult-interface'>ValidEditingResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Result of applying a valid transaction.
      </td>
    </tr>
  </tbody>
</table>

## Classes

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Class
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree/checkout-class'>Checkout</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          A mutable Checkout of a SharedTree, allowing viewing and interactive transactional editing. Provides <a href='https://en.wikipedia.org/wiki/Snapshot_isolation'>snapshot-isolation</a> while editing.
        </p>
        <p>
          A Checkout always shows a consistent sequence of versions of the SharedTree, but it may skip intermediate versions, and may fall behind. In this case consistent means the sequence of versions could occur with fully synchronous shared tree access, though the timing of sequenced edits arriving to the Checkout may be later than they actually arrive in the SharedTree. Specifically no sequenced edits will arrive during an ongoing edit (to implement snapshot isolation): they will be applied asynchronously some time after the ongoing edit is ended.
        </p>
        <p>
          Events emitted by <code>Checkout</code> are documented in <a href='/docs/apis/tree/checkoutevent-enum'>CheckoutEvent</a>. Exceptions thrown during event handling will be emitted as error events, which are automatically surfaced as error events on the <code>SharedTree</code> used at construction time.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/eagercheckout-class'>EagerCheckout</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>sealed</code>
      </td>
      <td>
        Checkout that always stays up to date with the SharedTree. This means that <span><i>EagerCheckout.waitForPendingUpdates</i></span> is always a no-op since EagerCheckout is always up to date.
        <br>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/forest-class'>Forest</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An immutable forest of ForestNode. Enforces single parenting, and allows querying the parent.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/revisionview-class'>RevisionView</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An immutable view of a distributed tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtree-class'>SharedTree</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A [distributed tree](../Readme.md).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreefactory-class'>SharedTreeFactory</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Factory for SharedTree. Includes history in the summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/transaction-class'>Transaction</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Buffers changes to be applied to an isolated view of a <code>SharedTree</code> over time before applying them directly to the tree itself as a single edit
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/transactionview-class'>TransactionView</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        An view of a distributed tree that is part of an ongoing transaction between <code>RevisionView</code>s.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/treeview-class'>TreeView</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A view of a distributed tree.
      </td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Enum
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree/changetype-enum'>ChangeType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The type of a Change
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/changetypeinternal-enum'>ChangeTypeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The type of a Change
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/checkoutevent-enum'>CheckoutEvent</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        An event emitted by a <code>Checkout</code> to indicate a state change. See <a href='/docs/apis/tree/icheckoutevents-interface'>ICheckoutEvents</a> for event argument information.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/constrainteffect-enum'>ConstraintEffect</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        What to do when a Constraint is violated.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/editstatus-enum'>EditStatus</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The status code of an attempt to apply the changes in an Edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/editvalidationresult-enum'>EditValidationResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The result of validation of an Edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/placevalidationresult-enum'>PlaceValidationResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The result of validating a place.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/rangevalidationresultkind-enum'>RangeValidationResultKind</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The kinds of result of validating a range.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/sharedtreeevent-enum'>SharedTreeEvent</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        An event emitted by a <code>SharedTree</code> to indicate a state change. See <a href='/docs/apis/tree/isharedtreeevents-interface'>ISharedTreeEvents</a> for event argument information.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/side-enum'>Side</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          Defines a place relative to sibling. The &quot;outside&quot; of a trait is the <code>undefined</code> sibling, so After <code>undefined</code> is the beginning of the trait, and before <code>undefined</code> is the end.
        </p>
        <p>
          For this purpose, traits look like:
        </p>
        <p>
          <code>{undefined} - {Node 0} - {Node 1} - ... - {Node N} - {undefined}</code>
        </p>
        <p>
          Each <code>{value}</code> in the diagram is a possible sibling, which is either a Node or undefined. Each <code>-</code> in the above diagram is a <code>Place</code>, and can be describe as being <code>After</code> a particular <code>{sibling}</code> or <code>Before</code> it. This means that <code>After</code> <code>{undefined}</code> means the same <code>Place</code> as before the first node and <code>Before</code> <code>{undefined}</code> means the <code>Place</code> after the last Node.
        </p>
        <p>
          Each place can be specified, (aka 'anchored') in two ways (relative to the sibling before or after): the choice of which way to anchor a place only matters when the kept across an edit, and thus evaluated in multiple contexts where the two place description may no longer evaluate to the same place.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/transactionevent-enum'>TransactionEvent</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        An event emitted by a <code>Transaction</code> to indicate a state change. See <a href='/docs/apis/tree/transactionevents-interface'>TransactionEvents</a> for event argument information.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree/writeformat-enum'>WriteFormat</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Format versions that SharedTree supports writing. Changes to op or summary formats necessitate updates.
      </td>
    </tr>
  </tbody>
</table>

## Types

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        TypeAlias
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree#attributionid-typealias'>AttributionId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        An identifier associated with a session for the purpose of attributing its created content to some user/entity.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#badplacevalidationresult-typealias'>BadPlaceValidationResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The result of validating a bad place.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#badrangevalidationresult-typealias'>BadRangeValidationResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The result of validating a bad range.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#buildnode-typealias'>BuildNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See <code>BuildTreeNode</code> for more.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#buildnodeinternal_0_0_2-typealias'>BuildNodeInternal_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See <code>BuildTreeNode</code> for more.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#buildnodeinternal-typealias'>BuildNodeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See <code>BuildTreeNode</code> for more.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#change-typealias'>Change</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A change that composes an Edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#changeinternal-typealias'>ChangeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A change that composes an Edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#changenode_0_0_2-typealias'>ChangeNode_0_0_2</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#compressedid-typealias'>CompressedId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        An identifier (UUID) that has been shortened by a distributed compression algorithm.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#definition-typealias'>Definition</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Definition. A full (Uuid) persistable definition.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#detachedsequenceid-typealias'>DetachedSequenceId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          Scoped to a single edit: identifies a sequences of nodes that can be moved into a trait.
        </p>
        <p>
          Within a given Edit, any DetachedSequenceId must be a source at most once, and a destination at most once. If used as a source, it must be after it is used as a destination. If this is violated, the Edit is considered malformed.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#editapplicationoutcome-typealias'>EditApplicationOutcome</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The outcome of an edit.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#editcommittedhandler-typealias'>EditCommittedHandler</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Expected type for a handler of the <code>EditCommitted</code> event.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#editid-typealias'>EditId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Edit identifier
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#finalcompressedid-typealias'>FinalCompressedId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A compressed ID that is local to a document. Stable across all revisions of a document starting from the one in which it was created. It should not be persisted outside of the history as it can only be decompressed in the context of the originating document. If external persistence is needed (e.g. by a client), a StableId should be used instead.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#localcompressedid-typealias'>LocalCompressedId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A compressed ID that is local to a session (can only be decompressed when paired with a SessionId). It should not be persisted outside of the history as it can only be decompressed in the context of the originating session. If external persistence is needed (e.g. by a client), a StableId should be used instead.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#nodeid-typealias'>NodeId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Node identifier. Identifies a node within a document.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#payload-typealias'>Payload</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          Json compatible representation of a payload storing arbitrary Serializable data.
        </p>
        <p>
          Keys starting with &quot;IFluid&quot; are reserved for special use such as the JavaScript feature detection pattern and should not be used.
        </p>
        <p>
          See <a href='/docs/apis/tree#comparepayloads-function'>comparePayloads(a, b)</a> for equality semantics and related details (like what is allowed to be lost when serializing)
        </p>
        <p>
          TODO:#51984: Allow opting into heuristic blobbing in snapshots with a special IFluid key.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#placeindex-typealias'>PlaceIndex</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Index of a place within a trait. 0 = before all nodes, 1 = after first node, etc.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#rangevalidationresult-typealias'>RangeValidationResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The result of validating a range.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#revision-typealias'>Revision</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          A revision corresponds to an index in an <code>EditLog</code>.
        </p>
        <p>
          It is associated with the output <code>RevisionView</code> of applying the edit at the index to the previous revision. For example:
        </p>
        <p>
          - revision 0 corresponds to the initialRevision.
        </p>
        <p>
          - revision 1 corresponds to the output of editLog[0] applied to the initialRevision.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#sequencededitappliedhandler-typealias'>SequencedEditAppliedHandler</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Expected type for a handler of the <a href='/docs/apis/tree/sharedtreeevent-enum#sequencededitapplied-enummember'>SequencedEditApplied</a> event.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A compressed ID that has been normalized into &quot;session space&quot; (see <code>IdCompressor</code> for more). Consumer-facing APIs and data structures should use session-space IDs as their lifetime and equality is stable and tied to the compressor that produced them.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#sharedtreeargs-typealias'>SharedTreeArgs</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The write format and associated options used to construct a <code>SharedTree</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#sharedtreeoptions-typealias'>SharedTreeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The type of shared tree options for a given write format
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#stablenodeid-typealias'>StableNodeId</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Globally unique node identifier. Uniquely identifies a node within and across documents. Can be used across SharedTree instances.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#traitlabel-typealias'>TraitLabel</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Definition. A full (Uuid) persistable label for a trait.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#traitnodeindex-typealias'>TraitNodeIndex</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Index of a node within a trait. 0 = first node, 1 = second node, etc.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#treenodesequence-typealias'>TreeNodeSequence</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A sequence of Nodes that make up a trait under a Node
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#uuidstring-typealias'>UuidString</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A 128-bit Universally Unique IDentifier. Represented here with a string of the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, where x is a lowercase hex digit.
      </td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Function
      </th>
      <th>
        Alerts
      </th>
      <th>
        Return Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree#comparepayloads-function'>comparePayloads(a, b)</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Variable
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree#change-variable'>Change</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#changeinternal-variable'>ChangeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#initialtree-variable'>initialTree</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        The initial tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#stableplace-variable'>StablePlace</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#stableplaceinternal-variable'>StablePlaceInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#stablerange-variable'>StableRange</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/tree#stablerangeinternal-variable'>StableRangeInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Namespaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Namespace
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/tree/transactioninternal-namespace'>TransactionInternal</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          A mutable transaction for applying sequences of changes to a TreeView. Allows viewing the intermediate states.
        </p>
        <p>
          Contains necessary state to apply changes within an edit to a TreeView.
        </p>
        <p>
          May have any number of changes applied to make up the edit. Use <code>close</code> to complete the transaction, returning the array of changes and an EditingResult showing the results of applying the changes as an Edit to the initial TreeView (passed to the constructor).
        </p>
        <p>
          No data outside the Transaction is modified by Transaction: the results from <code>close</code> must be used to actually submit an <code>Edit</code>.
        </p>
      </td>
    </tr>
  </tbody>
</table>

## Type Details

### AttributionId (ALPHA) {#attributionid-typealias}

An identifier associated with a session for the purpose of attributing its created content to some user/entity.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#attributionid-signature}

```typescript
export type AttributionId = UuidString;
```

### BadPlaceValidationResult (ALPHA) {#badplacevalidationresult-typealias}

The result of validating a bad place.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#badplacevalidationresult-signature}

```typescript
export type BadPlaceValidationResult = Exclude<PlaceValidationResult, PlaceValidationResult.Valid>;
```

### BadRangeValidationResult (ALPHA) {#badrangevalidationresult-typealias}

The result of validating a bad range.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#badrangevalidationresult-signature}

```typescript
export type BadRangeValidationResult = Exclude<RangeValidationResult, RangeValidationResultKind.Valid>;
```

### BuildNode (ALPHA) {#buildnode-typealias}

Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See `BuildTreeNode` for more.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#buildnode-signature}

```typescript
export type BuildNode = BuildTreeNode | number;
```

### BuildNodeInternal\_0\_0\_2 (ALPHA) {#buildnodeinternal_0_0_2-typealias}

Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See `BuildTreeNode` for more.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#buildnodeinternal_0_0_2-signature}

```typescript
export type BuildNodeInternal_0_0_2 = TreeNode<BuildNodeInternal_0_0_2, StableNodeId> | DetachedSequenceId;
```

### BuildNodeInternal (ALPHA) {#buildnodeinternal-typealias}

Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change. See `BuildTreeNode` for more.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#buildnodeinternal-signature}

```typescript
export type BuildNodeInternal = TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId;
```

### Change (ALPHA) {#change-typealias}

A change that composes an Edit.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#change-signature}

```typescript
export type Change = Insert | Detach | Build | SetValue | Constraint;
```

#### Remarks {#change-remarks}

`Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.

#### Example {#change-example}

```typescript
Change.insert(sourceId, destination)
```

### ChangeInternal (ALPHA) {#changeinternal-typealias}

A change that composes an Edit.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#changeinternal-signature}

```typescript
export type ChangeInternal = InsertInternal | DetachInternal | BuildInternal | SetValueInternal | ConstraintInternal;
```

#### Remarks {#changeinternal-remarks}

`Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.

### ChangeNode\_0\_0\_2 (ALPHA) {#changenode_0_0_2-typealias}

JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#changenode_0_0_2-signature}

```typescript
export type ChangeNode_0_0_2 = TreeNode<ChangeNode_0_0_2, StableNodeId>;
```

### CompressedId (ALPHA) {#compressedid-typealias}

An identifier (UUID) that has been shortened by a distributed compression algorithm.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#compressedid-signature}

```typescript
export type CompressedId = FinalCompressedId | LocalCompressedId;
```

### Definition (ALPHA) {#definition-typealias}

Definition. A full (Uuid) persistable definition.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#definition-signature}

```typescript
export type Definition = UuidString & {
    readonly Definition: 'c0ef9488-2a78-482d-aeed-37fba996354c';
};
```

### DetachedSequenceId (ALPHA) {#detachedsequenceid-typealias}

Scoped to a single edit: identifies a sequences of nodes that can be moved into a trait.

Within a given Edit, any DetachedSequenceId must be a source at most once, and a destination at most once. If used as a source, it must be after it is used as a destination. If this is violated, the Edit is considered malformed.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#detachedsequenceid-signature}

```typescript
export type DetachedSequenceId = number & {
    readonly DetachedSequenceId: 'f7d7903a-194e-45e7-8e82-c9ef4333577d';
};
```

### EditApplicationOutcome (ALPHA) {#editapplicationoutcome-typealias}

The outcome of an edit.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#editapplicationoutcome-signature}

```typescript
export type EditApplicationOutcome = {
    readonly view: RevisionView;
    readonly status: EditStatus.Applied;
} | {
    readonly failure: TransactionInternal.Failure;
    readonly status: EditStatus.Invalid | EditStatus.Malformed;
};
```

### EditCommittedHandler (ALPHA) {#editcommittedhandler-typealias}

Expected type for a handler of the `EditCommitted` event.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#editcommittedhandler-signature}

```typescript
export type EditCommittedHandler = (args: EditCommittedEventArguments) => void;
```

### EditId (ALPHA) {#editid-typealias}

Edit identifier

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#editid-signature}

```typescript
export type EditId = UuidString & {
    readonly EditId: '56897beb-53e4-4e66-85da-4bf5cd5d0d49';
};
```

### FinalCompressedId (ALPHA) {#finalcompressedid-typealias}

A compressed ID that is local to a document. Stable across all revisions of a document starting from the one in which it was created. It should not be persisted outside of the history as it can only be decompressed in the context of the originating document. If external persistence is needed (e.g. by a client), a StableId should be used instead.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#finalcompressedid-signature}

```typescript
export type FinalCompressedId = number & {
    readonly FinalCompressedId: '5d83d1e2-98b7-4e4e-a889-54c855cfa73d';
    readonly OpNormalized: '9209432d-a959-4df7-b2ad-767ead4dbcae';
};
```

### LocalCompressedId (ALPHA) {#localcompressedid-typealias}

A compressed ID that is local to a session (can only be decompressed when paired with a SessionId). It should not be persisted outside of the history as it can only be decompressed in the context of the originating session. If external persistence is needed (e.g. by a client), a StableId should be used instead.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#localcompressedid-signature}

```typescript
export type LocalCompressedId = number & {
    readonly LocalCompressedId: '6fccb42f-e2a4-4243-bd29-f13d12b9c6d1';
} & SessionUnique;
```

### NodeId (ALPHA) {#nodeid-typealias}

Node identifier. Identifies a node within a document.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#nodeid-signature}

```typescript
export type NodeId = number & SessionSpaceCompressedId & NodeIdBrand;
```

### Payload (ALPHA) {#payload-typealias}

Json compatible representation of a payload storing arbitrary Serializable data.

Keys starting with "IFluid" are reserved for special use such as the JavaScript feature detection pattern and should not be used.

See [comparePayloads(a, b)](/docs/apis/tree#comparepayloads-function) for equality semantics and related details (like what is allowed to be lost when serializing)

TODO:\#51984: Allow opting into heuristic blobbing in snapshots with a special IFluid key.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#payload-signature}

```typescript
export type Payload = any;
```

### PlaceIndex (ALPHA) {#placeindex-typealias}

Index of a place within a trait. 0 = before all nodes, 1 = after first node, etc.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#placeindex-signature}

```typescript
export type PlaceIndex = number & {
    readonly PlaceIndex: unique symbol;
};
```

### RangeValidationResult (ALPHA) {#rangevalidationresult-typealias}

The result of validating a range.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#rangevalidationresult-signature}

```typescript
export type RangeValidationResult = RangeValidationResultKind.Valid | RangeValidationResultKind.PlacesInDifferentTraits | RangeValidationResultKind.Inverted | {
    kind: RangeValidationResultKind.BadPlace;
    place: StablePlaceInternal;
    placeFailure: BadPlaceValidationResult;
};
```

### Revision (ALPHA) {#revision-typealias}

A revision corresponds to an index in an `EditLog`.

It is associated with the output `RevisionView` of applying the edit at the index to the previous revision. For example:

- revision 0 corresponds to the initialRevision.

- revision 1 corresponds to the output of editLog\[0\] applied to the initialRevision.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#revision-signature}

```typescript
export type Revision = number;
```

### SequencedEditAppliedHandler (ALPHA) {#sequencededitappliedhandler-typealias}

Expected type for a handler of the [SequencedEditApplied](/docs/apis/tree/sharedtreeevent-enum#sequencededitapplied-enummember) event.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#sequencededitappliedhandler-signature}

```typescript
export type SequencedEditAppliedHandler = (args: SequencedEditAppliedEventArguments) => void;
```

### SessionSpaceCompressedId (ALPHA) {#sessionspacecompressedid-typealias}

A compressed ID that has been normalized into "session space" (see `IdCompressor` for more). Consumer-facing APIs and data structures should use session-space IDs as their lifetime and equality is stable and tied to the compressor that produced them.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#sessionspacecompressedid-signature}

```typescript
export type SessionSpaceCompressedId = CompressedId & SessionUnique;
```

### SharedTreeArgs (ALPHA) {#sharedtreeargs-typealias}

The write format and associated options used to construct a `SharedTree`

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#sharedtreeargs-signature}

```typescript
export type SharedTreeArgs<WF extends WriteFormat = WriteFormat> = [writeFormat: WF, options?: SharedTreeOptions<WF>];
```

### SharedTreeOptions (ALPHA) {#sharedtreeoptions-typealias}

The type of shared tree options for a given write format

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#sharedtreeoptions-signature}

```typescript
export type SharedTreeOptions<WF extends WriteFormat, HistoryCompatibility extends 'Forwards' | 'None' = 'Forwards'> = SharedTreeBaseOptions & Omit<WF extends WriteFormat.v0_0_2 ? SharedTreeOptions_0_0_2 : WF extends WriteFormat.v0_1_1 ? SharedTreeOptions_0_1_1 : never, HistoryCompatibility extends 'Forwards' ? 'summarizeHistory' : never>;
```

### StableNodeId (ALPHA) {#stablenodeid-typealias}

Globally unique node identifier. Uniquely identifies a node within and across documents. Can be used across SharedTree instances.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#stablenodeid-signature}

```typescript
export type StableNodeId = string & {
    readonly StableNodeId: 'a0843b38-699d-4bb2-aa7a-16c502a71151';
};
```

### TraitLabel (ALPHA) {#traitlabel-typealias}

Definition. A full (Uuid) persistable label for a trait.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#traitlabel-signature}

```typescript
export type TraitLabel = UuidString & {
    readonly TraitLabel: '613826ed-49cc-4df3-b2b8-bfc6866af8e3';
};
```

### TraitNodeIndex (ALPHA) {#traitnodeindex-typealias}

Index of a node within a trait. 0 = first node, 1 = second node, etc.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#traitnodeindex-signature}

```typescript
export type TraitNodeIndex = number & {
    readonly TraitNodeIndex: unique symbol;
};
```

### TreeNodeSequence (ALPHA) {#treenodesequence-typealias}

A sequence of Nodes that make up a trait under a Node

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#treenodesequence-signature}

```typescript
export type TreeNodeSequence<TChild> = readonly TChild[];
```

### UuidString (ALPHA) {#uuidstring-typealias}

A 128-bit Universally Unique IDentifier. Represented here with a string of the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, where x is a lowercase hex digit.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#uuidstring-signature}

```typescript
export type UuidString = string & {
    readonly UuidString: '9d40d0ae-90d9-44b1-9482-9f55d59d5465';
};
```

## Function Details

### comparePayloads (ALPHA) {#comparepayloads-function}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#comparepayloads-signature}

```typescript
export declare function comparePayloads(a: Payload, b: Payload): boolean;
```

#### Parameters {#comparepayloads-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        a
      </td>
      <td>
        <span><a href='/docs/apis/tree#payload-typealias'>Payload</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        b
      </td>
      <td>
        <span><a href='/docs/apis/tree#payload-typealias'>Payload</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#comparepayloads-returns}

true if two `Payloads` are identical. May return false for equivalent payloads encoded differently.

Object field order and object identity are not considered significant, and are ignored by this function. (This is because they may not be preserved through roundtrip).

For other information which Fluid would lose on serialization round trip, behavior is unspecified other than this this function is reflective (all payloads are equal to themselves) and commutative (argument order does not matter).

This means that any Payload is equal to itself and a deep clone of itself.

Payloads might not be equal to a version of themselves that has been serialized then deserialized. If they are serialized then deserialized again, the two deserialized objects will compare equal, however the serialized strings may be unequal (due to field order for objects being unspecified).

Fluid will cause lossy operations due to use of JSON.stringify(). This includes: - Loss of object identity - Loss of field order (may be ordered arbitrarily) - -0 becomes +0 - NaN, Infinity, -Infinity all become null - custom toJSON functions may cause arbitrary behavior - functions become undefined or null - non enumerable properties (including prototype) are lost - more (this is not a complete list)

Inputs must not contain cyclic references other than fields set to their immediate parent (for the JavaScript feature detection pattern).

IFluidHandle instances (detected via JavaScript feature detection pattern) are only compared by absolutePath.

TODO:\#54095: Is there a better way to do this comparison?

**Return type:** boolean

## Variable Details

### Change (ALPHA) {#change-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#change-signature}

```typescript
Change: {
    build: (source: BuildNode | TreeNodeSequence<BuildNode>, destination: number) => Build;
    insert: (source: number, destination: StablePlace) => Insert;
    detach: (source: StableRange, destination?: number) => Detach;
    setPayload: (nodeToModify: NodeId, payload: Payload) => SetValue;
    clearPayload: (nodeToModify: NodeId) => SetValue;
    constraint: (toConstrain: StableRange, effect: ConstraintEffect, identityHash?: UuidString, length?: number, contentHash?: UuidString, parentNode?: NodeId, label?: TraitLabel) => Constraint;
    delete: (stableRange: StableRange) => Change;
    insertTree: (nodes: BuildNode | TreeNodeSequence<BuildNode>, destination: StablePlace) => Change[];
    move: (source: StableRange, destination: StablePlace) => Change[];
}
```

### ChangeInternal (ALPHA) {#changeinternal-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#changeinternal-signature}

```typescript
ChangeInternal: {
    build: (source: TreeNodeSequence<BuildNodeInternal>, destination: DetachedSequenceId) => BuildInternal;
    insert: (source: DetachedSequenceId, destination: StablePlaceInternal) => InsertInternal;
    detach: (source: StableRangeInternal, destination?: DetachedSequenceId) => DetachInternal;
    setPayload: (nodeToModify: NodeData<NodeId> | NodeId, payload: Payload) => SetValueInternal;
    clearPayload: (nodeToModify: NodeData<NodeId> | NodeId) => SetValueInternal;
    constraint: (toConstrain: StableRangeInternal, effect: ConstraintEffect, identityHash?: UuidString, length?: number, contentHash?: UuidString, parentNode?: NodeId, label?: TraitLabel) => ConstraintInternal;
    delete: (stableRange: StableRangeInternal) => ChangeInternal;
    insertTree: (nodes: TreeNodeSequence<BuildNodeInternal>, destination: StablePlaceInternal) => ChangeInternal[];
    move: (source: StableRangeInternal, destination: StablePlaceInternal) => ChangeInternal[];
}
```

### initialTree (ALPHA) {#initialtree-variable}

The initial tree.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#initialtree-signature}

```typescript
initialTree: ChangeNode_0_0_2
```

### StablePlace (ALPHA) {#stableplace-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#stableplace-signature}

```typescript
StablePlace: {
    before: (node: NodeData<NodeId> | NodeId) => StablePlace;
    after: (node: NodeData<NodeId> | NodeId) => StablePlace;
    atStartOf: (trait: TraitLocation) => StablePlace;
    atEndOf: (trait: TraitLocation) => StablePlace;
}
```

### StablePlaceInternal (ALPHA) {#stableplaceinternal-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#stableplaceinternal-signature}

```typescript
StablePlaceInternal: {
    before: (node: NodeData<NodeId> | NodeId) => StablePlaceInternal;
    after: (node: NodeData<NodeId> | NodeId) => StablePlaceInternal;
    atStartOf: (trait: TraitLocationInternal) => StablePlaceInternal;
    atEndOf: (trait: TraitLocationInternal) => StablePlaceInternal;
}
```

### StableRange (ALPHA) {#stablerange-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#stablerange-signature}

```typescript
StableRange: {
    from: (start: StablePlace) => {
        to: (end: StablePlace) => StableRange;
    };
    only: (node: NodeData<NodeId> | NodeId) => StableRange;
    all: (trait: TraitLocation) => StableRange;
}
```

### StableRangeInternal (ALPHA) {#stablerangeinternal-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#stablerangeinternal-signature}

```typescript
StableRangeInternal: {
    from: (start: StablePlaceInternal) => {
        to: (end: StablePlaceInternal) => StableRangeInternal;
    };
    only: (node: NodeData<NodeId> | NodeId) => StableRangeInternal;
    all: (trait: TraitLocationInternal) => StableRangeInternal;
}
```
