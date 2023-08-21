{
  "title": "@fluidframework/server-services-client Package",
  "kind": "Package",
  "members": {
    "Class": {
      "BasicRestWrapper": "/docs/apis/server-services-client/basicrestwrapper-class",
      "GitManager": "/docs/apis/server-services-client/gitmanager-class",
      "Historian": "/docs/apis/server-services-client/historian-class",
      "NetworkError": "/docs/apis/server-services-client/networkerror-class",
      "RestLessClient": "/docs/apis/server-services-client/restlessclient-class",
      "RestWrapper": "/docs/apis/server-services-client/restwrapper-class",
      "SummaryTreeUploadManager": "/docs/apis/server-services-client/summarytreeuploadmanager-class",
      "WholeSummaryUploadManager": "/docs/apis/server-services-client/wholesummaryuploadmanager-class"
    },
    "Variable": {
      "buildTreePath": "/docs/apis/server-services-client#buildtreepath-variable",
      "canDeleteDoc": "/docs/apis/server-services-client#candeletedoc-variable",
      "canRead": "/docs/apis/server-services-client#canread-variable",
      "canRevokeToken": "/docs/apis/server-services-client#canrevoketoken-variable",
      "canSummarize": "/docs/apis/server-services-client#cansummarize-variable",
      "canWrite": "/docs/apis/server-services-client#canwrite-variable",
      "choose": "/docs/apis/server-services-client#choose-variable",
      "CorrelationIdHeaderName": "/docs/apis/server-services-client#correlationidheadername-variable",
      "defaultHash": "/docs/apis/server-services-client#defaulthash-variable",
      "DocDeleteScopeType": "/docs/apis/server-services-client#docdeletescopetype-variable",
      "DriverVersionHeaderName": "/docs/apis/server-services-client#driverversionheadername-variable",
      "getAuthorizationTokenFromCredentials": "/docs/apis/server-services-client#getauthorizationtokenfromcredentials-variable",
      "getRandomInt": "/docs/apis/server-services-client#getrandomint-variable",
      "LatestSummaryId": "/docs/apis/server-services-client#latestsummaryid-variable",
      "TokenRevokeScopeType": "/docs/apis/server-services-client#tokenrevokescopetype-variable"
    },
    "Function": {
      "convertFirstSummaryWholeSummaryTreeToSummaryTree": "/docs/apis/server-services-client#convertfirstsummarywholesummarytreetosummarytree-function",
      "convertSortedNumberArrayToRanges": "/docs/apis/server-services-client#convertsortednumberarraytoranges-function",
      "convertSummaryTreeToWholeSummaryTree": "/docs/apis/server-services-client#convertsummarytreetowholesummarytree-function",
      "convertWholeFlatSummaryToSnapshotTreeAndBlobs": "/docs/apis/server-services-client#convertwholeflatsummarytosnapshottreeandblobs-function",
      "createFluidServiceNetworkError": "/docs/apis/server-services-client#createfluidservicenetworkerror-function",
      "generateServiceProtocolEntries": "/docs/apis/server-services-client#generateserviceprotocolentries-function",
      "generateToken": "/docs/apis/server-services-client#generatetoken-function",
      "generateUser": "/docs/apis/server-services-client#generateuser-function",
      "getNextHash": "/docs/apis/server-services-client#getnexthash-function",
      "getOrCreateRepository": "/docs/apis/server-services-client#getorcreaterepository-function",
      "getQuorumTreeEntries": "/docs/apis/server-services-client#getquorumtreeentries-function",
      "getRandomName": "/docs/apis/server-services-client#getrandomname-function",
      "isNetworkError": "/docs/apis/server-services-client#isnetworkerror-function",
      "mergeAppAndProtocolTree": "/docs/apis/server-services-client#mergeappandprotocoltree-function",
      "promiseTimeout": "/docs/apis/server-services-client#promisetimeout-function",
      "throwFluidServiceNetworkError": "/docs/apis/server-services-client#throwfluidservicenetworkerror-function",
      "validateTokenClaims": "/docs/apis/server-services-client#validatetokenclaims-function",
      "validateTokenClaimsExpiration": "/docs/apis/server-services-client#validatetokenclaimsexpiration-function"
    },
    "TypeAlias": {
      "ExtendedSummaryObject": "/docs/apis/server-services-client#extendedsummaryobject-typealias",
      "IWholeFlatSummaryTreeEntry": "/docs/apis/server-services-client#iwholeflatsummarytreeentry-typealias",
      "IWholeSummaryPayloadType": "/docs/apis/server-services-client#iwholesummarypayloadtype-typealias",
      "WholeSummaryTreeEntry": "/docs/apis/server-services-client#wholesummarytreeentry-typealias",
      "WholeSummaryTreeValue": "/docs/apis/server-services-client#wholesummarytreevalue-typealias"
    },
    "Interface": {
      "IAlfredTenant": "/docs/apis/server-services-client/ialfredtenant-interface",
      "ICreateRefParamsExternal": "/docs/apis/server-services-client/icreaterefparamsexternal-interface",
      "ICredentials": "/docs/apis/server-services-client/icredentials-interface",
      "IEmbeddedSummaryHandle": "/docs/apis/server-services-client/iembeddedsummaryhandle-interface",
      "IGetRefParamsExternal": "/docs/apis/server-services-client/igetrefparamsexternal-interface",
      "IGitCache": "/docs/apis/server-services-client/igitcache-interface",
      "IGitManager": "/docs/apis/server-services-client/igitmanager-interface",
      "IGitService": "/docs/apis/server-services-client/igitservice-interface",
      "IHistorian": "/docs/apis/server-services-client/ihistorian-interface",
      "INetworkErrorDetails": "/docs/apis/server-services-client/inetworkerrordetails-interface",
      "INormalizedWholeSummary": "/docs/apis/server-services-client/inormalizedwholesummary-interface",
      "IPatchRefParamsExternal": "/docs/apis/server-services-client/ipatchrefparamsexternal-interface",
      "ISession": "/docs/apis/server-services-client/isession-interface",
      "ISummaryTree": "/docs/apis/server-services-client/isummarytree-interface",
      "ISummaryUploadManager": "/docs/apis/server-services-client/isummaryuploadmanager-interface",
      "IWholeFlatSummary": "/docs/apis/server-services-client/iwholeflatsummary-interface",
      "IWholeFlatSummaryBlob": "/docs/apis/server-services-client/iwholeflatsummaryblob-interface",
      "IWholeFlatSummaryTree": "/docs/apis/server-services-client/iwholeflatsummarytree-interface",
      "IWholeFlatSummaryTreeEntryBlob": "/docs/apis/server-services-client/iwholeflatsummarytreeentryblob-interface",
      "IWholeFlatSummaryTreeEntryTree": "/docs/apis/server-services-client/iwholeflatsummarytreeentrytree-interface",
      "IWholeSummaryBlob": "/docs/apis/server-services-client/iwholesummaryblob-interface",
      "IWholeSummaryPayload": "/docs/apis/server-services-client/iwholesummarypayload-interface",
      "IWholeSummaryTree": "/docs/apis/server-services-client/iwholesummarytree-interface",
      "IWholeSummaryTreeBaseEntry": "/docs/apis/server-services-client/iwholesummarytreebaseentry-interface",
      "IWholeSummaryTreeHandleEntry": "/docs/apis/server-services-client/iwholesummarytreehandleentry-interface",
      "IWholeSummaryTreeValueEntry": "/docs/apis/server-services-client/iwholesummarytreevalueentry-interface",
      "IWriteSummaryResponse": "/docs/apis/server-services-client/iwritesummaryresponse-interface"
    },
    "Enum": {
      "RestLessFieldNames": "/docs/apis/server-services-client#restlessfieldnames-enum"
    }
  },
  "package": "@fluidframework/server-services-client",
  "unscopedPackageName": "server-services-client"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/server-services-client](/docs/apis/server-services-client)

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Interface
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/ialfredtenant-interface'>IAlfredTenant</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/icreaterefparamsexternal-interface'>ICreateRefParamsExternal</a>
      </td>
      <td>
        Required params to create ref with config
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/icredentials-interface'>ICredentials</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iembeddedsummaryhandle-interface'>IEmbeddedSummaryHandle</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/igetrefparamsexternal-interface'>IGetRefParamsExternal</a>
      </td>
      <td>
        Required params to get ref with config
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/igitcache-interface'>IGitCache</a>
      </td>
      <td>
        Git cache data
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/igitmanager-interface'>IGitManager</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/igitservice-interface'>IGitService</a>
      </td>
      <td>
        Interface to a generic Git provider
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/ihistorian-interface'>IHistorian</a>
      </td>
      <td>
        The Historian extends the git service by providing access to document header information stored in the repository
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/inetworkerrordetails-interface'>INetworkErrorDetails</a>
      </td>
      <td>
        Represents the details associated with a <a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/inormalizedwholesummary-interface'>INormalizedWholeSummary</a>
      </td>
      <td>
        Normalized Whole Summary with decoded blobs and unflattened snapshot tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/ipatchrefparamsexternal-interface'>IPatchRefParamsExternal</a>
      </td>
      <td>
        Required params to patch ref with config
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/isession-interface'>ISession</a>
      </td>
      <td>
        Session information that includes the server urls and session status
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/isummaryuploadmanager-interface'>ISummaryUploadManager</a>
      </td>
      <td>
        Uploads a summary to storage.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholeflatsummary-interface'>IWholeFlatSummary</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholeflatsummaryblob-interface'>IWholeFlatSummaryBlob</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholeflatsummarytree-interface'>IWholeFlatSummaryTree</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholeflatsummarytreeentryblob-interface'>IWholeFlatSummaryTreeEntryBlob</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholeflatsummarytreeentrytree-interface'>IWholeFlatSummaryTreeEntryTree</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummaryblob-interface'>IWholeSummaryBlob</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummarypayload-interface'>IWholeSummaryPayload</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummarytree-interface'>IWholeSummaryTree</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummarytreebaseentry-interface'>IWholeSummaryTreeBaseEntry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummarytreehandleentry-interface'>IWholeSummaryTreeHandleEntry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwholesummarytreevalueentry-interface'>IWholeSummaryTreeValueEntry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/iwritesummaryresponse-interface'>IWriteSummaryResponse</a>
      </td>
      <td>
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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/basicrestwrapper-class'>BasicRestWrapper</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/gitmanager-class'>GitManager</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/historian-class'>Historian</a>
      </td>
      <td>
        Implementation of the IHistorian interface that calls out to a REST interface
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a>
      </td>
      <td>
        Represents errors associated with network communication.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/restlessclient-class'>RestLessClient</a>
      </td>
      <td>
        <p>
          Client for communicating with a &quot;RestLess&quot; server. Translates a typical RESTful HTTP request into &quot;RestLess&quot; HTTP format:
        </p>
        <p>
          POST \<path\> HTTP/\<1.1&#124;2\&gt;
        </p>
        <p>
          HOST \<hostname\&gt;
        </p>
        <p>
          Content-Type: application/x-www-form-urlencoded
        </p>
        <p>
          &lt;url-encoded-headers-body-and-method&gt;
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/restwrapper-class'>RestWrapper</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/summarytreeuploadmanager-class'>SummaryTreeUploadManager</a>
      </td>
      <td>
        Recursively writes summary tree as individual summary blobs.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client/wholesummaryuploadmanager-class'>WholeSummaryUploadManager</a>
      </td>
      <td>
        Converts summary to snapshot tree and uploads with single snaphot tree payload.
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
        <a href='/docs/apis/server-services-client#restlessfieldnames-enum'>RestLessFieldNames</a>
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
        <a href='/docs/apis/server-services-client#extendedsummaryobject-typealias'>ExtendedSummaryObject</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#iwholeflatsummarytreeentry-typealias'>IWholeFlatSummaryTreeEntry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#iwholesummarypayloadtype-typealias'>IWholeSummaryPayloadType</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#wholesummarytreeentry-typealias'>WholeSummaryTreeEntry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#wholesummarytreevalue-typealias'>WholeSummaryTreeValue</a>
      </td>
      <td>
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
        <a href='/docs/apis/server-services-client#convertfirstsummarywholesummarytreetosummarytree-function'>convertFirstSummaryWholeSummaryTreeToSummaryTree</a>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/isummarytree-interface'>ISummaryTree</a></span>
      </td>
      <td>
        Converts existing IWholeSummaryTree to ISummaryTree for the first summary (without Handle entries)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#convertsortednumberarraytoranges-function'>convertSortedNumberArrayToRanges</a>
      </td>
      <td>
        <span>number[][]</span>
      </td>
      <td>
        Converts the given number array into an array of ranges Example: [1, 2, 3, 4, 5, 6] to [[1, 6]] [1, 2, 3, 5, 6] to [[1,3],[5,6]]
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#convertsummarytreetowholesummarytree-function'>convertSummaryTreeToWholeSummaryTree</a>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/iwholesummarytree-interface'>IWholeSummaryTree</a></span>
      </td>
      <td>
        Converts the summary tree to a whole summary tree to be uploaded. Always upload full whole summary tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#convertwholeflatsummarytosnapshottreeandblobs-function'>convertWholeFlatSummaryToSnapshotTreeAndBlobs</a>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/inormalizedwholesummary-interface'>INormalizedWholeSummary</a></span>
      </td>
      <td>
        Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#createfluidservicenetworkerror-function'>createFluidServiceNetworkError</a>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a></span>
      </td>
      <td>
        Convenience function for generating a <a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#generateserviceprotocolentries-function'>generateServiceProtocolEntries</a>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions#itreeentry-typealias'>ITreeEntry</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#generatetoken-function'>generateToken</a>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
        Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign) and should only be used in client context.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#generateuser-function'>generateUser</a>
      </td>
      <td>
        <span><a href='/docs/apis/azure-client/iuser-interface'>IUser</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getnexthash-function'>getNextHash</a>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getorcreaterepository-function'>getOrCreateRepository</a>
      </td>
      <td>
        <span>Promise&lt;void&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getquorumtreeentries-function'>getQuorumTreeEntries</a>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions#itreeentry-typealias'>ITreeEntry</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getrandomname-function'>getRandomName</a>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#isnetworkerror-function'>isNetworkError</a>
      </td>
      <td>
        <span>error is <a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#mergeappandprotocoltree-function'>mergeAppAndProtocolTree</a>
      </td>
      <td>
        <span>ICreateTreeEntry[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#promisetimeout-function'>promiseTimeout</a>
      </td>
      <td>
        <span>Promise&lt;any&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#throwfluidservicenetworkerror-function'>throwFluidServiceNetworkError</a>
      </td>
      <td>
        <span>never</span>
      </td>
      <td>
        Convenience function to both generate and throw a <a href='/docs/apis/server-services-client/networkerror-class'>NetworkError</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#validatetokenclaims-function'>validateTokenClaims</a>
      </td>
      <td>
        <span><a href='/docs/apis/azure-client/itokenclaims-interface'>ITokenClaims</a></span>
      </td>
      <td>
        Validates a JWT token to authorize routerlicious. Throws NetworkError if claims are invalid.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#validatetokenclaimsexpiration-function'>validateTokenClaimsExpiration</a>
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
        Validates token claims' iat and exp properties to ensure valid token expiration. Throws NetworkError if expiry is invalid.
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
        <a href='/docs/apis/server-services-client#buildtreepath-variable'>buildTreePath</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        Convert a list of nodes to a tree path. If a node is empty (blank) it will be removed. If a node's name begins and/or ends with a &quot;/&quot;, it will be removed.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#candeletedoc-variable'>canDeleteDoc</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        Delete document permission.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#canread-variable'>canRead</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#canrevoketoken-variable'>canRevokeToken</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#cansummarize-variable'>canSummarize</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#canwrite-variable'>canWrite</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#choose-variable'>choose</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#correlationidheadername-variable'>CorrelationIdHeaderName</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#defaulthash-variable'>defaultHash</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#docdeletescopetype-variable'>DocDeleteScopeType</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        C1 can delete a docuemnt
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#driverversionheadername-variable'>DriverVersionHeaderName</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getauthorizationtokenfromcredentials-variable'>getAuthorizationTokenFromCredentials</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#getrandomint-variable'>getRandomInt</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        getRandomInt is not and should not be used as part of any secure random number generation
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#latestsummaryid-variable'>LatestSummaryId</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        This ID is an alias to the latest summary known by the service.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#tokenrevokescopetype-variable'>TokenRevokeScopeType</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        C1 can revoke an access token of a client
      </td>
    </tr>
  </tbody>
</table>

## Enumeration Details

### RestLessFieldNames {#restlessfieldnames-enum}

#### Signature {#restlessfieldnames-signature}

```typescript
export declare enum RestLessFieldNames
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
        <a href='/docs/apis/server-services-client#restlessfieldnames-body-enummember'>Body</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#restlessfieldnames-header-enummember'>Header</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/server-services-client#restlessfieldnames-method-enummember'>Method</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

##### Body {#restlessfieldnames-body-enummember}

###### Signature {#body-signature}

```typescript
Body = "body"
```

##### Header {#restlessfieldnames-header-enummember}

###### Signature {#header-signature}

```typescript
Header = "header"
```

##### Method {#restlessfieldnames-method-enummember}

###### Signature {#method-signature}

```typescript
Method = "method"
```

## Type Details

### ExtendedSummaryObject {#extendedsummaryobject-typealias}

#### Signature {#extendedsummaryobject-signature}

```typescript
export declare type ExtendedSummaryObject = SummaryObject | IEmbeddedSummaryHandle;
```

### IWholeFlatSummaryTreeEntry {#iwholeflatsummarytreeentry-typealias}

#### Signature {#iwholeflatsummarytreeentry-signature}

```typescript
export declare type IWholeFlatSummaryTreeEntry = IWholeFlatSummaryTreeEntryTree | IWholeFlatSummaryTreeEntryBlob;
```

### IWholeSummaryPayloadType {#iwholesummarypayloadtype-typealias}

#### Signature {#iwholesummarypayloadtype-signature}

```typescript
export declare type IWholeSummaryPayloadType = "container" | "channel";
```

### WholeSummaryTreeEntry {#wholesummarytreeentry-typealias}

#### Signature {#wholesummarytreeentry-signature}

```typescript
export declare type WholeSummaryTreeEntry = IWholeSummaryTreeValueEntry | IWholeSummaryTreeHandleEntry;
```

### WholeSummaryTreeValue {#wholesummarytreevalue-typealias}

#### Signature {#wholesummarytreevalue-signature}

```typescript
export declare type WholeSummaryTreeValue = IWholeSummaryTree | IWholeSummaryBlob;
```

## Function Details

### convertFirstSummaryWholeSummaryTreeToSummaryTree {#convertfirstsummarywholesummarytreetosummarytree-function}

Converts existing IWholeSummaryTree to ISummaryTree for the first summary (without Handle entries)

#### Signature {#convertfirstsummarywholesummarytreetosummarytree-signature}

```typescript
export declare function convertFirstSummaryWholeSummaryTreeToSummaryTree(wholeSummaryTree: IWholeSummaryTree, unreferenced?: true | undefined): ISummaryTree;
```

#### Parameters {#convertfirstsummarywholesummarytreetosummarytree-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        wholeSummaryTree
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/iwholesummarytree-interface'>IWholeSummaryTree</a></span>
      </td>
      <td>
        wholeSummaryTree used on the payload for creating and uploading a document.
      </td>
    </tr>
    <tr>
      <td>
        unreferenced
      </td>
      <td>
        optional
      </td>
      <td>
        <span>true &#124; undefined</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertfirstsummarywholesummarytreetosummarytree-returns}

Summary tree to be used when creating a new document.

**Return type:** [ISummaryTree](/docs/apis/server-services-client/isummarytree-interface)

### convertSortedNumberArrayToRanges {#convertsortednumberarraytoranges-function}

Converts the given number array into an array of ranges Example: \[1, 2, 3, 4, 5, 6\] to \[\[1, 6\]\] \[1, 2, 3, 5, 6\] to \[\[1,3\],\[5,6\]\]

#### Signature {#convertsortednumberarraytoranges-signature}

```typescript
export declare function convertSortedNumberArrayToRanges(numberArray: number[]): number[][];
```

#### Parameters {#convertsortednumberarraytoranges-parameters}

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
        numberArray
      </td>
      <td>
        <span>number[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertsortednumberarraytoranges-returns}

**Return type:** number\[\]\[\]

### convertSummaryTreeToWholeSummaryTree {#convertsummarytreetowholesummarytree-function}

Converts the summary tree to a whole summary tree to be uploaded. Always upload full whole summary tree.

#### Signature {#convertsummarytreetowholesummarytree-signature}

```typescript
export declare function convertSummaryTreeToWholeSummaryTree(parentHandle: string | undefined, tree: ISummaryTree, path?: string, rootNodeName?: string): IWholeSummaryTree;
```

#### Parameters {#convertsummarytreetowholesummarytree-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        parentHandle
      </td>
      <td>
      </td>
      <td>
        <span>string &#124; undefined</span>
      </td>
      <td>
        Handle of the last uploaded summary or detach new summary.
      </td>
    </tr>
    <tr>
      <td>
        tree
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/isummarytree-interface'>ISummaryTree</a></span>
      </td>
      <td>
        Summary Tree which will be converted to whole summary tree to be uploaded.
      </td>
    </tr>
    <tr>
      <td>
        path
      </td>
      <td>
        optional
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
        Current path of node which is getting evaluated.
      </td>
    </tr>
    <tr>
      <td>
        rootNodeName
      </td>
      <td>
        optional
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertsummarytreetowholesummarytree-returns}

**Return type:** [IWholeSummaryTree](/docs/apis/server-services-client/iwholesummarytree-interface)

### convertWholeFlatSummaryToSnapshotTreeAndBlobs {#convertwholeflatsummarytosnapshottreeandblobs-function}

Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.

#### Signature {#convertwholeflatsummarytosnapshottreeandblobs-signature}

```typescript
export declare function convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary: IWholeFlatSummary, treePrefixToRemove?: string): INormalizedWholeSummary;
```

#### Parameters {#convertwholeflatsummarytosnapshottreeandblobs-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        flatSummary
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/iwholeflatsummary-interface'>IWholeFlatSummary</a></span>
      </td>
      <td>
        flat summary
      </td>
    </tr>
    <tr>
      <td>
        treePrefixToRemove
      </td>
      <td>
        optional
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
        tree prefix to strip. By default we are stripping &quot;.app&quot; prefix
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertwholeflatsummarytosnapshottreeandblobs-returns}

snapshot tree, blob array, and sequence number

**Return type:** [INormalizedWholeSummary](/docs/apis/server-services-client/inormalizedwholesummary-interface)

### createFluidServiceNetworkError {#createfluidservicenetworkerror-function}

Convenience function for generating a [NetworkError](/docs/apis/server-services-client/networkerror-class).

#### Signature {#createfluidservicenetworkerror-signature}

```typescript
export declare function createFluidServiceNetworkError(statusCode: number, errorData?: INetworkErrorDetails | string): NetworkError;
```

#### Remarks {#createfluidservicenetworkerror-remarks}

Generates a [NetworkError](/docs/apis/server-services-client/networkerror-class) instance appropriately configured given the status code and error data provided. This function is intended to be used in situations where a [NetworkError](/docs/apis/server-services-client/networkerror-class) is dynamically created based variable parameters. That is, when it is not known whether the status code can be 404 or 500.

#### Parameters {#createfluidservicenetworkerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        statusCode
      </td>
      <td>
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
        HTTP status code that describes the error.
      </td>
    </tr>
    <tr>
      <td>
        errorData
      </td>
      <td>
        optional
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/inetworkerrordetails-interface'>INetworkErrorDetails</a> &#124; string</span>
      </td>
      <td>
        Optional additional data associated with the error. Can either be a simple string representing the message, or an <a href='/docs/apis/server-services-client/inetworkerrordetails-interface'>INetworkErrorDetails</a> object.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createfluidservicenetworkerror-returns}

A [NetworkError](/docs/apis/server-services-client/networkerror-class) instance properly configured according to the parameters provided.

**Return type:** [NetworkError](/docs/apis/server-services-client/networkerror-class)

### generateServiceProtocolEntries {#generateserviceprotocolentries-function}

#### Signature {#generateserviceprotocolentries-signature}

```typescript
export declare function generateServiceProtocolEntries(deli: string, scribe: string): ITreeEntry[];
```

#### Parameters {#generateserviceprotocolentries-parameters}

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
        deli
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        scribe
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#generateserviceprotocolentries-returns}

**Return type:** [ITreeEntry](/docs/apis/protocol-definitions#itreeentry-typealias)\[\]

### generateToken {#generatetoken-function}

Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign) and should only be used in client context.

#### Signature {#generatetoken-signature}

```typescript
export declare function generateToken(tenantId: string, documentId: string, key: string, scopes: ScopeType[], user?: IUser, lifetime?: number, ver?: string): string;
```

#### Parameters {#generatetoken-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        tenantId
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        documentId
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        key
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        scopes
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/azure-client#scopetype-enum'>ScopeType</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        user
      </td>
      <td>
        optional
      </td>
      <td>
        <span><a href='/docs/apis/azure-client/iuser-interface'>IUser</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        lifetime
      </td>
      <td>
        optional
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        ver
      </td>
      <td>
        optional
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#generatetoken-returns}

**Return type:** string

### generateUser {#generateuser-function}

#### Signature {#generateuser-signature}

```typescript
export declare function generateUser(): IUser;
```

#### Returns {#generateuser-returns}

**Return type:** [IUser](/docs/apis/azure-client/iuser-interface)

### getNextHash {#getnexthash-function}

#### Signature {#getnexthash-signature}

```typescript
export declare function getNextHash(message: ISequencedDocumentMessage, lastHash: string): string;
```

#### Parameters {#getnexthash-parameters}

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
        message
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        lastHash
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getnexthash-returns}

**Return type:** string

### getOrCreateRepository {#getorcreaterepository-function}

#### Signature {#getorcreaterepository-signature}

```typescript
export declare function getOrCreateRepository(endpoint: string, owner: string, repository: string, headers?: AxiosRequestHeaders): Promise<void>;
```

#### Parameters {#getorcreaterepository-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        endpoint
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        owner
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        repository
      </td>
      <td>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        headers
      </td>
      <td>
        optional
      </td>
      <td>
        <span>AxiosRequestHeaders</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getorcreaterepository-returns}

**Return type:** Promise&lt;void&gt;

### getQuorumTreeEntries {#getquorumtreeentries-function}

#### Signature {#getquorumtreeentries-signature}

```typescript
export declare function getQuorumTreeEntries(minimumSequenceNumber: number, sequenceNumber: number, quorumSnapshot: IQuorumSnapshot): ITreeEntry[];
```

#### Parameters {#getquorumtreeentries-parameters}

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
        minimumSequenceNumber
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        sequenceNumber
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        quorumSnapshot
      </td>
      <td>
        <span><a href='/docs/apis/protocol-base/iquorumsnapshot-interface'>IQuorumSnapshot</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getquorumtreeentries-returns}

**Return type:** [ITreeEntry](/docs/apis/protocol-definitions#itreeentry-typealias)\[\]

### getRandomName {#getrandomname-function}

#### Signature {#getrandomname-signature}

```typescript
export declare function getRandomName(connector?: string, capitalize?: boolean): string;
```

#### Parameters {#getrandomname-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        connector
      </td>
      <td>
        optional
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        capitalize
      </td>
      <td>
        optional
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getrandomname-returns}

**Return type:** string

### isNetworkError {#isnetworkerror-function}

#### Signature {#isnetworkerror-signature}

```typescript
export declare function isNetworkError(error: unknown): error is NetworkError;
```

#### Parameters {#isnetworkerror-parameters}

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
        error
      </td>
      <td>
        <span>unknown</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isnetworkerror-returns}

**Return type:** error is [NetworkError](/docs/apis/server-services-client/networkerror-class)

### mergeAppAndProtocolTree {#mergeappandprotocoltree-function}

#### Signature {#mergeappandprotocoltree-signature}

```typescript
export declare function mergeAppAndProtocolTree(appSummaryTree: ITree, protocolTree: ITree): ICreateTreeEntry[];
```

#### Parameters {#mergeappandprotocoltree-parameters}

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
        appSummaryTree
      </td>
      <td>
        <span>ITree</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        protocolTree
      </td>
      <td>
        <span>ITree</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#mergeappandprotocoltree-returns}

**Return type:** ICreateTreeEntry\[\]

### promiseTimeout {#promisetimeout-function}

#### Signature {#promisetimeout-signature}

```typescript
export declare function promiseTimeout(mSec: number, promise: Promise<any>): Promise<any>;
```

#### Parameters {#promisetimeout-parameters}

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
        mSec
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        promise
      </td>
      <td>
        <span>Promise&lt;any&gt;</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#promisetimeout-returns}

**Return type:** Promise&lt;any&gt;

### throwFluidServiceNetworkError {#throwfluidservicenetworkerror-function}

Convenience function to both generate and throw a [NetworkError](/docs/apis/server-services-client/networkerror-class).

#### Signature {#throwfluidservicenetworkerror-signature}

```typescript
export declare function throwFluidServiceNetworkError(statusCode: number, errorData?: INetworkErrorDetails | string): never;
```

#### Remarks {#throwfluidservicenetworkerror-remarks}

Similarly to [createFluidServiceNetworkError](/docs/apis/server-services-client#createfluidservicenetworkerror-function), this function generates a [NetworkError](/docs/apis/server-services-client/networkerror-class) instance appropriately configured given the status code and error data provided. The difference is that this function also throws the [NetworkError](/docs/apis/server-services-client/networkerror-class).

#### Parameters {#throwfluidservicenetworkerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
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
        statusCode
      </td>
      <td>
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
        HTTP status code that describes the error.
      </td>
    </tr>
    <tr>
      <td>
        errorData
      </td>
      <td>
        optional
      </td>
      <td>
        <span><a href='/docs/apis/server-services-client/inetworkerrordetails-interface'>INetworkErrorDetails</a> &#124; string</span>
      </td>
      <td>
        Optional additional data associated with the error. Can either be a simple string representing the message, or an <a href='/docs/apis/server-services-client/inetworkerrordetails-interface'>INetworkErrorDetails</a> object.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#throwfluidservicenetworkerror-returns}

**Return type:** never

### validateTokenClaims {#validatetokenclaims-function}

Validates a JWT token to authorize routerlicious. Throws NetworkError if claims are invalid.

#### Signature {#validatetokenclaims-signature}

```typescript
export declare function validateTokenClaims(token: string, documentId: string, tenantId: string): ITokenClaims;
```

#### Parameters {#validatetokenclaims-parameters}

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
        token
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        documentId
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        tenantId
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#validatetokenclaims-returns}

- decoded claims.

**Return type:** [ITokenClaims](/docs/apis/azure-client/itokenclaims-interface)

### validateTokenClaimsExpiration {#validatetokenclaimsexpiration-function}

Validates token claims' iat and exp properties to ensure valid token expiration. Throws NetworkError if expiry is invalid.

#### Signature {#validatetokenclaimsexpiration-signature}

```typescript
export declare function validateTokenClaimsExpiration(claims: ITokenClaims, maxTokenLifetimeSec: number): number;
```

#### Parameters {#validatetokenclaimsexpiration-parameters}

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
        claims
      </td>
      <td>
        <span><a href='/docs/apis/azure-client/itokenclaims-interface'>ITokenClaims</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        maxTokenLifetimeSec
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#validatetokenclaimsexpiration-returns}

token lifetime in milliseconds.

**Return type:** number

## Variable Details

### buildTreePath {#buildtreepath-variable}

Convert a list of nodes to a tree path. If a node is empty (blank) it will be removed. If a node's name begins and/or ends with a "/", it will be removed.

#### Signature {#buildtreepath-signature}

```typescript
buildTreePath: (...nodeNames: string[]) => string
```

### canDeleteDoc {#candeletedoc-variable}

Delete document permission.

#### Signature {#candeletedoc-signature}

```typescript
canDeleteDoc: (scopes: string[]) => boolean
```

### canRead {#canread-variable}

#### Signature {#canread-signature}

```typescript
canRead: (scopes: string[]) => boolean
```

### canRevokeToken {#canrevoketoken-variable}

#### Signature {#canrevoketoken-signature}

```typescript
canRevokeToken: (scopes: string[]) => boolean
```

### canSummarize {#cansummarize-variable}

#### Signature {#cansummarize-signature}

```typescript
canSummarize: (scopes: string[]) => boolean
```

### canWrite {#canwrite-variable}

#### Signature {#canwrite-signature}

```typescript
canWrite: (scopes: string[]) => boolean
```

### choose {#choose-variable}

#### Signature {#choose-signature}

```typescript
choose: () => string
```

### CorrelationIdHeaderName {#correlationidheadername-variable}

#### Signature {#correlationidheadername-signature}

```typescript
CorrelationIdHeaderName = "x-correlation-id"
```

### defaultHash {#defaulthash-variable}

#### Signature {#defaulthash-signature}

```typescript
defaultHash = "00000000"
```

### DocDeleteScopeType {#docdeletescopetype-variable}

C1 can delete a docuemnt

#### Signature {#docdeletescopetype-signature}

```typescript
DocDeleteScopeType = "doc:delete"
```

### DriverVersionHeaderName {#driverversionheadername-variable}

#### Signature {#driverversionheadername-signature}

```typescript
DriverVersionHeaderName = "x-driver-version"
```

### getAuthorizationTokenFromCredentials {#getauthorizationtokenfromcredentials-variable}

#### Signature {#getauthorizationtokenfromcredentials-signature}

```typescript
getAuthorizationTokenFromCredentials: (credentials: ICredentials) => string
```

### getRandomInt {#getrandomint-variable}

getRandomInt is not and should not be used as part of any secure random number generation

#### Signature {#getrandomint-signature}

```typescript
getRandomInt: (range: number) => number
```

### LatestSummaryId {#latestsummaryid-variable}

This ID is an alias to the latest summary known by the service.

#### Signature {#latestsummaryid-signature}

```typescript
LatestSummaryId = "latest"
```

### TokenRevokeScopeType {#tokenrevokescopetype-variable}

C1 can revoke an access token of a client

#### Signature {#tokenrevokescopetype-signature}

```typescript
TokenRevokeScopeType = "token:revoke"
```
