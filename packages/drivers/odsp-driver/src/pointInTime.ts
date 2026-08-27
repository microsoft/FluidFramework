/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDocumentService } from "@fluidframework/driver-definitions/internal";

import type { IOdspPointInTimeDocumentServiceImplementationProps } from "./odspDocumentServiceFactoryCore.js";

/**
 * ODSP's point-in-time document service implementation.
 *
 * @remarks Import this function from the legacy beta entrypoint and inject it through
 * {@link IOdspDocumentServiceFactoryOptions.pointInTimeDocumentServiceImplementation}.
 * The implementation is loaded on demand so consumers that do not enable point-in-time loading do
 * not include it in their main bundle.
 *
 * @param props - ODSP service dependencies and point-in-time load parameters supplied by the factory.
 * @returns A read-only ODSP document service materialized at the requested sequence number.
 *
 * @legacy @beta
 */
export async function createPointInTimeDocumentService(
	props: IOdspPointInTimeDocumentServiceImplementationProps,
): Promise<IDocumentService> {
	const { createPointInTimeDocumentService: createService } = await import(
		// eslint-disable-next-line import-x/no-internal-modules -- Lazily loads the optional implementation.
		"./pointInTimeDriver/createPointInTimeDocumentService.js"
	);
	return createService(props);
}
