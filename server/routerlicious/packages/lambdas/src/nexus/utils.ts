/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectionMode } from "@fluidframework/protocol-definitions";
import { NetworkError, canSummarize, canWrite } from "@fluidframework/server-services-client";
import type { ILogger } from "@fluidframework/server-services-core";
import {
	Lumberjack,
	getGlobalTelemetryContext,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import type { IRoom } from "./interfaces";

export const getMessageMetadata = (
	documentId: string,
	tenantId: string,
	correlationId?: string,
) => ({
	documentId,
	tenantId,
	correlationId,
});

export function handleServerErrorAndConvertToNetworkError(
	logger: ILogger,
	errorMessage: string,
	documentId: string,
	tenantId: string,
	error: any,
): NetworkError {
	const errMsgWithPrefix = `Connect Server Error - ${errorMessage}`;
	const correlationId = getGlobalTelemetryContext().getProperties().correlationId;
	logger.error(errMsgWithPrefix, {
		messageMetaData: getMessageMetadata(documentId, tenantId, correlationId),
	});
	Lumberjack.error(errMsgWithPrefix, getLumberBaseProperties(documentId, tenantId), error);
	return new NetworkError(
		500,
		`Failed to connect client to document. Check correlation Id ${correlationId} for details.`,
	);
}

export class ExpirationTimer {
	private timer: NodeJS.Timer | undefined;
	constructor(private readonly onTimeout: () => void) {}
	public clear() {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}
	public set(mSecUntilExpiration: number) {
		this.clear();
		this.timer = setTimeout(() => {
			this.onTimeout();
			this.clear();
		}, mSecUntilExpiration);
	}
}

export const hasWriteAccess = (scopes: string[]) => canWrite(scopes) || canSummarize(scopes);
export const isWriter = (scopes: string[], mode: ConnectionMode) =>
	hasWriteAccess(scopes) && mode === "write";

export const getRoomId = (room: IRoom) => `${room.tenantId}/${room.documentId}`;
