/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { queryParamToString } from "../../../utils";
import * as utils from "../utils";
import { getBlob } from "../git/blobs";
import { getTree } from "../git/trees";

export async function getContent(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	path: string,
	ref: string,
): Promise<any> {
	const tree = await getTree(store, tenantId, authorization, ref, true, true);

	let content;
	for (const entry of tree.tree) {
		if (entry.path === path) {
			content = await getBlob(store, tenantId, authorization, entry.sha, true);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return content;
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.get("/repos/:ignored?/:tenantId/contents/*", (request, response) => {
		const contentP = getContent(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params[0],
			queryParamToString(request.query.ref) ?? "",
		);

		utils.handleResponse(contentP, response, false);
	});

	return router;
}
