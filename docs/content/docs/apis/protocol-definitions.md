{
  "title": "@fluidframework/protocol-definitions Package",
  "summary": "Core set of Fluid protocol interfaces shared between services and clients. These interfaces must always be back and forward compatible.",
  "kind": "Package",
  "members": {
    "TypeAlias": {
      "ConnectionMode": "/docs/apis/protocol-definitions#connectionmode-typealias",
      "IApprovedProposal": "/docs/apis/protocol-definitions#iapprovedproposal-typealias",
      "ICommittedProposal": "/docs/apis/protocol-definitions#icommittedproposal-typealias",
      "IQuorumEvents": "/docs/apis/protocol-definitions#iquorumevents-typealias",
      "ISequencedProposal": "/docs/apis/protocol-definitions#isequencedproposal-typealias",
      "IsoDate": "/docs/apis/protocol-definitions#isodate-typealias",
      "ITreeEntry": "/docs/apis/protocol-definitions#itreeentry-typealias",
      "SummaryObject": "/docs/apis/protocol-definitions#summaryobject-typealias",
      "SummaryTree": "/docs/apis/protocol-definitions#summarytree-typealias",
      "SummaryType": "/docs/apis/protocol-definitions#summarytype-typealias",
      "SummaryTypeNoHandle": "/docs/apis/protocol-definitions#summarytypenohandle-typealias"
    },
    "Enum": {
      "FileMode": "/docs/apis/protocol-definitions#filemode-enum",
      "MessageType": "/docs/apis/protocol-definitions#messagetype-enum",
      "NackErrorType": "/docs/apis/protocol-definitions#nackerrortype-enum",
      "ScopeType": "/docs/apis/protocol-definitions#scopetype-enum",
      "SignalType": "/docs/apis/protocol-definitions#signaltype-enum",
      "TreeEntry": "/docs/apis/protocol-definitions#treeentry-enum"
    },
    "Interface": {
      "IActorClient": "/docs/apis/protocol-definitions/iactorclient-interface",
      "IAttachment": "/docs/apis/protocol-definitions/iattachment-interface",
      "IBlob": "/docs/apis/protocol-definitions/iblob-interface",
      "IBranchOrigin": "/docs/apis/protocol-definitions/ibranchorigin-interface",
      "ICapabilities": "/docs/apis/protocol-definitions/icapabilities-interface",
      "IClient": "/docs/apis/protocol-definitions/iclient-interface",
      "IClientConfiguration": "/docs/apis/protocol-definitions/iclientconfiguration-interface",
      "IClientDetails": "/docs/apis/protocol-definitions/iclientdetails-interface",
      "IClientJoin": "/docs/apis/protocol-definitions/iclientjoin-interface",
      "IConnect": "/docs/apis/protocol-definitions/iconnect-interface",
      "IConnected": "/docs/apis/protocol-definitions/iconnected-interface",
      "ICreateBlobResponse": "/docs/apis/protocol-definitions/icreateblobresponse-interface",
      "IDocumentAttributes": "/docs/apis/protocol-definitions/idocumentattributes-interface",
      "IDocumentMessage": "/docs/apis/protocol-definitions/idocumentmessage-interface",
      "IDocumentSystemMessage": "/docs/apis/protocol-definitions/idocumentsystemmessage-interface",
      "INack": "/docs/apis/protocol-definitions/inack-interface",
      "INackContent": "/docs/apis/protocol-definitions/inackcontent-interface",
      "IProcessMessageResult": "/docs/apis/protocol-definitions/iprocessmessageresult-interface",
      "IProposal": "/docs/apis/protocol-definitions/iproposal-interface",
      "IProtocolState": "/docs/apis/protocol-definitions/iprotocolstate-interface",
      "IQuorum": "/docs/apis/protocol-definitions/iquorum-interface",
      "IQuorumClients": "/docs/apis/protocol-definitions/iquorumclients-interface",
      "IQuorumClientsEvents": "/docs/apis/protocol-definitions/iquorumclientsevents-interface",
      "IQuorumProposals": "/docs/apis/protocol-definitions/iquorumproposals-interface",
      "IQuorumProposalsEvents": "/docs/apis/protocol-definitions/iquorumproposalsevents-interface",
      "ISentSignalMessage": "/docs/apis/protocol-definitions/isentsignalmessage-interface",
      "ISequencedClient": "/docs/apis/protocol-definitions/isequencedclient-interface",
      "ISequencedDocumentAugmentedMessage": "/docs/apis/protocol-definitions/isequenceddocumentaugmentedmessage-interface",
      "ISequencedDocumentMessage": "/docs/apis/protocol-definitions/isequenceddocumentmessage-interface",
      "ISequencedDocumentSystemMessage": "/docs/apis/protocol-definitions/isequenceddocumentsystemmessage-interface",
      "IServerError": "/docs/apis/protocol-definitions/iservererror-interface",
      "ISignalClient": "/docs/apis/protocol-definitions/isignalclient-interface",
      "ISignalMessage": "/docs/apis/protocol-definitions/isignalmessage-interface",
      "ISignalMessageBase": "/docs/apis/protocol-definitions/isignalmessagebase-interface",
      "ISnapshotTree": "/docs/apis/protocol-definitions/isnapshottree-interface",
      "ISnapshotTreeEx": "/docs/apis/protocol-definitions/isnapshottreeex-interface",
      "ISummaryAck": "/docs/apis/protocol-definitions/isummaryack-interface",
      "ISummaryAttachment": "/docs/apis/protocol-definitions/isummaryattachment-interface",
      "ISummaryBlob": "/docs/apis/protocol-definitions/isummaryblob-interface",
      "ISummaryContent": "/docs/apis/protocol-definitions/isummarycontent-interface",
      "ISummaryHandle": "/docs/apis/protocol-definitions/isummaryhandle-interface",
      "ISummaryNack": "/docs/apis/protocol-definitions/isummarynack-interface",
      "ISummaryProposal": "/docs/apis/protocol-definitions/isummaryproposal-interface",
      "ISummaryTokenClaims": "/docs/apis/protocol-definitions/isummarytokenclaims-interface",
      "ISummaryTree": "/docs/apis/protocol-definitions/isummarytree-interface",
      "ITokenClaims": "/docs/apis/protocol-definitions/itokenclaims-interface",
      "ITokenProvider": "/docs/apis/protocol-definitions/itokenprovider-interface",
      "ITokenService": "/docs/apis/protocol-definitions/itokenservice-interface",
      "ITrace": "/docs/apis/protocol-definitions/itrace-interface",
      "ITree": "/docs/apis/protocol-definitions/itree-interface",
      "IUploadedSummaryDetails": "/docs/apis/protocol-definitions/iuploadedsummarydetails-interface",
      "IUser": "/docs/apis/protocol-definitions/iuser-interface",
      "IVersion": "/docs/apis/protocol-definitions/iversion-interface"
    },
    "Namespace": {
      "SummaryType": "/docs/apis/protocol-definitions/summarytype-namespace"
    }
  },
  "package": "@fluidframework/protocol-definitions",
  "unscopedPackageName": "protocol-definitions"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/protocol-definitions](/docs/apis/protocol-definitions)

Core set of Fluid protocol interfaces shared between services and clients. These interfaces must always be back and forward compatible.

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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iactorclient-interface'>IActorClient</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iattachment-interface'>IAttachment</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iblob-interface'>IBlob</a>
      </td>
      <td>
      </td>
      <td>
        Raw blob stored within the tree
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/ibranchorigin-interface'>IBranchOrigin</a>
      </td>
      <td>
      </td>
      <td>
        Branch origin information
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/icapabilities-interface'>ICapabilities</a>
      </td>
      <td>
      </td>
      <td>
        Capabilities of a Client. In particular, whether or not the client is <a href='/docs/apis/protocol-definitions/icapabilities-interface#interactive-propertysignature'>interactive</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iclient-interface'>IClient</a>
      </td>
      <td>
      </td>
      <td>
        Represents a client connected to a Fluid service, including associated user details, permissions, and connection mode.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iclientconfiguration-interface'>IClientConfiguration</a>
      </td>
      <td>
      </td>
      <td>
        Key value store of service configuration properties provided to the client as part of connection
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iclientdetails-interface'>IClientDetails</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions/iclient-interface'>IClient</a> connection / environment metadata.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iclientjoin-interface'>IClientJoin</a>
      </td>
      <td>
      </td>
      <td>
        Contents sent with a <code>ClientJoin</code> message.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iconnect-interface'>IConnect</a>
      </td>
      <td>
      </td>
      <td>
        Message sent to connect to the given document
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iconnected-interface'>IConnected</a>
      </td>
      <td>
      </td>
      <td>
        Message sent to indicate a client has connected to the server
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/icreateblobresponse-interface'>ICreateBlobResponse</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/idocumentattributes-interface'>IDocumentAttributes</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/idocumentmessage-interface'>IDocumentMessage</a>
      </td>
      <td>
      </td>
      <td>
        Document specific message
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/idocumentsystemmessage-interface'>IDocumentSystemMessage</a>
      </td>
      <td>
      </td>
      <td>
        Document Message with optional system level data field.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/inack-interface'>INack</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/inackcontent-interface'>INackContent</a>
      </td>
      <td>
      </td>
      <td>
        Interface for nack content.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iprocessmessageresult-interface'>IProcessMessageResult</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iproposal-interface'>IProposal</a>
      </td>
      <td>
      </td>
      <td>
        <p>
          Proposal to set the given key/value pair.
        </p>
        <p>
          Consensus on the proposal is achieved if the MSN is \>= the sequence number at which the proposal is made and no client within the collaboration window rejects the proposal.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iprotocolstate-interface'>IProtocolState</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iquorum-interface'>IQuorum</a>
      </td>
      <td>
      </td>
      <td>
        Interface combining tracking of clients as well as proposals in the Quorum.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iquorumclients-interface'>IQuorumClients</a>
      </td>
      <td>
      </td>
      <td>
        Interface for tracking clients in the Quorum.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iquorumclientsevents-interface'>IQuorumClientsEvents</a>
      </td>
      <td>
      </td>
      <td>
        Events fired by a Quorum in response to client tracking.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iquorumproposals-interface'>IQuorumProposals</a>
      </td>
      <td>
      </td>
      <td>
        Interface for tracking proposals in the Quorum.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iquorumproposalsevents-interface'>IQuorumProposalsEvents</a>
      </td>
      <td>
      </td>
      <td>
        Events fired by a Quorum in response to proposal tracking.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isentsignalmessage-interface'>ISentSignalMessage</a>
      </td>
      <td>
      </td>
      <td>
        Interface for signals sent by clients to the server when submit_signals_v2 is enabled
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isequencedclient-interface'>ISequencedClient</a>
      </td>
      <td>
      </td>
      <td>
        A <a href='/docs/apis/protocol-definitions/iclient-interface'>IClient</a> that has been acknowledged by the sequencer.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isequenceddocumentaugmentedmessage-interface'>ISequencedDocumentAugmentedMessage</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>
      </td>
      <td>
      </td>
      <td>
        Sequenced message for a distributed document
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isequenceddocumentsystemmessage-interface'>ISequencedDocumentSystemMessage</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iservererror-interface'>IServerError</a>
      </td>
      <td>
      </td>
      <td>
        General errors returned from the server. May want to add error code or something similar in the future.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isignalclient-interface'>ISignalClient</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isignalmessage-interface'>ISignalMessage</a>
      </td>
      <td>
      </td>
      <td>
        Interface for signals sent by the server to clients
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isignalmessagebase-interface'>ISignalMessageBase</a>
      </td>
      <td>
      </td>
      <td>
        Common interface between incoming and outgoing signals
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isnapshottree-interface'>ISnapshotTree</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isnapshottreeex-interface'>ISnapshotTreeEx</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummaryack-interface'>ISummaryAck</a>
      </td>
      <td>
      </td>
      <td>
        Contents of summary ack expected from the server.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummaryattachment-interface'>ISummaryAttachment</a>
      </td>
      <td>
      </td>
      <td>
        Unique identifier for blobs uploaded outside of the summary. Attachment Blobs are uploaded and downloaded separately and do not take part of the snapshot payload. The id gets returned from the backend after the attachment has been uploaded. Additional information can be found here: <a href='https://github.com/microsoft/FluidFramework/issues/6374'>https://github.com/microsoft/FluidFramework/issues/6374</a>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummaryblob-interface'>ISummaryBlob</a>
      </td>
      <td>
      </td>
      <td>
        String or Binary data to be uploaded to the server as part of the container's Summary. Note: Already uploaded blobs would be referenced by a ISummaryAttachment. Additional information can be found here: <a href='https://github.com/microsoft/FluidFramework/issues/6568'>https://github.com/microsoft/FluidFramework/issues/6568</a>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummarycontent-interface'>ISummaryContent</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummaryhandle-interface'>ISummaryHandle</a>
      </td>
      <td>
      </td>
      <td>
        Path to a summary tree object from the last successful summary indicating the summary object hasn't changed since it was uploaded.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummarynack-interface'>ISummaryNack</a>
      </td>
      <td>
      </td>
      <td>
        Contents of summary nack expected from the server.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummaryproposal-interface'>ISummaryProposal</a>
      </td>
      <td>
      </td>
      <td>
        Data about the original proposed summary message.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummarytokenclaims-interface'>ISummaryTokenClaims</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
      </td>
      <td>
        Tree Node data structure with children that are nodes of SummaryObject type: Blob, Handle, Attachment or another Tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/itokenclaims-interface'>ITokenClaims</a>
      </td>
      <td>
      </td>
      <td>
        <p>
          <a href='https://jwt.io/introduction/'>JSON Web Token (JWT)</a> Claims
        </p>
        <p>
          See <a href='https://datatracker.ietf.org/doc/html/rfc7519#section-4'>https://datatracker.ietf.org/doc/html/rfc7519#section-4</a>
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/itokenprovider-interface'>ITokenProvider</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/itokenservice-interface'>ITokenService</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/itrace-interface'>ITrace</a>
      </td>
      <td>
      </td>
      <td>
        Messages to track latency trace
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/itree-interface'>ITree</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iuploadedsummarydetails-interface'>IUploadedSummaryDetails</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iuser-interface'>IUser</a>
      </td>
      <td>
      </td>
      <td>
        Base user definition. It is valid to extend this interface when adding new details to the user object.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/iversion-interface'>IVersion</a>
      </td>
      <td>
      </td>
      <td>
        Represents a version of the snapshot of a data store
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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#filemode-enum'>FileMode</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-enum'>MessageType</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#nackerrortype-enum'>NackErrorType</a>
      </td>
      <td>
        Type of the Nack. InvalidScopeError: Client's token is not valid for the intended message. ThrottlingError: Retriable after retryAfter number. BadRequestError: Clients message is invalid and should retry immediately with a valid message. LimitExceededError: Service is having issues. Client should not retry.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#scopetype-enum'>ScopeType</a>
      </td>
      <td>
        Defines scope access for a Container/Document
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#signaltype-enum'>SignalType</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#treeentry-enum'>TreeEntry</a>
      </td>
      <td>
        Type of entries that can be stored in a tree
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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#connectionmode-typealias'>ConnectionMode</a>
      </td>
      <td>
        A client's connection mode - either view-only (&quot;read&quot;) or allowing edits (&quot;write&quot;).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#iapprovedproposal-typealias'>IApprovedProposal</a>
      </td>
      <td>
        Adds the sequence number at which the message was approved to an ISequencedProposal
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#icommittedproposal-typealias'>ICommittedProposal</a>
      </td>
      <td>
        Adds the sequence number at which the message was committed to an IApprovedProposal
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#iquorumevents-typealias'>IQuorumEvents</a>
      </td>
      <td>
        All events fired by an IQuorum, both client tracking and proposal tracking.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#isequencedproposal-typealias'>ISequencedProposal</a>
      </td>
      <td>
        Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#isodate-typealias'>IsoDate</a>
      </td>
      <td>
        <a href='https://www.iso.org/iso-8601-date-and-time-format.html'>ISO 8601 format</a> date: <code>YYYY-MM-DDTHH:MM:SSZ</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#itreeentry-typealias'>ITreeEntry</a>
      </td>
      <td>
        A tree entry wraps a path with a type of node
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#summaryobject-typealias'>SummaryObject</a>
      </td>
      <td>
        Object representing a node within a summary tree. If any particular node is an <a href='/docs/apis/protocol-definitions/isummarytree-interface'>ISummaryTree</a>, it can contain additional <code>SummaryObject</code>s as its children.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#summarytree-typealias'>SummaryTree</a>
      </td>
      <td>
        The root of the summary tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#summarytype-typealias'>SummaryType</a>
      </td>
      <td>
        Type tag used to distinguish different types of nodes in a <a href='/docs/apis/protocol-definitions/isummarytree-interface'>ISummaryTree</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#summarytypenohandle-typealias'>SummaryTypeNoHandle</a>
      </td>
      <td>
        Summary type that <a href='/docs/apis/protocol-definitions/isummaryhandle-interface'>ISummaryHandle</a> points to.
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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions/summarytype-namespace'>SummaryType</a>
      </td>
      <td>
        Type tag used to distinguish different types of nodes in a <a href='/docs/apis/protocol-definitions/isummarytree-interface'>ISummaryTree</a>.
      </td>
    </tr>
  </tbody>
</table>

## Enumeration Details

### FileMode {#filemode-enum}

#### Signature {#filemode-signature}

```typescript
export declare enum FileMode
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#filemode-directory-enummember'>Directory</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#filemode-executable-enummember'>Executable</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#filemode-file-enummember'>File</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#filemode-symlink-enummember'>Symlink</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

##### Directory {#filemode-directory-enummember}

###### Signature {#directory-signature}

```typescript
Directory = "040000"
```

##### Executable {#filemode-executable-enummember}

###### Signature {#executable-signature}

```typescript
Executable = "100755"
```

##### File {#filemode-file-enummember}

###### Signature {#file-signature}

```typescript
File = "100644"
```

##### Symlink {#filemode-symlink-enummember}

###### Signature {#symlink-signature}

```typescript
Symlink = "120000"
```

### MessageType {#messagetype-enum}

#### Signature {#messagetype-signature}

```typescript
export declare enum MessageType
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-accept-enummember'>Accept</a>
      </td>
      <td>
        Message sent by client accepting proposal
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-clientjoin-enummember'>ClientJoin</a>
      </td>
      <td>
        System message sent to indicate a new client has joined the collaboration.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-clientleave-enummember'>ClientLeave</a>
      </td>
      <td>
        System message sent to indicate a client has left the collaboration.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-control-enummember'>Control</a>
      </td>
      <td>
        Service specific control messages that are never sequenced.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-noclient-enummember'>NoClient</a>
      </td>
      <td>
        Message to indicate that no active clients are present.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-noop-enummember'>NoOp</a>
      </td>
      <td>
        Empty operation message. Used to send an updated reference sequence number. Relay service is free to coalesce these messages or fully drop them, if another message was used to update MSN to a number equal or higher than referenced sequence number in Noop.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-operation-enummember'>Operation</a>
      </td>
      <td>
        Operation (message) produced by container runtime.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-propose-enummember'>Propose</a>
      </td>
      <td>
        Proposes a new consensus value.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-reject-enummember'>Reject</a>
      </td>
      <td>
        Message used to reject a pending proposal.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-roundtrip-enummember'>RoundTrip</a>
      </td>
      <td>
        Message to indicate successful round trip.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-summarize-enummember'>Summarize</a>
      </td>
      <td>
        Summary operation (message).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-summaryack-enummember'>SummaryAck</a>
      </td>
      <td>
        Summary operation (message) written.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#messagetype-summarynack-enummember'>SummaryNack</a>
      </td>
      <td>
        Summary operation (message) write failure.
      </td>
    </tr>
  </tbody>
</table>

##### Accept {#messagetype-accept-enummember}

Message sent by client accepting proposal

###### Signature {#accept-signature}

```typescript
Accept = "accept"
```

##### ClientJoin {#messagetype-clientjoin-enummember}

System message sent to indicate a new client has joined the collaboration.

###### Signature {#clientjoin-signature}

```typescript
ClientJoin = "join"
```

##### ClientLeave {#messagetype-clientleave-enummember}

System message sent to indicate a client has left the collaboration.

###### Signature {#clientleave-signature}

```typescript
ClientLeave = "leave"
```

##### Control {#messagetype-control-enummember}

Service specific control messages that are never sequenced.

###### Signature {#control-signature}

```typescript
Control = "control"
```

##### NoClient {#messagetype-noclient-enummember}

Message to indicate that no active clients are present.

###### Signature {#noclient-signature}

```typescript
NoClient = "noClient"
```

##### NoOp {#messagetype-noop-enummember}

Empty operation message. Used to send an updated reference sequence number. Relay service is free to coalesce these messages or fully drop them, if another message was used to update MSN to a number equal or higher than referenced sequence number in Noop.

###### Signature {#noop-signature}

```typescript
NoOp = "noop"
```

##### Operation {#messagetype-operation-enummember}

Operation (message) produced by container runtime.

###### Signature {#operation-signature}

```typescript
Operation = "op"
```

##### Propose {#messagetype-propose-enummember}

Proposes a new consensus value.

###### Signature {#propose-signature}

```typescript
Propose = "propose"
```

##### Reject {#messagetype-reject-enummember}

Message used to reject a pending proposal.

###### Signature {#reject-signature}

```typescript
Reject = "reject"
```

##### RoundTrip {#messagetype-roundtrip-enummember}

Message to indicate successful round trip.

###### Signature {#roundtrip-signature}

```typescript
RoundTrip = "tripComplete"
```

##### Summarize {#messagetype-summarize-enummember}

Summary operation (message).

###### Signature {#summarize-signature}

```typescript
Summarize = "summarize"
```

##### SummaryAck {#messagetype-summaryack-enummember}

Summary operation (message) written.

###### Signature {#summaryack-signature}

```typescript
SummaryAck = "summaryAck"
```

##### SummaryNack {#messagetype-summarynack-enummember}

Summary operation (message) write failure.

###### Signature {#summarynack-signature}

```typescript
SummaryNack = "summaryNack"
```

### NackErrorType {#nackerrortype-enum}

Type of the Nack. InvalidScopeError: Client's token is not valid for the intended message. ThrottlingError: Retriable after retryAfter number. BadRequestError: Clients message is invalid and should retry immediately with a valid message. LimitExceededError: Service is having issues. Client should not retry.

#### Signature {#nackerrortype-signature}

```typescript
export declare enum NackErrorType
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#nackerrortype-badrequesterror-enummember'>BadRequestError</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#nackerrortype-invalidscopeerror-enummember'>InvalidScopeError</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#nackerrortype-limitexceedederror-enummember'>LimitExceededError</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#nackerrortype-throttlingerror-enummember'>ThrottlingError</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

##### BadRequestError {#nackerrortype-badrequesterror-enummember}

###### Signature {#badrequesterror-signature}

```typescript
BadRequestError = "BadRequestError"
```

##### InvalidScopeError {#nackerrortype-invalidscopeerror-enummember}

###### Signature {#invalidscopeerror-signature}

```typescript
InvalidScopeError = "InvalidScopeError"
```

##### LimitExceededError {#nackerrortype-limitexceedederror-enummember}

###### Signature {#limitexceedederror-signature}

```typescript
LimitExceededError = "LimitExceededError"
```

##### ThrottlingError {#nackerrortype-throttlingerror-enummember}

###### Signature {#throttlingerror-signature}

```typescript
ThrottlingError = "ThrottlingError"
```

### ScopeType {#scopetype-enum}

Defines scope access for a Container/Document

#### Signature {#scopetype-signature}

```typescript
export declare enum ScopeType
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#scopetype-docread-enummember'>DocRead</a>
      </td>
      <td>
        Read access is supported on the Container/Document
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#scopetype-docwrite-enummember'>DocWrite</a>
      </td>
      <td>
        Write access is supported on the Container/Document
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#scopetype-summarywrite-enummember'>SummaryWrite</a>
      </td>
      <td>
        User can generate new summaries operations
      </td>
    </tr>
  </tbody>
</table>

##### DocRead {#scopetype-docread-enummember}

Read access is supported on the Container/Document

###### Signature {#docread-signature}

```typescript
DocRead = "doc:read"
```

##### DocWrite {#scopetype-docwrite-enummember}

Write access is supported on the Container/Document

###### Signature {#docwrite-signature}

```typescript
DocWrite = "doc:write"
```

##### SummaryWrite {#scopetype-summarywrite-enummember}

User can generate new summaries operations

###### Signature {#summarywrite-signature}

```typescript
SummaryWrite = "summary:write"
```

### SignalType {#signaltype-enum}

#### Signature {#signaltype-signature}

```typescript
export declare enum SignalType
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#signaltype-clientjoin-enummember'>ClientJoin</a>
      </td>
      <td>
        System signal sent to indicate a new client has joined the collaboration.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#signaltype-clientleave-enummember'>ClientLeave</a>
      </td>
      <td>
        System signal sent to indicate a client has left the collaboration.
      </td>
    </tr>
  </tbody>
</table>

##### ClientJoin {#signaltype-clientjoin-enummember}

System signal sent to indicate a new client has joined the collaboration.

###### Signature {#clientjoin-signature}

```typescript
ClientJoin = "join"
```

##### ClientLeave {#signaltype-clientleave-enummember}

System signal sent to indicate a client has left the collaboration.

###### Signature {#clientleave-signature}

```typescript
ClientLeave = "leave"
```

### TreeEntry {#treeentry-enum}

Type of entries that can be stored in a tree

#### Signature {#treeentry-signature}

```typescript
export declare enum TreeEntry
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Flag
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#treeentry-attachment-enummember'>Attachment</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#treeentry-blob-enummember'>Blob</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/protocol-definitions#treeentry-tree-enummember'>Tree</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

##### Attachment {#treeentry-attachment-enummember}

###### Signature {#attachment-signature}

```typescript
Attachment = "Attachment"
```

##### Blob {#treeentry-blob-enummember}

###### Signature {#blob-signature}

```typescript
Blob = "Blob"
```

##### Tree {#treeentry-tree-enummember}

###### Signature {#tree-signature}

```typescript
Tree = "Tree"
```

## Type Details

### ConnectionMode {#connectionmode-typealias}

A client's connection mode - either view-only ("read") or allowing edits ("write").

#### Signature {#connectionmode-signature}

```typescript
export declare type ConnectionMode = "write" | "read";
```

#### Remarks {#connectionmode-remarks}

Note: a user's connection mode is dependent on their permissions. E.g. a user with read-only permissions will not be allowed a "write" connection mode.

### IApprovedProposal {#iapprovedproposal-typealias}

Adds the sequence number at which the message was approved to an ISequencedProposal

#### Signature {#iapprovedproposal-signature}

```typescript
export declare type IApprovedProposal = {
    approvalSequenceNumber: number;
} & ISequencedProposal;
```

### ICommittedProposal {#icommittedproposal-typealias}

Adds the sequence number at which the message was committed to an IApprovedProposal

#### Signature {#icommittedproposal-signature}

```typescript
export declare type ICommittedProposal = {
    commitSequenceNumber: number;
} & IApprovedProposal;
```

### IQuorumEvents {#iquorumevents-typealias}

All events fired by an IQuorum, both client tracking and proposal tracking.

#### Signature {#iquorumevents-signature}

```typescript
export declare type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;
```

### ISequencedProposal {#isequencedproposal-typealias}

Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal

#### Signature {#isequencedproposal-signature}

```typescript
export declare type ISequencedProposal = {
    sequenceNumber: number;
} & IProposal;
```

### IsoDate {#isodate-typealias}

[ISO 8601 format](https://www.iso.org/iso-8601-date-and-time-format.html) date: `YYYY-MM-DDTHH:MM:SSZ`

#### Signature {#isodate-signature}

```typescript
export declare type IsoDate = string;
```

### ITreeEntry {#itreeentry-typealias}

A tree entry wraps a path with a type of node

#### Signature {#itreeentry-signature}

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

### SummaryObject {#summaryobject-typealias}

Object representing a node within a summary tree. If any particular node is an [ISummaryTree](/docs/apis/protocol-definitions/isummarytree-interface), it can contain additional `SummaryObject`s as its children.

#### Signature {#summaryobject-signature}

```typescript
export declare type SummaryObject = ISummaryTree | ISummaryBlob | ISummaryHandle | ISummaryAttachment;
```

### SummaryTree {#summarytree-typealias}

The root of the summary tree.

#### Signature {#summarytree-signature}

```typescript
export declare type SummaryTree = ISummaryTree | ISummaryHandle;
```

### SummaryType {#summarytype-typealias}

Type tag used to distinguish different types of nodes in a [ISummaryTree](/docs/apis/protocol-definitions/isummarytree-interface).

#### Signature {#summarytype-signature}

```typescript
export declare type SummaryType = SummaryType.Attachment | SummaryType.Blob | SummaryType.Handle | SummaryType.Tree;
```

### SummaryTypeNoHandle {#summarytypenohandle-typealias}

Summary type that [ISummaryHandle](/docs/apis/protocol-definitions/isummaryhandle-interface) points to.

#### Signature {#summarytypenohandle-signature}

```typescript
export declare type SummaryTypeNoHandle = SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment;
```

#### Remarks {#summarytypenohandle-remarks}

Summary handles are often used to point to summary tree objects contained within older summaries, thus avoiding the need to re-send the entire subtree if summary object has not changed.
