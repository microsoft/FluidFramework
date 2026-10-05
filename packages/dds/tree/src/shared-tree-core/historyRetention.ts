/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Persisted, per-instance history policy. An omitted setting disables retention.
 * @internal
 */
export type TreeHistoryConfiguration = Readonly<{ retainHistory?: boolean }>;
