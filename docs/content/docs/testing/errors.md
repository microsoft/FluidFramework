---
title: Common Fluid Framework Errors
menuPosition: 5
---

This article lists the most common errors Fluid developers will encounter. The first steps to resolve the errors are listed. If you get an error that is not included here, please [let us know with a GitHub issue](https://github.com/microsoft/FluidFramework/issues) and we’ll update both the documentation and our guidance. 

### **`<X>` is not a constructor** 

[A generic JavaScript exception](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Not_a_constructor)

**Steps to take** : Investigate the root cause in your application. It’s likely that there is a high-level catch statement around the container operations and the underlying problem is in those operations.  

### **`0x26d`**

The ops fetched from service do not start from the requested first op. 

**Steps to take**: If the issue persists, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **`0x26f`**

The ops fetched from the service are either out of order or duplicated. 

**Steps to take**: If the issue persists, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **`0x589` / Local data store detected in attaching state while running GC**

A data store was created in the summarizer client and is in “connecting” state when the summary runs. This leads to summary failures and can eventually lead to document corruption if it happens consistently.  

**Steps to take**: Data stores should never be created in the summarizer client because there is no user interaction. Determine which data store is causing the issue. Use the preceding DataStoreCreatedInSummarizer error. It has the properties fullPackageName and fluidDataStoreId. Those properties identify the data store that was created in summarizer. 

### **BlobOnlyStorage not implemented method used**	 

A call to storage is made before the container is attached. 

**Steps to take**: This is a known issue in the Fluid Framework. It is being investigated and this article will be updated when a fix is deployed. 

### **Cannot read properties of undefined (reading 'x')** 

A JavaScript exception that indicates an undefined value was accessed. This is caused by attempting to access one of the following. 

- An object property for undefined. 

- An element in an array which doesn’t exist. 

- A DOM element which doesn’t exist. 

**Steps to take**: Investigate the root cause in your application. It’s likely that there is a high-level catch statement around the container operations and the underlying problem is in those operations. 

### **channelFactoryNotRegisteredForGivenType** 

Thrown by a Distributed Data Structure (DDS) or shared object during its load. The factory for that requested type was not found in the shared object registry. 

The shared object registry (of type `ISharedObjectRegistry`) is something the client supplies to Fluid when the data store is loaded. From that point on, the registry is read-only. This implies the document requires certain types of DDSs for which the runtime is not able to get a factory instance. 

**Steps to take**: Both the DDS's type (`channelFactoryType`) and the package path (`dataStorePackagePath`) of the data store that contains the DDS are part of the error. These indicate which DDS in a data store has the missing factory. The likely scenario is that a document was created with one configuration, then loaded with another with a newer version of the application. You’ll need to develop a migration strategy for your DDSes. 

### **channelTypeNotAvailable** 

This is a backwards compatibility case where an old attach message for a Distributed Data Structure (DDS) or shared object is processed. An error is thrown during the load operation when the attach message doesn't have an associated type. This DDS cannot be loaded since the runtime cannot get the factory for that DDS to create an instance of it. 

**Steps to take**: You’ll need to develop a migration strategy for your DDSes to continue processing old requests. 

### **Container closed without error during load** 

Something closed the container while it was being loaded. This doesn’t affect your data and is not a concern. 

**Steps to take**: Investigate the context in which this error is generated and make sure the closing behavior is intentional. 

### **Disconnect: Summary cancelled due to summarizer or main client disconnect** 

The client disconnected while the summary was being prepared. When a client disconnects, summaries should be cancelled, as there is no way to submit the summary. 

**Steps to take**: This isn’t problematic unless it happens frequently on the same document. Consider more than ten occurrences to be a concern. In that case, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **DuplicateJoinSessionRefresh** 

The client refreshed or joined the session twice. 

**Steps to take**: This is a known issue in the Fluid Framework. It is being investigated and this article will be updated when a fix is deployed. 

### **Epoch mismatch** 

The client and server epochs are different. The epoch can change when a previous version of document is restored. If there is already a client running with another epoch when this happens, further interaction with storage leads to this error. 

**Steps to take**: Refreshing the document should fetch the new epoch and cause the document to load properly. 

### **Error parsing snapshot response: 0x3dc** 

The client was unable to parse a fetch snapshot response from the service. 

**Steps to take**: The snapshot is likely malformed for that network call. Retrying the operation should be successful. 

### **Error while parsing fetch response** 

The client is unable to parse the network call response from the service. If this issue occurs on an important network call, such as fetching a snapshot, the document could fail to load. Refreshing the document can fix it.  

**Steps to take**: If the issue persists and doesn’t let the document load, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **Failed to execute 'invoke' on 'CreateURLCallback': The provided callback is no longer runnable.** 

A JavaScript exception unrelated to Fluid. 

**Steps to take**: Investigate the root cause in your application. It’s likely that there is a high-level catch statement around container operations and the underlying problem is in those operations. 

### **Failed to fetch** 

There was an error contacting the SharePoint Embedded server. Fetching the document snapshot or getting a document link returned the specified HTTP status code. 

**Steps to take**: This error is surfaced by Fluid, but indicates a communication issue between the client and the server. Check your authentication for the platform. This may also indicate network connectivity issues. 

### **fluid:telemetry:BlobManager:AttachmentReadBlob_cancel** 

The client failed to read a blob from storage. There are several possibilities as to the root cause of this error, but it is usually caused by either storage not being available or the client attempting to read blobs after the runtime has closed. This may be a sign of a race condition or of faulty application-level cleanup logic. 

**Steps to take**: Investigate the root cause based on the error from the event. If your application isn’t responsible, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **fluid:telemetry:Container:ContainerClose** 

The container has closed with an error. This implies that the session has ended, the document is closed, and the client must explicitly load the document again. The Fluid container API’s [close function](https://github.com/microsoft/FluidFramework/blob/a9da5b9ace925483ad2b6095d0a9f26fc616068f/packages/loader/container-loader/src/container.ts#L991) emits this event. It can be triggered by either the app or the framework. It may or may not include an embedded error. If close is called without an error as an argument, the event signifies a normal close operation, not an error. 

**Steps to take**: Verify if the close function is called by the application. If not, investigate the embedded error. 

### **fluid:telemetry:DeltaManager:GetDeltas_Exception** 

The delta manager attempted to fetch some missing ops and failed to do so. There could be several reasons for the failure. 

**Steps to take**: If the source is an authentication problem (401 or 403), you should investigate your auth layer. You may also need to investigate your token fetcher or if any relevant IP addresses are blocked. 

### **fluid:telemetry:FluidDataStoreContext:RealizeError** 

A data store failed to load during the corresponding application code initialization that happens as part of realization. This leads to data stores not being loaded in documents. This mostly happens due to application code failing during data store initialization, such as in the `initializingFirstTime`, `initializingFromExisting`, and `hasInitialized` functions of DataObject. 

**Steps to take**: The error contains details such as an error message, fullPackageName, and fluidDataStoreId. You should use these to find the root error and which data stores are affected. 

### **fluid:telemetry:OdspDriver:DeltaConnection:FlushResult** 

This event is recorded when the ops being flushed to the SharePoint Embedded server from the relay service are not successful. This can result in summary failures.  

**Steps to take**: If the document is not summarizing, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **fluid:telemetry:OdspDriver:GetDeltas_Error** 

The call to fetch ops has failed in the driver layer. This is likely an authentication issue (401 or 403), but could also be a token fetcher error or the result of blocked IP address. 

**Steps to take**: Investigate your authentication layer for storage communication issues.  

### **fluid:telemetry:Summarizer:Running:GarbageCollection_cancel**

Garbage collection was cancelled for an unexpected reason. This leads to a subsequent fluid:telemetry:Summarizer:Running:Summarize_cancel event. The document will not be summarized in the respective summary operation. This is a problem if there are subsequent failures on a single document where the summarizer repeatedly signals. sum 

**Steps to take**:  If it’s an occasional error with each document, it’s not a concern, as the summarizer will recover. If this happens ten or more times with a document, roll back the changes that caused this behavior and report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **fluid:telemetry:Summarizer:Running:gcUnknownOutboundReferences** 

Garbage collection detected new references that it did not detect between summaries. Certain data stores may become garbage collected earlier than expected. This results in potential data loss and data corruption scenarios.  

**Steps to take**: Any code that causes a spike in calls to gcUnknownOutboundReferences might cause garbage collection to delete data stores and blobs early. Rollback any code causing this event to occur, if reasonable. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **fluid:telemetry:Summarizer:Running:Summarize_cancel** 

Summarization was cancelled for an unexpected reason. This leads to the document not being summarized in the respective summary operation.  

**Steps to take**: If an error is included with this event, follow the guidance for that error. Otherwise, this is an internal Fluid event and should be reported to the Fluid team by filing a a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **fluid:telemetry:SummaryManager:SummarizerException** 

The summarizer threw an exception while it was running. This is similar to fluid:telemetry:Summarizer:Running:Summarize_cancel. 

**Steps to take**: Extract more information from the event to diagnose the root cause. The error property provides more insight. 

### **Found a lower minimumSequenceNumber (msn) than previously recorded** 

The atomic broadcast protocol was broken. The client observed a message with a sequence number lower than expected. 

**Steps to take**: This is an issue with the Fluid Framework. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **Found two messages with the same sequenceNumber but different payloads** 

The runtime detected that the server sent two different ops with the same sequence number. The runtime will close and there may be data loss. 

**Steps to take**: Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **Incomplete batch** 

The client received and processed an incomplete batch of ops. 

**Steps to take**: This is an issue with the Fluid Framework. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **IP Address is blocked** 

The IP address of the client was blocked by the SharePoint Embedded server. When communicating with the service, the client may receive a 403, forbidden response, code. If the response also contains either the blockedIPAddress or the conditionalAccessPolicyEnforced code, this error is produced. This means the SharePoint Embedded server explicitly rejected the request for this client and tenant. 

**Steps to take**: Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **MergeTree insert failed** 

A SharedString Distributed Data Structure (DDS) processed a remote op that refers to invalid positions. Depending on the context of the op, this indicates data processing or data corruption errors. 

**Steps to take**: This indicates an internal Fluid problem. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues).

### **No registry for package** 

No data store registry was provided to the runtime.  

**Steps to take**: Investigate the lifecycle of the runtime and how the Distributed Data Structure (DDS) factories are set up. 

### **NodeDidNotRunGC** 

A data store or Distributed Data Structure (DDS) did not run garbage collection (GC) during summarization. This leads to summary failures and possible document corruption if it happens consistently. It is likely that a data store or DDS was created during summarization, which runs after GC.  

**Steps to take**: Data stores should never be created in the summarizer client because there is no user interaction. Determine which data store is causing the issue. Use the preceding DataStoreCreatedInSummarizer error. It has the properties fullPackageName and fluidDataStoreId, which identify the data store that was created in summarizer. 

### **ODSP fetch error [`<http-status-code>`]** 

There was an error contacting the SharePoint Embedded server. Fetching the document snapshot or getting a document link returned the specified HTTP status code. 

**Steps to take**: This error is surfaced by Fluid, but indicates a communication issue between the client and the server. Check your authentication for the platform. 

### **Op was submitted from within a `ensureNoDataModelChanges` callback** 

The client created an op inside an onchanged event handler of a Distributed Data Structure (DDS). Avoid this coding pattern if possible. Changing the data model as a response to changes in the data model can lead to undefined behavior. 

**Steps to take**: Avoid op reentry and changing DDSes inside onchanged event handlers. If that isn’t possible, use op grouping. 

### **ops request cancelled by client**

While the client was fetching ops from the server, it cancelled the request. 

**Steps to take**: If the cancellation is persistent and unexpected, report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). Occasional cancellations should not be considered a problem or error. 

### **Out of schema data: A required trait was not present on the document node.** 

This is a client-supplied error, coming from ts-pipe. 

**Steps to take**: Investigate why the traits aren’t being supplied to the document node. 

### **Proper new file params should be there** 

The expected parameters for container creation in the container attach request aren’t present. The request to attach the container needs to have siteUrl, SPO driveId, `filePath`, and the file name. If any of these are missing, then the resolver throws this error.  

**Steps to take**: Check the attach request code. Use the `createOdspCreateContainerRequest` function to create this request. 

### **Registry does not contain entry for the package** 

The Distributed Data Structure (DDS) registry provided to Fluid doesn’t contain any entry for the requested package. 

**Steps to take**: Check your DDS registry settings. If the proper package is configured, report this issue to the Fluid team by filing a GitHub issue. 

### **Runtime detected too many reconnects with no progress syncing local ops.** 

The client didn’t make progress in between reconnections. Since there is no point in continuing to accumulate changes which aren’t serialized, the client closes. This can lead to data loss. 

**Steps to take**: This is an issue with the Fluid Framework. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **socket.io (connect_error): timeout** 

This socket.io error indicates that the client timed out when attempting to communicate with the server.  

**Steps to take**: This is usually a network connectivity issue. Ensure that the client can communicate with the server. Any firewall rules or internet connection diagnostics may be able to help. 

### **socket.io (connect_error): websocket error: {"description":{"isTrusted":true},"type":"TransportError"}** 

The client was unable to connect, possibly due to network issues. 

**Steps to take**: Follow the steps listed in the article [Troubleshooting connection issues | Socket.IO](https://socket.io/docs/v4/troubleshooting-connection-issues/) 

### **socket.io (disconnect): ping timeout** 

This is a generic timeout error from socket.io. A full description is in the Server options | Socket.IO article.  

**Steps to take**: This is usually a network connectivity issue. Ensure that the client can communicate with the server. Any firewall rules or internet connection diagnostics may be able to help.  

### **socket.io (disconnect): transport close** 

The socket has closed and the client stopped communicating with the server. The client will try to reconnect automatically, and, as such, will acquire a new clientId and begin the other connection steps. 

**Steps to take**: This is an issue with the Fluid Framework. Report this issue to the Fluid team by filing a [GitHub issue](https://github.com/microsoft/FluidFramework/issues). 

### **summary state stale - Unsupported option 'refreshLatestAck'** 

This error is generated after a summarize_cancel event. The unexpected cancellation is the real error.  

**Steps to take**: By itself, this is not actionable. Follow the guidance for preceding errors. 

### **The Host-provided token fetcher threw an error**

This occurs when the app-provided token fetcher fails. 

**Steps to take**: Check the token fetcher logic in your application. 