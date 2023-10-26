/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Server makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IServerMetadata {
	createSignal?: boolean;
	noClient?: boolean;
	deliAcked?: boolean;
}
