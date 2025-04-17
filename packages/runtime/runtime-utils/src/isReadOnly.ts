/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type {
	ISequencedDocumentMessage,
	IDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import { summarizerClientType } from "./summaryUtils.js";

/**
 * @internal
 * */
export const isReadonly = (
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
) =>
	(deltaManager.readOnlyInfo.readonly ?? false) ||
	deltaManager.clientDetails.type === summarizerClientType;
