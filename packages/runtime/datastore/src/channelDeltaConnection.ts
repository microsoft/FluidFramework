/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IDeltaConnection,
	IDeltaHandler,
} from "@fluidframework/datastore-definitions/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageContents,
	ISequencedRuntimeMessageCore,
} from "@fluidframework/runtime-definitions/internal";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";

const stashedOpMetadataMark = Symbol();

type StashedOpMetadata = { contents: any; metadata: unknown }[] &
	Record<typeof stashedOpMetadataMark, typeof stashedOpMetadataMark>;

function createStashedOpMetadata(): StashedOpMetadata {
	const arr = [];
	Object.defineProperty(arr, stashedOpMetadataMark, {
		value: stashedOpMetadataMark,
		writable: false,
		enumerable: true,
	});
	return arr as any as StashedOpMetadata;
}

function isStashedOpMetadata(md: unknown): md is StashedOpMetadata {
	return (
		Array.isArray(md) &&
		stashedOpMetadataMark in md &&
		md[stashedOpMetadataMark] === stashedOpMetadataMark
	);
}

function processWithStashedOpMetadataHandling(
	content: any,
	localOpMetaData: unknown,
	func: (contents: any, metadata: unknown) => void,
) {
	if (isStashedOpMetadata(localOpMetaData)) {
		localOpMetaData.forEach(({ contents, metadata }) => func(contents, metadata));
	} else {
		func(content, localOpMetaData);
	}
}

function getMessagesWithStashedOpHandling(messageContents: IRuntimeMessageContents[]) {
	const newMessageContents: IRuntimeMessageContents[] = [];
	for (const messageContent of messageContents) {
		if (isStashedOpMetadata(messageContent.localOpMetadata)) {
			messageContent.localOpMetadata.forEach(({ contents, metadata }) => {
				newMessageContents.push({
					contents,
					localOpMetadata: metadata,
					clientSequenceNumber: messageContent.clientSequenceNumber,
				});
			});
		} else {
			newMessageContents.push(messageContent);
		}
	}
	return newMessageContents;
}

export class ChannelDeltaConnection implements IDeltaConnection {
	private _handler: IDeltaHandler | undefined;
	private stashedOpMd: StashedOpMetadata | undefined;

	private get handler(): IDeltaHandler {
		assert(!!this._handler, 0x177 /* "Missing delta handler" */);
		return this._handler;
	}
	public get connected(): boolean {
		return this._connected;
	}

	constructor(
		private _connected: boolean,
		private readonly submitFn: (content: any, localOpMetadata: unknown) => void,
		public readonly dirty: () => void,
		private readonly isAttachedAndVisible: () => boolean,
	) {}

	public attach(handler: IDeltaHandler) {
		assert(this._handler === undefined, 0x178 /* "Missing delta handler on attach" */);
		this._handler = handler;
	}

	public setConnectionState(connected: boolean) {
		this._connected = connected;
		this.handler.setConnectionState(connected);
	}

	public processMessages(
		message: ISequencedRuntimeMessageCore,
		messageContents: IRuntimeMessageContents[],
		local: boolean,
	): void {
		const newMessageContents = getMessagesWithStashedOpHandling(messageContents);
		if (this.handler.processMessages !== undefined) {
			try {
				// catches as data processing error whether or not they come from async pending queues
				this.handler.processMessages(message, newMessageContents, local);
			} catch (error) {
				throw DataProcessingError.wrapIfUnrecognized(
					error,
					"channelDeltaConnectionFailedToProcessMessages",
				);
			}
			return;
		}

		for (const { contents, localOpMetadata, clientSequenceNumber } of newMessageContents) {
			const compatMessage: ISequencedDocumentMessage = {
				...message,
				contents,
				clientSequenceNumber,
			};
			try {
				// catches as data processing error whether or not they come from async pending queues
				this.handler.process(compatMessage, local, localOpMetadata);
			} catch (error) {
				throw DataProcessingError.wrapIfUnrecognized(
					error,
					"channelDeltaConnectionFailedToProcessMessage",
					compatMessage,
				);
			}
		}
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		processWithStashedOpMetadataHandling(
			content,
			localOpMetadata,
			this.handler.reSubmit.bind(this.handler),
		);
	}

	public rollback(content: any, localOpMetadata: unknown) {
		if (this.handler.rollback === undefined) {
			throw new Error("Handler doesn't support rollback");
		}
		processWithStashedOpMetadataHandling(
			content,
			localOpMetadata,
			this.handler.rollback.bind(this.handler),
		);
	}

	public applyStashedOp(content: any): unknown {
		try {
			this.stashedOpMd = this.isAttachedAndVisible() ? createStashedOpMetadata() : undefined;
			this.handler.applyStashedOp(content);
			return this.stashedOpMd;
		} finally {
			this.stashedOpMd = undefined;
		}
	}

	public submit(contents: any, metadata: unknown): void {
		if (this.stashedOpMd !== undefined) {
			this.stashedOpMd.push({ contents, metadata });
		} else {
			this.submitFn(contents, metadata);
		}
	}
}
