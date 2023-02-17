{
  "title": "@fluidframework/driver-utils Package",
  "kind": "Package",
  "members": {
    "Class": {
      "AuthorizationError": "/docs/apis/driver-utils\\authorizationerror-class",
      "BlobAggregationStorage": "/docs/apis/driver-utils\\blobaggregationstorage-class",
      "BlobCacheStorageService": "/docs/apis/driver-utils\\blobcachestorageservice-class",
      "DeltaStreamConnectionForbiddenError": "/docs/apis/driver-utils\\deltastreamconnectionforbiddenerror-class",
      "DocumentStorageServiceProxy": "/docs/apis/driver-utils\\documentstorageserviceproxy-class",
      "EmptyDocumentDeltaStorageService": "/docs/apis/driver-utils\\emptydocumentdeltastorageservice-class",
      "FluidInvalidSchemaError": "/docs/apis/driver-utils\\fluidinvalidschemaerror-class",
      "GenericNetworkError": "/docs/apis/driver-utils\\genericnetworkerror-class",
      "InsecureUrlResolver": "/docs/apis/driver-utils\\insecureurlresolver-class",
      "LocationRedirectionError": "/docs/apis/driver-utils\\locationredirectionerror-class",
      "MapWithExpiration": "/docs/apis/driver-utils\\mapwithexpiration-class",
      "MultiDocumentServiceFactory": "/docs/apis/driver-utils\\multidocumentservicefactory-class",
      "MultiUrlResolver": "/docs/apis/driver-utils\\multiurlresolver-class",
      "NetworkErrorBasic": "/docs/apis/driver-utils\\networkerrorbasic-class",
      "NonRetryableError": "/docs/apis/driver-utils\\nonretryableerror-class",
      "ParallelRequests": "/docs/apis/driver-utils\\parallelrequests-class",
      "PrefetchDocumentStorageService": "/docs/apis/driver-utils\\prefetchdocumentstorageservice-class",
      "Queue": "/docs/apis/driver-utils\\queue-class",
      "RateLimiter": "/docs/apis/driver-utils\\ratelimiter-class",
      "RetryableError": "/docs/apis/driver-utils\\retryableerror-class",
      "SnapshotExtractor": "/docs/apis/driver-utils\\snapshotextractor-class",
      "SummaryTreeAssembler": "/docs/apis/driver-utils\\summarytreeassembler-class",
      "ThrottlingError": "/docs/apis/driver-utils\\throttlingerror-class",
      "UsageError": "/docs/apis/driver-utils\\usageerror-class"
    },
    "Function": {
      "buildSnapshotTree": "/docs/apis/driver-utils#buildsnapshottree-function",
      "canBeCoalescedByService": "/docs/apis/driver-utils#canbecoalescedbyservice-function",
      "combineAppAndProtocolSummary": "/docs/apis/driver-utils#combineappandprotocolsummary-function",
      "configurableUrlResolver": "/docs/apis/driver-utils#configurableurlresolver-function",
      "convertSnapshotAndBlobsToSummaryTree": "/docs/apis/driver-utils#convertsnapshotandblobstosummarytree-function",
      "convertSummaryTreeToSnapshotITree": "/docs/apis/driver-utils#convertsummarytreetosnapshotitree-function",
      "createGenericNetworkError": "/docs/apis/driver-utils#creategenericnetworkerror-function",
      "ensureFluidResolvedUrl": "/docs/apis/driver-utils#ensurefluidresolvedurl-function",
      "getDocAttributesFromProtocolSummary": "/docs/apis/driver-utils#getdocattributesfromprotocolsummary-function",
      "getQuorumValuesFromProtocolSummary": "/docs/apis/driver-utils#getquorumvaluesfromprotocolsummary-function",
      "isOnline": "/docs/apis/driver-utils#isonline-function",
      "isRuntimeMessage": "/docs/apis/driver-utils#isruntimemessage-function",
      "isUnpackedRuntimeMessage": "/docs/apis/driver-utils#isunpackedruntimemessage-function",
      "logNetworkFailure": "/docs/apis/driver-utils#lognetworkfailure-function",
      "readAndParse": "/docs/apis/driver-utils#readandparse-function",
      "requestOps": "/docs/apis/driver-utils#requestops-function",
      "runWithRetry": "/docs/apis/driver-utils#runwithretry-function",
      "streamFromMessages": "/docs/apis/driver-utils#streamfrommessages-function",
      "streamObserver": "/docs/apis/driver-utils#streamobserver-function",
      "waitForConnectedState": "/docs/apis/driver-utils#waitforconnectedstate-function"
    },
    "Variable": {
      "canRetryOnError": "/docs/apis/driver-utils#canretryonerror-variable",
      "createWriteError": "/docs/apis/driver-utils#createwriteerror-variable",
      "emptyMessageStream": "/docs/apis/driver-utils#emptymessagestream-variable",
      "getRetryDelayFromError": "/docs/apis/driver-utils#getretrydelayfromerror-variable",
      "getRetryDelaySecondsFromError": "/docs/apis/driver-utils#getretrydelaysecondsfromerror-variable",
      "isFluidResolvedUrl": "/docs/apis/driver-utils#isfluidresolvedurl-variable"
    },
    "TypeAlias": {
      "DriverErrorTelemetryProps": "/docs/apis/driver-utils#drivererrortelemetryprops-typealias"
    },
    "Interface": {
      "IAnyDriverError": "/docs/apis/driver-utils\\ianydrivererror-interface",
      "IProgress": "/docs/apis/driver-utils\\iprogress-interface",
      "ISummaryTreeAssemblerProps": "/docs/apis/driver-utils\\isummarytreeassemblerprops-interface"
    },
    "Enum": {
      "MessageType2": "/docs/apis/driver-utils#messagetype2-enum",
      "OnlineStatus": "/docs/apis/driver-utils#onlinestatus-enum"
    }
  },
  "package": "@fluidframework/driver-utils",
  "unscopedPackageName": "driver-utils"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/driver-utils](/docs/apis/driver-utils)

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
        <a href='/docs/apis/driver-utils\ianydrivererror-interface'>IAnyDriverError</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        <p>Interface describing errors and warnings raised by any driver code. Not expected to be implemented by a class or an object literal, but rather used in place of any or unknown in various function signatures that pass errors around.</p><p>"Any" in the interface name is a nod to the fact that errorType has lost its type constraint. It will be either DriverErrorType or the specific driver's specialized error type enum, but we can't reference a specific driver's error type enum in this code.</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\iprogress-interface'>IProgress</a>
      </td>
      <td>
      </td>
      <td>
        Interface describing an object passed to various network APIs. It allows caller to control cancellation, as well as learn about any delays.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\isummarytreeassemblerprops-interface'>ISummaryTreeAssemblerProps</a>
      </td>
      <td>
      </td>
      <td>
        Summary tree assembler props
      </td>
    </tr>
  </tbody>
</table>

## Classes

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Class
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
        <a href='/docs/apis/driver-utils\authorizationerror-class'>AuthorizationError</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\blobaggregationstorage-class'>BlobAggregationStorage</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        Snapshot packer and extractor. When summary is written it will find and aggregate small blobs into bigger blobs When snapshot is read, it will unpack aggregated blobs and provide them transparently to caller.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\blobcachestorageservice-class'>BlobCacheStorageService</a>
      </td>
      <td>
      </td>
      <td>
        IDocumentStorageService adapter with pre-cached blobs.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\deltastreamconnectionforbiddenerror-class'>DeltaStreamConnectionForbiddenError</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\documentstorageserviceproxy-class'>DocumentStorageServiceProxy</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\emptydocumentdeltastorageservice-class'>EmptyDocumentDeltaStorageService</a>
      </td>
      <td>
      </td>
      <td>
        Implementation of IDocumentDeltaStorageService that will always return an empty message queue when fetching messages
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\fluidinvalidschemaerror-class'>FluidInvalidSchemaError</a>
      </td>
      <td>
      </td>
      <td>
        FluidInvalidSchema error class.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\genericnetworkerror-class'>GenericNetworkError</a>
      </td>
      <td>
      </td>
      <td>
        Generic network error class.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\insecureurlresolver-class'>InsecureUrlResolver</a>
      </td>
      <td>
      </td>
      <td>
        <p>As the name implies this is not secure and should not be used in production. It simply makes the example easier to get up and running.</p><p>In our example we run a simple web server via webpack-dev-server. This defines a URL format of the form http://localhost:8080/<documentId>/<path>.</p><p>We then need to map that to a Fluid based URL. These are of the form fluid://orderingUrl/<tenantId>/<documentId>/<path>.</p><p>The tenantId/documentId pair defines the 'full' document ID the service makes use of. The path is then an optional part of the URL that the document interprets and maps to a data store. It's exactly similar to how a web service works or a router inside of a single page app framework.</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\locationredirectionerror-class'>LocationRedirectionError</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\mapwithexpiration-class'>MapWithExpiration</a>
      </td>
      <td>
      </td>
      <td>
        An extension of Map that expires (deletes) entries after a period of inactivity. The policy is based on the last time a key was written to.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\multidocumentservicefactory-class'>MultiDocumentServiceFactory</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\multiurlresolver-class'>MultiUrlResolver</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\networkerrorbasic-class'>NetworkErrorBasic</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\nonretryableerror-class'>NonRetryableError</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\parallelrequests-class'>ParallelRequests</a>
      </td>
      <td>
      </td>
      <td>
        Helper class to organize parallel fetching of data It can be used to concurrently do many requests, while consuming data in the right order. Take a look at UT for examples.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\prefetchdocumentstorageservice-class'>PrefetchDocumentStorageService</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\queue-class'>Queue</a>
      </td>
      <td>
      </td>
      <td>
        Helper queue class to allow async push / pull It's essentially a pipe allowing multiple writers, and single reader
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\ratelimiter-class'>RateLimiter</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\retryableerror-class'>RetryableError</a>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\snapshotextractor-class'>SnapshotExtractor</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        Base class that deals with unpacking snapshots (in place) containing aggregated blobs It relies on abstract methods for reads and storing unpacked blobs.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\summarytreeassembler-class'>SummaryTreeAssembler</a>
      </td>
      <td>
      </td>
      <td>
        Summary tree assembler (without stats collection).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\throttlingerror-class'>ThrottlingError</a>
      </td>
      <td>
      </td>
      <td>
        Throttling error class - used to communicate all throttling errors
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils\usageerror-class'>UsageError</a>
      </td>
      <td>
      </td>
      <td>
        Error indicating an API is being used improperly resulting in an invalid operation.
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
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#messagetype2-enum'>MessageType2</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#onlinestatus-enum'>OnlineStatus</a>
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
        <a href='/docs/apis/driver-utils#drivererrortelemetryprops-typealias'>DriverErrorTelemetryProps</a>
      </td>
      <td>
        Telemetry props with driver-specific required properties
      </td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Function
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Return Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#buildsnapshottree-function'>buildSnapshotTree</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isnapshottree-interface'>ISnapshotTree</a>
      </td>
      <td>
        Build a tree hierarchy base on an array of ITreeEntry
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#canbecoalescedbyservice-function'>canBeCoalescedByService</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#combineappandprotocolsummary-function'>combineAppAndProtocolSummary</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        Combine the app summary and protocol summary in 1 tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#configurableurlresolver-function'>configurableUrlResolver</a>
      </td>
      <td>
      </td>
      <td>
        Promise<<a href='/docs/apis/driver-definitions#iresolvedurl-typealias'>IResolvedUrl</a> | undefined>
      </td>
      <td>
        Resolver that takes a list of url resolvers and then try each of them to resolve the url.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#convertsnapshotandblobstosummarytree-function'>convertSnapshotAndBlobsToSummaryTree</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        Helper function that converts ISnapshotTree and blobs to ISummaryTree
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#convertsummarytreetosnapshotitree-function'>convertSummaryTreeToSnapshotITree</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\itree-interface'>ITree</a>
      </td>
      <td>
        Converts ISummaryTree to ITree format.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#creategenericnetworkerror-function'>createGenericNetworkError</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-utils\throttlingerror-class'>ThrottlingError</a> | <a href='/docs/apis/driver-utils\genericnetworkerror-class'>GenericNetworkError</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#ensurefluidresolvedurl-function'>ensureFluidResolvedUrl</a>
      </td>
      <td>
      </td>
      <td>
        asserts resolved is <a href='/docs/apis/driver-definitions\ifluidresolvedurl-interface'>IFluidResolvedUrl</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#getdocattributesfromprotocolsummary-function'>getDocAttributesFromProtocolSummary</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\idocumentattributes-interface'>IDocumentAttributes</a>
      </td>
      <td>
        Extract the attributes from the protocol summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#getquorumvaluesfromprotocolsummary-function'>getQuorumValuesFromProtocolSummary</a>
      </td>
      <td>
      </td>
      <td>
        [string, <a href='/docs/apis/protocol-definitions#icommittedproposal-typealias'>ICommittedProposal</a>][]
      </td>
      <td>
        Extract quorum values from the protocol summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#isonline-function'>isOnline</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-utils#onlinestatus-enum'>OnlineStatus</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#isruntimemessage-function'>isRuntimeMessage</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
        Tells if message was sent by container runtime
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#isunpackedruntimemessage-function'>isUnpackedRuntimeMessage</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        boolean
      </td>
      <td>
        <p>Determines whether or not the message type is one of the following: (legacy)</p><p>- "component"</p><p>- "attach"</p><p>- "chunkedOp"</p><p>- "blobAttach"</p><p>- "rejoin"</p><p>- "alias"</p><p>- "op"</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#lognetworkfailure-function'>logNetworkFailure</a>
      </td>
      <td>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#readandparse-function'>readAndParse</a>
      </td>
      <td>
      </td>
      <td>
        Promise<T>
      </td>
      <td>
        Read a blob from <a href='/docs/apis/driver-definitions\idocumentstorageservice-interface'>IDocumentStorageService</a> and <a href='https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse'>JSON.parse</a> it into object of type <code>T</code>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#requestops-function'>requestOps</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\istream-interface'>IStream</a><<a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>[]>
      </td>
      <td>
        Request ops from storage
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#runwithretry-function'>runWithRetry</a>
      </td>
      <td>
      </td>
      <td>
        Promise<T>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#streamfrommessages-function'>streamFromMessages</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\istream-interface'>IStream</a><<a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>[]>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#streamobserver-function'>streamObserver</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\istream-interface'>IStream</a><T>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#waitforconnectedstate-function'>waitForConnectedState</a>
      </td>
      <td>
      </td>
      <td>
        Promise<void>
      </td>
      <td>
        Wait for browser to get to connected state. If connected, waits minimum of minDelay anyway (between network retries) If disconnected, polls every 30 seconds anyway, to make sure we are not getting stuck because of wrong signal Note that browsers will have false positives (like having Hyper-V adapter on machine, or machine connected to router that is not connected to internet) But there should be no false negatives. The only exception - Opera returns false when user enters "Work Offline" mode, regardless of actual connectivity.
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
        <a href='/docs/apis/driver-utils#canretryonerror-variable'>canRetryOnError</a>
      </td>
      <td>
        Check if a connection error can be retried. Unless explicitly allowed, retry is disallowed. I.e. asserts or unexpected exceptions in our code result in container failure.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#createwriteerror-variable'>createWriteError</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#emptymessagestream-variable'>emptyMessageStream</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#getretrydelayfromerror-variable'>getRetryDelayFromError</a>
      </td>
      <td>
        Check retryAfterSeconds property on error and convert to ms
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#getretrydelaysecondsfromerror-variable'>getRetryDelaySecondsFromError</a>
      </td>
      <td>
        Check retryAfterSeconds property on error
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#isfluidresolvedurl-variable'>isFluidResolvedUrl</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Enumeration Details

### MessageType2 {#messagetype2-enum}

#### Signature {#messagetype2-signature}

```typescript
export declare enum MessageType2 
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
        <a href='/docs/apis/driver-utils#messagetype2-accept-enummember'>Accept</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### Accept {#messagetype2-accept-enummember}

###### Signature {#accept-signature}

```typescript
Accept = "accept"
```

### OnlineStatus {#onlinestatus-enum}

#### Signature {#onlinestatus-signature}

```typescript
export declare enum OnlineStatus 
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
        <a href='/docs/apis/driver-utils#onlinestatus-offline-enummember'>Offline</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#onlinestatus-online-enummember'>Online</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/driver-utils#onlinestatus-unknown-enummember'>Unknown</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### Offline {#onlinestatus-offline-enummember}

###### Signature {#offline-signature}

```typescript
Offline = 0
```

##### Online {#onlinestatus-online-enummember}

###### Signature {#online-signature}

```typescript
Online = 1
```

##### Unknown {#onlinestatus-unknown-enummember}

###### Signature {#unknown-signature}

```typescript
Unknown = 2
```

## Type Details

### DriverErrorTelemetryProps {#drivererrortelemetryprops-typealias}

Telemetry props with driver-specific required properties

#### Signature {#drivererrortelemetryprops-signature}

```typescript
export declare type DriverErrorTelemetryProps = ITelemetryProperties & {
    driverVersion: string | undefined;
};
```

## Function Details

### buildSnapshotTree {#buildsnapshottree-function}

Build a tree hierarchy base on an array of ITreeEntry

#### Signature {#buildsnapshottree-signature}

```typescript
export declare function buildSnapshotTree(entries: ITreeEntry[], blobMap: Map<string, ArrayBufferLike>): ISnapshotTree;
```

#### Parameters {#buildsnapshottree-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        entries
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions#itreeentry-typealias'>ITreeEntry</a>[]
      </td>
      <td>
        an array of ITreeEntry to flatten
      </td>
    </tr>
    <tr>
      <td>
        blobMap
      </td>
      <td>
        Map<string, ArrayBufferLike>
      </td>
      <td>
        a map of blob's sha1 to content that gets filled with content from entries NOTE: blobMap's validity is contingent on the returned promise's resolution
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#buildsnapshottree-returns}

the hierarchical tree

<b>Return type:</b> [ISnapshotTree](/docs/apis/protocol-definitions\isnapshottree-interface)

### canBeCoalescedByService {#canbecoalescedbyservice-function}

#### Signature {#canbecoalescedbyservice-signature}

```typescript
export declare function canBeCoalescedByService(message: ISequencedDocumentMessage | IDocumentMessage): boolean;
```

#### Parameters {#canbecoalescedbyservice-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
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
        <a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a> | <a href='/docs/apis/protocol-definitions\idocumentmessage-interface'>IDocumentMessage</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#canbecoalescedbyservice-returns}

<b>Return type:</b> boolean

### combineAppAndProtocolSummary {#combineappandprotocolsummary-function}

Combine the app summary and protocol summary in 1 tree.

#### Signature {#combineappandprotocolsummary-signature}

```typescript
export declare function combineAppAndProtocolSummary(appSummary: ISummaryTree, protocolSummary: ISummaryTree): ISummaryTree;
```

#### Parameters {#combineappandprotocolsummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        appSummary
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        Summary of the app.
      </td>
    </tr>
    <tr>
      <td>
        protocolSummary
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        Summary of the protocol.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#combineappandprotocolsummary-returns}

<b>Return type:</b> [ISummaryTree](/docs/apis/protocol-definitions\isummarytree-interface)

### configurableUrlResolver {#configurableurlresolver-function}

Resolver that takes a list of url resolvers and then try each of them to resolve the url.

#### Signature {#configurableurlresolver-signature}

```typescript
export declare function configurableUrlResolver(resolversList: IUrlResolver[], request: IRequest): Promise<IResolvedUrl | undefined>;
```

#### Parameters {#configurableurlresolver-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        resolversList
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\iurlresolver-interface'>IUrlResolver</a>[]
      </td>
      <td>
        List of url resolvers to be used to resolve the request.
      </td>
    </tr>
    <tr>
      <td>
        request
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\irequest-interface'>IRequest</a>
      </td>
      <td>
        Request to be resolved.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#configurableurlresolver-returns}

<b>Return type:</b> Promise&lt;[IResolvedUrl](/docs/apis/driver-definitions#iresolvedurl-typealias) \| undefined&gt;

### convertSnapshotAndBlobsToSummaryTree {#convertsnapshotandblobstosummarytree-function}

Helper function that converts ISnapshotTree and blobs to ISummaryTree

#### Signature {#convertsnapshotandblobstosummarytree-signature}

```typescript
export declare function convertSnapshotAndBlobsToSummaryTree(snapshot: ISnapshotTree, blobs: Map<string, ArrayBuffer>): ISummaryTree;
```

#### Parameters {#convertsnapshotandblobstosummarytree-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        snapshot
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isnapshottree-interface'>ISnapshotTree</a>
      </td>
      <td>
        Source snapshot tree
      </td>
    </tr>
    <tr>
      <td>
        blobs
      </td>
      <td>
        Map<string, ArrayBuffer>
      </td>
      <td>
        Blobs cache
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertsnapshotandblobstosummarytree-returns}

Converted snapshot in ISummaryTree format

<b>Return type:</b> [ISummaryTree](/docs/apis/protocol-definitions\isummarytree-interface)

### convertSummaryTreeToSnapshotITree {#convertsummarytreetosnapshotitree-function}

Converts ISummaryTree to ITree format.

#### Signature {#convertsummarytreetosnapshotitree-signature}

```typescript
export declare function convertSummaryTreeToSnapshotITree(summaryTree: ISummaryTree): ITree;
```

#### Parameters {#convertsummarytreetosnapshotitree-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        summaryTree
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        summary tree in ISummaryTree format
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#convertsummarytreetosnapshotitree-returns}

<b>Return type:</b> [ITree](/docs/apis/protocol-definitions\itree-interface)

### createGenericNetworkError {#creategenericnetworkerror-function}

#### Signature {#creategenericnetworkerror-signature}

```typescript
export declare function createGenericNetworkError(message: string, retryInfo: {
    canRetry: boolean;
    retryAfterMs?: number;
}, props: DriverErrorTelemetryProps): ThrottlingError | GenericNetworkError;
```

#### Parameters {#creategenericnetworkerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
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
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        retryInfo
      </td>
      <td>
        { canRetry: boolean; retryAfterMs?: number; }
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        props
      </td>
      <td>
        <a href='/docs/apis/driver-utils#drivererrortelemetryprops-typealias'>DriverErrorTelemetryProps</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#creategenericnetworkerror-returns}

<b>Return type:</b> [ThrottlingError](/docs/apis/driver-utils\throttlingerror-class) \| [GenericNetworkError](/docs/apis/driver-utils\genericnetworkerror-class)

### ensureFluidResolvedUrl {#ensurefluidresolvedurl-function}

#### Signature {#ensurefluidresolvedurl-signature}

```typescript
export declare function ensureFluidResolvedUrl(resolved: IResolvedUrl | undefined): asserts resolved is IFluidResolvedUrl;
```

#### Parameters {#ensurefluidresolvedurl-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        resolved
      </td>
      <td>
        <a href='/docs/apis/driver-definitions#iresolvedurl-typealias'>IResolvedUrl</a> | undefined
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ensurefluidresolvedurl-returns}

<b>Return type:</b> asserts resolved is [IFluidResolvedUrl](/docs/apis/driver-definitions\ifluidresolvedurl-interface)

### getDocAttributesFromProtocolSummary {#getdocattributesfromprotocolsummary-function}

Extract the attributes from the protocol summary.

#### Signature {#getdocattributesfromprotocolsummary-signature}

```typescript
export declare function getDocAttributesFromProtocolSummary(protocolSummary: ISummaryTree): IDocumentAttributes;
```

#### Parameters {#getdocattributesfromprotocolsummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        protocolSummary
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        protocol summary from which the values are to be extracted.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getdocattributesfromprotocolsummary-returns}

<b>Return type:</b> [IDocumentAttributes](/docs/apis/protocol-definitions\idocumentattributes-interface)

### getQuorumValuesFromProtocolSummary {#getquorumvaluesfromprotocolsummary-function}

Extract quorum values from the protocol summary.

#### Signature {#getquorumvaluesfromprotocolsummary-signature}

```typescript
export declare function getQuorumValuesFromProtocolSummary(protocolSummary: ISummaryTree): [string, ICommittedProposal][];
```

#### Parameters {#getquorumvaluesfromprotocolsummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        protocolSummary
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        protocol summary from which the values are to be extracted.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getquorumvaluesfromprotocolsummary-returns}

<b>Return type:</b> \[string, [ICommittedProposal](/docs/apis/protocol-definitions#icommittedproposal-typealias)<!-- -->\]\[\]

### isOnline {#isonline-function}

#### Signature {#isonline-signature}

```typescript
export declare function isOnline(): OnlineStatus;
```

#### Returns {#isonline-returns}

<b>Return type:</b> [OnlineStatus](/docs/apis/driver-utils#onlinestatus-enum)

### isRuntimeMessage {#isruntimemessage-function}

Tells if message was sent by container runtime

#### Signature {#isruntimemessage-signature}

```typescript
export declare function isRuntimeMessage(message: {
    type: string;
}): boolean;
```

#### Parameters {#isruntimemessage-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
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
        { type: string; }
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isruntimemessage-returns}

whether the message is a runtime message

<b>Return type:</b> boolean

### isUnpackedRuntimeMessage {#isunpackedruntimemessage-function}

{{% callout Warning Deprecated %}}
This API should not be used.


{{% /callout %}}

Determines whether or not the message type is one of the following: (legacy)

- "component"

- "attach"

- "chunkedOp"

- "blobAttach"

- "rejoin"

- "alias"

- "op"

#### Signature {#isunpackedruntimemessage-signature}

```typescript
export declare function isUnpackedRuntimeMessage(message: ISequencedDocumentMessage): boolean;
```

#### Parameters {#isunpackedruntimemessage-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
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
        <a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isunpackedruntimemessage-returns}

<b>Return type:</b> boolean

### logNetworkFailure {#lognetworkfailure-function}

#### Signature {#lognetworkfailure-signature}

```typescript
export declare function logNetworkFailure(logger: ITelemetryLogger, event: ITelemetryErrorEvent, error?: any): void;
```

#### Parameters {#lognetworkfailure-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        logger
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        event
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetryerrorevent-interface'>ITelemetryErrorEvent</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        error
      </td>
      <td>
        optional
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### readAndParse {#readandparse-function}

Read a blob from [IDocumentStorageService](/docs/apis/driver-definitions\idocumentstorageservice-interface) and [JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) it into object of type `T`<!-- -->.

#### Signature {#readandparse-signature}

```typescript
export declare function readAndParse<T>(storage: Pick<IDocumentStorageService, "readBlob">, id: string): Promise<T>;
```

#### Parameters {#readandparse-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        storage
      </td>
      <td>
        Pick<<a href='/docs/apis/driver-definitions\idocumentstorageservice-interface'>IDocumentStorageService</a>, "readBlob">
      </td>
      <td>
        The <code>DocumentStorageService</code> to read from.
      </td>
    </tr>
    <tr>
      <td>
        id
      </td>
      <td>
        string
      </td>
      <td>
        The ID of the blob to read and parse.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#readandparse-returns}

The object that we decoded and parsed via `JSON.parse`<!-- -->.

<b>Return type:</b> Promise&lt;T&gt;

### requestOps {#requestops-function}

Request ops from storage

#### Signature {#requestops-signature}

```typescript
export declare function requestOps(get: (from: number, to: number, telemetryProps: ITelemetryProperties) => Promise<IDeltasFetchResult>, concurrency: number, fromTotal: number, toTotal: number | undefined, payloadSize: number, logger: ITelemetryLogger, signal?: AbortSignal, scenarioName?: string): IStream<ISequencedDocumentMessage[]>;
```

#### Parameters {#requestops-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        get
      </td>
      <td>
      </td>
      <td>
        (from: number, to: number, telemetryProps: <a href='/docs/apis/common-definitions\itelemetryproperties-interface'>ITelemetryProperties</a>) => Promise<<a href='/docs/apis/driver-definitions\ideltasfetchresult-interface'>IDeltasFetchResult</a>>
      </td>
      <td>
        Getter callback to get individual batches
      </td>
    </tr>
    <tr>
      <td>
        concurrency
      </td>
      <td>
      </td>
      <td>
        number
      </td>
      <td>
        Number of concurrent requests to make
      </td>
    </tr>
    <tr>
      <td>
        fromTotal
      </td>
      <td>
      </td>
      <td>
        number
      </td>
      <td>
        starting sequence number to fetch (inclusive)
      </td>
    </tr>
    <tr>
      <td>
        toTotal
      </td>
      <td>
      </td>
      <td>
        number | undefined
      </td>
      <td>
        max (exclusive) sequence number to fetch
      </td>
    </tr>
    <tr>
      <td>
        payloadSize
      </td>
      <td>
      </td>
      <td>
        number
      </td>
      <td>
        Payload size
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
        Logger to log progress and errors
      </td>
    </tr>
    <tr>
      <td>
        signal
      </td>
      <td>
        optional
      </td>
      <td>
        AbortSignal
      </td>
      <td>
        Cancelation signal
      </td>
    </tr>
    <tr>
      <td>
        scenarioName
      </td>
      <td>
        optional
      </td>
      <td>
        string
      </td>
      <td>
        Reason for fetching ops
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#requestops-returns}

- Messages fetched

<b>Return type:</b> [IStream](/docs/apis/driver-definitions\istream-interface)<!-- -->&lt;[ISequencedDocumentMessage](/docs/apis/protocol-definitions\isequenceddocumentmessage-interface)<!-- -->\[\]&gt;

### runWithRetry {#runwithretry-function}

#### Signature {#runwithretry-signature}

```typescript
export declare function runWithRetry<T>(api: (cancel?: AbortSignal) => Promise<T>, fetchCallName: string, logger: ITelemetryLogger, progress: IProgress): Promise<T>;
```

#### Parameters {#runwithretry-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        api
      </td>
      <td>
        (cancel?: AbortSignal) => Promise<T>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        fetchCallName
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        progress
      </td>
      <td>
        <a href='/docs/apis/driver-utils\iprogress-interface'>IProgress</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#runwithretry-returns}

<b>Return type:</b> Promise&lt;T&gt;

### streamFromMessages {#streamfrommessages-function}

#### Signature {#streamfrommessages-signature}

```typescript
export declare function streamFromMessages(messagesArg: Promise<ISequencedDocumentMessage[]>): IStream<ISequencedDocumentMessage[]>;
```

#### Parameters {#streamfrommessages-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        messagesArg
      </td>
      <td>
        Promise<<a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>[]>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#streamfrommessages-returns}

<b>Return type:</b> [IStream](/docs/apis/driver-definitions\istream-interface)<!-- -->&lt;[ISequencedDocumentMessage](/docs/apis/protocol-definitions\isequenceddocumentmessage-interface)<!-- -->\[\]&gt;

### streamObserver {#streamobserver-function}

#### Signature {#streamobserver-signature}

```typescript
export declare function streamObserver<T>(stream: IStream<T>, handler: (value: IStreamResult<T>) => void): IStream<T>;
```

#### Parameters {#streamobserver-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        stream
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\istream-interface'>IStream</a><T>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        handler
      </td>
      <td>
        (value: <a href='/docs/apis/driver-definitions#istreamresult-typealias'>IStreamResult</a><T>) => void
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#streamobserver-returns}

<b>Return type:</b> [IStream](/docs/apis/driver-definitions\istream-interface)<!-- -->&lt;T&gt;

### waitForConnectedState {#waitforconnectedstate-function}

Wait for browser to get to connected state. If connected, waits minimum of minDelay anyway (between network retries) If disconnected, polls every 30 seconds anyway, to make sure we are not getting stuck because of wrong signal Note that browsers will have false positives (like having Hyper-V adapter on machine, or machine connected to router that is not connected to internet) But there should be no false negatives. The only exception - Opera returns false when user enters "Work Offline" mode, regardless of actual connectivity.

#### Signature {#waitforconnectedstate-signature}

```typescript
export declare function waitForConnectedState(minDelay: number): Promise<void>;
```

#### Parameters {#waitforconnectedstate-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        minDelay
      </td>
      <td>
        number
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#waitforconnectedstate-returns}

<b>Return type:</b> Promise&lt;void&gt;

## Variable Details

### canRetryOnError {#canretryonerror-variable}

Check if a connection error can be retried. Unless explicitly allowed, retry is disallowed. I.e. asserts or unexpected exceptions in our code result in container failure.

#### Signature {#canretryonerror-signature}

```typescript
canRetryOnError: (error: any) => boolean
```

### createWriteError {#createwriteerror-variable}

#### Signature {#createwriteerror-signature}

```typescript
createWriteError: (message: string, props: DriverErrorTelemetryProps) => NonRetryableError<DriverErrorType.writeError>
```

### emptyMessageStream {#emptymessagestream-variable}

#### Signature {#emptymessagestream-signature}

```typescript
emptyMessageStream: IStream<ISequencedDocumentMessage[]>
```

### getRetryDelayFromError {#getretrydelayfromerror-variable}

Check retryAfterSeconds property on error and convert to ms

#### Signature {#getretrydelayfromerror-signature}

```typescript
getRetryDelayFromError: (error: any) => number | undefined
```

### getRetryDelaySecondsFromError {#getretrydelaysecondsfromerror-variable}

Check retryAfterSeconds property on error

#### Signature {#getretrydelaysecondsfromerror-signature}

```typescript
getRetryDelaySecondsFromError: (error: any) => number | undefined
```

### isFluidResolvedUrl {#isfluidresolvedurl-variable}

#### Signature {#isfluidresolvedurl-signature}

```typescript
isFluidResolvedUrl: (resolved: IResolvedUrl | undefined) => resolved is IFluidResolvedUrl
```