/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

interface ISequencedOpInfo<TOp> {
	client: string;
	seq: number;
	op: TOp;
}

/**
 * @internal
 */
export abstract class SharedOT<TState, TOp> extends SharedObject {
	/**
	 * Queue of sequenced ops that are above minSeq.  Used by 'processCore' to
	 * adjust incoming ops to account for prior ops that the sender didn't know about
	 * at the time they submitted their op.
	 */
	private readonly sequencedOps: ISequencedOpInfo<TOp>[] = [];

	/**
	 * Queue of local pending ops that have not yet been ACKed by the service.  Used
	 * to lazily rebuild the "local" state cache when it is invalidated by interleaved
	 * remote ops.
	 */
	private readonly pendingOps: TOp[] = [];

	/** The "global" state is the result of applying all sequenced ops. */
	private global: TState;

	/**
	 * Lazily cached result of optimistically applying pendingOps on top of the current
	 * "global" state.
	 */
	private local: TState;
	private localDirty = false;

	constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		initialValue: TState,
	) {
		super(id, runtime, attributes, "fluid_ot_");

		this.global = this.local = initialValue;
	}

	protected apply(op: TOp) {
		this.local = this.applyCore(this.state, op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			this.global = this.local;
			return;
		}

		this.pendingOps.push(op);
		this.submitLocalMessage(op);
	}

	/**
	 * Apply the given 'op' to the provided 'state', producing a new instance of state.
	 */
	protected abstract applyCore(state: TState, op: TOp): TState;

	/**
	 * Transform the 'input' op to adjust for the earlier 'transform' op.
	 */
	protected abstract transform(input: TOp, transform: TOp): TOp;

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		assert(
			this.pendingOps.length === 0,
			0x5f6 /* Summarizer must not have locally pending changes. */,
		);

		return createSingleBlobSummary("header", serializer.stringify(this.global, this.handle));
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const blob = await storage.readBlob("header");
		const rawContent = bufferToString(blob, "utf8");
		this.global = this.local = this.serializer.parse(rawContent) as TState;
	}

	protected onDisconnect() {}

	protected processCore(message: ISequencedDocumentMessage, local: boolean) {
		// Discard any sequenced ops that are now below the minimum sequence number.
		const minSeq = this.deltaManager.minimumSequenceNumber;
		while (this.sequencedOps[0]?.seq < minSeq) {
			this.sequencedOps.shift();
		}

		let remoteOp = message.contents;
		const messageSeq = message.sequenceNumber;
		const remoteRefSeq = message.referenceSequenceNumber;
		const remoteClient = message.clientId;

		// Adjust the incoming sequenced op to account for prior sequenced ops that the
		// sender hadn't yet seen at the time they sent the op.
		for (const { op, seq, client } of this.sequencedOps) {
			if (remoteRefSeq < seq && remoteClient !== client) {
				remoteOp = this.transform(remoteOp as TOp, op);
			}
		}

		// Retain the adjusted op in order to adjust future remote ops.
		// TODO: Verify whether this should be able to handle server-generated ops (with null clientId)
		this.sequencedOps.push({
			seq: messageSeq,

			client: remoteClient as string,
			op: remoteOp as TOp,
		});

		// The incoming sequenced op is now part of the "global" state.  Apply it to "this.global"
		// now.
		//
		// TODO: If the op is local, we could defer applying the remoteOp and wait and see if
		//       the global state catches up with our local state.
		this.global = this.applyCore(this.global, remoteOp as TOp);

		if (local) {
			this.pendingOps.shift();
		} else {
			// Our optimistic local cache (if any) did not account for the incoming op.
			this.localDirty = true;

			// Adjust our queue of locally pending ops to account for the incoming op so that they
			// may be reapplied to the global state if needed.
			for (let i = 0; i < this.pendingOps.length; i++) {
				this.pendingOps[i] = this.transform(this.pendingOps[i], remoteOp as TOp);
			}
		}
	}

	protected get state() {
		// If the locally cached state is dirty, reset it to the global state and reapply our
		// pending ops to bring it up to date.
		if (this.localDirty) {
			this.local = this.global;

			for (const op of this.pendingOps) {
				this.local = this.applyCore(this.local, op);
			}

			this.localDirty = false;
		}

		return this.local;
	}

	protected applyStashedOp(): void {
		throw new Error("not implemented");
	}
}
