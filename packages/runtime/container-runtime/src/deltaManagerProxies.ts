/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IConnectionDetails,
	IDeltaManagerEvents,
	IDeltaManagerFull,
	IDeltaQueue,
	IDeltaSender,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions/internal";
import type { IErrorBase } from "@fluidframework/core-interfaces";
import { IClientDetails } from "@fluidframework/driver-definitions";
import type { IAnyDriverError } from "@fluidframework/driver-definitions/internal";
import {
	IClientConfiguration,
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions/internal";

import type { PendingStateManager } from "./pendingStateManager.js";
import { summarizerClientType } from "./summary/index.js";

/**
 * Base class for DeltaManager proxy that proxy's access to the real DeltaManager.
 *
 * This class allows us to build proxy functionality without actually having to implement all the methods
 * of the DeltaManager.
 */
export abstract class BaseDeltaManagerProxy
	extends TypedEventEmitter<IDeltaManagerEvents>
	implements IDeltaManagerFull
{
	public get IDeltaSender(): IDeltaSender {
		return this;
	}

	public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
		return this.deltaManager.inbound;
	}

	public get outbound(): IDeltaQueue<IDocumentMessage[]> {
		return this.deltaManager.outbound;
	}

	public get inboundSignal(): IDeltaQueue<ISignalMessage> {
		return this.deltaManager.inboundSignal;
	}

	public get minimumSequenceNumber(): number {
		return this.deltaManager.minimumSequenceNumber;
	}

	public get lastSequenceNumber(): number {
		return this.deltaManager.lastSequenceNumber;
	}

	public get lastMessage(): ISequencedDocumentMessage | undefined {
		return this.deltaManager.lastMessage;
	}

	public get lastKnownSeqNumber(): number {
		return this.deltaManager.lastKnownSeqNumber;
	}

	public get initialSequenceNumber(): number {
		return this.deltaManager.initialSequenceNumber;
	}

	public get hasCheckpointSequenceNumber(): boolean {
		return this.deltaManager.hasCheckpointSequenceNumber;
	}

	public get clientDetails(): IClientDetails {
		return this.deltaManager.clientDetails;
	}

	public get version(): string {
		return this.deltaManager.version;
	}

	public get maxMessageSize(): number {
		return this.deltaManager.maxMessageSize;
	}

	public get serviceConfiguration(): IClientConfiguration | undefined {
		return this.deltaManager.serviceConfiguration;
	}

	public get active(): boolean {
		return this.deltaManager.active;
	}

	public get readOnlyInfo(): ReadOnlyInfo {
		return this.deltaManager.readOnlyInfo;
	}

	constructor(protected readonly deltaManager: IDeltaManagerFull) {
		super();

		// We are expecting this class to have many listeners, so we suppress noisy "MaxListenersExceededWarning" logging.
		super.setMaxListeners(0);

		this.deltaManager.on("prepareSend", this.onPrepareSend);
		this.deltaManager.on("submitOp", this.onSubmitOp);
		this.deltaManager.on("op", this.onOp);
		this.deltaManager.on("pong", this.onPong);
		this.deltaManager.on("connect", this.onConnect);
		this.deltaManager.on("disconnect", this.onDisconnect);
		this.deltaManager.on("readonly", this.onReadonly);
	}

	public dispose(): void {
		this.deltaManager.off("prepareSend", this.onPrepareSend);
		this.deltaManager.off("submitOp", this.onSubmitOp);
		this.deltaManager.off("op", this.onOp);
		this.deltaManager.off("pong", this.onPong);
		this.deltaManager.off("connect", this.onConnect);
		this.deltaManager.off("disconnect", this.onDisconnect);
		this.deltaManager.off("readonly", this.onReadonly);
	}

	public submitSignal(content: string, targetClientId?: string): void {
		return this.deltaManager.submitSignal(content, targetClientId);
	}

	public flush(): void {
		return this.deltaManager.flush();
	}

	private readonly onPrepareSend = (messageBuffer: unknown[]): void => {
		this.emit("prepareSend", messageBuffer);
	};
	private readonly onSubmitOp = (message: IDocumentMessage): void => {
		this.emit("submitOp", message);
	};
	protected readonly onOp = (
		message: ISequencedDocumentMessage,
		processingTime: number,
	): void => {
		this.emit("op", message, processingTime);
	};
	private readonly onPong = (latency: number): void => {
		this.emit("pong", latency);
	};
	private readonly onConnect = (details: IConnectionDetails, opsBehind?: number): void => {
		this.emit("connect", details, opsBehind);
	};
	private readonly onDisconnect = (reason: string, error?: IAnyDriverError): void => {
		this.emit("disconnect", reason, error);
	};
	private readonly onReadonly = (
		readonly: boolean,
		readonlyConnectionReason?: { reason: string; error?: IErrorBase },
	): void => {
		this.emit("readonly", readonly, readonlyConnectionReason);
	};
}

/**
 * Proxy to the real IDeltaManager for restricting certain access to layers below container runtime in summarizer clients:
 *- Summarizer client should be read-only to layers below the container runtime to restrict local changes.
 *- Summarizer client should not be active to layers below the container runtime to restrict local changes.
 */
// eslint-disable-next-line import/no-deprecated
export class DeltaManagerSummarizerProxy extends BaseDeltaManagerProxy {
	public get active(): boolean {
		// Summarize clients should not be active. There shouldn't be any local changes (writes) in the summarizer
		// except for the SummarizeOp which is generated by the runtime.
		// eslint-disable-next-line import/no-deprecated
		return !this.isSummarizerClient && this.deltaManager.active;
	}

	public get readOnlyInfo(): ReadOnlyInfo {
		// eslint-disable-next-line import/no-deprecated
		// Summarizer clients should be read-only as far as the runtime and layers below are concerned. There shouldn't
		// be any local changes (writes) in the summarizer except for the summarize op which is generated by the runtime.
		// eslint-disable-next-line import/no-deprecated
		if (this.isSummarizerClient) {
			return {
				readonly: true,
				forced: false,
				permissions: undefined,
				storageOnly: false,
			};
		}
		return this.deltaManager.readOnlyInfo;
	}

	// eslint-disable-next-line import/no-deprecated
	private readonly isSummarizerClient: boolean;

	constructor(protected readonly deltaManager: IDeltaManagerFull) {
		super(deltaManager);
		// eslint-disable-next-line import/no-deprecated
		this.isSummarizerClient = this.deltaManager.clientDetails.type === summarizerClientType;
	}
}

export class DeltaManagerPendingOpsProxy extends BaseDeltaManagerProxy {
	public get minimumSequenceNumber(): number {
		const minPendingSeqNum = this.pendingStateManager.minimumPendingMessageSequenceNumber;
		/**
		 * The reason why the minimum pending sequence number can be less than the delta manager's minimum sequence
		 * number (DM's msn) is that when we are processing messages in the container runtime/delta manager, the delta
		 * manager's msn can be updated to continually increase. In the meantime, the pending state manager's op which
		 * hasn't been sent can still have a lower sequence number than the DM's msn (think about a disconnected
		 * scenario). To successfully resubmit that pending op it has to be rebased first by the DDS. The DDS still
		 * needs to keep the local data for that op that has a reference sequence number lower than the DM's msn. To
		 * achieve this, the msn passed to the DDS needs to be the minimum of the DM's msn and the minimum pending
		 * sequence number, so that it can keep the relevant local data to generate the right data for the new op
		 * during resubmission.
		 */
		if (
			minPendingSeqNum !== undefined &&
			minPendingSeqNum < this.deltaManager.minimumSequenceNumber
		) {
			return minPendingSeqNum;
		}
		return this.deltaManager.minimumSequenceNumber;
	}

	public get lastMessage(): ISequencedDocumentMessage | undefined {
		if (this.deltaManager.lastMessage === undefined) {
			return this.deltaManager.lastMessage;
		}
		return {
			...this.deltaManager.lastMessage,
			minimumSequenceNumber: this.minimumSequenceNumber,
		};
	}

	protected readonly onOp = (
		message: ISequencedDocumentMessage,
		processingTime: number,
	): void => {
		const messageIntercept = {
			...message,
			minimumSequenceNumber: this.minimumSequenceNumber,
		};
		this.emit("op", messageIntercept, processingTime);
	};

	constructor(
		protected readonly deltaManager: IDeltaManagerFull,
		private readonly pendingStateManager: Pick<
			PendingStateManager,
			"minimumPendingMessageSequenceNumber"
		>,
	) {
		super(deltaManager);
	}
}
