/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDeltaManager,
	IDeltaQueue,
	IDeltaQueueEvents,
} from "@fluidframework/container-definitions";
import { EventForwarder } from "@fluidframework/common-utils";
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/protocol-definitions";
import { DeltaManagerProxyBase } from "@fluidframework/container-utils";

/**
 * Proxy to the real IDeltaQueue - used to restrict access
 */
export class DeltaQueueProxy<T>
	extends EventForwarder<IDeltaQueueEvents<T>>
	implements IDeltaQueue<T>
{
	public get paused(): boolean {
		return this.queue.paused;
	}

	public get length(): number {
		return this.queue.length;
	}

	public get idle(): boolean {
		return this.queue.idle;
	}

	constructor(private readonly queue: IDeltaQueue<T>) {
		super(queue);
	}

	public peek(): T | undefined {
		return this.queue.peek();
	}

	public toArray(): T[] {
		return this.queue.toArray();
	}

	// back-compat: usage removed in 0.33, remove in future versions
	public async systemPause(): Promise<void> {
		return this.pause();
	}

	public async pause(): Promise<void> {
		return this.queue.pause();
	}

	// back-compat: usage removed in 0.33, remove in future versions
	public async systemResume(): Promise<void> {
		return this.resume();
	}

	public async resume(): Promise<void> {
		this.queue.resume();
	}

	public async waitTillProcessingDone() {
		return this.queue.waitTillProcessingDone();
	}
}

/**
 * Proxy to the real IDeltaManager - used to restrict access
 */
export class DeltaManagerProxy
	extends DeltaManagerProxyBase
	implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>
{
	public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
		return this._inbound;
	}
	private readonly _inbound: IDeltaQueue<ISequencedDocumentMessage>;

	public get outbound(): IDeltaQueue<IDocumentMessage[]> {
		return this._outbound;
	}
	private readonly _outbound: IDeltaQueue<IDocumentMessage[]>;

	public get inboundSignal(): IDeltaQueue<ISignalMessage> {
		return this._inboundSignal;
	}
	private readonly _inboundSignal: IDeltaQueue<ISignalMessage>;

	constructor(deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>) {
		super(deltaManager);

		this._inbound = new DeltaQueueProxy(deltaManager.inbound);
		this._outbound = new DeltaQueueProxy(deltaManager.outbound);
		this._inboundSignal = new DeltaQueueProxy(deltaManager.inboundSignal);
	}

	public dispose(): void {
		this._inbound.dispose();
		this._outbound.dispose();
		this._inboundSignal.dispose();
		super.dispose();
	}
}
