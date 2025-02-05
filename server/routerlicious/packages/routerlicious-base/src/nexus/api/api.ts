/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { validateRequestParams } from "@fluidframework/server-services-shared";
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
import { Router } from "express";
import winston from "winston";
import { Provider } from "nconf";
import { Constants } from "../../utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export function create(
	config: Provider,
	tenantManager: core.ITenantManager,
	tenantThrottlers?: Map<string, core.IThrottler>,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	storage?: core.IDocumentStorage,
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
			const tenantId = request.params.tenantId;
			const documentId = request.params.id;
			const signalContent = request?.body?.signalContent;
			if (!isValidSignalEnvelope(signalContent)) {
				response
					.status(400)
					.send(
						`signalContent should contain 'contents.content' and 'contents.type' keys.`,
					);
				return;
			}
			if (!collaborationSessionEventEmitter) {
				response
					.status(500)
					.send(`No emitter configured for the broadcast-signal endpoint.`);
				return;
			}
			try {
				const deltaStreamUrl: string = config.get("worker:deltaStreamUrl");
				// This will be removed shortly. Used to test in dev clusters and force a redirect.
				const redirect: boolean = config.get("redirect");
				const document = await storage?.getDocument(tenantId, documentId);
				if (!document || !document.session.isSessionActive) {
					Lumberjack.info("Document not found", { tenantId, documentId });
					response.status(404).send("Document not found.");
					return;
				}
				if (!document.session.isSessionAlive) {
					Lumberjack.info("Document session not alive", { tenantId, documentId });
					response.status(410).send("Document session not alive.");
					return;
				}
				if (document.session.deltaStreamUrl !== deltaStreamUrl || redirect) {
					Lumberjack.info("Redirecting to docs cluster", {
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
				response.status(200).send("OK");
				return;
			} catch (error) {
				response.status(500).send(error);
				return;
			}
		},
	);

	return router;
}

function isValidSignalEnvelope(
	input: Partial<IRuntimeSignalEnvelope>,
): input is IRuntimeSignalEnvelope {
	return typeof input?.contents?.type === "string" && input?.contents?.content !== undefined;
}
