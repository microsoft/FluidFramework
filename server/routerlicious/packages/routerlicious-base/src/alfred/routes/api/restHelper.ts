/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Eventually this will become a library to craft various rest ops.
import * as git from "@fluidframework/gitresources";
import {
	IClientJoin,
	IDocumentMessage,
	IDocumentSystemMessage,
	MessageType,
} from "@fluidframework/protocol-definitions";
import * as core from "@fluidframework/server-services-core";

export interface IMapSetOperation {
	op: string;
	path: string;
	value: string;
}

export interface IBlobData {
	content: string;

	metadata: git.ICreateBlobParams;
}

export function craftClientJoinMessage(
	tenantId: string,
	documentId: string,
	contents: IClientJoin,
): core.IRawOperationMessage {
	const operation: IDocumentSystemMessage = {
		clientSequenceNumber: -1,
		contents: null,
		data: JSON.stringify(contents),
		referenceSequenceNumber: -1,
		traces: [],
		type: MessageType.ClientJoin,
	};

	const message: core.IRawOperationMessage = {
		clientId: null,
		documentId,
		operation,
		tenantId,
		timestamp: Date.now(),
		type: core.RawOperationType,
	};

	return message;
}

export function craftClientLeaveMessage(
	tenantId: string,
	documentId: string,
	contents: string,
): core.IRawOperationMessage {
	const operation: IDocumentSystemMessage = {
		clientSequenceNumber: -1,
		contents: null,
		data: JSON.stringify(contents),
		referenceSequenceNumber: -1,
		traces: [],
		type: MessageType.ClientLeave,
	};

	const message: core.IRawOperationMessage = {
		clientId: null,
		documentId,
		operation,
		tenantId,
		timestamp: Date.now(),
		type: core.RawOperationType,
	};

	return message;
}

export function craftOpMessage(
	tenantId: string,
	documentId: string,
	clientId: string,
	contents: string,
	clientSequenceNumber: number,
): core.IRawOperationMessage {
	const operation: IDocumentMessage = {
		clientSequenceNumber,
		contents,
		referenceSequenceNumber: -1,
		traces: [],
		type: MessageType.Operation,
	};

	const message: core.IRawOperationMessage = {
		clientId,
		documentId,
		operation,
		tenantId,
		timestamp: Date.now(),
		type: core.RawOperationType,
	};

	return message;
}

// We only support top level keys in root map for now.
export function craftMapSet(op: IMapSetOperation) {
	const opContent = {
		address: "root",
		contents: {
			key: op.path,
			type: "set",
			value: {
				type: "Plain",
				value: op.value,
			},
		},
	};

	const opMessage = {
		address: "root",
		contents: {
			clientSequenceNumber: 1,
			content: opContent,
			referenceSequenceNumber: 1,
			type: "op",
		},
	};

	return opMessage;
}

export function getDocumentUrlsfromNetworkInfo(
	tenantId: string,
	externalOrdererUrl: string,
	externalHistorianUrl: string,
	externalDeltaStreamUrl: string,
	isPrivateLink?: boolean | false,
): {
	documentOrdererUrl: string;
	documentHistorianUrl: string;
	documentDeltaStreamUrl: string;
} {
	if (isPrivateLink) {
		return {
			documentOrdererUrl: externalOrdererUrl.replace("https://", `https://${tenantId}.`),
			documentHistorianUrl: externalHistorianUrl.replace("https://", `https://${tenantId}.`),
			documentDeltaStreamUrl: externalDeltaStreamUrl.replace(
				"https://",
				`https://${tenantId}.`,
			),
		};
	}
	return {
		documentOrdererUrl: externalOrdererUrl,
		documentHistorianUrl: externalHistorianUrl,
		documentDeltaStreamUrl: externalDeltaStreamUrl,
	};
}
