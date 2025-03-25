/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getSimpleSchema,
	Tree,
	type ImplicitFieldSchema,
	type ReadableField,
} from "@fluidframework/tree/internal";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { getEditingSystemPrompt, getFunctioningSystemPrompt } from "./promptGeneration.js";
import { generateEditTypesForInsertion } from "./typeGeneration.js";
import { fail, type TreeView } from "./utils.js";

interface RetryState {
	readonly thinking:
		| Anthropic.Beta.BetaThinkingBlock
		| Anthropic.Beta.BetaRedactedThinkingBlock;
	readonly errors: {
		readonly error: UsageError;
		readonly editIndex: number;
		readonly toolUse: Anthropic.Beta.BetaToolUseBlock;
	}[];
}

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

	public async applyCodingPrompt(prompt: string): Promise<string | undefined> {
		const idGenerator = new IdGenerator();
		const root = this.treeView.root;
		if (typeof root !== "object" || root === null) {
			throw new UsageError("Primitive root nodes are not yet supported.");
		}
		const editFunctionName = "editTree";
		const systemPrompt = getFunctioningSystemPrompt(
			this.treeView,
			editFunctionName,
			idGenerator,
			this.domain?.hints,
		);

		const toolWrapper = z.object({
			functionBody: z
				.string()
				.describe(`The body of the \`${editFunctionName}\` JavaScript function`),
		});
		const input_schema = zodToJsonSchema(toolWrapper, { name: "foo" }).definitions
			?.foo as Anthropic.Tool.InputSchema;

		let log = "";
		if (this.domain?.toString !== undefined) {
			log += `# Initial Tree State\n\n`;
			log += `${
				this.domain.toString(root) ??
				`\`\`\`JSON\n${JSON.stringify(root, undefined, 2)}\n\`\`\``
			}\n\n`;
		}
		log += `# System Prompt\n\n${systemPrompt}\n\n`;
		log += `# User Prompt\n\n"${prompt}"\n\n`;

		const queryLlm = async (
			messages2: Anthropic.Beta.Messages.BetaMessageParam[],
		): Promise<Anthropic.Beta.Messages.BetaMessage> => {
			const message = await this.client.beta.messages.create({
				betas: ["token-efficient-tools-2025-02-19"],
				model: "claude-3-7-sonnet-latest",
				thinking: { type: "enabled", budget_tokens: maxTokens / 2 },
				stream: false,
				max_tokens: maxTokens,
				tools: [
					{
						name: "GenerateTreeEditingCode",
						description: `A JavaScript function \`${editFunctionName}\` to edit a user's tree`,
						input_schema,
					},
				],
				tool_choice: { type: "auto" },
				messages: messages2,
				system: `${systemPrompt}\n\nYou must use the GenerateTreeEditingCode tool to respond.`,
			});

			return message;
		};

		const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
			{ role: "user", content: prompt },
		];
		let response = await queryLlm(messages);

		const thinking =
			response.content.find(
				(c): c is Anthropic.Beta.BetaThinkingBlock => c.type === "thinking",
			) ?? fail("Expected thinking block");

		log += `# Chain of Thought\n\n${thinking.type === "thinking" ? thinking.thinking : "-- Redacted by LLM --"}\n\n`;

		const retryState: RetryState = {
			thinking,
			errors: [],
		};

		log += `# Results\n\n`;

		while (retryState.errors.length <= maxErrorRetries) {
			const toolUse =
				response.content.find(
					(v): v is Anthropic.Beta.BetaToolUseBlock => v.type === "tool_use",
				) ?? fail("Expected tool use block");

			const branch = this.treeView.fork();
			const idGenerator2 = new IdGenerator();
			idGenerator2.assignIds(branch.root);
			const parse = toolWrapper.safeParse(toolUse.input);
			if (parse.success) {
				log += `## Result${retryState.errors.length > 0 ? ` Attempt ${retryState.errors.length + 1}` : ""}\n\n\`\`\`JavaScript\n${parse.data.functionBody}\n\`\`\`\n\n`;

				const editCode = parse.data.functionBody;
				// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
				const fn = new Function("tree", "idMap", `${editCode}\n\neditTree(tree, idMap);`) as (
					tree: typeof branch,
					idMap: IdGenerator,
				) => void;

				try {
					fn(branch, idGenerator2);
					log += `### Applied Edit\n\n`;
					log += `The new state of the tree is:\n\n`;
					log += `${
						this.domain?.toString?.(branch.root) ??
						`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
					}\n\n`;

					this.treeView.merge(branch);
					return log;
				} catch (error: unknown) {
					log += `### Error Applying Edit\n\n`;
					log += `\`${(error as Error)?.message}\`\n\n`;
					branch.dispose();
					if (error instanceof UsageError) {
						log += `LLM will be queried again.\n\n`;
						retryState.errors.push({
							editIndex: 0,
							error,
							toolUse,
						});
					} else {
						throw error;
					}
				}
			} else {
				log += `### Error Parsing Result\n\n`;
				log += `\`${parse.error.message}\`\n\n`;
				log += `LLM will be queried again.\n\n`;
				retryState.errors.push({
					error: new UsageError(parse.error.message),
					editIndex: -1,
					toolUse,
				});
				branch.dispose();
			}

			const retryMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [...messages];
			for (const retry of retryState.errors) {
				retryMessages.push(
					{ role: "assistant", content: [retryState.thinking, retry.toolUse] },
					{
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: retry.toolUse.id,
								content:
									retry.editIndex >= 0
										? `Error: "${retry.error.message}" when editing tree.`
										: `Error: "${retry.error.message}" when attempting to parse edit code.`,
							},
						],
					},
				);
			}

			response = await queryLlm(retryMessages);
		}

		log += `# Exceeded Maximum Error Count`;
		return log;
	}

	public async applyPrompt(prompt: string): Promise<string | undefined> {
		const idGenerator = new IdGenerator();
		const root = this.treeView.root;
		if (typeof root !== "object" || root === null) {
			throw new UsageError("Primitive root nodes are not yet supported.");
		}
		const simpleSchema = getSimpleSchema(Tree.schema(root));
		const systemPrompt = getEditingSystemPrompt(
			this.treeView,
			idGenerator,
			this.domain?.hints,
		);

		// TODO: use langchain library to get this for free
		// TODO: respect description, tokensUsed, and debugOptions
		const toolWrapper = z.object({
			edits: z.array(z.unknown()).describe(`An array of well-formed TreeEdits`),
		});
		const input_schema = zodToJsonSchema(toolWrapper, { name: "foo" }).definitions
			?.foo as Anthropic.Tool.InputSchema;

		let log = "";
		if (this.domain?.toString !== undefined) {
			log += `# Initial Tree State\n\n`;
			log += `${
				this.domain.toString(root) ??
				`\`\`\`JSON\n${JSON.stringify(root, undefined, 2)}\n\`\`\``
			}\n\n`;
		}
		log += `# System Prompt\n\n${systemPrompt}\n\n`;
		log += `# User Prompt\n\n"${prompt}"\n\n`;

		const queryLlm = async (
			messages2: Anthropic.Beta.Messages.BetaMessageParam[],
		): Promise<Anthropic.Beta.Messages.BetaMessage> => {
			const message = await this.client.beta.messages.create({
				betas: ["token-efficient-tools-2025-02-19"],
				model: "claude-3-7-sonnet-latest",
				thinking: { type: "enabled", budget_tokens: maxTokens / 2 },
				stream: false,
				max_tokens: maxTokens,
				tools: [
					{
						name: "EditJsonTree",
						description: "An array of edits to a user's SharedTree domain",
						input_schema,
					},
				],
				tool_choice: { type: "auto" },
				messages: messages2,
				system: `${systemPrompt} You must use the EditJsonTree tool to respond.`,
			});

			return message;
		};

		const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
			{ role: "user", content: prompt },
		];
		let response = await queryLlm(messages);

		const thinking =
			response.content.find(
				(c): c is Anthropic.Beta.BetaThinkingBlock => c.type === "thinking",
			) ?? fail("Expected thinking block");

		log += `# Chain of Thought\n\n${thinking.type === "thinking" ? thinking.thinking : "-- Redacted by LLM --"}\n\n`;

		const retryState: RetryState = {
			thinking,
			errors: [],
		};

		const wrapper = z.object({
			edits: generateEditTypesForInsertion(simpleSchema),
		});

		log += `# Results\n\n`;

		while (retryState.errors.length <= maxErrorRetries) {
			const toolUse =
				response.content.find(
					(v): v is Anthropic.Beta.BetaToolUseBlock => v.type === "tool_use",
				) ?? fail("Expected tool use block");

			log += `## Result${retryState.errors.length > 0 ? ` Attempt ${retryState.errors.length + 1}` : ""}\n\n\`\`\`JSON\n${JSON.stringify(toolUse.input, undefined, 2)}\n\`\`\`\n\n`;

			const branch = this.treeView.fork();
			const idGenerator2 = new IdGenerator();
			idGenerator2.assignIds(branch.root);
			const parse = wrapper.safeParse(toolUse.input);
			if (parse.success) {
				const edits = parse.data.edits as TreeEdit[];

				let editIndex = 0;
				try {
					while (editIndex < edits.length) {
						const edit = edits[editIndex] ?? fail("Expected edit");
						applyAgentEdit(simpleSchema, branch, edit, idGenerator2);
						log += `### Applied Edit ${editIndex + 1}\n\n`;
						log += `The new state of the tree is:\n\n`;
						log += `${
							this.domain?.toString?.(branch.root) ??
							`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
						}\n\n`;
						editIndex += 1;
					}

					this.treeView.merge(branch);
					return log;
				} catch (error: unknown) {
					log += `### Error Applying Edit ${editIndex + 1}\n\n`;
					log += `\`${(error as Error)?.message}\`\n\n`;
					branch.dispose();
					if (error instanceof UsageError) {
						log += `LLM will be queried again.\n\n`;
						retryState.errors.push({
							editIndex,
							error,
							toolUse,
						});
					} else {
						throw error;
					}
				}
			} else {
				log += `### Error Parsing Result\n\n`;
				log += `\`${parse.error.message}\`\n\n`;
				log += `LLM will be queried again.\n\n`;
				retryState.errors.push({
					error: new UsageError(parse.error.message),
					editIndex: -1,
					toolUse,
				});
				branch.dispose();
			}

			const retryMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [...messages];
			for (const retry of retryState.errors) {
				retryMessages.push(
					{ role: "assistant", content: [retryState.thinking, retry.toolUse] },
					{
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: retry.toolUse.id,
								content:
									retry.editIndex >= 0
										? `Error: "${retry.error.message}" when applying TreeEdit at index ${retry.editIndex}.`
										: `Error: "${retry.error.message}" when attempting to parse edits.`,
							},
						],
					},
				);
			}

			response = await queryLlm(retryMessages);
		}

		log += `# Exceeded Maximum Error Count`;
		return log;
	}
}

const maxTokens = 20000; // TODO: Allow caller to provide this
const maxErrorRetries = 3; // TODO: Allow caller to provide this
