/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getSimpleSchema,
	type ImplicitFieldSchema,
	type ReadableField,
	type ReadSchema,
	type RestrictiveStringRecord,
	type TreeFieldFromImplicitField,
	type TreeObjectNode,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// eslint-disable-next-line import/no-internal-modules
import { tool } from "@langchain/core/tools";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";
import { z } from "zod";

import {
	SharedTreeSemanticAgentBase,
	type Log,
	type SharedTreeSemanticAgent,
} from "./agent.js";
import { applyAgentEdit } from "./agentEditReducer.js";
import {
	objectIdKey,
	objectIdType,
	typeField,
	type InsertIntoArray,
	type MoveArrayElement,
	type RemoveFromArray,
	type SetField,
	type TreeEdit,
} from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import {
	doesNodeContainArraySchema,
	generateEditTypesForInsertion,
	generateEditTypesForPrompt,
} from "./typeGeneration.js";
import { fail, getFriendlySchemaName, type TreeView } from "./utils.js";

/**
 * TODO
 * @alpha
 */
export function createEditingAgent<TRoot extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TRoot>,
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TRoot>) => string;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent {
	return new SharedTreeEditingAgent(client, treeView, options);
}

class SharedTreeEditingAgent<
	TRoot extends ImplicitFieldSchema,
> extends SharedTreeSemanticAgentBase<TRoot> {
	public constructor(
		client: BaseChatModel,
		treeView: TreeView<TRoot>,
		options?: {
			readonly domainHints?: string;
			readonly treeToString?: (root: ReadableField<TRoot>) => string;
			readonly log?: Log;
		},
	) {
		const root = treeView.root;
		if (typeof root !== "object" || root === null) {
			throw new UsageError("Primitive root nodes are not yet supported.");
		}
		const simpleSchema = getSimpleSchema(treeView.schema);
		const wrapper = z.object({
			edits: generateEditTypesForInsertion(simpleSchema),
		});
		const editingTool = tool(
			(args) => {
				this.options?.log?.(`## Editing Tool Invoked\n\n`);
				const parseResult = wrapper.safeParse({ edits: args.edits });
				if (!parseResult.success) {
					throw parseResult.error;
				}

				const edits = parseResult.data.edits as TreeEdit[];
				let editIndex = 0;
				while (editIndex < edits.length) {
					const edit = edits[editIndex] ?? fail("Expected edit");
					try {
						applyAgentEdit(
							simpleSchema,
							this.prompting.branch,
							edit,
							this.prompting.idGenerator,
						);
					} catch (error: unknown) {
						if (error instanceof UsageError) {
							this.options?.log?.(`### Edit ${editIndex + 1} Error\n\n`);
							this.options?.log?.(
								`\`\`\`JSON\n${JSON.stringify(edits[editIndex])}\n\`\`\`\n\n`,
							);
							this.options?.log?.(`#### Error\n\n`);
							this.options?.log?.(`\`\`\`JSON\n${error.message}\n\`\`\`\n\n`);

							return `Error when applying edit at index ${editIndex}: ${error.message}`;
						}
						throw error;
					}
					this.options?.log?.(`### Applied Edit ${editIndex + 1}\n\n`);
					this.options?.log?.(`\`\`\`JSON\n${JSON.stringify(edits[editIndex])}\n\`\`\`\n\n`);
					this.options?.log?.(`#### New Tree State\n\n`);
					this.options?.log?.(
						`${
							this.options.treeToString?.(this.prompting.branch.root) ??
							`\`\`\`JSON\n${this.stringifyTree(this.prompting.branch.root, this.prompting.idGenerator)}\n\`\`\``
						}\n\n`,
					);
					editIndex += 1;
				}
				return `After running your function, the new state of the tree is:\n\n\`\`\`JSON\n${this.stringifyTree(this.prompting.branch.root, this.prompting.idGenerator)}\n\`\`\``;
			},
			{
				name: "EditJsonTree",
				description: "An array of edits to a user's SharedTree domain",
				schema: z.object({
					edits: z.array(z.record(z.unknown())).describe(`An array of well-formed TreeEdits`),
				}),
			},
		);

		super(client, treeView, editingTool, options);
	}

	protected getSystemPrompt(view: Omit<TreeView<TRoot>, "fork" | "merge">): string {
		// TODO: Support for non-object roots
		assert(
			typeof view.root === "object" && view.root !== null && !isFluidHandle(view.root),
			"",
		);
		const schema = getSimpleSchema(view.schema);
		const { editTypes, editRoot, domainTypes, domainRoot } = generateEditTypesForPrompt(
			schema,
			true,
		);
		for (const [key, value] of Object.entries(domainTypes)) {
			const friendlyKey = getFriendlySchemaName(key);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete domainTypes[key];
			if (
				friendlyKey !== undefined &&
				friendlyKey !== "string" &&
				friendlyKey !== "number" &&
				friendlyKey !== "boolean"
			) {
				domainTypes[friendlyKey] = value;
			}
		}
		const domainSchema = createZodJsonValidator(domainTypes, domainRoot);
		const domainSchemaString = domainSchema.getSchemaText();
		const treeSchemaString = createZodJsonValidator(editTypes, editRoot).getSchemaText();
		const setFieldType = "SetField" satisfies Capitalize<SetField["type"]>;
		const insertIntoArrayType = "InsertIntoArray" satisfies Capitalize<
			InsertIntoArray["type"]
		>;
		const topLevelEditWrapperDescription = doesNodeContainArraySchema(view.root)
			? `is one of the following interfaces: \`${setFieldType}\` for editing objects or one of \`${insertIntoArrayType}\`, \`${"RemoveFromArray" satisfies Capitalize<RemoveFromArray["type"]>}\`, \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` for editing arrays`
			: `is the interface \`${setFieldType}\``;

		const rootTypes = [...schema.root.allowedTypesIdentifiers];
		// TODO: security: user prompt in system prompt
		const systemPrompt = `${this.getSystemPromptPreamble(domainTypes, domainRoot)}

## Editing

If the user asks you to edit the data, you will use the ${this.editingTool.name} tool to produce an array of edits where each edit ${topLevelEditWrapperDescription}.
When creating new objects for \`${insertIntoArrayType}\` or \`${setFieldType}\`, you may create an ${objectIdType} and put it in the \`${objectIdKey}\` property if you want to refer to the object in a later edit.
For example, if you want to insert a new object into an array and (in a subsequent edit) move another piece of content to after the newly inserted one, you can use the ${objectIdType} of the newly inserted object in the \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` edit.
New ${objectIdType}s must be unique, i.e. a new object cannot have the same ${objectIdType} as any object that has existed before.
${objectIdType}s are optional; do not supply them unless you need to refer to the object in a later edit.
For a \`${setFieldType}\` or \`${insertIntoArrayType}\` edit, you might insert an object into a location where it is ambiguous what the type of the object is from the data alone.
In that case, supply the type in the \`${typeField}\` property of the object with a value that is the typescript type name of that object.

The schema definitions for an edit are:

\`\`\`typescript
${treeSchemaString}
\`\`\`

The tree is a JSON object with the following schema:

\`\`\`typescript
${domainSchemaString}
\`\`\`

The type${rootTypes.length > 1 ? "s" : ""} allowable at the root of the tree ${rootTypes.length > 1 ? "are" : "is"} \`${rootTypes.map((t) => getFriendlySchemaName(t)).join(" | ")}\`.
The current state of the tree is:

\`\`\`JSON
${this.stringifyTree(view.root, new IdGenerator())}
\`\`\`

Your final output should be an array of one or more edits that accomplishes the goal, or an empty array if the task can't be accomplished.
Before returning the edits, you should check that they are valid according to both the application schema and the editing language schema.
When possible, ensure that the edits preserve the identity of objects already in the tree (for example, prefer move operations over removal and reinsertion).
Do not put \`${objectIdKey}\` properties on new objects that you create unless you are going to refer to them in a later edit.
Finally, double check that the edits would accomplish the user's request (if it is possible).`;

		return systemPrompt;
	}

	protected override stringifyTree(
		root: TreeFieldFromImplicitField<ReadSchema<TRoot>>,
		idGenerator: IdGenerator,
		visitObject?: (
			object: TreeObjectNode<RestrictiveStringRecord<ImplicitFieldSchema>>,
			id: string,
		) => object | void,
	): string {
		return super.stringifyTree(root, idGenerator, (object, id) => {
			return {
				[objectIdKey]: id,
				...(visitObject?.(object, id) ?? object),
			};
		});
	}
}
