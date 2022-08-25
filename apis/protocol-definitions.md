{"kind":"Package","title":"@fluidframework/protocol-definitions Package","summary":"Core set of Fluid protocol interfaces shared between services and clients. These interfaces must always be back and forward compatible.","members":{"TypeAlias":{"ConnectionMode":"/docs/apis/protocol-definitions#connectionmode-TypeAlias","IApprovedProposal":"/docs/apis/protocol-definitions#iapprovedproposal-TypeAlias","ICommittedProposal":"/docs/apis/protocol-definitions#icommittedproposal-TypeAlias","IQuorumEvents":"/docs/apis/protocol-definitions#iquorumevents-TypeAlias","ISequencedProposal":"/docs/apis/protocol-definitions#isequencedproposal-TypeAlias","IsoDate":"/docs/apis/protocol-definitions#isodate-TypeAlias","ITreeEntry":"/docs/apis/protocol-definitions#itreeentry-TypeAlias","SummaryObject":"/docs/apis/protocol-definitions#summaryobject-TypeAlias","SummaryTree":"/docs/apis/protocol-definitions#summarytree-TypeAlias","SummaryType":"/docs/apis/protocol-definitions#summarytype-TypeAlias","SummaryTypeNoHandle":"/docs/apis/protocol-definitions#summarytypenohandle-TypeAlias"},"Enum":{"FileMode":"/docs/apis/protocol-definitions#filemode-Enum","MessageType":"/docs/apis/protocol-definitions#messagetype-Enum","NackErrorType":"/docs/apis/protocol-definitions#nackerrortype-Enum","ScopeType":"/docs/apis/protocol-definitions#scopetype-Enum","TreeEntry":"/docs/apis/protocol-definitions#treeentry-Enum"},"Interface":{"IActorClient":"/docs/apis/protocol-definitions/iactorclient","IAttachment":"/docs/apis/protocol-definitions/iattachment","IBlob":"/docs/apis/protocol-definitions/iblob","IBranchOrigin":"/docs/apis/protocol-definitions/ibranchorigin","ICapabilities":"/docs/apis/protocol-definitions/icapabilities","IClient":"/docs/apis/protocol-definitions/iclient","IClientConfiguration":"/docs/apis/protocol-definitions/iclientconfiguration","IClientDetails":"/docs/apis/protocol-definitions/iclientdetails","IClientJoin":"/docs/apis/protocol-definitions/iclientjoin","IConnect":"/docs/apis/protocol-definitions/iconnect","IConnected":"/docs/apis/protocol-definitions/iconnected","ICreateBlobResponse":"/docs/apis/protocol-definitions/icreateblobresponse","IDocumentAttributes":"/docs/apis/protocol-definitions/idocumentattributes","IDocumentMessage":"/docs/apis/protocol-definitions/idocumentmessage","IDocumentSystemMessage":"/docs/apis/protocol-definitions/idocumentsystemmessage","IHelpMessage":"/docs/apis/protocol-definitions/ihelpmessage","INack":"/docs/apis/protocol-definitions/inack","INackContent":"/docs/apis/protocol-definitions/inackcontent","IProcessMessageResult":"/docs/apis/protocol-definitions/iprocessmessageresult","IProposal":"/docs/apis/protocol-definitions/iproposal","IProtocolState":"/docs/apis/protocol-definitions/iprotocolstate","IQueueMessage":"/docs/apis/protocol-definitions/iqueuemessage","IQuorum":"/docs/apis/protocol-definitions/iquorum","IQuorumClients":"/docs/apis/protocol-definitions/iquorumclients","IQuorumClientsEvents":"/docs/apis/protocol-definitions/iquorumclientsevents","IQuorumProposals":"/docs/apis/protocol-definitions/iquorumproposals","IQuorumProposalsEvents":"/docs/apis/protocol-definitions/iquorumproposalsevents","ISequencedClient":"/docs/apis/protocol-definitions/isequencedclient","ISequencedDocumentAugmentedMessage":"/docs/apis/protocol-definitions/isequenceddocumentaugmentedmessage","ISequencedDocumentMessage":"/docs/apis/protocol-definitions/isequenceddocumentmessage","ISequencedDocumentSystemMessage":"/docs/apis/protocol-definitions/isequenceddocumentsystemmessage","IServerError":"/docs/apis/protocol-definitions/iservererror","ISignalClient":"/docs/apis/protocol-definitions/isignalclient","ISignalMessage":"/docs/apis/protocol-definitions/isignalmessage","ISnapshotTree":"/docs/apis/protocol-definitions/isnapshottree","ISnapshotTreeEx":"/docs/apis/protocol-definitions/isnapshottreeex","ISummaryAck":"/docs/apis/protocol-definitions/isummaryack","ISummaryAttachment":"/docs/apis/protocol-definitions/isummaryattachment","ISummaryBlob":"/docs/apis/protocol-definitions/isummaryblob","ISummaryContent":"/docs/apis/protocol-definitions/isummarycontent","ISummaryHandle":"/docs/apis/protocol-definitions/isummaryhandle","ISummaryNack":"/docs/apis/protocol-definitions/isummarynack","ISummaryProposal":"/docs/apis/protocol-definitions/isummaryproposal","ISummaryTokenClaims":"/docs/apis/protocol-definitions/isummarytokenclaims","ISummaryTree":"/docs/apis/protocol-definitions/isummarytree","ITokenClaims":"/docs/apis/protocol-definitions/itokenclaims","ITokenProvider":"/docs/apis/protocol-definitions/itokenprovider","ITokenService":"/docs/apis/protocol-definitions/itokenservice","ITrace":"/docs/apis/protocol-definitions/itrace","ITree":"/docs/apis/protocol-definitions/itree","IUploadedSummaryDetails":"/docs/apis/protocol-definitions/iuploadedsummarydetails","IUser":"/docs/apis/protocol-definitions/iuser","IVersion":"/docs/apis/protocol-definitions/iversion"},"Namespace":{"SummaryType":"/docs/apis/protocol-definitions/summarytype"}},"package":"@fluidframework/protocol-definitions","unscopedPackageName":"protocol-definitions"}

[//]: # (Do not edit this file. It is automatically generated by API Documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/protocol-definitions](/docs/apis/protocol-definitions)

Core set of Fluid protocol interfaces shared between services and clients. These interfaces must always be back and forward compatible.

## Enumerations

<table class="table table-striped table-hover enum-list">
<caption>List of enums contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Enumeration</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#filemode-Enum'>FileMode</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#messagetype-Enum'>MessageType</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#nackerrortype-Enum'>NackErrorType</a></td>
      <td>Type of the Nack. InvalidScopeError: Client's token is not valid for the intended op. ThrottlingError: Retryable after retryAfter number. BadRequestError: Clients op is invalid and should retry immediately with a valid op. LimitExceededError: Service is having issues. Client should not retry.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#scopetype-Enum'>ScopeType</a></td>
      <td>Defines scope access for a Container/Document</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#treeentry-Enum'>TreeEntry</a></td>
      <td>Type of entries that can be stored in a tree</td>
    </tr>
  </tbody>
</table>

## Interfaces

<table class="table table-striped table-hover interface-list">
<caption>List of interfaces contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Interface</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iactorclient'>IActorClient</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iattachment'>IAttachment</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iblob'>IBlob</a></td>
      <td>Raw blob stored within the tree</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/ibranchorigin'>IBranchOrigin</a></td>
      <td>Branch origin information</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/icapabilities'>ICapabilities</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iclient'>IClient</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iclientconfiguration'>IClientConfiguration</a></td>
      <td>Key value store of service configuration properties provided to the client as part of connection</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iclientdetails'>IClientDetails</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iclientjoin'>IClientJoin</a></td>
      <td>Contents sent with a ClientJoin message</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iconnect'>IConnect</a></td>
      <td>Message sent to connect to the given document</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iconnected'>IConnected</a></td>
      <td>Message sent to indicate a client has connected to the server</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/icreateblobresponse'>ICreateBlobResponse</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/idocumentattributes'>IDocumentAttributes</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/idocumentmessage'>IDocumentMessage</a></td>
      <td>Document specific message</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/idocumentsystemmessage'>IDocumentSystemMessage</a></td>
      <td>Document Message with optional system level data field.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/ihelpmessage'>IHelpMessage</a></td>
      <td>Represents a message containing tasks.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/inack'>INack</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/inackcontent'>INackContent</a></td>
      <td>Interface for nack content.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iprocessmessageresult'>IProcessMessageResult</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iproposal'>IProposal</a></td>
      <td>Proposal to set the given key/value pair.<!-- -->Consensus on the proposal is achieved if the MSN is >= the sequence number at which the proposal is made and no client within the collaboration window rejects the proposal.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iprotocolstate'>IProtocolState</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iqueuemessage'>IQueueMessage</a></td>
      <td>Represents a message in task queue to be processed.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iquorum'>IQuorum</a></td>
      <td>Interface combining tracking of clients as well as proposals in the Quorum.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iquorumclients'>IQuorumClients</a></td>
      <td>Interface for tracking clients in the Quorum.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iquorumclientsevents'>IQuorumClientsEvents</a></td>
      <td>Events fired by a Quorum in response to client tracking.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iquorumproposals'>IQuorumProposals</a></td>
      <td>Interface for tracking proposals in the Quorum.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iquorumproposalsevents'>IQuorumProposalsEvents</a></td>
      <td>Events fired by a Quorum in response to proposal tracking.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isequencedclient'>ISequencedClient</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isequenceddocumentaugmentedmessage'>ISequencedDocumentAugmentedMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage'>ISequencedDocumentMessage</a></td>
      <td>Sequenced message for a distributed document</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isequenceddocumentsystemmessage'>ISequencedDocumentSystemMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iservererror'>IServerError</a></td>
      <td>General errors returned from the server. May want to add error code or something similar in the future.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isignalclient'>ISignalClient</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isignalmessage'>ISignalMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isnapshottree'>ISnapshotTree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isnapshottreeex'>ISnapshotTreeEx</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummaryack'>ISummaryAck</a></td>
      <td>Contents of summary ack expected from the server.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummaryattachment'>ISummaryAttachment</a></td>
      <td>Unique identifier for blobs uploaded outside of the summary. Attachment Blobs are uploaded and downloaded separately and do not take part of the snapshot payload. The id gets returned from the backend after the attachment has been uploaded. Additional information can be found here: <a href='https://github.com/microsoft/FluidFramework/issues/6374'>https://github.com/microsoft/FluidFramework/issues/6374</a></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummaryblob'>ISummaryBlob</a></td>
      <td>String or Binary data to be uploaded to the server as part of the container's Summary. Note: Already uploaded blobs would be referenced by a ISummaryAttachment. Additional information can be found here: <a href='https://github.com/microsoft/FluidFramework/issues/6568'>https://github.com/microsoft/FluidFramework/issues/6568</a></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummarycontent'>ISummaryContent</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummaryhandle'>ISummaryHandle</a></td>
      <td>Path to a summary tree object from the last successful summary indicating the summary object hasn't changed since it was uploaded.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummarynack'>ISummaryNack</a></td>
      <td>Contents of summary nack expected from the server.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummaryproposal'>ISummaryProposal</a></td>
      <td>Data about the original proposed summary op.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummarytokenclaims'>ISummaryTokenClaims</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/isummarytree'>ISummaryTree</a></td>
      <td>Tree Node data structure with children that are nodes of SummaryObject type: Blob, Handle, Attachment or another Tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/itokenclaims'>ITokenClaims</a></td>
      <td><a href='https://jwt.io/introduction/'>JSON Web Token (JWT)</a> Claims<!-- -->See <a href='https://datatracker.ietf.org/doc/html/rfc7519#section-4'>https://datatracker.ietf.org/doc/html/rfc7519#section-4</a></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/itokenprovider'>ITokenProvider</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/itokenservice'>ITokenService</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/itrace'>ITrace</a></td>
      <td>Messages to track latency trace</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/itree'>ITree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iuploadedsummarydetails'>IUploadedSummaryDetails</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iuser'>IUser</a></td>
      <td>Base user definition. It is valid to extend this interface when adding new details to the user object.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/iversion'>IVersion</a></td>
      <td>Represents a version of the snapshot of a data store</td>
    </tr>
  </tbody>
</table>

## Namespaces

<table class="table table-striped table-hover namespace-list">
<caption>List of namespaces contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Namespace</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/protocol-definitions/summarytype'>SummaryType</a></td>
      <td>Type tag used to distinguish different types of nodes in a <a href='/docs/apis/protocol-definitions/isummarytree'>ISummaryTree</a>.</td>
    </tr>
  </tbody>
</table>

## Type Aliases

<table class="table table-striped table-hover alias-list">
<caption>List of type aliases contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Type Alias</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#connectionmode-TypeAlias'>ConnectionMode</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#iapprovedproposal-TypeAlias'>IApprovedProposal</a></td>
      <td>Adds the sequence number at which the message was approved to an ISequencedProposal</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#icommittedproposal-TypeAlias'>ICommittedProposal</a></td>
      <td>Adds the sequence number at which the message was committed to an IApprovedProposal</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#iquorumevents-TypeAlias'>IQuorumEvents</a></td>
      <td>All events fired by an IQuorum, both client tracking and proposal tracking.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#isequencedproposal-TypeAlias'>ISequencedProposal</a></td>
      <td>Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#isodate-TypeAlias'>IsoDate</a></td>
      <td><a href='https://www.iso.org/iso-8601-date-and-time-format.html'>ISO 8601 format</a> date: <code>YYYY-MM-DDTHH:MM:SSZ</code></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#itreeentry-TypeAlias'>ITreeEntry</a></td>
      <td>A tree entry wraps a path with a type of node</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#summaryobject-TypeAlias'>SummaryObject</a></td>
      <td>Object representing a node within a summary tree. If any particular node is an <a href='/docs/apis/protocol-definitions/isummarytree'>ISummaryTree</a>, it can contain additional <code>SummaryObject</code>s as its children.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#summarytree-TypeAlias'>SummaryTree</a></td>
      <td>The root of the summary tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#summarytype-TypeAlias'>SummaryType</a></td>
      <td>Type tag used to distinguish different types of nodes in a <a href='/docs/apis/protocol-definitions/isummarytree'>ISummaryTree</a>.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/protocol-definitions#summarytypenohandle-TypeAlias'>SummaryTypeNoHandle</a></td>
      <td>Summary type that <a href='/docs/apis/protocol-definitions/isummaryhandle'>ISummaryHandle</a> points to.</td>
    </tr>
  </tbody>
</table>

<hr><div id=package-details>

## Enumeration Details {#enumerations-details}

### FileMode enum {#filemode-Enum}

<b>Signature:</b>

```typescript
export declare enum FileMode 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Directory</td>
      <td><code>&quot;040000&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Executable</td>
      <td><code>&quot;100755&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>File</td>
      <td><code>&quot;100644&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Symlink</td>
      <td><code>&quot;120000&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>

### MessageType enum {#messagetype-Enum}

<b>Signature:</b>

```typescript
export declare enum MessageType 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>ClientJoin</td>
      <td><code>&quot;join&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>ClientLeave</td>
      <td><code>&quot;leave&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Control</td>
      <td><code>&quot;control&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>NoClient</td>
      <td><code>&quot;noClient&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>NoOp</td>
      <td><code>&quot;noop&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Operation</td>
      <td><code>&quot;op&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Propose</td>
      <td><code>&quot;propose&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Reject</td>
      <td><code>&quot;reject&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>RemoteHelp</td>
      <td><code>&quot;remoteHelp&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>RoundTrip</td>
      <td><code>&quot;tripComplete&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Summarize</td>
      <td><code>&quot;summarize&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>SummaryAck</td>
      <td><code>&quot;summaryAck&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>SummaryNack</td>
      <td><code>&quot;summaryNack&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>

### NackErrorType enum {#nackerrortype-Enum}

Type of the Nack. InvalidScopeError: Client's token is not valid for the intended op. ThrottlingError: Retryable after retryAfter number. BadRequestError: Clients op is invalid and should retry immediately with a valid op. LimitExceededError: Service is having issues. Client should not retry.

<b>Signature:</b>

```typescript
export declare enum NackErrorType 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>BadRequestError</td>
      <td><code>&quot;BadRequestError&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>InvalidScopeError</td>
      <td><code>&quot;InvalidScopeError&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>LimitExceededError</td>
      <td><code>&quot;LimitExceededError&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>ThrottlingError</td>
      <td><code>&quot;ThrottlingError&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>

### ScopeType enum {#scopetype-Enum}

Defines scope access for a Container/Document

<b>Signature:</b>

```typescript
export declare enum ScopeType 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>DocRead</td>
      <td><code>&quot;doc:read&quot;</code></td>
      <td>Read access is supported on the Container/Document</td>
    </tr>
    <tr>
      <td>DocWrite</td>
      <td><code>&quot;doc:write&quot;</code></td>
      <td>Write access is supported on the Container/Document</td>
    </tr>
    <tr>
      <td>SummaryWrite</td>
      <td><code>&quot;summary:write&quot;</code></td>
      <td>User can generate new summaries operations</td>
    </tr>
  </tbody>
</table>

### TreeEntry enum {#treeentry-Enum}

Type of entries that can be stored in a tree

<b>Signature:</b>

```typescript
export declare enum TreeEntry 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Attachment</td>
      <td><code>&quot;Attachment&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Blob</td>
      <td><code>&quot;Blob&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Tree</td>
      <td><code>&quot;Tree&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>


## Type Alias Details {#type-aliases-details}

### ConnectionMode {#connectionmode-TypeAlias}

<b>Signature:</b>

```typescript
export declare type ConnectionMode = "write" | "read";
```

### IApprovedProposal {#iapprovedproposal-TypeAlias}

Adds the sequence number at which the message was approved to an ISequencedProposal

<b>Signature:</b>

```typescript
export declare type IApprovedProposal = {
    approvalSequenceNumber: number;
} & ISequencedProposal;
```

### ICommittedProposal {#icommittedproposal-TypeAlias}

Adds the sequence number at which the message was committed to an IApprovedProposal

<b>Signature:</b>

```typescript
export declare type ICommittedProposal = {
    commitSequenceNumber: number;
} & IApprovedProposal;
```

### IQuorumEvents {#iquorumevents-TypeAlias}

All events fired by an IQuorum, both client tracking and proposal tracking.

<b>Signature:</b>

```typescript
export declare type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;
```

### ISequencedProposal {#isequencedproposal-TypeAlias}

Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal

<b>Signature:</b>

```typescript
export declare type ISequencedProposal = {
    sequenceNumber: number;
} & IProposal;
```

### IsoDate {#isodate-TypeAlias}

[ISO 8601 format](https://www.iso.org/iso-8601-date-and-time-format.html) date: `YYYY-MM-DDTHH:MM:SSZ`

<b>Signature:</b>

```typescript
export declare type IsoDate = string;
```

### ITreeEntry {#itreeentry-TypeAlias}

A tree entry wraps a path with a type of node

<b>Signature:</b>

```typescript
export declare type ITreeEntry = {
    path: string;
    mode: FileMode;
} & ({
    type: TreeEntry.Blob;
    value: IBlob;
} | {
    type: TreeEntry.Tree;
    value: ITree;
} | {
    type: TreeEntry.Attachment;
    value: IAttachment;
});
```

### SummaryObject {#summaryobject-TypeAlias}

Object representing a node within a summary tree. If any particular node is an [ISummaryTree](/docs/apis/protocol-definitions/isummarytree)<!-- -->, it can contain additional `SummaryObject`<!-- -->s as its children.

<b>Signature:</b>

```typescript
export declare type SummaryObject = ISummaryTree | ISummaryBlob | ISummaryHandle | ISummaryAttachment;
```

### SummaryTree {#summarytree-TypeAlias}

The root of the summary tree.

<b>Signature:</b>

```typescript
export declare type SummaryTree = ISummaryTree | ISummaryHandle;
```

### SummaryType {#summarytype-TypeAlias}

Type tag used to distinguish different types of nodes in a [ISummaryTree](/docs/apis/protocol-definitions/isummarytree)<!-- -->.

<b>Signature:</b>

```typescript
export declare type SummaryType = SummaryType.Attachment | SummaryType.Blob | SummaryType.Handle | SummaryType.Tree;
```

### SummaryTypeNoHandle {#summarytypenohandle-TypeAlias}

Summary type that [ISummaryHandle](/docs/apis/protocol-definitions/isummaryhandle) points to.

<b>Signature:</b>

```typescript
export declare type SummaryTypeNoHandle = SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment;
```

#### Remarks {#summarytypenohandle-TypeAlias-remarks}

Summary handles are often used to point to summary tree objects contained within older summaries, thus avoiding the need to re-send the entire subtree if summary object has not changed.


</div>
