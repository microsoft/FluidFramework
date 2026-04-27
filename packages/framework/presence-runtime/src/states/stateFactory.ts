/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LatestFactory, LatestMapFactory } from "@fluid-internal/presence-definitions";

import { latestMap } from "./latestMapValueManager.js";
import { latest } from "./latestValueManager.js";

/**
 * Factory for creating presence State objects.
 *
 * @remarks
 * Use `latest` to create a {@link @fluidframework/presence#Latest} or {@link @fluidframework/presence#LatestRaw} State object.
 * Use `latestMap` to create a {@link @fluidframework/presence#LatestMap} or {@link @fluidframework/presence#LatestMapRaw} State object.
 *
 * @public
 *
 * @privateRemarks
 * Explicit typing is used here to work around a limitation in TypeScript (and fully support
 * {@link https://www.typescriptlang.org/tsconfig/#isolatedDeclarations | isolatedDeclarations}).
 */
export const StateFactory: {
	readonly latest: LatestFactory;
	readonly latestMap: LatestMapFactory;
} = {
	latest,
	latestMap,
} as const;
