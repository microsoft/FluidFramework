/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentSystemMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { InboundAttachMessage } from "@fluidframework/runtime-definitions/internal";

import { agentSchedulerId } from "./containerRuntime.js";
import { ContainerMessageType, type LocalContainerRuntimeMessage } from "./messageTypes.js";

export const opSize = (op: ISequencedDocumentMessage): number => {
	// Some messages may already have string contents,
	// so stringifying them again will add inaccurate overhead.
	const content =
		typeof op.contents === "string" ? op.contents : (JSON.stringify(op.contents) ?? "");
	const data = opHasData(op) ? op.data : "";
	return content.length + data.length;
};

const opHasData = (op: ISequencedDocumentMessage): op is ISequencedDocumentSystemMessage =>
	(op as ISequencedDocumentSystemMessage).data !== undefined;

/**
 * Determines if this pending message represents a user change and thus should mark the container dirty.
 */
export function isContainerMessageDirtyable({
	type,
	contents,
}: LocalContainerRuntimeMessage): boolean {
	// Certain container runtime messages should not mark the container dirty such as the old built-in
	// AgentScheduler and Garbage collector messages.
	switch (type) {
		case ContainerMessageType.Attach: {
			const attachMessage = contents as InboundAttachMessage;
			if (attachMessage.id === agentSchedulerId) {
				return false;
			}
			break;
		}
		case ContainerMessageType.FluidDataStoreOp: {
			const envelope = contents;
			if (envelope.address === agentSchedulerId) {
				return false;
			}
			break;
		}
		case ContainerMessageType.IdAllocation:
		case ContainerMessageType.DocumentSchemaChange:
		case ContainerMessageType.GC: {
			return false;
		}
		default: {
			break;
		}
	}
	return true;
}
