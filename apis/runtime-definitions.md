{
  "title": "@fluidframework/runtime-definitions Package",
  "kind": "Package",
  "members": {
    "TypeAlias": {
      "AliasResult": "/docs/apis/runtime-definitions#aliasresult-typealias",
      "CreateChildSummarizerNodeFn": "/docs/apis/runtime-definitions#createchildsummarizernodefn-typealias",
      "CreateChildSummarizerNodeParam": "/docs/apis/runtime-definitions#createchildsummarizernodeparam-typealias",
      "FluidDataStoreRegistryEntry": "/docs/apis/runtime-definitions#fluiddatastoreregistryentry-typealias",
      "InboundAttachMessage": "/docs/apis/runtime-definitions#inboundattachmessage-typealias",
      "NamedFluidDataStoreRegistryEntries": "/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias",
      "NamedFluidDataStoreRegistryEntry": "/docs/apis/runtime-definitions#namedfluiddatastoreregistryentry-typealias",
      "SummarizeInternalFn": "/docs/apis/runtime-definitions#summarizeinternalfn-typealias",
      "VisibilityState_2": "/docs/apis/runtime-definitions#visibilitystate_2-typealias"
    },
    "Enum": {
      "BindState": "/docs/apis/runtime-definitions#bindstate-enum",
      "CreateSummarizerNodeSource": "/docs/apis/runtime-definitions#createsummarizernodesource-enum",
      "FlushMode": "/docs/apis/runtime-definitions#flushmode-enum",
      "FlushModeExperimental": "/docs/apis/runtime-definitions#flushmodeexperimental-enum"
    },
    "Variable": {
      "blobCountPropertyName": "/docs/apis/runtime-definitions#blobcountpropertyname-variable",
      "channelsTreeName": "/docs/apis/runtime-definitions#channelstreename-variable",
      "gcBlobPrefix": "/docs/apis/runtime-definitions#gcblobprefix-variable",
      "gcDeletedBlobKey": "/docs/apis/runtime-definitions#gcdeletedblobkey-variable",
      "gcTombstoneBlobKey": "/docs/apis/runtime-definitions#gctombstoneblobkey-variable",
      "gcTreeKey": "/docs/apis/runtime-definitions#gctreekey-variable",
      "IFluidDataStoreFactory": "/docs/apis/runtime-definitions#ifluiddatastorefactory-variable",
      "IFluidDataStoreRegistry": "/docs/apis/runtime-definitions#ifluiddatastoreregistry-variable",
      "totalBlobSizePropertyName": "/docs/apis/runtime-definitions#totalblobsizepropertyname-variable",
      "VisibilityState_2": "/docs/apis/runtime-definitions#visibilitystate_2-variable"
    },
    "Interface": {
      "IAttachMessage": "/docs/apis/runtime-definitions\\iattachmessage-interface",
      "IContainerRuntimeBase": "/docs/apis/runtime-definitions\\icontainerruntimebase-interface",
      "IContainerRuntimeBaseEvents": "/docs/apis/runtime-definitions\\icontainerruntimebaseevents-interface",
      "IDataStore": "/docs/apis/runtime-definitions\\idatastore-interface",
      "IEnvelope": "/docs/apis/runtime-definitions\\ienvelope-interface",
      "IFluidDataStoreChannel": "/docs/apis/runtime-definitions\\ifluiddatastorechannel-interface",
      "IFluidDataStoreContext": "/docs/apis/runtime-definitions\\ifluiddatastorecontext-interface",
      "IFluidDataStoreContextDetached": "/docs/apis/runtime-definitions\\ifluiddatastorecontextdetached-interface",
      "IFluidDataStoreContextEvents": "/docs/apis/runtime-definitions\\ifluiddatastorecontextevents-interface",
      "IFluidDataStoreFactory": "/docs/apis/runtime-definitions\\ifluiddatastorefactory-interface",
      "IFluidDataStoreRegistry": "/docs/apis/runtime-definitions\\ifluiddatastoreregistry-interface",
      "IGarbageCollectionData": "/docs/apis/runtime-definitions\\igarbagecollectiondata-interface",
      "IGarbageCollectionDetailsBase": "/docs/apis/runtime-definitions\\igarbagecollectiondetailsbase-interface",
      "IGarbageCollectionNodeData": "/docs/apis/runtime-definitions\\igarbagecollectionnodedata-interface",
      "IGarbageCollectionSnapshotData": "/docs/apis/runtime-definitions\\igarbagecollectionsnapshotdata-interface",
      "IGarbageCollectionState": "/docs/apis/runtime-definitions\\igarbagecollectionstate-interface",
      "IGarbageCollectionSummaryDetailsLegacy": "/docs/apis/runtime-definitions\\igarbagecollectionsummarydetailslegacy-interface",
      "IInboundSignalMessage": "/docs/apis/runtime-definitions\\iinboundsignalmessage-interface",
      "IProvideFluidDataStoreFactory": "/docs/apis/runtime-definitions\\iprovidefluiddatastorefactory-interface",
      "IProvideFluidDataStoreRegistry": "/docs/apis/runtime-definitions\\iprovidefluiddatastoreregistry-interface",
      "ISignalEnvelope": "/docs/apis/runtime-definitions\\isignalenvelope-interface",
      "ISummarizeInternalResult": "/docs/apis/runtime-definitions\\isummarizeinternalresult-interface",
      "ISummarizeResult": "/docs/apis/runtime-definitions\\isummarizeresult-interface",
      "ISummarizerNode": "/docs/apis/runtime-definitions\\isummarizernode-interface",
      "ISummarizerNodeConfig": "/docs/apis/runtime-definitions\\isummarizernodeconfig-interface",
      "ISummarizerNodeConfigWithGC": "/docs/apis/runtime-definitions\\isummarizernodeconfigwithgc-interface",
      "ISummarizerNodeWithGC": "/docs/apis/runtime-definitions\\isummarizernodewithgc-interface",
      "ISummaryStats": "/docs/apis/runtime-definitions\\isummarystats-interface",
      "ISummaryTreeWithStats": "/docs/apis/runtime-definitions\\isummarytreewithstats-interface",
      "ITelemetryContext": "/docs/apis/runtime-definitions\\itelemetrycontext-interface"
    }
  },
  "package": "@fluidframework/runtime-definitions",
  "unscopedPackageName": "runtime-definitions"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/runtime-definitions](/docs/apis/runtime-definitions)

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Interface
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\iattachmessage-interface'>IAttachMessage</a>
      </td>
      <td>
      </td>
      <td>
        Message send by client attaching local data structure. Contains snapshot of data structure which is the current state of this data structure.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\icontainerruntimebase-interface'>IContainerRuntimeBase</a>
      </td>
      <td>
      </td>
      <td>
        A reduced set of functionality of IContainerRuntime that a data store context/data store runtime will need TODO: this should be merged into IFluidDataStoreContext
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\icontainerruntimebaseevents-interface'>IContainerRuntimeBaseEvents</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\idatastore-interface'>IDataStore</a>
      </td>
      <td>
      </td>
      <td>
        Exposes some functionality/features of a data store: - Handle to the data store's entryPoint - Fluid router for the data store - Can be assigned an alias
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ienvelope-interface'>IEnvelope</a>
      </td>
      <td>
      </td>
      <td>
        An envelope wraps the contents with the intended target
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorechannel-interface'>IFluidDataStoreChannel</a>
      </td>
      <td>
      </td>
      <td>
        <p>Minimal interface a data store runtime needs to provide for IFluidDataStoreContext to bind to control.</p><p>Functionality include attach, snapshot, op/signal processing, request routes, expose an entryPoint, and connection state notifications</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorecontext-interface'>IFluidDataStoreContext</a>
      </td>
      <td>
      </td>
      <td>
        Represents the context for the data store. It is used by the data store runtime to get information and call functionality to the container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorecontextdetached-interface'>IFluidDataStoreContextDetached</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorecontextevents-interface'>IFluidDataStoreContextEvents</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorefactory-interface'>IFluidDataStoreFactory</a>
      </td>
      <td>
      </td>
      <td>
        IFluidDataStoreFactory create data stores. It is associated with an identifier (its <code>type</code> member) and usually provided to consumers using this mapping through a data store registry.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastoreregistry-interface'>IFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
      <td>
        An association of identifiers to data store registry entries, where the entries can be used to create data stores.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectiondata-interface'>IGarbageCollectionData</a>
      </td>
      <td>
      </td>
      <td>
        Garbage collection data returned by nodes in a Container. Used for running GC in the Container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectiondetailsbase-interface'>IGarbageCollectionDetailsBase</a>
      </td>
      <td>
      </td>
      <td>
        GC details provided to each node during creation.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectionnodedata-interface'>IGarbageCollectionNodeData</a>
      </td>
      <td>
      </td>
      <td>
        The garbage collection data of each node in the reference graph.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectionsnapshotdata-interface'>IGarbageCollectionSnapshotData</a>
      </td>
      <td>
      </td>
      <td>
        The GC data that is read from a snapshot. It contains the Garbage CollectionState state and tombstone state.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectionstate-interface'>IGarbageCollectionState</a>
      </td>
      <td>
      </td>
      <td>
        The garbage collection state of the reference graph. It contains a list of all the nodes in the graph and their GC data.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\igarbagecollectionsummarydetailslegacy-interface'>IGarbageCollectionSummaryDetailsLegacy</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\iinboundsignalmessage-interface'>IInboundSignalMessage</a>
      </td>
      <td>
      </td>
      <td>
        Represents ISignalMessage with its type.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\iprovidefluiddatastorefactory-interface'>IProvideFluidDataStoreFactory</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\iprovidefluiddatastoreregistry-interface'>IProvideFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isignalenvelope-interface'>ISignalEnvelope</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizeinternalresult-interface'>ISummarizeInternalResult</a>
      </td>
      <td>
      </td>
      <td>
        Contains the same data as ISummaryResult but in order to avoid naming collisions, the data store summaries are wrapped around an array of labels identified by pathPartsForChildren.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizeresult-interface'>ISummarizeResult</a>
      </td>
      <td>
      </td>
      <td>
        Represents a summary at a current sequence number.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizernode-interface'>ISummarizerNode</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizernodeconfig-interface'>ISummarizerNodeConfig</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizernodeconfigwithgc-interface'>ISummarizerNodeConfigWithGC</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarizernodewithgc-interface'>ISummarizerNodeWithGC</a>
      </td>
      <td>
      </td>
      <td>
        <p>Extends the functionality of ISummarizerNode to support garbage collection. It adds / updates the following APIs:</p><p><code>usedRoutes</code>: The routes in this node that are currently in use.</p><p><code>getGCData</code>: A new API that can be used to get the garbage collection data for this node.</p><p><code>summarize</code>: Added a trackState flag which indicates whether the summarizer node should track the state of the summary or not.</p><p><code>createChild</code>: Added the following params:</p><p>- <code>getGCDataFn</code>: This gets the GC data from the caller. This must be provided in order for getGCData to work.</p><p>- <code>getInitialGCDetailsFn</code>: This gets the initial GC details from the caller.</p><p><code>deleteChild</code>: Deletes a child node.</p><p><code>isReferenced</code>: This tells whether this node is referenced in the document or not.</p><p><code>updateUsedRoutes</code>: Used to notify this node of routes that are currently in use in it.</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarystats-interface'>ISummaryStats</a>
      </td>
      <td>
      </td>
      <td>
        Contains the aggregation data from a Tree/Subtree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarytreewithstats-interface'>ISummaryTreeWithStats</a>
      </td>
      <td>
      </td>
      <td>
        Represents the summary tree for a node along with the statistics for that tree. For example, for a given data store, it contains the data for data store along with a subtree for each of its DDS. Any component that implements IChannelContext, IFluidDataStoreChannel or extends SharedObject will be taking part of the summarization process.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions\itelemetrycontext-interface'>ITelemetryContext</a>
      </td>
      <td>
      </td>
      <td>
        Contains telemetry data relevant to summarization workflows. This object is expected to be modified directly by various summarize methods.
      </td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Enum
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#bindstate-enum'>BindState</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createsummarizernodesource-enum'>CreateSummarizerNodeSource</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmode-enum'>FlushMode</a>
      </td>
      <td>
      </td>
      <td>
        Runtime flush mode handling
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmodeexperimental-enum'>FlushModeExperimental</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Types

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        TypeAlias
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#aliasresult-typealias'>AliasResult</a>
      </td>
      <td>
        <p>Encapsulates the return codes of the aliasing API.</p><p>'Success' - the datastore has been successfully aliased. It can now be used. 'Conflict' - there is already a datastore bound to the provided alias. To acquire a handle to it, use the <code>IContainerRuntime.getRootDataStore</code> function. The current datastore should be discarded and will be garbage collected. The current datastore cannot be aliased to a different value. 'AlreadyAliased' - the datastore has already been previously bound to another alias name.</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createchildsummarizernodefn-typealias'>CreateChildSummarizerNodeFn</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createchildsummarizernodeparam-typealias'>CreateChildSummarizerNodeParam</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#fluiddatastoreregistryentry-typealias'>FluidDataStoreRegistryEntry</a>
      </td>
      <td>
        A single registry entry that may be used to create data stores It has to have either factory or registry, or both.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#inboundattachmessage-typealias'>InboundAttachMessage</a>
      </td>
      <td>
        This type should be used when reading an incoming attach op, but it should not be used when creating a new attach op. Older versions of attach messages could have null snapshots, so this gives correct typings for writing backward compatible code.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias'>NamedFluidDataStoreRegistryEntries</a>
      </td>
      <td>
        An iterable identifier/registry entry pair list
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentry-typealias'>NamedFluidDataStoreRegistryEntry</a>
      </td>
      <td>
        An associated pair of an identifier and registry entry. Registry entries may be dynamically loaded.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#summarizeinternalfn-typealias'>SummarizeInternalFn</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#visibilitystate_2-typealias'>VisibilityState_2</a>
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
      <th scope="col">
        Variable
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#blobcountpropertyname-variable'>blobCountPropertyName</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#channelstreename-variable'>channelsTreeName</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#gcblobprefix-variable'>gcBlobPrefix</a>
      </td>
      <td>
        They prefix for GC blobs in the GC tree in summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#gcdeletedblobkey-variable'>gcDeletedBlobKey</a>
      </td>
      <td>
        The key for deleted nodes blob in the GC tree in summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#gctombstoneblobkey-variable'>gcTombstoneBlobKey</a>
      </td>
      <td>
        The key for tombstone blob in the GC tree in summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#gctreekey-variable'>gcTreeKey</a>
      </td>
      <td>
        The key for the GC tree in summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#ifluiddatastorefactory-variable'>IFluidDataStoreFactory</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#ifluiddatastoreregistry-variable'>IFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#totalblobsizepropertyname-variable'>totalBlobSizePropertyName</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#visibilitystate_2-variable'>VisibilityState_2</a>
      </td>
      <td>
        This tells the visibility state of a Fluid object. It basically tracks whether the object is not visible, visible locally within the container only or visible globally to all clients.
      </td>
    </tr>
  </tbody>
</table>

## Enumeration Details

### BindState {#bindstate-enum}

{{% callout Warning Deprecated %}}
Used only in deprecated API bindToContext


{{% /callout %}}

#### Signature {#bindstate-signature}

```typescript
export declare enum BindState 
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Flag
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#bindstate-binding-enummember'>Binding</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#bindstate-bound-enummember'>Bound</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#bindstate-notbound-enummember'>NotBound</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### Binding {#bindstate-binding-enummember}

###### Signature {#binding-signature}

```typescript
Binding = "Binding"
```

##### Bound {#bindstate-bound-enummember}

###### Signature {#bound-signature}

```typescript
Bound = "Bound"
```

##### NotBound {#bindstate-notbound-enummember}

###### Signature {#notbound-signature}

```typescript
NotBound = "NotBound"
```

### CreateSummarizerNodeSource {#createsummarizernodesource-enum}

#### Signature {#createsummarizernodesource-signature}

```typescript
export declare enum CreateSummarizerNodeSource 
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Flag
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createsummarizernodesource-fromattach-enummember'>FromAttach</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createsummarizernodesource-fromsummary-enummember'>FromSummary</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#createsummarizernodesource-local-enummember'>Local</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### FromAttach {#createsummarizernodesource-fromattach-enummember}

###### Signature {#fromattach-signature}

```typescript
FromAttach = 1
```

##### FromSummary {#createsummarizernodesource-fromsummary-enummember}

###### Signature {#fromsummary-signature}

```typescript
FromSummary = 0
```

##### Local {#createsummarizernodesource-local-enummember}

###### Signature {#local-signature}

```typescript
Local = 2
```

### FlushMode {#flushmode-enum}

Runtime flush mode handling

#### Signature {#flushmode-signature}

```typescript
export declare enum FlushMode 
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Flag
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmode-immediate-enummember'>Immediate</a>
      </td>
      <td>
        In Immediate flush mode the runtime will immediately send all operations to the driver layer.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmode-turnbased-enummember'>TurnBased</a>
      </td>
      <td>
        When in TurnBased flush mode the runtime will buffer operations in the current turn and send them as a single batch at the end of the turn. The flush call on the runtime can be used to force send the current batch.
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### Immediate {#flushmode-immediate-enummember}

In Immediate flush mode the runtime will immediately send all operations to the driver layer.

###### Signature {#immediate-signature}

```typescript
Immediate = 0
```

##### TurnBased {#flushmode-turnbased-enummember}

When in TurnBased flush mode the runtime will buffer operations in the current turn and send them as a single batch at the end of the turn. The flush call on the runtime can be used to force send the current batch.

###### Signature {#turnbased-signature}

```typescript
TurnBased = 1
```

### FlushModeExperimental {#flushmodeexperimental-enum}

#### Signature {#flushmodeexperimental-signature}

```typescript
export declare enum FlushModeExperimental 
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Flag
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmodeexperimental-async-enummember'>Async</a>
      </td>
      <td>
        <p>When in Async flush mode, the runtime will accumulate all operations across JS turns and send them as a single batch when all micro-tasks are complete.</p><p>- Not ready for use</p>
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### Async {#flushmodeexperimental-async-enummember}

When in Async flush mode, the runtime will accumulate all operations across JS turns and send them as a single batch when all micro-tasks are complete.

- Not ready for use

###### Signature {#async-signature}

```typescript
Async = 2
```

## Type Details

### AliasResult {#aliasresult-typealias}

Encapsulates the return codes of the aliasing API.

'Success' - the datastore has been successfully aliased. It can now be used. 'Conflict' - there is already a datastore bound to the provided alias. To acquire a handle to it, use the `IContainerRuntime.getRootDataStore` function. The current datastore should be discarded and will be garbage collected. The current datastore cannot be aliased to a different value. 'AlreadyAliased' - the datastore has already been previously bound to another alias name.

#### Signature {#aliasresult-signature}

```typescript
export declare type AliasResult = "Success" | "Conflict" | "AlreadyAliased";
```

### CreateChildSummarizerNodeFn {#createchildsummarizernodefn-typealias}

#### Signature {#createchildsummarizernodefn-signature}

```typescript
export declare type CreateChildSummarizerNodeFn = (summarizeInternal: SummarizeInternalFn, getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>, 
getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>) => ISummarizerNodeWithGC;
```

### CreateChildSummarizerNodeParam {#createchildsummarizernodeparam-typealias}

#### Signature {#createchildsummarizernodeparam-signature}

```typescript
export declare type CreateChildSummarizerNodeParam = {
    type: CreateSummarizerNodeSource.FromSummary;
} | {
    type: CreateSummarizerNodeSource.FromAttach;
    sequenceNumber: number;
    snapshot: ITree;
} | {
    type: CreateSummarizerNodeSource.Local;
};
```

### FluidDataStoreRegistryEntry {#fluiddatastoreregistryentry-typealias}

A single registry entry that may be used to create data stores It has to have either factory or registry, or both.

#### Signature {#fluiddatastoreregistryentry-signature}

```typescript
export declare type FluidDataStoreRegistryEntry = Readonly<Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>>;
```

### InboundAttachMessage {#inboundattachmessage-typealias}

This type should be used when reading an incoming attach op, but it should not be used when creating a new attach op. Older versions of attach messages could have null snapshots, so this gives correct typings for writing backward compatible code.

#### Signature {#inboundattachmessage-signature}

```typescript
export declare type InboundAttachMessage = Omit<IAttachMessage, "snapshot"> & {
    snapshot: IAttachMessage["snapshot"] | null;
};
```

### NamedFluidDataStoreRegistryEntries {#namedfluiddatastoreregistryentries-typealias}

An iterable identifier/registry entry pair list

#### Signature {#namedfluiddatastoreregistryentries-signature}

```typescript
export declare type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;
```

### NamedFluidDataStoreRegistryEntry {#namedfluiddatastoreregistryentry-typealias}

An associated pair of an identifier and registry entry. Registry entries may be dynamically loaded.

#### Signature {#namedfluiddatastoreregistryentry-signature}

```typescript
export declare type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];
```

### SummarizeInternalFn {#summarizeinternalfn-typealias}

#### Signature {#summarizeinternalfn-signature}

```typescript
export declare type SummarizeInternalFn = (fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext) => Promise<ISummarizeInternalResult>;
```

### VisibilityState\_2 {#visibilitystate_2-typealias}

#### Signature {#visibilitystate_2-signature}

```typescript
export declare type VisibilityState = typeof VisibilityState[keyof typeof VisibilityState];
```

## Variable Details

### blobCountPropertyName {#blobcountpropertyname-variable}

#### Signature {#blobcountpropertyname-signature}

```typescript
blobCountPropertyName = "BlobCount"
```

### channelsTreeName {#channelstreename-variable}

#### Signature {#channelstreename-signature}

```typescript
channelsTreeName = ".channels"
```

### gcBlobPrefix {#gcblobprefix-variable}

They prefix for GC blobs in the GC tree in summary.

#### Signature {#gcblobprefix-signature}

```typescript
gcBlobPrefix = "__gc"
```

### gcDeletedBlobKey {#gcdeletedblobkey-variable}

The key for deleted nodes blob in the GC tree in summary.

#### Signature {#gcdeletedblobkey-signature}

```typescript
gcDeletedBlobKey = "__deletedNodes"
```

### gcTombstoneBlobKey {#gctombstoneblobkey-variable}

The key for tombstone blob in the GC tree in summary.

#### Signature {#gctombstoneblobkey-signature}

```typescript
gcTombstoneBlobKey = "__tombstones"
```

### gcTreeKey {#gctreekey-variable}

The key for the GC tree in summary.

#### Signature {#gctreekey-signature}

```typescript
gcTreeKey = "gc"
```

### IFluidDataStoreFactory {#ifluiddatastorefactory-variable}

#### Signature {#ifluiddatastorefactory-signature}

```typescript
IFluidDataStoreFactory: keyof IProvideFluidDataStoreFactory
```

### IFluidDataStoreRegistry {#ifluiddatastoreregistry-variable}

#### Signature {#ifluiddatastoreregistry-signature}

```typescript
IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry
```

### totalBlobSizePropertyName {#totalblobsizepropertyname-variable}

#### Signature {#totalblobsizepropertyname-signature}

```typescript
totalBlobSizePropertyName = "TotalBlobSize"
```

### VisibilityState\_2 {#visibilitystate_2-variable}

This tells the visibility state of a Fluid object. It basically tracks whether the object is not visible, visible locally within the container only or visible globally to all clients.

#### Signature {#visibilitystate_2-signature}

```typescript
VisibilityState: {
    NotVisible: string;
    LocallyVisible: string;
    GloballyVisible: string;
}
```