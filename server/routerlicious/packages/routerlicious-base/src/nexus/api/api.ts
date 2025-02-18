/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { handleResponse, validateRequestParams } from "@fluidframework/server-services-shared";
import {
	throttle,
	IThrottleMiddlewareOptions,
	verifyStorageToken,
} from "@fluidframework/server-services-utils";
import * as core from "@fluidframework/server-services-core";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IBroadcastSignalEventPayload,
	ICollaborationSessionEvents,
	IRoom,
	IRuntimeSignalEnvelope,
} from "@fluidframework/server-lambdas";
import { Router, type Request, type Response } from "express";
import winston from "winston";
import { Provider } from "nconf";
import { Constants } from "../../utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { NetworkError } from "@fluidframework/server-services-client";

export function create(
	config: Provider,
	tenantManager: core.ITenantManager,
	tenantThrottlers: Map<string, core.IThrottler>,
	storage: core.IDocumentStorage,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: Constants.nexusRestThrottleIdSuffix,
	};
	const generalTenantThrottler = tenantThrottlers?.get(Constants.generalRestCallThrottleIdPrefix);

	router.post(
		"/:tenantId/:id/broadcast-signal",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		verifyStorageToken(tenantManager, config),
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const handleBroadcastSignalP = handleBroadcastSignal(
				request,
				response,
				config,
				storage,
				collaborationSessionEventEmitter,
			);
			handleResponse(
				handleBroadcastSignalP,
				response,
				undefined,
				500,
				200,
				undefined,
				(error: any) =>
					Lumberjack.error(
						"Error handling broadcast-signal",
						{
							tenantId: request.params.tenantId,
							documentId: request.params.documentId,
						},
						error,
					),
			);
		},
	);

	return router;
}

async function handleBroadcastSignal(
	request: Request,
	response: Response,
	config: Provider,
	storage: core.IDocumentStorage,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
): Promise<void> {
	const tenantId = request.params.tenantId;
	const documentId = request.params.id;
	const signalContent = request?.body?.signalContent;
	if (!isValidSignalEnvelope(signalContent)) {
		Lumberjack.error(
			"signalContent should contain 'contents.content' and 'contents.type' key",
			{ tenantId, documentId },
		);
		throw new NetworkError(
			400,
			`signalContent should contain 'contents.content' and 'contents.type' keys`,
		);
	}
	if (!collaborationSessionEventEmitter) {
		Lumberjack.error("No emitter configured for the broadcast-signal endpoint", {
			tenantId,
			documentId,
		});
		throw new NetworkError(500, `No emitter configured for the broadcast-signal endpoint`);
	}

	const deltaStreamUrl: string = config.get("worker:deltaStreamUrl");
	const document = await storage?.getDocument(tenantId, documentId);
	if (!document || !document.session.isSessionActive) {
		Lumberjack.error("Document not found", { tenantId, documentId });
		throw new NetworkError(404, "Document not found");
	}
	if (!document.session.isSessionAlive) {
		Lumberjack.warning("Document session not alive", { tenantId, documentId });
		throw new NetworkError(410, "Document session not alive");
	}
	if (document.session.deltaStreamUrl !== deltaStreamUrl) {
		Lumberjack.info("Redirecting broadcast-signal to correct cluster", {
			documentUrl: document.session.deltaStreamUrl,
			currentUrl: deltaStreamUrl,
			targetUrlAndPath: `${document.session.deltaStreamUrl}${request.originalUrl}`,
		});
		response.redirect(`${document.session.deltaStreamUrl}${request.originalUrl}`);
		return;
	}

	const signalRoom: IRoom = { tenantId, documentId };
	const payload: IBroadcastSignalEventPayload = { signalRoom, signalContent };
	collaborationSessionEventEmitter.emit("broadcastSignal", payload);
}

function isValidSignalEnvelope(
	input: Partial<IRuntimeSignalEnvelope>,
): input is IRuntimeSignalEnvelope {
	return typeof input?.contents?.type === "string" && input?.contents?.content !== undefined;
}
