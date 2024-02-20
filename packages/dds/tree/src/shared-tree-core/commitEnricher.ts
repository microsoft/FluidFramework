/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GraphCommit } from "../core/index.js";

export interface ICommitEnricher<TChange> {
	enrichCommit(commit: GraphCommit<TChange>, isResubmit: boolean): GraphCommit<TChange>;
	commitSequenced(isLocal: boolean): void;
}
