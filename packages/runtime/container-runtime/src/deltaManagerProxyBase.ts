/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IConnectionDetails,
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaQueue,
	IDeltaSender,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import type { IErrorBase } from "@fluidframework/core-interfaces";
import type { IAnyDriverError } from "@fluidframework/driver-definitions";
import {
	IClientConfiguration,
	IClientDetails,
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/protocol-definitions";

/**
 * Base class for creating proxy to the real delta manager. It implements all required methods on IDeltaManager and
 * proxy implementations can override specific methods.
 */
export class DeltaManagerProxyBase
	extends TypedEventEmitter<IDeltaManagerEvents>
	implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>
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

	public get lastMessage() {
		return this.deltaManager.lastMessage;
	}

	public get lastKnownSeqNumber() {
		return this.deltaManager.lastKnownSeqNumber;
	}

	public get initialSequenceNumber(): number {
		return this.deltaManager.initialSequenceNumber;
	}

	public get hasCheckpointSequenceNumber() {
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

	constructor(
		protected readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
	) {
		super();
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

	public submitSignal(content: any, targetClientId?: string): void {
		return this.deltaManager.submitSignal(content, targetClientId);
	}

	public flush(): void {
		return this.deltaManager.flush();
	}

	private readonly onPrepareSend = (messageBuffer: any[]): void => {
		this.emit("prepareSend", messageBuffer);
	};
	private readonly onSubmitOp = (message: IDocumentMessage): void => {
		this.emit("submitOp", message);
	};
	private readonly onOp = (message: ISequencedDocumentMessage, processingTime: number): void => {
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
