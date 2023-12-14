/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDenyList } from "./definitions";

export class DenyList implements IDenyList {
	// Key of the map is a tenantID
	// Value of the map is a set with documentIDs
	private readonly deniedMap: Map<string, Set<string>>;
	constructor(denyList?: { [key: string]: string[] }) {
		this.deniedMap = new Map();
		if (denyList) {
			for (const [tenantId, documentIds] of Object.entries(denyList)) {
				this.deniedMap.set(tenantId, new Set(documentIds));
			}
		}
	}

	public isDenied(tenantId: string, documentId: string): boolean {
		const documentIdsForTenantId = this.deniedMap.get(tenantId);
		if (!documentIdsForTenantId) {
			return false;
		}
		return documentIdsForTenantId.has(documentId);
	}
}
