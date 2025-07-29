/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema, ReadableField } from "@fluidframework/tree/internal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import/no-internal-modules

import {
	SharedTreeSemanticAgentBase,
	type Log,
	type SharedTreeSemanticAgent,
} from "./agent.js";
import type { TreeView } from "./utils.js";

/**
 * TODO doc
 * @alpha
 */
export function createFunctioningAgent<TRoot extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TRoot>,
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TRoot>) => string;
		readonly validator?: (js: string) => boolean;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent {
	return new SharedTreeFunctioningAgent(client, treeView, options);
}

class SharedTreeFunctioningAgent<
	TRoot extends ImplicitFieldSchema,
> extends SharedTreeSemanticAgentBase<TRoot> {
	public constructor(
		client: BaseChatModel,
		treeView: TreeView<TRoot>,
		options?: {
			readonly domainHints?: string;
			readonly treeToString?: (root: ReadableField<TRoot>) => string;
			readonly validator?: (js: string) => boolean;
			readonly log?: Log;
		},
	) {
		super(client, treeView, options);
	}
}
