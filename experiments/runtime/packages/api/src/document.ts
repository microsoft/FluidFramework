// import { IDocument } from "@prague/api-definitions";
// import * as resources from "@prague/gitresources";
import { IRuntime } from "@prague/runtime-definitions";
// import { Deferred } from "@prague/utils";
// import * as assert from "assert";
import { EventEmitter } from "events";
// import performanceNow = require("performance-now");
// import * as uuid from "uuid/v4";
// import { debug } from "./debug";

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter /* implements IDocument */ {
    public static async Load(runtime: IRuntime): Promise<Document> {

        const document = new Document();

        return document;
    }

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    // private distributedObjects = new Map<string, IDistributedObjectState>();
    // private reservations = new Map<string, Deferred<api.ICollaborativeObject>>();

    // private messagesSinceMSNChange = new Array<api.ISequencedDocumentMessage>();
    // private helpRequested: Set<string> = new Set<string>();
    // private pendingAttach = new Map<string, api.IAttachMessage>();
    // private lastMinSequenceNumber;
    // private loaded = false;
    // private lastLeaderClientId: string;

    /**
     * Constructs a new document from the provided details
     */
    private constructor() {
        super();
    }

    // private async prepareRemoteMessage(message: api.ISequencedDocumentMessage): Promise<any> {
    //     if (message.type === api.ObjectOperation) {
    //         const envelope = message.contents as api.IEnvelope;
    //         const objectDetails = this.distributedObjects.get(envelope.address);
    //         return objectDetails.connection.prepare(message);
    //     } else if (message.type === api.AttachObject && message.clientId !== this._clientId) {
    //         const attachMessage = message.contents as api.IAttachMessage;

    //         // create storage service that wraps the attach data
    //         const localStorage = new api.LocalObjectStorageService(attachMessage.snapshot);
    //         const connection = new api.ObjectDeltaConnection(attachMessage.id, this, this.connectionState);

    //         // Document sequence number references <= message.sequenceNumber should map to the object's 0 sequence
    //         // number. We cap to the MSN to keep a tighter window and because no references should be below it.
    //         connection.setBaseMapping(0, message.minimumSequenceNumber);

    //         const distributedObject: api.IDistributedObject = {
    //             id: attachMessage.id,
    //             sequenceNumber: 0,
    //             type: attachMessage.type,
    //         };

    //         const services = {
    //             deltaConnection: connection,
    //             objectStorage: localStorage,
    //         };

    //         const origin = message.origin ? message.origin.id : this.id;
    //         this.reserveDistributedObject(distributedObject.id);
    //         const value = await this.loadInternal(distributedObject, [], services, 0, origin);

    //         return {
    //             services,
    //             value,
    //         };
    //     }
    // }

    // private processRemoteMessage(message: api.ISequencedDocumentMessage, context: any) {
    //     const minSequenceNumberChanged = this.lastMinSequenceNumber !== message.minimumSequenceNumber;
    //     this.lastMinSequenceNumber = message.minimumSequenceNumber;

    //     // Add the message to the list of pending messages so we can transform them during a snapshot
    //     this.messagesSinceMSNChange.push(message);

    //     const eventArgs: any[] = [message];
    //     switch (message.type) {
    //         case api.ObjectOperation:
    //             const envelope = message.contents as api.IEnvelope;
    //             const objectDetails = this.distributedObjects.get(envelope.address);

    //             this.submitLatencyMessage(message);
    //             objectDetails.connection.process(message, context);
    //             eventArgs.push(objectDetails.object);
    //             break;

    //         case api.AttachObject:
    //             const attachMessage = message.contents as api.IAttachMessage;

    //             // If a non-local operation then go and create the object - otherwise mark it as officially
    //             // attached.
    //             if (message.clientId !== this._clientId) {
    //                 this.fulfillDistributedObject(context.value as api.ICollaborativeObject, context.services);
    //             } else {
    //                 assert(this.pendingAttach.has(attachMessage.id));
    //                 this.pendingAttach.delete(attachMessage.id);

    //                 // Document sequence number references <= message.sequenceNumber should map to the object's 0
    //                 // sequence number. We cap to the MSN to keep a tighter window and because
    //                 // no references should be
    //                 // below it.
    //                 this.distributedObjects.get(attachMessage.id).connection.setBaseMapping(
    //                     0,
    //                     message.minimumSequenceNumber);
    //             }
    //             eventArgs.push(this.distributedObjects.get(attachMessage.id).object);
    //             break;

    //         case api.ClientJoin:
    //             this.clients.set(message.contents.clientId, message.contents.detail);
    //             // This is the only one that requires the pending client ID
    //             if (message.contents.clientId === this.pendingClientId) {
    //                 this.setConnectionState(
    //                     api.ConnectionState.Connected,
    //                     `Fully joined the document@ ${message.minimumSequenceNumber}`,
    //                     this.pendingClientId);
    //             }
    //             this.runTaskAnalyzer();
    //             this.emit("clientJoin", message.contents);
    //             break;

    //         case api.ClientLeave:
    //             this.clients.delete(message.contents);
    //             this.emit("clientLeave", message.contents);
    //             this.runTaskAnalyzer();
    //             break;

    //         // Message contains full metadata (no content)
    //         case api.BlobPrepared:
    //             this.blobManager.addBlob(message.contents);
    //             this.emit(api.BlobPrepared, message.contents);
    //             break;

    //         case api.BlobUploaded:
    //             // indicates that blob has been uploaded, just a flag... no blob buffer
    //             // message.contents is just the hash
    //             this.blobManager.createBlob(message.contents);
    //             this.emit(api.BlobUploaded, message.contents);
    //         default:
    //             break;
    //     }

    //     if (minSequenceNumberChanged) {
    //         // Reset the list of messages we have received since the min sequence number changed
    //         let index = 0;
    //         for (; index < this.messagesSinceMSNChange.length; index++) {
    //             if (this.messagesSinceMSNChange[index].sequenceNumber > message.minimumSequenceNumber) {
    //                 break;
    //             }
    //         }
    //         this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);

    //         for (const [, object] of this.distributedObjects) {
    //             if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
    //                 object.connection.updateMinSequenceNumber(message.minimumSequenceNumber);
    //             }
    //         }
    //     }

    //     this.emit("op", ...eventArgs);
    // }
}
