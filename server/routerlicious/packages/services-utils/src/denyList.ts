/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDenyList } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { RequestHandler } from "express";

// TODO: Remove duplicate code in Historian
export class DenyList implements IDenyList {
	private readonly blockedDocuments: Set<string>;
	private readonly blockedTenants: Set<string>;
	constructor(tenantsDenyList?: string[], blockedDocumentsList?: string[]) {
		this.blockedTenants = new Set();
		this.blockedDocuments = new Set();
		if (blockedDocumentsList) {
			for (const documentId of blockedDocumentsList) {
				this.blockedDocuments.add(documentId);
			}
		}

		if (tenantsDenyList) {
			for (const tenantId of tenantsDenyList) {
				this.blockedTenants.add(tenantId);
			}
		}
	}

	public isTenantDenied(tenantId: string): boolean {
		return this.blockedTenants.has(tenantId);
	}

	public isDocumentDenied(documentId: string): boolean {
		return this.blockedDocuments.has(documentId);
	}
}

export function denyListMiddleware(
	denyList: IDenyList | undefined,
	skipDocumentDenyListCheck = false,
): RequestHandler {
	return (req, res, next) => {
		if (!denyList) {
			return next();
		}

		const tenantId = req.params.tenantId;
		const documentId = req.params.id;

		if (denyList.isTenantDenied(tenantId)) {
			Lumberjack.error("Tenant is in the deny list", {
				tenantId,
			});
			res.status(500).send(`Unable to process request for tenant id: ${tenantId}`);
			return;
		}

		if (documentId && !skipDocumentDenyListCheck) {
			if (denyList.isDocumentDenied(documentId)) {
				Lumberjack.error("Document is in the deny list", {
					tenantId,
					documentId,
				});
				res.status(500).send(`Unable to process request for document id: ${documentId}`);
				return;
			}
		}

		next();
	};
}
