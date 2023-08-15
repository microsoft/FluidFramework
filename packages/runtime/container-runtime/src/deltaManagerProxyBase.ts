/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventForwarder } from "@fluidframework/common-utils";
import {
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaQueue,
	IDeltaSender,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
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
 *
 * @deprecated
 *
 * This class is only used internally in FluidFramework code and will no longer be exported in a future release.
 * No replacement API is intended for external consumers.
 */
export class DeltaManagerProxyBase
	extends EventForwarder<IDeltaManagerEvents>
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
		super(deltaManager);
	}

	public dispose(): void {
		super.dispose();
	}

	public submitSignal(content: any): void {
		return this.deltaManager.submitSignal(content);
	}

	public flush(): void {
		return this.deltaManager.flush();
	}
}
