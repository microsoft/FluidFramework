/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISeedWorkflowApplication } from "../../harness/index.js";
import { codeDetails, projectionLayout } from "../appProjection.js";
import { sampleRuntimeFactory, type IHtmlApplicationLoad } from "../sampleRuntimeFactory.js";

/**
 * HTML-only observations belong to the sample tests, not the lifecycle harness.
 */
export interface IHtmlTestApplication extends ISeedWorkflowApplication<IHtmlApplicationLoad> {
	/** Calls at the actual serializer entry, excluding display/test-only comparisons. */
	readonly serializedParts: Readonly<Record<string, number>>;
}

/**
 * Adapt the HTML sample to the reusable harness while retaining its format-specific test probes.
 */
export function createHtmlTestApplication(): IHtmlTestApplication {
	const serializedParts: Record<string, number> = {};
	return {
		codeDetails,
		serializedParts,
		createRuntimeFactory: (options) =>
			sampleRuntimeFactory({
				...options,
				onSerializePart: (part) => {
					serializedParts[part] = (serializedParts[part] ?? 0) + 1;
				},
			}),
		seedBlobIds(snapshot) {
			const projection = snapshot?.trees[projectionLayout.key];
			return projection === undefined
				? []
				: [
						...Object.values(projection.blobs),
						...Object.values(projection.trees[projectionLayout.parts]?.trees ?? {}).flatMap(
							(part) => Object.values(part.blobs),
						),
					];
		},
	};
}
