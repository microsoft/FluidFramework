import {
    ConnectionState,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ITree,
} from "@prague/container-definitions";
import {
    IDistributedObjectServices,
    IObjectStorageService,
    IRuntime,
} from "@prague/runtime-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { ISharedObject } from "./types";
import { ValueType } from "./valueType";

// TODO this may migrate to the runtime
export const OperationType = "op";

export abstract class SharedObject extends EventEmitter implements ISharedObject {
    // tslint:disable-next-line:variable-name
    public readonly __sharedObject__ = true;

    // Private fields exposed via getters
    // tslint:disable:variable-name
    private _state = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    private services: IDistributedObjectServices;

    public get state(): ConnectionState {
        return this._state;
    }

    constructor(public id: string, protected runtime: IRuntime, public type: string) {
        super();
    }

    public toJSON() {
        return {
            type: ValueType[ValueType.Shared],
            value: this.id,
        };
    }

    public abstract ready(): Promise<void>;

    /**
     * A shared object, after construction, can either be loaded in the case that it is already part of
     * a shared document. Or later attached if it is being newly added.
     */
    public async load(
        minimumSequenceNumber: number,
        messages: ISequencedDocumentMessage[],
        headerOrigin: string,
        services: IDistributedObjectServices): Promise<void> {

        this.services = services;

        await this.loadCore(
            minimumSequenceNumber,
            messages,
            headerOrigin,
            services.objectStorage);
        this.attachDeltaHandler();
    }

    /**
     * Initializes the object as a local, non-shared object. This object can become shared after
     * it is attached to the document.
     */
    public initializeLocal() {
        this.initializeLocalCore();
    }

    /**
     * Attaches the given shared object to its containing document
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        // Allow derived classes to perform custom processing prior to attaching this object
        this.attachCore();

        // Notify the document of the attachment
        this.services = this.runtime.attachChannel(this);
        this.attachDeltaHandler();

        return this;
    }

    /**
     * Returns whether the given shared object is local
     */
    public isLocal(): boolean {
        return !this.services;
    }

    public on(event: "pre-op" | "op", listener: (op: ISequencedDocumentMessage, local: boolean) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Gets a form of the object that can be serialized.
     */
    public abstract snapshot(): ITree;

    /**
     * Creates a new message from the provided message that is relative to the given sequenceNumber. It is valid
     * to modify the passed in object in place.
     */
    public abstract transform(
        message: any,
        referenceSequenceNumber: number,
        sequenceNumber: number): any;

    /**
     * Allows the distributed data type to perform custom loading
     */
    protected abstract loadCore(
        minimumSequenceNumber: number,
        messages: ISequencedDocumentMessage[],
        headerOrigin: string,
        services: IObjectStorageService): Promise<void>;

    /**
     * Allows the distributed data type to perform custom local loading
     */
    protected abstract initializeLocalCore();

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    protected abstract attachCore();

    /**
     * Prepares the given message for processing
     */
    protected abstract prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    /**
     * Derived classes must override this to do custom processing on a remote message
     */
    protected abstract processCore(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Method called when the minimum sequence number for the object has changed
     */
    protected abstract processMinSequenceNumberChanged(value: number);

    /**
     * Called when the object has disconnected from the delta stream
     */
    protected abstract onDisconnect();

    /**
     * Called when the object has fully connected to the delta stream
     */
    protected abstract onConnect(pending: IDocumentMessage[]);

    /**
     * Processes a message by the local client
     */
    protected submitLocalMessage(contents: any): void {
        assert(!this.isLocal());
        this.services.deltaConnection.submit(contents);
    }

    private attachDeltaHandler() {
        this.services.deltaConnection.attach({
            minSequenceNumberChanged: (value) => {
                this.processMinSequenceNumberChanged(value);
            },
            prepare: (message, local) => {
                return this.prepare(message, local);
            },
            process: (message, local, context) => {
                this.process(message, local, context);
            },
            setConnectionState: (state: ConnectionState) => {
                this.setConnectionState(state);
            },
        });

        // Trigger initial state
        this.setConnectionState(this.services.deltaConnection.state);
    }

    private prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.prepareCore(message, local);
    }

    private setConnectionState(state: ConnectionState) {
        // Should I change the state at the end? So that we *can't* send new stuff before we send old?
        this._state = state;

        switch (state) {
            case ConnectionState.Disconnected:
                // Things that are true now...
                // - if we had a connection we can no longer send messages over it
                // - if we had outbound messages some may or may not be ACK'd. Won't know until next message
                //
                // - nack could get a new msn - but might as well do it in the join?
                this.onDisconnect();
                break;

            case ConnectionState.Connecting:
                // Things that are now true...
                // - we will begin to receive inbound messages
                // - we know what our new client id is.
                // - still not safe to send messages

                // While connecting we are still ticking off the previous messages
                debug(`${this.id} is now connecting`);
                break;

            case ConnectionState.Connected:
                // And now we are fully connected
                // - we have a client ID
                // - we are caught up enough to attempt to send messages
                throw new Error("To be implemented");
                this.onConnect([]);
                break;

            default:
                assert.ok(false, `Unknown ConnectionState ${state}`);
        }
    }

    /**
     * Handles a message being received from the remote delta server
     */
    private process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.emit("pre-op", message, local);
        this.processCore(message, local, context);
        this.emit("op", message, local);
    }
}
