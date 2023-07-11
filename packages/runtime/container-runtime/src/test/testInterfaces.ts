/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPendingBlobs } from "../blobManager";
import { IPendingLocalState } from "../pendingStateManager";

export interface PendingLocalState {
	pending: IPendingLocalState | undefined;
	pendingAttachmentBlobs: IPendingBlobs;
}
