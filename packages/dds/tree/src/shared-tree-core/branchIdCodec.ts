/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IIdCompressor,
	OpSpaceCompressedId,
	SessionId,
} from "@fluidframework/id-compressor";
import type { BranchId } from "./branch.js";

export function encodeBranchId(
	idCompressor: IIdCompressor,
	branchId: BranchId,
): OpSpaceCompressedId | undefined {
	return branchId === "main" ? undefined : idCompressor.normalizeToOpSpace(branchId);
}

export function decodeBranchId(
	idCompressor: IIdCompressor,
	encoded: OpSpaceCompressedId | undefined,
	context: { readonly originatorId: SessionId },
): BranchId {
	return encoded === undefined
		? "main"
		: idCompressor.normalizeToSessionSpace(encoded, context.originatorId);
}
