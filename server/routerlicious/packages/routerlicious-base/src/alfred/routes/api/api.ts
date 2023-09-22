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
} from "@fluidframework/server-lambdas";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import * as core from "@fluidframework/server-services-core";
import {
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
	getCorrelationId,
	getBooleanFromConfig,
	verifyToken,
	verifyStorageToken,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";
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
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};
	const generalTenantThrottler = tenantThrottlers.get(Constants.generalRestCallThrottleIdPrefix);

	// Jwt token cache
	const enableJwtTokenCache: boolean = getBooleanFromConfig(
		"alfred:jwtTokenCache:enable",
		config,
	);

	function handlePatchRootSuccess(request: Request, opBuilder: (request: Request) => any[]) {
		const tenantId = getParam(request.params, "tenantId");
		const documentId = getParam(request.params, "id");
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
		async (request, response) => {
			response.sendStatus(200);
		},
	);

	router.patch(
		"/:tenantId/:id/root",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
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
		async (request, response) => {
			const tenantId = getParam(request.params, "tenantId");
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
		async (request, response) => {
			const tenantId = getParam(request.params, "tenantId");
			const documentId = getParam(request.params, "id");
			const signalContent = getParam(request.body, "singalContent");
			try {
				const signalRoom: IRoom = { tenantId, documentId };
				const payload: IBroadcastSignalEventPayload = { signalRoom, signalContent };
				collaborationSessionEventEmitter.emit("broadcast-signal", payload);
				response.status(200).send("OK");
			} catch (error) {
				response.status(500).send(error);
			}
		},
	);

	return router;
}

function mapSetBuilder(request: Request): any[] {
	const reqOps = request.body as IMapSetOperation[];
	const ops = [];
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
		() => getCorrelationId() || uuid(),
	);
	return restWrapper.post(uri, blobData, undefined, {
		"Content-Type": "application/json",
	});
};
