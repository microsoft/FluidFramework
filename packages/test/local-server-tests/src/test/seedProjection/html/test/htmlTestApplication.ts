/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISeedWorkflowApplication } from "../../harness/index.js";
import { codeDetails, projectionKey, type HtmlPartId } from "../externalSeedFile.js";
import { sampleRuntimeFactory, type IAppObservation } from "../sampleRuntimeFactory.js";

/** HTML-only observations belong to the sample tests, not the lifecycle harness. */
export interface IHtmlTestApplication extends ISeedWorkflowApplication<IAppObservation> {
	/** Calls at the actual serializer entry, excluding display/test-only comparisons. */
	readonly serializedParts: Readonly<Record<HtmlPartId, number>>;
}

/** Adapt the HTML sample to the reusable harness while retaining its format-specific test probes. */
export function createHtmlTestApplication(): IHtmlTestApplication {
	const serializedParts: Record<HtmlPartId, number> = { first: 0, second: 0 };
	return {
		codeDetails,
		serializedParts,
		createRuntimeFactory: (options) =>
			sampleRuntimeFactory({
				...options,
				onSerializePart: (part) => {
					serializedParts[part]++;
				},
			}),
		seedBlobIds(snapshot) {
			const projection = snapshot?.trees[projectionKey];
			return projection === undefined
				? []
				: [
						...Object.values(projection.blobs),
						...Object.values(projection.trees).flatMap((part) => Object.values(part.blobs)),
					];
		},
	};
}
