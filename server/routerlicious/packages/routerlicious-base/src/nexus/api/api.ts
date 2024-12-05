/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { validateRequestParams } from "@fluidframework/server-services-shared";
import { throttle, IThrottleMiddlewareOptions } from "@fluidframework/server-services-utils";
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
	tenantThrottlers?: Map<string, core.IThrottler>,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	storage?: core.IDocumentStorage,
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: "NexusRest",
	};
	const generalTenantThrottler = tenantThrottlers?.get(Constants.generalRestCallThrottleIdPrefix);

	router.post(
		"/:tenantId/:id/broadcast-signal",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
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
				const redirect: boolean = config.get("redirect");
				const document = await storage?.getDocument(tenantId, documentId);
				if (document?.session.ordererUrl !== deltaStreamUrl || redirect) {
					Lumberjack.info("Redirecting to docs cluster", {
						documentUrl: document?.session.ordererUrl,
						currentUrl: deltaStreamUrl,
						targetUrlAndPath: `${document?.session.deltaStreamUrl}${request.originalUrl}`,
					});
					response.redirect(
						308,
						`${document?.session.deltaStreamUrl}${request.originalUrl}`,
					);
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
