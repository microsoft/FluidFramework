import { isSerializedHandle } from "@fluidframework/runtime-utils/internal";

/**
 * Finds all Fluid handle paths in a plain object tree (using the same logic as detectOutboundReferences).
 * Returns a Set of handle URLs (absolute paths).
 */
export function findAllHandlePaths(input: unknown): Set<string> {
	const toSearch = [input];
	const found: Set<string> = new Set();
	while (toSearch.length > 0) {
		const obj = toSearch.shift();
		if (typeof obj === "object" && obj !== null) {
			for (const value of Object.values(obj)) {
				if (isSerializedHandle(value)) {
					found.add(value.url);
				} else {
					toSearch.push(value);
				}
			}
		}
	}
	return found;
}
