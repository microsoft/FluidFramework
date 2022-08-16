{"kind":"Package","title":"@fluidframework/server-services-client Package","members":{"Class":{"BasicRestWrapper":"/docs/apis/server-services-client/basicrestwrapper","GitManager":"/docs/apis/server-services-client/gitmanager","Historian":"/docs/apis/server-services-client/historian","NetworkError":"/docs/apis/server-services-client/networkerror","RestLessClient":"/docs/apis/server-services-client/restlessclient","RestWrapper":"/docs/apis/server-services-client/restwrapper","SummaryTreeUploadManager":"/docs/apis/server-services-client/summarytreeuploadmanager","WholeSummaryUploadManager":"/docs/apis/server-services-client/wholesummaryuploadmanager"},"Variable":{"buildTreePath":"/docs/apis/server-services-client#buildtreepath-Variable","canRead":"/docs/apis/server-services-client#canread-Variable","canSummarize":"/docs/apis/server-services-client#cansummarize-Variable","canWrite":"/docs/apis/server-services-client#canwrite-Variable","choose":"/docs/apis/server-services-client#choose-Variable","CorrelationIdHeaderName":"/docs/apis/server-services-client#correlationidheadername-Variable","defaultHash":"/docs/apis/server-services-client#defaulthash-Variable","DriverVersionHeaderName":"/docs/apis/server-services-client#driverversionheadername-Variable","getAuthorizationTokenFromCredentials":"/docs/apis/server-services-client#getauthorizationtokenfromcredentials-Variable"},"Function":{"convertSummaryTreeToWholeSummaryTree":"/docs/apis/server-services-client#convertsummarytreetowholesummarytree-Function","convertWholeFlatSummaryToSnapshotTreeAndBlobs":"/docs/apis/server-services-client#convertwholeflatsummarytosnapshottreeandblobs-Function","createFluidServiceNetworkError":"/docs/apis/server-services-client#createfluidservicenetworkerror-Function","generateToken":"/docs/apis/server-services-client#generatetoken-Function","generateUser":"/docs/apis/server-services-client#generateuser-Function","getNextHash":"/docs/apis/server-services-client#getnexthash-Function","getOrCreateRepository":"/docs/apis/server-services-client#getorcreaterepository-Function","getRandomName":"/docs/apis/server-services-client#getrandomname-Function","isNetworkError":"/docs/apis/server-services-client#isnetworkerror-Function","promiseTimeout":"/docs/apis/server-services-client#promisetimeout-Function","throwFluidServiceNetworkError":"/docs/apis/server-services-client#throwfluidservicenetworkerror-Function","validateTokenClaims":"/docs/apis/server-services-client#validatetokenclaims-Function","validateTokenClaimsExpiration":"/docs/apis/server-services-client#validatetokenclaimsexpiration-Function"},"TypeAlias":{"ExtendedSummaryObject":"/docs/apis/server-services-client#extendedsummaryobject-TypeAlias","IWholeFlatSummaryTreeEntry":"/docs/apis/server-services-client#iwholeflatsummarytreeentry-TypeAlias","IWholeSummaryPayloadType":"/docs/apis/server-services-client#iwholesummarypayloadtype-TypeAlias","WholeSummaryTreeEntry":"/docs/apis/server-services-client#wholesummarytreeentry-TypeAlias","WholeSummaryTreeValue":"/docs/apis/server-services-client#wholesummarytreevalue-TypeAlias"},"Interface":{"IAlfredTenant":"/docs/apis/server-services-client/ialfredtenant","ICreateRefParamsExternal":"/docs/apis/server-services-client/icreaterefparamsexternal","ICredentials":"/docs/apis/server-services-client/icredentials","IEmbeddedSummaryHandle":"/docs/apis/server-services-client/iembeddedsummaryhandle","IGetRefParamsExternal":"/docs/apis/server-services-client/igetrefparamsexternal","IGitCache":"/docs/apis/server-services-client/igitcache","IGitManager":"/docs/apis/server-services-client/igitmanager","IGitService":"/docs/apis/server-services-client/igitservice","IHistorian":"/docs/apis/server-services-client/ihistorian","INetworkErrorDetails":"/docs/apis/server-services-client/inetworkerrordetails","INormalizedWholeSummary":"/docs/apis/server-services-client/inormalizedwholesummary","IPatchRefParamsExternal":"/docs/apis/server-services-client/ipatchrefparamsexternal","ISession":"/docs/apis/server-services-client/isession","ISummaryTree":"/docs/apis/server-services-client/isummarytree","ISummaryUploadManager":"/docs/apis/server-services-client/isummaryuploadmanager","IWholeFlatSummary":"/docs/apis/server-services-client/iwholeflatsummary","IWholeFlatSummaryBlob":"/docs/apis/server-services-client/iwholeflatsummaryblob","IWholeFlatSummaryTree":"/docs/apis/server-services-client/iwholeflatsummarytree","IWholeFlatSummaryTreeEntryBlob":"/docs/apis/server-services-client/iwholeflatsummarytreeentryblob","IWholeFlatSummaryTreeEntryTree":"/docs/apis/server-services-client/iwholeflatsummarytreeentrytree","IWholeSummaryBlob":"/docs/apis/server-services-client/iwholesummaryblob","IWholeSummaryPayload":"/docs/apis/server-services-client/iwholesummarypayload","IWholeSummaryTree":"/docs/apis/server-services-client/iwholesummarytree","IWholeSummaryTreeBaseEntry":"/docs/apis/server-services-client/iwholesummarytreebaseentry","IWholeSummaryTreeHandleEntry":"/docs/apis/server-services-client/iwholesummarytreehandleentry","IWholeSummaryTreeValueEntry":"/docs/apis/server-services-client/iwholesummarytreevalueentry","IWriteSummaryResponse":"/docs/apis/server-services-client/iwritesummaryresponse"},"Enum":{"RestLessFieldNames":"/docs/apis/server-services-client#restlessfieldnames-Enum"}},"package":"@fluidframework/server-services-client","unscopedPackageName":"server-services-client"}

[//]: # (Do not edit this file. It is automatically generated by API Documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/server-services-client](/docs/apis/server-services-client)

## Classes

<table class="table table-striped table-hover class-list">
<caption>List of classes contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Class</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/server-services-client/basicrestwrapper'>BasicRestWrapper</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/gitmanager'>GitManager</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/historian'>Historian</a></td>
      <td>Implementation of the IHistorian interface that calls out to a REST interface</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/networkerror'>NetworkError</a></td>
      <td>Represents errors associated with network communication.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/restlessclient'>RestLessClient</a></td>
      <td>Client for communicating with a "RestLess" server. Translates a typical RESTful HTTP request into "RestLess" HTTP format:<!-- -->POST <<!-- -->path<!-- -->> HTTP/<!-- --><<!-- -->1.1|2<!-- -->>HOST <<!-- -->hostname<!-- -->>Content-Type: application/x-www-form-urlencoded<url-encoded-headers-body-and-method></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/restwrapper'>RestWrapper</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/summarytreeuploadmanager'>SummaryTreeUploadManager</a></td>
      <td>Recursively writes summary tree as individual summary blobs.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/wholesummaryuploadmanager'>WholeSummaryUploadManager</a></td>
      <td>Converts summary to snapshot tree and uploads with single snaphot tree payload.</td>
    </tr>
  </tbody>
</table>

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
      <td><a href='/docs/apis/server-services-client#restlessfieldnames-Enum'>RestLessFieldNames</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover function-list">
<caption>List of functions contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Function</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/server-services-client#convertsummarytreetowholesummarytree-Function'>convertSummaryTreeToWholeSummaryTree(parentHandle, tree, path, rootNodeName)</a></td>
      <td>Converts the summary tree to a whole summary tree to be uploaded. Always upload full whole summary tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#convertwholeflatsummarytosnapshottreeandblobs-Function'>convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary, treePrefixToRemove)</a></td>
      <td>Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#createfluidservicenetworkerror-Function'>createFluidServiceNetworkError(statusCode, errorData)</a></td>
      <td>Convenience function for generating a <a href='/docs/apis/server-services-client/networkerror'>NetworkError</a>.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#generatetoken-Function'>generateToken(tenantId, documentId, key, scopes, user, lifetime, ver)</a></td>
      <td>Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign) and should only be used in client context.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#generateuser-Function'>generateUser()</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#getnexthash-Function'>getNextHash(message, lastHash)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#getorcreaterepository-Function'>getOrCreateRepository(endpoint, owner, repository, headers)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#getrandomname-Function'>getRandomName(connector, capitalize)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#isnetworkerror-Function'>isNetworkError(error)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#promisetimeout-Function'>promiseTimeout(mSec, promise)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#throwfluidservicenetworkerror-Function'>throwFluidServiceNetworkError(statusCode, errorData)</a></td>
      <td>Convenience function to both generate and throw a <a href='/docs/apis/server-services-client/networkerror'>NetworkError</a>.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#validatetokenclaims-Function'>validateTokenClaims(token, documentId, tenantId)</a></td>
      <td>Validates a JWT token to authorize routerlicious. Throws NetworkError if claims are invalid.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#validatetokenclaimsexpiration-Function'>validateTokenClaimsExpiration(claims, maxTokenLifetimeSec)</a></td>
      <td>Validates token claims' iat and exp properties to ensure valid token expiration. Throws NetworkError if expiry is invalid.</td>
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
      <td><a href='/docs/apis/server-services-client/ialfredtenant'>IAlfredTenant</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/icreaterefparamsexternal'>ICreateRefParamsExternal</a></td>
      <td>Required params to create ref with config</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/icredentials'>ICredentials</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iembeddedsummaryhandle'>IEmbeddedSummaryHandle</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/igetrefparamsexternal'>IGetRefParamsExternal</a></td>
      <td>Required params to get ref with config</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/igitcache'>IGitCache</a></td>
      <td>Git cache data</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/igitmanager'>IGitManager</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/igitservice'>IGitService</a></td>
      <td>Interface to a generic Git provider</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/ihistorian'>IHistorian</a></td>
      <td>The Historian extends the git service by providing access to document header information stored in the repository</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/inetworkerrordetails'>INetworkErrorDetails</a></td>
      <td>Represents the details associated with a <a href='/docs/apis/server-services-client/networkerror'>NetworkError</a>.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/inormalizedwholesummary'>INormalizedWholeSummary</a></td>
      <td>Normalized Whole Summary with decoded blobs and unflattened snapshot tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/ipatchrefparamsexternal'>IPatchRefParamsExternal</a></td>
      <td>Required params to patch ref with config</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/isession'>ISession</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/isummarytree'>ISummaryTree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/isummaryuploadmanager'>ISummaryUploadManager</a></td>
      <td>Uploads a summary to storage.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummary'>IWholeFlatSummary</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummaryblob'>IWholeFlatSummaryBlob</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummarytree'>IWholeFlatSummaryTree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummarytreeentryblob'>IWholeFlatSummaryTreeEntryBlob</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummarytreeentrytree'>IWholeFlatSummaryTreeEntryTree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummaryblob'>IWholeSummaryBlob</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummarypayload'>IWholeSummaryPayload</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummarytree'>IWholeSummaryTree</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummarytreebaseentry'>IWholeSummaryTreeBaseEntry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummarytreehandleentry'>IWholeSummaryTreeHandleEntry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwholesummarytreevalueentry'>IWholeSummaryTreeValueEntry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client/iwritesummaryresponse'>IWriteSummaryResponse</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover variable-list">
<caption>List of variables contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Variable</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/server-services-client#buildtreepath-Variable'>buildTreePath</a></td>
      <td>Convert a list of nodes to a tree path. If a node is empty (blank) it will be removed. If a node's name begins and/or ends with a "/", it will be removed.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#canread-Variable'>canRead</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#cansummarize-Variable'>canSummarize</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#canwrite-Variable'>canWrite</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#choose-Variable'>choose</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#correlationidheadername-Variable'>CorrelationIdHeaderName</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#defaulthash-Variable'>defaultHash</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#driverversionheadername-Variable'>DriverVersionHeaderName</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#getauthorizationtokenfromcredentials-Variable'>getAuthorizationTokenFromCredentials</a></td>
      <td></td>
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
      <td><a href='/docs/apis/server-services-client#extendedsummaryobject-TypeAlias'>ExtendedSummaryObject</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#iwholeflatsummarytreeentry-TypeAlias'>IWholeFlatSummaryTreeEntry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#iwholesummarypayloadtype-TypeAlias'>IWholeSummaryPayloadType</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#wholesummarytreeentry-TypeAlias'>WholeSummaryTreeEntry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/server-services-client#wholesummarytreevalue-TypeAlias'>WholeSummaryTreeValue</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

<hr><div id=package-details>

## Enumeration Details {#enumerations-details}

### RestLessFieldNames enum {#restlessfieldnames-Enum}

<b>Signature:</b>

```typescript
export declare enum RestLessFieldNames 
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
      <td>Body</td>
      <td><code>&quot;body&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Header</td>
      <td><code>&quot;header&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Method</td>
      <td><code>&quot;method&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>


## Function Details {#functions-details}

### convertSummaryTreeToWholeSummaryTree {#convertsummarytreetowholesummarytree-Function}

Converts the summary tree to a whole summary tree to be uploaded. Always upload full whole summary tree.

<b>Signature:</b>

```typescript
export declare function convertSummaryTreeToWholeSummaryTree(parentHandle: string | undefined, tree: ISummaryTree, path?: string, rootNodeName?: string): IWholeSummaryTree;
```

#### Parameters {#convertsummarytreetowholesummarytree-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>parentHandle</td>
      <td>string | undefined</td>
      <td>Handle of the last uploaded summary or detach new summary.</td>
    </tr>
    <tr>
      <td>tree</td>
      <td><a href='/docs/apis/server-services-client/isummarytree'>ISummaryTree</a></td>
      <td>Summary Tree which will be converted to whole summary tree to be uploaded.</td>
    </tr>
    <tr>
      <td>path</td>
      <td>string</td>
      <td>Current path of node which is getting evaluated.</td>
    </tr>
    <tr>
      <td>rootNodeName</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### convertWholeFlatSummaryToSnapshotTreeAndBlobs {#convertwholeflatsummarytosnapshottreeandblobs-Function}

Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.

<b>Signature:</b>

```typescript
export declare function convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary: IWholeFlatSummary, treePrefixToRemove?: string): INormalizedWholeSummary;
```

#### Parameters {#convertwholeflatsummarytosnapshottreeandblobs-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>flatSummary</td>
      <td><a href='/docs/apis/server-services-client/iwholeflatsummary'>IWholeFlatSummary</a></td>
      <td>flat summary</td>
    </tr>
    <tr>
      <td>treePrefixToRemove</td>
      <td>string</td>
      <td>tree prefix to strip. By default we are stripping ".app" prefix</td>
    </tr>
  </tbody>
</table>

#### Returns {#convertwholeflatsummarytosnapshottreeandblobs-Function-returns}


snapshot tree, blob array, and sequence number

<b>Return type(s):</b> [INormalizedWholeSummary](/docs/apis/server-services-client/inormalizedwholesummary)

### createFluidServiceNetworkError {#createfluidservicenetworkerror-Function}

Convenience function for generating a [NetworkError](/docs/apis/server-services-client/networkerror)<!-- -->.

<b>Signature:</b>

```typescript
export declare function createFluidServiceNetworkError(statusCode: number, errorData?: INetworkErrorDetails | string): NetworkError;
```

#### Parameters {#createfluidservicenetworkerror-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>statusCode</td>
      <td>number</td>
      <td>HTTP status code that describes the error.</td>
    </tr>
    <tr>
      <td>errorData</td>
      <td><a href='/docs/apis/server-services-client/inetworkerrordetails'>INetworkErrorDetails</a> | string</td>
      <td>Optional additional data associated with the error. Can either be a simple string representing the message, or an <a href='/docs/apis/server-services-client/inetworkerrordetails'>INetworkErrorDetails</a> object.</td>
    </tr>
  </tbody>
</table>

#### Returns {#createfluidservicenetworkerror-Function-returns}


A [NetworkError](/docs/apis/server-services-client/networkerror) instance properly configured according to the parameters provided.

<b>Return type(s):</b> [NetworkError](/docs/apis/server-services-client/networkerror)

#### Remarks {#createfluidservicenetworkerror-Function-remarks}

Generates a [NetworkError](/docs/apis/server-services-client/networkerror) instance appropriately configured given the status code and error data provided. This function is intended to be used in situations where a [NetworkError](/docs/apis/server-services-client/networkerror) is dynamically created based variable parameters. That is, when it is not known whether the status code can be 404 or 500.

### generateToken {#generatetoken-Function}

Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign) and should only be used in client context.

<b>Signature:</b>

```typescript
export declare function generateToken(tenantId: string, documentId: string, key: string, scopes: ScopeType[], user?: IUser, lifetime?: number, ver?: string): string;
```

#### Parameters {#generatetoken-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>tenantId</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>documentId</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>key</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>scopes</td>
      <td><a href='/docs/apis/azure-client#scopetype-Enum'>ScopeType</a>[]</td>
      <td></td>
    </tr>
    <tr>
      <td>user</td>
      <td><a href='/docs/apis/azure-client/iuser'>IUser</a></td>
      <td></td>
    </tr>
    <tr>
      <td>lifetime</td>
      <td>number</td>
      <td></td>
    </tr>
    <tr>
      <td>ver</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### generateUser {#generateuser-Function}

<b>Signature:</b>

```typescript
export declare function generateUser(): IUser;
```

### getNextHash {#getnexthash-Function}

<b>Signature:</b>

```typescript
export declare function getNextHash(message: ISequencedDocumentMessage, lastHash: string): string;
```

#### Parameters {#getnexthash-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>message</td>
      <td><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage'>ISequencedDocumentMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td>lastHash</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getOrCreateRepository {#getorcreaterepository-Function}

<b>Signature:</b>

```typescript
export declare function getOrCreateRepository(endpoint: string, owner: string, repository: string, headers?: AxiosRequestHeaders): Promise<void>;
```

#### Parameters {#getorcreaterepository-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>endpoint</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>owner</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>repository</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>headers</td>
      <td>AxiosRequestHeaders</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getRandomName {#getrandomname-Function}

<b>Signature:</b>

```typescript
export declare function getRandomName(connector?: string, capitalize?: boolean): string;
```

#### Parameters {#getrandomname-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>connector</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>capitalize</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### isNetworkError {#isnetworkerror-Function}

<b>Signature:</b>

```typescript
export declare function isNetworkError(error: unknown): error is NetworkError;
```

#### Parameters {#isnetworkerror-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>error</td>
      <td>unknown</td>
      <td></td>
    </tr>
  </tbody>
</table>

### promiseTimeout {#promisetimeout-Function}

<b>Signature:</b>

```typescript
export declare function promiseTimeout(mSec: number, promise: Promise<any>): Promise<any>;
```

#### Parameters {#promisetimeout-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>mSec</td>
      <td>number</td>
      <td></td>
    </tr>
    <tr>
      <td>promise</td>
      <td>Promise<any></td>
      <td></td>
    </tr>
  </tbody>
</table>

### throwFluidServiceNetworkError {#throwfluidservicenetworkerror-Function}

Convenience function to both generate and throw a [NetworkError](/docs/apis/server-services-client/networkerror)<!-- -->.

<b>Signature:</b>

```typescript
export declare function throwFluidServiceNetworkError(statusCode: number, errorData?: INetworkErrorDetails | string): never;
```

#### Parameters {#throwfluidservicenetworkerror-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>statusCode</td>
      <td>number</td>
      <td>HTTP status code that describes the error.</td>
    </tr>
    <tr>
      <td>errorData</td>
      <td><a href='/docs/apis/server-services-client/inetworkerrordetails'>INetworkErrorDetails</a> | string</td>
      <td>Optional additional data associated with the error. Can either be a simple string representing the message, or an <a href='/docs/apis/server-services-client/inetworkerrordetails'>INetworkErrorDetails</a> object.</td>
    </tr>
  </tbody>
</table>

#### Remarks {#throwfluidservicenetworkerror-Function-remarks}

Similarly to [createFluidServiceNetworkError()](/docs/apis/server-services-client#createfluidservicenetworkerror-Function)<!-- -->, this function generates a [NetworkError](/docs/apis/server-services-client/networkerror) instance appropriately configured given the status code and error data provided. The difference is that this function also throws the [NetworkError](/docs/apis/server-services-client/networkerror)<!-- -->.

### validateTokenClaims {#validatetokenclaims-Function}

Validates a JWT token to authorize routerlicious. Throws NetworkError if claims are invalid.

<b>Signature:</b>

```typescript
export declare function validateTokenClaims(token: string, documentId: string, tenantId: string): ITokenClaims;
```

#### Parameters {#validatetokenclaims-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>token</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>documentId</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>tenantId</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

#### Returns {#validatetokenclaims-Function-returns}


- decoded claims.

<b>Return type(s):</b> [ITokenClaims](/docs/apis/azure-client/itokenclaims)

### validateTokenClaimsExpiration {#validatetokenclaimsexpiration-Function}

Validates token claims' iat and exp properties to ensure valid token expiration. Throws NetworkError if expiry is invalid.

<b>Signature:</b>

```typescript
export declare function validateTokenClaimsExpiration(claims: ITokenClaims, maxTokenLifetimeSec: number): number;
```

#### Parameters {#validatetokenclaimsexpiration-Function-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>claims</td>
      <td><a href='/docs/apis/azure-client/itokenclaims'>ITokenClaims</a></td>
      <td></td>
    </tr>
    <tr>
      <td>maxTokenLifetimeSec</td>
      <td>number</td>
      <td></td>
    </tr>
  </tbody>
</table>

#### Returns {#validatetokenclaimsexpiration-Function-returns}


token lifetime in milliseconds.

<b>Return type(s):</b> number


## Variable Details {#variables-details}

### buildTreePath {#buildtreepath-Variable}

Convert a list of nodes to a tree path. If a node is empty (blank) it will be removed. If a node's name begins and/or ends with a "/", it will be removed.

<b>Signature:</b>

```typescript
buildTreePath: (...nodeNames: string[]) => string
```

### canRead {#canread-Variable}

<b>Signature:</b>

```typescript
canRead: (scopes: string[]) => boolean
```

### canSummarize {#cansummarize-Variable}

<b>Signature:</b>

```typescript
canSummarize: (scopes: string[]) => boolean
```

### canWrite {#canwrite-Variable}

<b>Signature:</b>

```typescript
canWrite: (scopes: string[]) => boolean
```

### choose {#choose-Variable}

<b>Signature:</b>

```typescript
choose: () => string
```

### CorrelationIdHeaderName {#correlationidheadername-Variable}

<b>Signature:</b>

```typescript
CorrelationIdHeaderName = "x-correlation-id"
```

### defaultHash {#defaulthash-Variable}

<b>Signature:</b>

```typescript
defaultHash = "00000000"
```

### DriverVersionHeaderName {#driverversionheadername-Variable}

<b>Signature:</b>

```typescript
DriverVersionHeaderName = "x-driver-version"
```

### getAuthorizationTokenFromCredentials {#getauthorizationtokenfromcredentials-Variable}

<b>Signature:</b>

```typescript
getAuthorizationTokenFromCredentials: (credentials: ICredentials) => string
```

## Type Alias Details {#type-aliases-details}

### ExtendedSummaryObject {#extendedsummaryobject-TypeAlias}

<b>Signature:</b>

```typescript
export declare type ExtendedSummaryObject = SummaryObject | IEmbeddedSummaryHandle;
```

### IWholeFlatSummaryTreeEntry {#iwholeflatsummarytreeentry-TypeAlias}

<b>Signature:</b>

```typescript
export declare type IWholeFlatSummaryTreeEntry = IWholeFlatSummaryTreeEntryTree | IWholeFlatSummaryTreeEntryBlob;
```

### IWholeSummaryPayloadType {#iwholesummarypayloadtype-TypeAlias}

<b>Signature:</b>

```typescript
export declare type IWholeSummaryPayloadType = "container" | "channel";
```

### WholeSummaryTreeEntry {#wholesummarytreeentry-TypeAlias}

<b>Signature:</b>

```typescript
export declare type WholeSummaryTreeEntry = IWholeSummaryTreeValueEntry | IWholeSummaryTreeHandleEntry;
```

### WholeSummaryTreeValue {#wholesummarytreevalue-TypeAlias}

<b>Signature:</b>

```typescript
export declare type WholeSummaryTreeValue = IWholeSummaryTree | IWholeSummaryBlob;
```

</div>
