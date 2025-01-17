/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64, TypedEventEmitter } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import { IClient, IClientJoin, ScopeType } from "@fluidframework/protocol-definitions";
import {
	IBroadcastSignalEventPayload,
	ICollaborationSessionEvents,
	IRoom,
	IRuntimeSignalEnvelope,
} from "@fluidframework/server-lambdas";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import * as core from "@fluidframework/server-services-core";
import {
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
	getBooleanFromConfig,
	verifyToken,
	verifyStorageToken,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import {
	Lumberjack,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { Request, Router } from "express";
import sillyname from "sillyname";
import { Provider } from "nconf";
import winston from "winston";
import { v4 as uuid } from "uuid";
import { Constants } from "../../../utils";
import {
	craftClientJoinMessage,
	craftClientLeaveMessage,
	craftMapSet,
	craftOpMessage,
	IBlobData,
	IMapSetOperation,
} from "./restHelper";

export function create(
	config: Provider,
	producer: core.IProducer,
	tenantManager: core.ITenantManager,
	storage: core.IDocumentStorage,
	tenantThrottlers: Map<string, core.IThrottler>,
	jwtTokenCache?: core.ICache,
	revokedTokenChecker?: core.IRevokedTokenChecker,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	fluidAccessTokenGenerator?: core.IFluidAccessTokenGenerator,
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};
	const generalTenantThrottler = tenantThrottlers.get(Constants.generalRestCallThrottleIdPrefix);

	// Jwt token cache
	const enableJwtTokenCache: boolean = getBooleanFromConfig(
		"alfred:jwtTokenCache:enable",
		config,
	);

	function handlePatchRootSuccess(request: Request, opBuilder: (request: Request) => any[]) {
		const tenantId = request.params.tenantId;
		const documentId = request.params.id;
		const clientId = (sillyname() as string).toLowerCase().split(" ").join("-");
		sendJoin(tenantId, documentId, clientId, producer);
		sendOp(request, tenantId, documentId, clientId, producer, opBuilder);
		sendLeave(tenantId, documentId, clientId, producer);
	}

	router.get(
		"/ping",
		throttle(generalTenantThrottler, winston, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ping",
		}),
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			response.sendStatus(200);
		},
	);

	if (fluidAccessTokenGenerator) {
		router.post(
			"/tenants/:tenantId/accesstoken",
			validateRequestParams("tenantId"),
			throttle(generalTenantThrottler, winston, tenantThrottleOptions),
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			async (request, response) => {
				const tenantId = request.params.tenantId;
				const bearerAuthToken = request?.header("Authorization");
				if (!bearerAuthToken) {
					response.status(400).send(`Missing Authorization header in the request.`);
					return;
				}
				const fluidAccessTokenRequest = fluidAccessTokenGenerator.generateFluidToken(
					tenantId,
					bearerAuthToken,
					request?.body,
				);
				handleResponse(fluidAccessTokenRequest, response, undefined, undefined, 201);
			},
		);
	}

	router.patch(
		"/:tenantId/:id/root",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
			const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
			const validP = verifyRequest(
				request,
				tenantManager,
				storage,
				maxTokenLifetimeSec,
				isTokenExpiryEnabled,
				enableJwtTokenCache,
				jwtTokenCache,
				revokedTokenChecker,
			);
			handleResponse(
				validP.then(() => undefined),
				response,
				undefined,
				undefined,
				200,
				() => handlePatchRootSuccess(request, mapSetBuilder),
			);
		},
	);

	router.post(
		"/:tenantId/:id/blobs",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const tenantId = request.params.tenantId;
			const blobData = request.body as IBlobData;
			// TODO: why is this contacting external blob storage?
			const externalHistorianUrl = config.get("worker:blobStorageUrl") as string;
			const requestToken = fromUtf8ToBase64(tenantId);
			const uri = `${externalHistorianUrl}/repos/${tenantId}/git/blobs?token=${requestToken}`;
			const requestBody: git.ICreateBlobParams = {
				content: blobData.content,
				encoding: "base64",
			};
			uploadBlob(uri, requestBody)
				.then((data: git.ICreateBlobResponse) => {
					response.status(200).json(data);
				})
				.catch((err) => {
					response.status(400).end(err.toString());
				});
		},
	);

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

function mapSetBuilder(request: Request): any[] {
	const reqOps = request.body as IMapSetOperation[];
	const ops: ReturnType<typeof craftMapSet>[] = [];
	for (const reqOp of reqOps) {
		ops.push(craftMapSet(reqOp));
	}

	return ops;
}

function sendJoin(
	tenantId: string,
	documentId: string,
	clientId: string,
	producer: core.IProducer,
) {
	const detail: IClient = {
		mode: "write",
		permission: [],
		scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
		details: {
			capabilities: { interactive: false },
		},
		user: { id: "Rest-Client" },
	};
	const clientDetail: IClientJoin = {
		clientId,
		detail,
	};

	const joinMessage = craftClientJoinMessage(tenantId, documentId, clientDetail);
	producer.send([joinMessage], tenantId, documentId).catch((err) => {
		const lumberjackProperties = {
			...getLumberBaseProperties(documentId, tenantId),
		};
		Lumberjack.error("Error sending join message to producer", lumberjackProperties, err);
	});
}

function isValidSignalEnvelope(
	input: Partial<IRuntimeSignalEnvelope>,
): input is IRuntimeSignalEnvelope {
	return typeof input?.contents?.type === "string" && input?.contents?.content !== undefined;
}

function sendLeave(
	tenantId: string,
	documentId: string,
	clientId: string,
	producer: core.IProducer,
) {
	const leaveMessage = craftClientLeaveMessage(tenantId, documentId, clientId);
	producer.send([leaveMessage], tenantId, documentId).catch((err) => {
		const lumberjackProperties = {
			...getLumberBaseProperties(documentId, tenantId),
		};
		Lumberjack.error("Error sending leave message to producer", lumberjackProperties, err);
	});
}

function sendOp(
	request: Request,
	tenantId: string,
	documentId: string,
	clientId: string,
	producer: core.IProducer,
	opBuilder: (request: Request) => any[],
) {
	const opContents = opBuilder(request);
	let clientSequenceNumber = 1;
	for (const content of opContents) {
		const opMessage = craftOpMessage(
			tenantId,
			documentId,
			clientId,
			JSON.stringify(content),
			clientSequenceNumber++,
		);
		producer.send([opMessage], tenantId, documentId).catch((err) => {
			const lumberjackProperties = {
				...getLumberBaseProperties(documentId, tenantId),
			};
			Lumberjack.error("Error sending op to producer", lumberjackProperties, err);
		});
	}
}

const verifyRequest = async (
	request: Request,
	tenantManager: core.ITenantManager,
	storage: core.IDocumentStorage,
	maxTokenLifetimeSec: number,
	isTokenExpiryEnabled: boolean,
	tokenCacheEnabled: boolean,
	tokenCache?: core.ICache,
	revokedTokenChecker?: core.IRevokedTokenChecker,
) =>
	Promise.all([
		verifyTokenWrapper(
			request,
			tenantManager,
			maxTokenLifetimeSec,
			isTokenExpiryEnabled,
			tokenCacheEnabled,
			tokenCache,
			revokedTokenChecker,
		),
		checkDocumentExistence(request, storage),
	]);

async function verifyTokenWrapper(
	request: Request,
	tenantManager: core.ITenantManager,
	maxTokenLifetimeSec: number,
	isTokenExpiryEnabled: boolean,
	tokenCacheEnabled: boolean,
	tokenCache?: core.ICache,
	revokedTokenChecker?: core.IRevokedTokenChecker,
): Promise<void> {
	const token = request.headers["access-token"] as string;
	if (!token) {
		throw new Error("Missing access token in request header.");
	}
	const tenantId = getParam(request.params, "tenantId");
	if (!tenantId) {
		throw new Error("Missing tenantId in request.");
	}
	const documentId = getParam(request.params, "id");
	if (!documentId) {
		throw new Error("Missing documentId in request.");
	}

	const options = {
		requireDocumentId: true,
		requireTokenExpiryCheck: isTokenExpiryEnabled,
		maxTokenLifetimeSec,
		ensureSingleUseToken: false,
		singleUseTokenCache: undefined,
		enableTokenCache: tokenCacheEnabled,
		tokenCache,
		revokedTokenChecker,
	};
	return verifyToken(tenantId, documentId, token, tenantManager, options);
}

async function checkDocumentExistence(
	request: Request,
	storage: core.IDocumentStorage,
): Promise<any> {
	const tenantId = getParam(request.params, "tenantId");
	const documentId = getParam(request.params, "id");
	if (!tenantId || !documentId) {
		throw new Error("Invalid tenant or document id");
	}
	const document = await storage.getDocument(tenantId, documentId);
	if (!document || document.scheduledDeletionTime) {
		throw new Error("Cannot access document marked for deletion");
	}
}

const uploadBlob = async (
	uri: string,
	blobData: git.ICreateBlobParams,
): Promise<git.ICreateBlobResponse> => {
	const restWrapper = new BasicRestWrapper(
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		() =>
			getGlobalTelemetryContext().getProperties().correlationId ??
			uuid() /* getCorrelationId */,
		() => getGlobalTelemetryContext().getProperties() /* getTelemetryContextProperties */,
		undefined /* refreshTokenIfNeeded */,
		"alfred",
		true /* enableTelemetry */,
	);
	return restWrapper.post(uri, blobData, undefined, {
		"Content-Type": "application/json",
	});
};
