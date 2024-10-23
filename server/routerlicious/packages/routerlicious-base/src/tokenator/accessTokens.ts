import type { IAccessTokenGenerator } from "@fluidframework/server-services-core";
import { handleResponse } from "@fluidframework/server-services-shared";
import { getParam } from "@fluidframework/server-services-utils";
import { Router } from "express";

export function create(accessTokenGenerator: IAccessTokenGenerator): Router {
	const router: Router = Router();

	// Returns an access token for the given tenant
	router.post(
		"/tenants/:tenantId/accesstoken",
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const tenantId = getParam(request.params, "tenantId");
			const documentId = (request.body.documentId as string) || undefined;
			const customClaims = (request.body.customClaims as Record<string, any>) || undefined;
			const accessToken = accessTokenGenerator.generateToken(
				tenantId,
				documentId,
				customClaims,
			);
			handleResponse(accessToken, response, undefined, undefined, 201);
		},
	);

	return router;
}
