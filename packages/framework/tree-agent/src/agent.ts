/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getSimpleSchema,
	Tree,
	type ImplicitFieldSchema,
	type InsertableField,
	type ReadableField,
	type TreeFieldFromImplicitField,
	type TreeViewAlpha,
	type TreeNode,
	NodeKind,
	type InsertableContent,
	type ObjectNodeSchema,
	normalizeFieldSchema,
} from "@fluidframework/tree/internal";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import {
	getEditingSystemPrompt,
	getFriendlySchemaName,
	getFunctioningSystemPrompt,
} from "./promptGeneration.js";
import { generateEditTypesForInsertion } from "./typeGeneration.js";
import { constructNode, fail, type TreeView } from "./utils.js";

interface RetryState {
	readonly errors: {
		readonly error: UsageError;
		readonly toolUse: Anthropic.Beta.BetaToolUseBlock;
	}[];
}

/**
 * @alpha
 */
export type Log = (message: string) => void;

/**
 * @alpha
 */
export class SharedTreeSemanticAgent<TRoot extends ImplicitFieldSchema> {
	public constructor(
		public readonly client: Anthropic,
		public readonly treeView: TreeView<TRoot>,
		public readonly domain?: {
			hints?: string;
			toString?: (root: ReadableField<TRoot>) => string;
		},
	) {}

	async #queryLlm(
		systemPrompt: string,
		tool: Anthropic.Beta.Messages.BetaToolUnion,
		messages: Anthropic.Beta.Messages.BetaMessageParam[] = [],
	): Promise<Anthropic.Beta.Messages.BetaMessage> {
		return this.client.beta.messages.create({
			betas: ["token-efficient-tools-2025-02-19"],
			model: "claude-3-7-sonnet-latest",
			thinking: { type: "enabled", budget_tokens: maxTokens / 2 },
			stream: false,
			max_tokens: maxTokens,
			tools: [tool],
			tool_choice: { type: "auto" },
			messages,
			system: `${systemPrompt} You must use the ${tool.name} tool to respond.`,
		});
	}

	#makeTool(
		name: string,
		description: string,
		wrapper: z.ZodObject<z.ZodRawShape>,
	): Anthropic.Beta.BetaTool {
		return {
			name,
			description,
			input_schema: zodToJsonSchema(wrapper, { name: "foo" }).definitions
				?.foo as Anthropic.Tool.InputSchema,
		};
	}

	public async runCodeFromPrompt(
		prompt: string,
		args?: { validator?: (js: string) => boolean; logger?: Log },
	): Promise<void> {
		const editFunctionName = "editTree";
		const systemPrompt = getFunctioningSystemPrompt(this.treeView, editFunctionName);

		const toolWrapper = z.object({
			functionBody: z
				.string()
				.describe(`The body of the \`${editFunctionName}\` JavaScript function`),
		});
		const tool = this.#makeTool(
			"GenerateTreeEditingCode",
			`A JavaScript function \`${editFunctionName}\` to edit a user's tree`,
			toolWrapper,
		);
		const create: Record<string, (input: InsertableContent) => TreeNode> = {};
		visitObjectNodeSchema(this.treeView.schema, (schema) => {
			const name =
				getFriendlySchemaName(schema.identifier) ??
				fail("Expected friendly name for object node schema");

			create[name] = (input: InsertableContent) => constructNode(schema, input);
		});

		await this.#applyPrompt(
			systemPrompt,
			prompt,
			tool,
			(toolInput, branch, idGenerator2) => {
				const parseResult = toolWrapper.safeParse(toolInput);
				if (!parseResult.success) {
					return parseResult.error.message;
				}

				const functionCode = parseResult.data.functionBody;
				if (args?.validator?.(functionCode) === false) {
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
				const code = `${functionCode}\n\neditTree(params);`;
				// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
				const fn = new Function("params", code) as (p: typeof params) => void;
				fn(params);
				args?.logger?.(`### Applied Edit\n\n`);
				args?.logger?.(`The new state of the tree is:\n\n`);
				args?.logger?.(
					`${
						this.domain?.toString?.(branch.root) ??
						`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
					}\n\n`,
				);
			},
			args?.logger,
		);
	}

	public async applyEditsFromPrompt(prompt: string, logger?: Log): Promise<void> {
		const root = this.treeView.root;
		if (typeof root !== "object" || root === null) {
			throw new UsageError("Primitive root nodes are not yet supported.");
		}
		const simpleSchema = getSimpleSchema(Tree.schema(root));
		const systemPrompt = getEditingSystemPrompt(this.treeView);
		const tool = this.#makeTool(
			"EditJsonTree",
			"An array of edits to a user's SharedTree domain",
			z.object({
				edits: z.array(z.unknown()).describe(`An array of well-formed TreeEdits`),
			}),
		);

		const wrapper = z.object({
			edits: generateEditTypesForInsertion(simpleSchema),
		});

		await this.#applyPrompt(
			systemPrompt,
			prompt,
			tool,
			(toolInput, branch, idGenerator2) => {
				const parseResult = wrapper.safeParse(toolInput);
				if (!parseResult.success) {
					return parseResult.error.message;
				}

				const edits = parseResult.data.edits as TreeEdit[];
				let editIndex = 0;
				while (editIndex < edits.length) {
					const edit = edits[editIndex] ?? fail("Expected edit");
					try {
						applyAgentEdit(simpleSchema, branch, edit, idGenerator2);
					} catch (error: unknown) {
						if (error instanceof UsageError) {
							return `Error when applying edit at index ${editIndex}: ${error.message}`;
						}
						throw error;
					}
					logger?.(`### Applied Edit ${editIndex + 1}\n\n`);
					logger?.(`The new state of the tree is:\n\n`);
					logger?.(
						`${
							this.domain?.toString?.(branch.root) ??
							`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
						}\n\n`,
					);
					editIndex += 1;
				}
			},
			logger,
		);
	}

	async #applyPrompt(
		systemPrompt: string,
		userPrompt: string,
		tool: Anthropic.Beta.Messages.BetaToolUnion,
		parseAndApply: (
			toolInput: unknown,
			branch: TreeViewAlpha<TRoot>,
			idGenerator: IdGenerator,
		) => void | string,
		logger: Log | undefined,
	): Promise<void> {
		const retryState: RetryState = {
			errors: [],
		};

		const initialMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
		if (this.domain?.hints !== undefined) {
			initialMessages.push({
				role: "user",
				content: `Here is some information about the application domain: ${this.domain.hints}`,
			});
		}
		initialMessages.push({ role: "user", content: userPrompt });

		let thinking: Anthropic.Beta.BetaThinkingBlock | undefined;

		logger?.(`# Initial Tree State\n\n`);
		logger?.(
			`${
				this.domain?.toString?.(this.treeView.root) ??
				`\`\`\`JSON\n${JSON.stringify(this.treeView.root, undefined, 2)}\n\`\`\``
			}\n\n`,
		);

		logger?.(`# System Prompt\n\n${systemPrompt}\n\n`);
		logger?.(`# User Prompt\n\n`);
		if (this.domain?.hints === undefined) {
			logger?.(`"${userPrompt}"\n\n`);
		} else {
			logger?.(`## Domain Hints\n\n"${this.domain.hints}"\n\n`);
			logger?.(`## Prompt\n\n"${userPrompt}"\n\n`);
		}
		logger?.(`# Results\n\n`);

		while (retryState.errors.length <= maxErrorRetries) {
			const messages = [...initialMessages];
			for (const retry of retryState.errors) {
				assert(thinking !== undefined, "Thinking block should be defined");
				messages.push(
					{ role: "assistant", content: [thinking, retry.toolUse] },
					{
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: retry.toolUse.id,
								content: `Error: "${retry.error.message}" when attempting to edit tree.`,
							},
						],
					},
				);
			}

			const response = await this.#queryLlm(systemPrompt, tool, messages);

			if (thinking === undefined) {
				thinking =
					response.content.find(
						(c): c is Anthropic.Beta.BetaThinkingBlock => c.type === "thinking",
					) ?? fail("Expected thinking block");

				logger?.(
					`# Chain of Thought\n\n${thinking.type === "thinking" ? thinking.thinking : "-- Redacted by LLM --"}\n\n`,
				);
			}

			const toolUse =
				response.content.find(
					(v): v is Anthropic.Beta.BetaToolUseBlock => v.type === "tool_use",
				) ?? fail("Expected tool use block");

			logger?.(
				`## Result${retryState.errors.length > 0 ? ` Attempt ${retryState.errors.length + 1}` : ""}\n\n\`\`\`JSON\n${JSON.stringify(toolUse.input, undefined, 2)}\n\`\`\`\n\n`,
			);

			const branch = this.treeView.fork();
			const idGenerator2 = new IdGenerator();
			idGenerator2.assignIds(branch.root);

			try {
				const error = parseAndApply(toolUse.input, branch, idGenerator2);
				if (error === undefined) {
					this.treeView.merge(branch);
					return;
				} else {
					logger?.(`### Error Parsing Response from LLM\n\n`);
					logger?.(`\`${error}\`\n\n`);
					logger?.(`LLM will be queried again.\n\n`);
					retryState.errors.push({
						error: new UsageError(error),
						toolUse,
					});
					branch.dispose();
				}
			} catch (error: unknown) {
				logger?.(`### Error When Editing Tree\n\n`);
				logger?.(`\`${(error as Error)?.message}\`\n\n`);
				branch.dispose();
				if (error instanceof UsageError) {
					logger?.(`LLM will be queried again.\n\n`);
					retryState.errors.push({
						error,
						toolUse,
					});
				} else {
					throw error;
				}
			}
		}
	}
}

const maxTokens = 20000; // TODO: Allow caller to provide this
const maxErrorRetries = 3; // TODO: Allow caller to provide this

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
