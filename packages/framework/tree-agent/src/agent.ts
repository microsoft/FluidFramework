/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { unreachableCase } from "@fluidframework/core-utils/internal";
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

const functionName = "editTree";
const paramsName = "params";

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
			tools: [tool, this.#thinkingTool],
			tool_choice: { type: "auto" },
			messages,
			system: systemPrompt,
		});
	}

	public async runCodeFromPrompt(
		prompt: string,
		args?: { validator?: (js: string) => boolean; log?: Log },
	): Promise<void> {
		const editingToolName = "GenerateTreeEditingCode";
		const systemPrompt = getFunctioningSystemPrompt(
			this.treeView,
			editingToolName,
			this.#thinkingTool.name,
			functionName,
		);

		const toolWrapper = z.object({
			functionBody: z
				.string()
				.describe(`The body of the \`${functionName}\` JavaScript function`),
		});
		const tool = this.#makeTool(
			editingToolName,
			`A JavaScript function \`${functionName}\` to edit a user's tree`,
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
				const code = processLlmCode(functionCode);
				args?.log?.(`### Generated Code\n\n\`\`\`js\n${code}\n\`\`\`\n\n`);
				// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
				const fn = new Function(paramsName, code) as (p: typeof params) => void;
				fn(params);
				args?.log?.(`The new state of the tree is:\n\n`);
				args?.log?.(
					`${
						this.domain?.toString?.(branch.root) ??
						`\`\`\`JSON\n${JSON.stringify(branch.root, undefined, 2)}\n\`\`\``
					}\n\n`,
				);
			},
			args?.log,
		);
	}

	public async applyEditsFromPrompt(prompt: string, logger?: Log): Promise<void> {
		const editingToolName = "EditJsonTree";
		const root = this.treeView.root;
		if (typeof root !== "object" || root === null) {
			throw new UsageError("Primitive root nodes are not yet supported.");
		}
		const simpleSchema = getSimpleSchema(Tree.schema(root));
		const systemPrompt = getEditingSystemPrompt(
			this.treeView,
			editingToolName,
			this.#thinkingTool.name,
		);
		const tool = this.#makeTool(
			editingToolName,
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
		log: Log | undefined,
	): Promise<string | undefined> {
		const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
		const hintMessage =
			this.domain?.hints === undefined
				? ""
				: `Here is some information about the application domain: ${this.domain.hints}\n\n`;

		messages.push({
			role: "user",
			content: `${hintMessage}Here is the message from the user: ${userPrompt}`,
		});

		log?.(`# System Prompt\n\n${systemPrompt}\n\n`);
		log?.(`# User Prompt\n\n`);
		if (this.domain?.hints === undefined) {
			log?.(`"${quote(userPrompt)}"\n\n`);
		} else {
			log?.(`## Domain Hints\n\n"${this.domain.hints}"\n\n`);
			log?.(`## Prompt\n\n"${quote(userPrompt)}"\n\n`);
		}

		// TODO change this condition
		let responseMessage: Anthropic.Beta.Messages.BetaMessage;
		do {
			responseMessage = await this.#queryLlm(systemPrompt, tool, messages);
			// We start with one message, and then add two more for each subsequent correspondence
			log?.(`# LLM Response ${Math.ceil(messages.length / 2)}\n\n`);
			for (const block of responseMessage.content) {
				switch (block.type) {
					case "thinking": {
						log?.(`${block.thinking}\n\n`);
						break;
					}
					case "redacted_thinking": {
						log?.(
							`> _The LLM did some thinking, but it was redacted for safety reasons._\n\n`,
						);
						break;
					}
					case "text": {
						log?.(`${quote(block.text)}\n\n`);
						break;
					}
					default: {
						break;
					}
				}
			}
			messages.push({ role: responseMessage.role, content: responseMessage.content });
			const latestBlock = responseMessage.content.at(-1) ?? fail("Expected a message block");
			switch (latestBlock.type) {
				case "text": {
					return latestBlock.text;
				}
				case "thinking":
				case "redacted_thinking": {
					return fail("Expected a thinking block to be followed by a tool use or text block");
				}
				case "tool_use": {
					switch (latestBlock.name) {
						case this.#thinkingTool.name: {
							const parse = thinkingToolSchema.safeParse(latestBlock.input);
							const content = parse.success ? parse.data.thought : parse.error.message;
							messages.push({
								role: "user",
								content: [
									{
										tool_use_id: latestBlock.id,
										type: "tool_result",
										content,
									},
								],
							});
							log?.(`## Thinking Tool Invoked\n\n${content}\n\n`);
							break;
						}
						case "EditJsonTree":
						case "GenerateTreeEditingCode": {
							const branch = this.treeView.fork();
							const idGenerator2 = new IdGenerator();
							idGenerator2.assignIds(branch.root);
							try {
								log?.(`## Editing Tool Invoked\n\n`);
								const parseError = parseAndApply(latestBlock.input, branch, idGenerator2);
								if (parseError === undefined) {
									this.treeView.merge(branch);
									messages.push({
										role: "user",
										content: [
											{
												tool_use_id: latestBlock.id,
												type: "tool_result",
												content: `Successfully applied edits to the tree.`, // TODO: send back the stringified tree here
											},
										],
									});
								} else {
									log?.(`### Error Parsing Response from LLM\n\n\`${parseError}\`\n\n`);
									messages.push({
										role: "user",
										content: [
											{
												tool_use_id: latestBlock.id,
												type: "tool_result",
												content: `Failed to parse response: ${parseError}`,
											},
										],
									});
									branch.dispose();
								}
							} catch (error: unknown) {
								log?.(`### Error When Editing Tree\n\n\`${(error as Error)?.message}\`\n\n`);
								branch.dispose();
								if (error instanceof UsageError) {
									messages.push({
										role: "user",
										content: [
											{
												tool_use_id: latestBlock.id,
												type: "tool_result",
												content: `Error: "${(error as Error)?.message ?? ""}" when attempting to edit tree.`,
											},
										],
									});
								} else {
									throw error;
								}
							}
							break;
						}
						default: {
							messages.push({
								role: "user",
								content: [
									{
										tool_use_id: latestBlock.id,
										type: "tool_result",
										content: `Unrecognized tool: ${latestBlock.name}`,
									},
								],
							});
						}
					}
					break;
				}

				default: {
					return unreachableCase(latestBlock);
				}
			}
		} while (responseMessage.stop_reason === "tool_use" && messages.length < maxMessages + 1);
	}

	#thinkingTool = this.#makeTool(
		"think",
		"Use the tool to think about something. It will not obtain new information or change any data, but just append the thought to the log. Use it when complex reasoning or some cache memory is needed.",
		thinkingToolSchema,
	);

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
}

const thinkingToolSchema = z.object({
	thought: z.string().describe("A thought to think about."),
});
const maxTokens = 20000; // TODO: Allow caller to provide this
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
