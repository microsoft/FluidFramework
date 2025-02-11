/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitterEventType } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseProperties, type ErasedType } from "@fluidframework/core-interfaces";
import {
	type IFluidHandleInternal,
	type IFluidLoadable,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelServices,
	IChannelStorageService,
	type IChannel,
	IChannelAttributes,
	type IChannelFactory,
	IFluidDataStoreRuntime,
	type IDeltaHandler,
} from "@fluidframework/datastore-definitions/internal";
import {
	type IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	blobCountPropertyName,
	totalBlobSizePropertyName,
	type IRuntimeMessageCollection,
	type IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";
import {
	toDeltaManagerInternal,
	TelemetryContext,
} from "@fluidframework/runtime-utils/internal";
import {
	ITelemetryLoggerExt,
	DataProcessingError,
	EventEmitterWithErrorHandling,
	MonitoringContext,
	SampledTelemetryHelper,
	createChildLogger,
	loggerToMonitoringContext,
	tagCodeArtifacts,
	type ICustomData,
	type IFluidErrorBase,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { SharedObjectHandle } from "./handle.js";
import { FluidSerializer, IFluidSerializer } from "./serializer.js";
import { SummarySerializer } from "./summarySerializer.js";
import { ISharedObject, ISharedObjectEvents } from "./types.js";
import { makeHandlesSerializable, parseHandles } from "./utils.js";

/**
 * Custom telemetry properties used in {@link SharedObjectCore} to instantiate {@link TelemetryEventBatcher} class.
 * This interface is used to define the properties that will be passed to the {@link TelemetryEventBatcher.measure} function
 * which is called in the {@link SharedObjectCore.process} method.
 */
interface ProcessTelemetryProperties {
	sequenceDifference: number;
}

/**
 * Base class from which all shared objects derive.
 * @legacy
 * @alpha
 */
export abstract class SharedObjectCore<
		TEvent extends ISharedObjectEvents = ISharedObjectEvents,
	>
	extends EventEmitterWithErrorHandling<TEvent>
	implements ISharedObject<TEvent>
{
	public get IFluidLoadable(): this {
		return this;
	}

	private readonly opProcessingHelper: SampledTelemetryHelper<
		void,
		ProcessTelemetryProperties
	>;
	private readonly callbacksHelper: SampledTelemetryHelper<boolean>;

	/**
	 * The handle referring to this SharedObject
	 */
	public readonly handle: IFluidHandleInternal;

	/**
	 * Telemetry logger for the shared object
	 */
	protected readonly logger: ITelemetryLoggerExt;
	private readonly mc: MonitoringContext;

	/**
	 * Connection state
	 */
	private _connected = false;

	/**
	 * Services used by the shared object
	 */
	private services: IChannelServices | undefined;

	/**
	 * True if the dds is bound to its parent.
	 */
	private _isBoundToContext: boolean = false;

	/**
	 * Tracks error that closed this object.
	 */
	private closeError?: ReturnType<typeof DataProcessingError.wrapIfUnrecognized>;

	/**
	 * Gets the connection state
	 * @returns The state of the connection
	 */
	public get connected(): boolean {
		return this._connected;
	}

	/**
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 */
	constructor(
		public id: string,
		protected runtime: IFluidDataStoreRuntime,
		public readonly attributes: IChannelAttributes,
	) {
		super((event: EventEmitterEventType, e: unknown) =>
			this.eventListenerErrorHandler(event, e),
		);

		assert(!id.includes("/"), 0x304 /* Id cannot contain slashes */);

		this.handle = new SharedObjectHandle(this, id, runtime.IFluidHandleContext);

		this.logger = createChildLogger({
			logger: runtime.logger,
			properties: {
				all: {
					sharedObjectId: uuid(),
					...tagCodeArtifacts({
						ddsType: this.attributes.type,
					}),
				},
			},
		});
		this.mc = loggerToMonitoringContext(this.logger);

		const { opProcessingHelper, callbacksHelper } = this.setUpSampledTelemetryHelpers();
		this.opProcessingHelper = opProcessingHelper;
		this.callbacksHelper = callbacksHelper;
	}

	/**
	 * Accessor for `this.runtime`'s {@link @fluidframework/datastore-definitions#IFluidDataStoreRuntime.deltaManager} as a {@link @fluidframework/container-definitions/internal#IDeltaManager}
	 */
	protected get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
		return toDeltaManagerInternal(this.runtime.deltaManager);
	}

	/**
	 * This function is only supposed to be called from SharedObjectCore's constructor and
	 * depends on a few things being set already. assert() calls make sure of it.
	 * @returns The telemetry sampling helpers, so the constructor can be the one to assign them
	 * to variables to avoid complaints from TypeScript.
	 */
	private setUpSampledTelemetryHelpers(): {
		opProcessingHelper: SampledTelemetryHelper<void, ProcessTelemetryProperties>;
		callbacksHelper: SampledTelemetryHelper<boolean>;
	} {
		assert(
			this.mc !== undefined && this.logger !== undefined,
			0x349 /* this.mc and/or this.logger has not been set */,
		);
		const opProcessingHelper = new SampledTelemetryHelper<void, ProcessTelemetryProperties>(
			{
				eventName: "ddsOpProcessing",
				category: "performance",
			},
			this.logger,
			this.mc.config.getNumber("Fluid.SharedObject.OpProcessingTelemetrySampling") ?? 1000,
			true,
			new Map<string, ITelemetryBaseProperties>([
				["local", { localOp: true }],
				["remote", { localOp: false }],
			]),
		);
		const callbacksHelper = new SampledTelemetryHelper<boolean>(
			{
				eventName: "ddsEventCallbacks",
				category: "performance",
			},
			this.logger,
			this.mc.config.getNumber("Fluid.SharedObject.DdsCallbacksTelemetrySampling") ?? 1000,
			true,
		);

		this.runtime.once("dispose", () => {
			this.callbacksHelper.dispose();
			this.opProcessingHelper.dispose();
		});

		return { opProcessingHelper, callbacksHelper };
	}

	/**
	 * Marks this objects as closed. Any attempt to change it (local changes or processing remote ops)
	 * would result in same error thrown. If called multiple times, only first error is remembered.
	 * @param error - error object that is thrown whenever an attempt is made to modify this object
	 */
	private closeWithError(error: IFluidErrorBase | undefined): void {
		if (this.closeError === undefined) {
			this.closeError = error;
		}
	}

	/**
	 * Verifies that this object is not closed via closeWithError(). If it is, throws an error used to close it.
	 */
	private verifyNotClosed(): void {
		if (this.closeError !== undefined) {
			throw this.closeError;
		}
	}

	/**
	 * Event listener handler helper that can be used to react to exceptions thrown from event listeners
	 * It wraps error with DataProcessingError, closes this object and throws resulting error.
	 * See closeWithError() for more details
	 * Ideally such situation never happens, as consumers of DDS should never throw exceptions
	 * in event listeners (i.e. catch any of the issues and make determination on how to handle it).
	 * When such exceptions propagate through, most likely data model is no longer consistent, i.e.
	 * DDS state does not match what user sees. Because of it DDS moves to "corrupted state" and does not
	 * allow processing of ops or local changes, which very quickly results in container closure.
	 */
	private eventListenerErrorHandler(event: EventEmitterEventType, e: unknown): void {
		const error = DataProcessingError.wrapIfUnrecognized(
			e,
			"SharedObjectEventListenerException",
		);
		error.addTelemetryProperties({ emittedEventName: String(event) });

		this.closeWithError(error);
		throw error;
	}

	private setBoundAndHandleAttach(): void {
		// Ensure didAttach is only called once, and we only register a single event
		// but we still call setConnectionState as our existing mocks don't
		// always propagate connection state
		this.setBoundAndHandleAttach = () => this.setConnectionState(this.runtime.connected);
		this._isBoundToContext = true;
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const runDidAttach: () => void = () => {
			// Allows objects to do any custom processing if it is attached.
			this.didAttach();
			this.setConnectionState(this.runtime.connected);
		};
		if (this.isAttached()) {
			runDidAttach();
		} else {
			this.runtime.once("attaching", runDidAttach);
		}
	}

	/**
	 * A shared object, after construction, can either be loaded in the case that it is already part of
	 * a shared document. Or later attached if it is being newly added.
	 * @param services - Services used by the shared object
	 */
	public async load(services: IChannelServices): Promise<void> {
		this.services = services;
		// set this before load so that isAttached is true
		// for attached runtimes when load core is running
		this._isBoundToContext = true;
		await this.loadCore(services.objectStorage);
		this.attachDeltaHandler();
		this.setBoundAndHandleAttach();
	}

	/**
	 * Initializes the object as a local, non-shared object. This object can become shared after
	 * it is attached to the document.
	 */
	public initializeLocal(): void {
		this.initializeLocalCore();
	}

	/**
	 * {@inheritDoc (ISharedObject:interface).bindToContext}
	 */
	public bindToContext(): void {
		// ensure the method only runs once by removing the implementation
		// without this the method suffers from re-entrancy issues
		this.bindToContext = () => {};
		if (!this._isBoundToContext) {
			this.runtime.bindChannel(this);
			// must set after bind channel so isAttached doesn't report true
			// before binding is complete
			this.setBoundAndHandleAttach();
		}
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).connect}
	 */
	public connect(services: IChannelServices): void {
		// handle the case where load is called
		// before connect; loading detached data stores
		if (this.services === undefined) {
			this.services = services;
			this.attachDeltaHandler();
		}

		this.setBoundAndHandleAttach();
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).isAttached}
	 */
	public isAttached(): boolean {
		return this._isBoundToContext && this.runtime.attachState !== AttachState.Detached;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 */
	public abstract getAttachSummary(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 */
	public abstract summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats>;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getGCData}
	 */
	public abstract getGCData(fullGC?: boolean): IGarbageCollectionData;

	/**
	 * Allows the distributed data type to perform custom loading
	 * @param services - Storage used by the shared object
	 */
	protected abstract loadCore(services: IChannelStorageService): Promise<void>;

	/**
	 * Allows the distributed data type to perform custom local loading.
	 */
	protected initializeLocalCore(): void {
		return;
	}

	/**
	 * Allows the distributive data type the ability to perform custom processing once an attach has happened.
	 * Also called after non-local data type get loaded.
	 */
	protected didAttach(): void {
		return;
	}

	/**
	 * Derived classes must override this to do custom processing on a remote message.
	 * @param message - The message to process
	 * @param local - True if the shared object is local
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 *
	 * @deprecated - Replaced by processMessagesCore.
	 */
	protected abstract processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void;

	/* eslint-disable jsdoc/check-indentation */
	/**
	 * Process a 'bunch' of messages for this shared object.
	 *
	 * @remarks
	 * A 'bunch' is a group of messages that have the following properties:
	 * - They are all part of the same grouped batch, which entails:
	 *   - They are contiguous in sequencing order.
	 *   - They are all from the same client.
	 *   - They are all based on the same reference sequence number.
	 *   - They are not interleaved with messages from other clients.
	 * - They are not interleaved with messages from other DDS in the container.
	 * Derived classes should override this if they need to do custom processing on a 'bunch' of remote messages.
	 * @param messageCollection - The collection of messages to process.
	 *
	 */
	/* eslint-enable jsdoc/check-indentation */
	protected processMessagesCore?(messagesCollection: IRuntimeMessageCollection): void;

	/**
	 * Called when the object has disconnected from the delta stream.
	 */

	protected abstract onDisconnect(): void;

	/**
	 * The serializer to serialize / parse handles.
	 */
	protected abstract get serializer(): IFluidSerializer;

	/**
	 * Submits a message by the local client to the runtime.
	 * @param content - Content of the message. Note: handles contained in the
	 * message object should not be encoded in any way
	 * @param localOpMetadata - The local metadata associated with the message. This is kept locally by the runtime
	 * and not sent to the server. This will be sent back when this message is received back from the server. This is
	 * also sent if we are asked to resubmit the message.
	 */
	protected submitLocalMessage(content: unknown, localOpMetadata: unknown = undefined): void {
		this.verifyNotClosed();
		if (this.isAttached()) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.services!.deltaConnection.submit(
				makeHandlesSerializable(content, this.serializer, this.handle),
				localOpMetadata,
			);
		}
	}

	/**
	 * Marks this object as dirty so that it is part of the next summary. It is called by a SharedSummaryBlock
	 * that want to be part of summary but does not generate ops.
	 */
	protected dirty(): void {
		if (!this.isAttached()) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.services!.deltaConnection.dirty();
	}

	/**
	 * Called when the object has fully connected to the delta stream
	 * Default implementation for DDS, override if different behavior is required.
	 */
	protected onConnect(): void {}

	/**
	 * Called when a message has to be resubmitted. This typically happens after a reconnection for unacked messages.
	 * The default implementation here is to resubmit the same message. The client can override if different behavior
	 * is required. It can choose to resubmit the same message, submit different / multiple messages or not submit
	 * anything at all.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.submitLocalMessage(content, localOpMetadata);
	}

	/**
	 * Promises that are waiting for an ack from the server before resolving should use this instead of new Promise.
	 * It ensures that if something changes that will interrupt that ack (e.g. the FluidDataStoreRuntime disposes),
	 * the Promise will reject.
	 * If runtime is disposed when this call is made, executor is not run and promise is rejected right away.
	 */
	protected async newAckBasedPromise<T>(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: unknown) => void,
		) => void,
	): Promise<T> {
		let rejectBecauseDispose: () => void;
		return new Promise<T>((resolve, reject) => {
			rejectBecauseDispose = () =>
				reject(
					new Error("FluidDataStoreRuntime disposed while this ack-based Promise was pending"),
				);

			if (this.runtime.disposed) {
				rejectBecauseDispose();
				return;
			}

			this.runtime.on("dispose", rejectBecauseDispose);
			executor(resolve, reject);
		}).finally(() => {
			// Note: rejectBecauseDispose will never be undefined here
			this.runtime.off("dispose", rejectBecauseDispose);
		});
	}

	private attachDeltaHandler(): void {
		// Services should already be there in case we are attaching delta handler.
		assert(
			this.services !== undefined,
			0x07a /* "Services should be there to attach delta handler" */,
		);
		// attachDeltaHandler is only called after services is assigned
		this.services.deltaConnection.attach({
			process: (
				message: ISequencedDocumentMessage,
				local: boolean,
				localOpMetadata: unknown,
			) => {
				this.process(
					{ ...message, contents: parseHandles(message.contents, this.serializer) },
					local,
					localOpMetadata,
				);
			},
			processMessages: (messagesCollection: IRuntimeMessageCollection) => {
				this.processMessages(messagesCollection);
			},
			setConnectionState: (connected: boolean) => {
				this.setConnectionState(connected);
			},
			reSubmit: (content: unknown, localOpMetadata: unknown) => {
				this.reSubmit(content, localOpMetadata);
			},
			applyStashedOp: (content: unknown): void => {
				this.applyStashedOp(parseHandles(content, this.serializer));
			},
			rollback: (content: unknown, localOpMetadata: unknown) => {
				this.rollback(content, localOpMetadata);
			},
		} satisfies IDeltaHandler);
	}

	/**
	 * Set the state of connection to services.
	 * @param connected - true if connected, false otherwise.
	 */
	private setConnectionState(connected: boolean): void {
		// only an attached shared object can transition its
		// connected state. This is defensive, as some
		// of our test harnesses don't handle this correctly
		if (!this.isAttached() || this._connected === connected) {
			// Not changing state, nothing the same.
			return;
		}

		// Should I change the state at the end? So that we *can't* send new stuff before we send old?
		this._connected = connected;

		if (connected) {
			// Call this for now so that DDSes like ConsensusOrderedCollection that maintain their own pending
			// messages will work.
			this.onConnect();
		} else {
			// Things that are true now...
			// - if we had a connection we can no longer send messages over it
			// - if we had outbound messages some may or may not be ACK'd. Won't know until next message
			//
			// - nack could get a new msn - but might as well do it in the join?
			this.onDisconnect();
		}
	}

	/**
	 * Handles a message being received from the remote delta server.
	 * @param message - The message to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 *
	 * @deprecated - Replaced by processMessages.
	 */
	private process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.verifyNotClosed(); // This will result in container closure.
		this.emitInternal("pre-op", message, local, this);

		this.opProcessingHelper.measure(
			(): ICustomData<ProcessTelemetryProperties> => {
				this.processCore(message, local, localOpMetadata);
				const telemetryProperties: ProcessTelemetryProperties = {
					sequenceDifference: message.sequenceNumber - message.referenceSequenceNumber,
				};
				return {
					customData: telemetryProperties,
				};
			},
			local ? "local" : "remote",
		);

		this.emitInternal("op", message, local, this);
	}

	/* eslint-disable jsdoc/check-indentation */
	/**
	 * Process a bunch of messages for this shared object. A bunch is group of messages that have the following properties:
	 * - They are all part of the same grouped batch, which entails:
	 *   - They are contiguous in sequencing order.
	 *   - They are all from the same client.
	 *   - They are all based on the same reference sequence number.
	 *   - They are not interleaved with messages from other clients.
	 * - They are not interleaved with messages from other DDS in the container.
	 * @param messageCollection - The collection of messages to process.
	 *
	 */
	/* eslint-enable jsdoc/check-indentation */
	private processMessages(messagesCollection: IRuntimeMessageCollection): void {
		this.verifyNotClosed(); // This will result in container closure.
		const { envelope, local, messagesContent: encodedMessagesContent } = messagesCollection;

		// Decode any handles in the contents and emit the "pre-op" event.
		const decodedMessagesContent: IRuntimeMessagesContent[] = [];
		for (const { contents, localOpMetadata, clientSequenceNumber } of encodedMessagesContent) {
			const decodedMessageContent: IRuntimeMessagesContent = {
				contents: parseHandles(contents, this.serializer),
				localOpMetadata,
				clientSequenceNumber,
			};
			decodedMessagesContent.push(decodedMessageContent);

			const decodedMessage: ISequencedDocumentMessage = {
				...envelope,
				contents: decodedMessageContent.contents,
				clientSequenceNumber,
			};
			this.emitInternal("pre-op", decodedMessage, local, this);

			// back-compat: Until processCore is removed and processMessagesCore becomes required, if processMessagesCore
			// is not implemented, call processCore for each message and emit the "op" event.
			if (this.processMessagesCore === undefined) {
				this.opProcessingHelper.measure(
					(): ICustomData<ProcessTelemetryProperties> => {
						this.processCore(decodedMessage, local, localOpMetadata);
						const telemetryProperties: ProcessTelemetryProperties = {
							sequenceDifference: envelope.sequenceNumber - envelope.referenceSequenceNumber,
						};
						return {
							customData: telemetryProperties,
						};
					},
					local ? "local" : "remote",
				);
				this.emitInternal("op", decodedMessage, local, this);
			}
		}

		// This case is taken care of in the previous for-loop.
		if (this.processMessagesCore === undefined) {
			return;
		}

		this.opProcessingHelper.measure(
			(): ICustomData<ProcessTelemetryProperties> => {
				assert(
					this.processMessagesCore !== undefined,
					"processMessagesCore should be defined",
				);
				this.processMessagesCore({
					envelope,
					local,
					messagesContent: decodedMessagesContent,
				});
				const telemetryProperties: ProcessTelemetryProperties = {
					sequenceDifference: envelope.sequenceNumber - envelope.referenceSequenceNumber,
				};
				return {
					customData: telemetryProperties,
				};
			},
			local ? "local" : "remote",
		);

		for (const { contents, clientSequenceNumber } of decodedMessagesContent) {
			const message: ISequencedDocumentMessage = {
				...envelope,
				contents,
				clientSequenceNumber,
			};
			this.emitInternal("op", message, local, this);
		}
	}

	/**
	 * Called when a message has to be resubmitted. This typically happens for unacked messages after a
	 * reconnection.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	private reSubmit(content: unknown, localOpMetadata: unknown): void {
		this.reSubmitCore(content, localOpMetadata);
	}

	/**
	 * Revert an op
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
		throw new Error("rollback not supported");
	}

	/**
	 * Apply changes from the provided op content just as if a local client has made the change,
	 * including submitting the op. Used when rehydrating an attached container
	 * with pending changes. The rehydration process replays all remote ops
	 * and applies stashed ops after the remote op with a sequence number
	 * that matches that of the stashed op is applied. This ensures
	 * stashed ops are applied at the same state they were originally created.
	 *
	 * It is possible that stashed ops have been sent in the past, and will be found when
	 * the shared object catches up with remotes ops.
	 * So this prepares the SharedObject for seeing potentially seeing the ACK.
	 * If no matching remote op is found, all the applied stashed ops will go
	 * through the normal resubmit flow upon reconnection, which allows the dds
	 * to rebase them to the latest state, and then resubmit them.
	 *
	 * @param content - Contents of a stashed op.
	 */
	protected abstract applyStashedOp(content: unknown): void;

	/**
	 * Emit an event. This function is only intended for use by DDS classes that extend SharedObject/SharedObjectCore,
	 * specifically to emit events that are part of the public interface of the DDS (i.e. those that can have listeners
	 * attached to them by the consumers of the DDS). It should not be called from outside the class or to emit events
	 * which are only internal to the DDS. Support for calling it from outside the DDS instance might be removed in the
	 * future.
	 * @param event - The event to emit.
	 * @param args - Arguments to pass to the event listeners.
	 * @returns `true` if the event had listeners, `false` otherwise.
	 */
	public emit(event: EventEmitterEventType, ...args: any[]): boolean {
		return this.callbacksHelper.measure(() => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return super.emit(event, ...args);
		});
	}

	/**
	 * Use to emit events inside {@link SharedObjectCore}, with no telemetry measurement
	 * done on the duration of the callbacks. Simply calls `super.emit()`.
	 * @param event - Event to emit
	 * @param args - Arguments for the event
	 * @returns Whatever `super.emit()` returns.
	 */
	private emitInternal(event: EventEmitterEventType, ...args: unknown[]): boolean {
		return super.emit(event, ...args);
	}
}

/**
 * SharedObject with simplified, synchronous summarization and GC.
 * DDS implementations with async and incremental summarization should extend SharedObjectCore directly instead.
 * @legacy
 * @alpha
 */
export abstract class SharedObject<
	TEvent extends ISharedObjectEvents = ISharedObjectEvents,
> extends SharedObjectCore<TEvent> {
	/**
	 * True while we are garbage collecting this object's data.
	 */
	private _isGCing: boolean = false;

	/**
	 * The serializer to use to serialize / parse handles, if any.
	 */
	private readonly _serializer: IFluidSerializer;

	protected get serializer(): IFluidSerializer {
		/**
		 * During garbage collection, the SummarySerializer keeps track of IFluidHandles that are serialized. These
		 * handles represent references to other Fluid objects.
		 *
		 * This is fine for now. However, if we implement delay loading in DDss, they may load and de-serialize content
		 * in summarize. When that happens, they may incorrectly hit this assert and we will have to change this.
		 */
		assert(
			!this._isGCing,
			0x075 /* "SummarySerializer should be used for serializing data during summary." */,
		);
		return this._serializer;
	}

	/**
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 */
	constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		private readonly telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes);

		this._serializer = new FluidSerializer(this.runtime.channelsRoutingContext);
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 */
	public getAttachSummary(
		fullTree: boolean = false,
		trackState: boolean = false,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const result = this.summarizeCore(this.serializer, telemetryContext);
		this.incrementTelemetryMetric(
			blobCountPropertyName,
			result.stats.blobNodeCount,
			telemetryContext,
		);
		this.incrementTelemetryMetric(
			totalBlobSizePropertyName,
			result.stats.totalBlobSize,
			telemetryContext,
		);
		return result;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 */
	public async summarize(
		fullTree: boolean = false,
		trackState: boolean = false,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): Promise<ISummaryTreeWithStats> {
		const result = this.summarizeCore(
			this.serializer,
			telemetryContext,
			incrementalSummaryContext,
		);
		this.incrementTelemetryMetric(
			blobCountPropertyName,
			result.stats.blobNodeCount,
			telemetryContext,
		);
		this.incrementTelemetryMetric(
			totalBlobSizePropertyName,
			result.stats.totalBlobSize,
			telemetryContext,
		);
		return result;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getGCData}
	 */
	public getGCData(fullGC: boolean = false): IGarbageCollectionData {
		// Set _isGCing to true. This flag is used to ensure that we only use SummarySerializer to serialize handles
		// in this object's data.
		assert(
			!this._isGCing,
			0x078 /* "Possible re-entrancy! Summary should not already be in progress." */,
		);
		this._isGCing = true;

		let gcData: IGarbageCollectionData;
		try {
			const serializer = new SummarySerializer(this.runtime.channelsRoutingContext);
			this.processGCDataCore(serializer);
			// The GC data for this shared object contains a single GC node. The outbound routes of this node are the
			// routes of handles serialized during summarization.
			gcData = { gcNodes: { "/": serializer.getSerializedRoutes() } };
			assert(
				this._isGCing,
				0x079 /* "Possible re-entrancy! Summary should have been in progress." */,
			);
		} finally {
			this._isGCing = false;
		}

		return gcData;
	}

	/**
	 * Calls the serializer over all data in this object that reference other GC nodes.
	 * Derived classes must override this to provide custom list of references to other GC nodes.
	 */
	protected processGCDataCore(serializer: IFluidSerializer): void {
		// We run the full summarize logic to get the list of outbound routes from this object. This is a little
		// expensive but its okay for now. It will be updated to not use full summarize and make it more efficient.
		// See: https://github.com/microsoft/FluidFramework/issues/4547
		this.summarizeCore(serializer);
	}

	/**
	 * Gets a form of the object that can be serialized.
	 * @returns A tree representing the snapshot of the shared object.
	 */
	protected abstract summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats;

	private incrementTelemetryMetric(
		propertyName: string,
		incrementBy: number,
		telemetryContext?: ITelemetryContext,
	): void {
		if (telemetryContext !== undefined) {
			// TelemetryContext needs to implment a get function
			assert(
				"get" in telemetryContext && typeof telemetryContext.get === "function",
				0x97e /* received context must have a get function */,
			);

			const prevTotal = ((telemetryContext as TelemetryContext).get(
				this.telemetryContextPrefix,
				propertyName,
			) ?? 0) as number;
			telemetryContext.set(this.telemetryContextPrefix, propertyName, prevTotal + incrementBy);
		}
	}
}

/**
 * Defines a kind of shared object.
 * Used in containers to register a shared object implementation, and to create new instances of a given type of shared object.
 *
 * @remarks
 * For use internally and in the "encapsulated API".
 * See {@link SharedObjectKind} for the type erased version for use in the public declarative API.
 *
 * @privateRemarks
 * This does not extend {@link SharedObjectKind} since doing so would prevent implementing this interface in type safe code.
 * Any implementation of this can safely be used as a {@link SharedObjectKind} with an explicit type conversion,
 * but doing so is typically not needed as {@link createSharedObjectKind} is used to produce values that are both types simultaneously.
 * @legacy
 * @alpha
 */
export interface ISharedObjectKind<TSharedObject> {
	/**
	 * Get a factory which can be used by the Fluid Framework to programmatically instantiate shared objects within containers.
	 * @remarks
	 * The produced factory is intended for use with the FluidDataStoreRegistry and is used by the Fluid Framework to instantiate already existing Channels.
	 * To create new shared objects use:
	 *
	 * - {@link @fluidframework/fluid-static#IFluidContainer.create} if using `@fluidframework/fluid-static`, for example via `@fluidframework/azure-client`.
	 *
	 * - {@link ISharedObjectKind.create} if using a custom container definitions (and thus not using {@link @fluidframework/fluid-static#IFluidContainer}).
	 */
	getFactory(): IChannelFactory<TSharedObject>;

	/**
	 * Create a shared object.
	 * @param runtime - The data store runtime that the new shared object belongs to.
	 * @param id - Optional name of the shared object.
	 * @returns Newly created shared object.
	 *
	 * @example
	 * To create a `SharedTree`, call the static create method:
	 *
	 * ```typescript
	 * const myTree = SharedTree.create(this.runtime, id);
	 * ```
	 * @remarks
	 * The created object is local (detached): insert a handle to it into an attached object to share (attach) it.
	 * If using `@fluidframework/fluid-static` (for example via `@fluidframework/azure-client`), use {@link @fluidframework/fluid-static#IFluidContainer.create} instead of calling this directly.
	 *
	 * @privateRemarks
	 * This can only be used with a `MockFluidDataStoreRuntime` when that mock is created with a `registry` containing a factory for this shared object.
	 */
	create(runtime: IFluidDataStoreRuntime, id?: string): TSharedObject;
}

/**
 * Defines a kind of shared object.
 * @remarks
 * Used in containers to register a shared object implementation, and to create new instances of a given type of shared object.
 * See {@link @fluidframework/fluid-static#IFluidContainer.create} and {@link @fluidframework/fluid-static#ContainerSchema} for details.
 * @privateRemarks
 * Part of the "declarative API".
 * Type erased reference to an {@link ISharedObjectKind} or a DataObject class in for use in
 * `fluid-static`'s `IFluidContainer` and `ContainerSchema`.
 * Use {@link createSharedObjectKind} to creating an instance of this type.
 * @sealed
 * @public
 */
export interface SharedObjectKind<out TSharedObject = unknown>
	extends ErasedType<readonly ["SharedObjectKind", TSharedObject]> {
	/**
	 * Check whether an {@link @fluidframework/core-interfaces#IFluidLoadable} is an instance of this shared object kind.
	 * @remarks This should be used in place of `instanceof` checks for shared objects, as their actual classes are not exported in Fluid's public API.
	 */
	is(value: IFluidLoadable): value is IFluidLoadable & TSharedObject;
}

/**
 * Utility for creating ISharedObjectKind instances.
 * @remarks
 * This takes in a class which implements IChannelFactory,
 * and uses it to return a a single value which is intended to be used as the APi entry point for the corresponding shared object type.
 * The returned value implements {@link ISharedObjectKind} for use in the encapsulated API, as well as the type erased {@link SharedObjectKind} used by the declarative API.
 * See {@link @fluidframework/fluid-static#ContainerSchema} for how this is used in the declarative API.
 * @internal
 */
export function createSharedObjectKind<TSharedObject>(
	factory: (new () => IChannelFactory<TSharedObject>) & { readonly Type: string },
): ISharedObjectKind<TSharedObject> & SharedObjectKind<TSharedObject> {
	const result: ISharedObjectKind<TSharedObject> &
		Omit<SharedObjectKind<TSharedObject>, "brand"> = {
		getFactory(): IChannelFactory<TSharedObject> {
			return new factory();
		},

		create(runtime: IFluidDataStoreRuntime, id?: string): TSharedObject {
			return runtime.createChannel(id, factory.Type) as TSharedObject;
		},

		is(value: IFluidLoadable): value is IFluidLoadable & TSharedObject {
			return isChannel(value) && value.attributes.type === factory.Type;
		},
	};

	return result as typeof result & SharedObjectKind<TSharedObject>;
}

function isChannel(loadable: IFluidLoadable): loadable is IChannel {
	// This assumes no other IFluidLoadable has an `attributes` field, and thus may not be fully robust.
	return (loadable as IChannel).attributes !== undefined;
}
