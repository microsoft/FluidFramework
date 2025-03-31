/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getSimpleSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type ReadableField,
	type TreeFieldFromImplicitField,
	type TreeNode,
	NodeKind,
	type InsertableContent,
	type ObjectNodeSchema,
	normalizeFieldSchema,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// eslint-disable-next-line import/no-internal-modules
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// eslint-disable-next-line import/no-internal-modules
import type { ToolMessage, AIMessage } from "@langchain/core/messages";
// eslint-disable-next-line import/no-internal-modules
import { tool, type StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import {
	getEditingSystemPrompt,
	getFriendlySchemaName,
	getFunctioningSystemPrompt,
} from "./promptGeneration.js";
import { generateEditTypesForInsertion } from "./typeGeneration.js";
import { constructNode, fail, failUsage, type TreeView } from "./utils.js";

const functionName = "editTree";
const paramsName = "params";

/**
 * @alpha
 */
export type Log = (message: string) => void;

/**
 * @alpha
 */
export abstract class SharedTreeSemanticAgent<TRoot extends ImplicitFieldSchema> {
	protected constructor(
		public readonly client: BaseChatModel,
		public readonly treeView: TreeView<TRoot>,
		protected readonly editingTool: StructuredTool,
		protected readonly options:
			| {
					readonly domainHints?: string;
					readonly treeToString?: (root: ReadableField<TRoot>) => string;
					readonly log?: Log;
			  }
			| undefined,
	) {}

	protected thinkingTool = tool(
		// eslint-disable-next-line unicorn/consistent-function-scoping
		({ thoughts }) => thoughts,
		{
			name: "think",
			description:
				"Use the tool to think about something. It will not obtain new information or change any data, but just append the thought to the log. Use it when complex reasoning or some cache memory is needed.",

			schema: z.object({
				thoughts: z.string().describe("A thought to think about."),
			}),
		},
	);

	protected async applyPrompt(
		systemPrompt: string,
		userPrompt: string,
	): Promise<string | undefined> {
		const messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
		messages.push(new SystemMessage(systemPrompt));
		messages.push(
			new HumanMessage(
				`${
					this.options?.domainHints === undefined
						? ""
						: `Here is some information about my application domain: ${this.options?.domainHints}\n\n`
				}${userPrompt}`,
			),
		);

		this.options?.log?.(`# System Prompt\n\n${systemPrompt}\n\n`);
		this.options?.log?.(`# User Prompt\n\n`);
		if (this.options?.domainHints === undefined) {
			this.options?.log?.(`"${quote(userPrompt)}"\n\n`);
		} else {
			this.options?.log?.(`## Domain Hints\n\n"${this.options?.domainHints}"\n\n`);
			this.options?.log?.(`## Prompt\n\n"${quote(userPrompt)}"\n\n`);
		}

		let responseMessage: AIMessage;
		do {
			responseMessage =
				(await this.client
					.bindTools?.([this.editingTool, this.thinkingTool], { tool_choice: "auto" })
					?.invoke(messages)) ??
				failUsage("LLM client must support function calling or tool use.");

			messages.push(responseMessage);
			// We start with one message, and then add two more for each subsequent correspondence
			this.options?.log?.(`# LLM Response ${Math.ceil(messages.length / 2)}\n\n`);
			this.options?.log?.(`${responseMessage.text}\n\n`);
			if (responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0) {
				for (const toolCall of responseMessage.tool_calls) {
					switch (toolCall.name) {
						case this.thinkingTool.name: {
							const result = (await this.thinkingTool.invoke(toolCall)) as ToolMessage;
							this.options?.log?.(`## Thinking Tool Invoked\n\n${result.text}\n\n`);
							break;
						}
						case "EditJsonTree":
						case "GenerateTreeEditingCode": {
							const result = (await this.editingTool.invoke(toolCall)) as ToolMessage;
							messages.push(result);
							break;
						}
						default: {
							messages.push(new HumanMessage(`Unrecognized tool call: ${toolCall.name}`));
						}
					}
				}
			} else {
				return responseMessage.text;
			}
		} while (messages.length < maxMessages + 1);
	}
}

/**
 * TODO doc
 * @alpha
 */
export class SharedTreeSemanticCodingAgent<
	TRoot extends ImplicitFieldSchema,
> extends SharedTreeSemanticAgent<TRoot> {
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
		const editingTool = tool(
			({ functionCode }) => {
				const create: Record<string, (input: InsertableContent) => TreeNode> = {};
				visitObjectNodeSchema(this.treeView.schema, (schema) => {
					const name =
						getFriendlySchemaName(schema.identifier) ??
						fail("Expected friendly name for object node schema");

					create[name] = (input: InsertableContent) => constructNode(schema, input);
				});
				const branch = this.treeView.fork();
				const idGenerator2 = new IdGenerator();
				idGenerator2.assignIds(branch.root);
				if (options?.validator?.(functionCode) === false) {
					return "Code validation failed";
				}
				const params = {
					get root(): TreeFieldFromImplicitField<TRoot> {
						return branch.root;
					},
					set root(value: InsertableField<TRoot>) {
						branch.root = value;
					},
					idMap: idGenerator2,
					create,
				};
				const code = processLlmCode(functionCode);
				this.options?.log?.(`### Generated Code\n\n\`\`\`js\n${code}\n\`\`\`\n\n`);
				// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
				const fn = new Function(paramsName, code) as (p: typeof params) => void;
				fn(params);
				this.options?.log?.(`The new state of the tree is:\n\n`);
				this.options?.log?.(
					`${
						this.options?.treeToString?.(branch.root) ??
						`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
					}\n\n`,
				);
				// TODO: Return the current tree state here instead, but make sure to preserve IDs correctly
				return "The tree has been edited.";
			},
			{
				name: "GenerateTreeEditingCode",
				description: `Invokes a JavaScript function \`${functionName}\` to edit a user's tree`,
				schema: z.object({
					functionCode: z
						.string()
						.describe(`The body of the \`${functionName}\` JavaScript function`),
				}),
			},
		);
		super(client, treeView, editingTool, options);
	}

	public async runCodeFromPrompt(prompt: string): Promise<void> {
		const systemPrompt = getFunctioningSystemPrompt(
			this.treeView,
			this.editingTool.name,
			this.thinkingTool.name,
			functionName,
		);

		await this.applyPrompt(systemPrompt, prompt);
	}
}

/**
 * TODO doc
 * @alpha
 */
export class SharedTreeSemanticEditingAgent<
	TRoot extends ImplicitFieldSchema,
> extends SharedTreeSemanticAgent<TRoot> {
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
				const parseResult = wrapper.safeParse({ edits: args.edits });
				if (!parseResult.success) {
					throw parseResult.error;
				}

				const branch = this.treeView.fork();
				const idGenerator2 = new IdGenerator();
				idGenerator2.assignIds(branch.root);
				const edits = parseResult.data.edits as TreeEdit[];
				let editIndex = 0;
				while (editIndex < edits.length) {
					const edit = edits[editIndex] ?? fail("Expected edit");
					try {
						applyAgentEdit(simpleSchema, branch, edit, idGenerator2);
					} catch (error: unknown) {
						branch.dispose();
						if (error instanceof UsageError) {
							return `Error when applying edit at index ${editIndex}: ${error.message}`;
						}
						throw error;
					}
					this.options?.log?.(`### Applied Edit ${editIndex + 1}\n\n`);
					this.options?.log?.(`The new state of the tree is:\n\n`);
					this.options?.log?.(
						`${
							this.options.treeToString?.(branch.root) ??
							`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
						}\n\n`,
					);
					editIndex += 1;
				}
				this.treeView.merge(branch);
				// TODO: Return the current tree state here instead, but make sure to preserve IDs correctly
				return "The tree has been edited.";
			},
			{
				name: "EditJsonTree",
				description: "An array of edits to a user's SharedTree domain",
				schema: z.object({
					edits: z.array(z.unknown()).describe(`An array of well-formed TreeEdits`),
				}),
			},
		);

		super(client, treeView, editingTool, options);
	}

	public async applyEditsFromPrompt(prompt: string): Promise<void> {
		const editingToolName = "EditJsonTree";

		const systemPrompt = getEditingSystemPrompt(
			this.treeView,
			editingToolName,
			this.thinkingTool.name,
		);

		await this.applyPrompt(systemPrompt, prompt);
	}
}

const maxMessages = 5; // TODO: Allow caller to provide this

function visitObjectNodeSchema(
	schema: ImplicitFieldSchema,
	visitor: (schema: ObjectNodeSchema) => void,
): void {
	const normalizedSchema = normalizeFieldSchema(schema);
	for (const nodeSchema of normalizedSchema.allowedTypeSet) {
		if (nodeSchema.kind === NodeKind.Object) {
			visitor(nodeSchema as ObjectNodeSchema);
		}
		visitObjectNodeSchema([...nodeSchema.childTypes], visitor);
	}
}

function processLlmCode(code: string): string {
	// TODO: use a library like Acorn to analyze the code more robustly
	const regex = new RegExp(`function\\s+${functionName}\\s*\\(`);
	if (!regex.test(code)) {
		throw new Error(`Generated code does not contain a function named \`${functionName}\``);
	}

	return `${code}\n\n${functionName}(${paramsName});`;
}

function quote(text: string): string {
	return `> ${text.replace(/\n/g, "\n>")}`;
}
