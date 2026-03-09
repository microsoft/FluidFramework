/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { TreeAgentChatMessage } from "@fluidframework/tree-agent/alpha";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import-x/no-internal-modules
import { AIMessage } from "@langchain/core/messages"; // eslint-disable-line import-x/no-internal-modules
import type { BaseMessage } from "@langchain/core/messages"; // eslint-disable-line import-x/no-internal-modules

import { createLangchainChatModel } from "../chatModel.js";

/**
 * Creates a mock BaseChatModel that captures the messages it receives and returns a canned AIMessage.
 */
function createMockBaseChatModel(aiResponse: AIMessage): {
	model: BaseChatModel;
	capturedMessages: () => BaseMessage[];
} {
	let captured: BaseMessage[] = [];
	const model = {
		metadata: { modelName: "mock" },
		bindTools(_tools: unknown[], _options: unknown) {
			return {
				async invoke(messages: BaseMessage[]): Promise<AIMessage> {
					captured = [...messages];
					return aiResponse;
				},
			};
		},
	} as unknown as BaseChatModel;
	return { model, capturedMessages: () => captured };
}

/**
 * Helper to invoke a chat model, asserting that invoke is defined.
 */
async function invokeModel(
	chatModel: ReturnType<typeof createLangchainChatModel>,
	history: readonly TreeAgentChatMessage[],
): ReturnType<NonNullable<ReturnType<typeof createLangchainChatModel>["invoke"]>> {
	assert.ok(chatModel.invoke !== undefined, "Expected invoke to be defined");
	return chatModel.invoke(history);
}

describe("LangchainChatModel", () => {
	describe("tool call round-trip", () => {
		it("preserves tool call args and id through invoke and back via convertToLangchainMessages", async () => {
			const toolCallId = "call_abc123";
			const toolName = "GenerateTreeEditingCode";
			const args = { js: 'context.root = "hello";' };

			// Mock LLM returns a tool call
			const aiResponse = new AIMessage({
				content: "",
				tool_calls: [{ id: toolCallId, name: toolName, args }],
			});
			const { model } = createMockBaseChatModel(aiResponse);
			const chatModel = createLangchainChatModel(model);

			// First invoke: get the tool response
			const response = await invokeModel(chatModel, [
				{ role: "system", content: "You are an assistant." },
				{ role: "user", content: "Edit the tree" },
			]);

			assert.equal(response.type, "tool");
			assert.ok(response.type === "tool");
			assert.equal(response.toolCallId, toolCallId);
			assert.equal(response.toolName, toolName);
			assert.deepEqual(response.toolArgs, args);

			// Now build a history that includes the tool call and a tool result,
			// then invoke again. This tests convertToLangchainMessages round-trip.
			const history: TreeAgentChatMessage[] = [
				{ role: "system", content: "You are an assistant." },
				{ role: "user", content: "Edit the tree" },
				{ role: "tool_call", toolCallId, toolName, toolArgs: args },
				{ role: "tool_result", toolCallId, content: "Edit applied successfully." },
			];

			// Mock LLM returns a done response this time
			const doneResponse = new AIMessage({ content: "All done!" });
			const { model: model2, capturedMessages: capturedMessages2 } =
				createMockBaseChatModel(doneResponse);
			const chatModel2 = createLangchainChatModel(model2);
			await invokeModel(chatModel2, history);

			// Verify the LangChain messages received by the mock contain correct tool_call and tool_result
			const msgs = capturedMessages2();
			assert.equal(msgs.length, 4); // system, user, AI (tool_call), ToolMessage

			// The AI message should have tool_calls with the original args
			const aiMsg = msgs[2];
			assert.ok(aiMsg !== undefined);
			assert.ok("tool_calls" in aiMsg && Array.isArray(aiMsg.tool_calls));
			assert.equal(aiMsg.tool_calls.length, 1);
			const firstToolCall = aiMsg.tool_calls[0];
			assert.ok(firstToolCall !== undefined);
			assert.equal(firstToolCall.id, toolCallId);
			assert.equal(firstToolCall.name, toolName);
			assert.deepEqual(firstToolCall.args, args);

			// The ToolMessage should have the correct tool_call_id
			const toolMsg = msgs[3];
			assert.ok(toolMsg !== undefined);
			assert.ok("tool_call_id" in toolMsg);
			assert.equal(toolMsg.tool_call_id, toolCallId);
		});

		it("handles undefined toolCallId", async () => {
			const toolName = "GenerateTreeEditingCode";
			const args = { code: 'context.root = "test";' };

			// Mock LLM returns a tool call without an id
			const aiResponse = new AIMessage({
				content: "",
				tool_calls: [{ id: undefined, name: toolName, args }],
			});
			const { model } = createMockBaseChatModel(aiResponse);
			const chatModel = createLangchainChatModel(model);

			const response = await invokeModel(chatModel, [{ role: "user", content: "Edit" }]);

			assert.ok(response.type === "tool");
			assert.equal(response.toolCallId, undefined);
			assert.equal(response.toolName, toolName);
			assert.deepEqual(response.toolArgs, args);

			// Round-trip: include it in history and verify convertToLangchainMessages handles it
			const history: TreeAgentChatMessage[] = [
				{ role: "user", content: "Edit" },
				{ role: "tool_call", toolName, toolArgs: args },
				{ role: "tool_result", content: "Done." },
			];

			const doneResponse = new AIMessage({ content: "OK" });
			const { model: model2, capturedMessages: capturedMessages2 } =
				createMockBaseChatModel(doneResponse);
			const chatModel2 = createLangchainChatModel(model2);
			await invokeModel(chatModel2, history);

			const msgs = capturedMessages2();
			assert.equal(msgs.length, 3); // user, AI (tool_call), ToolMessage

			// AI message tool_calls should have undefined id
			const aiMsg = msgs[1];
			assert.ok(aiMsg !== undefined && "tool_calls" in aiMsg);
			const toolCalls = aiMsg.tool_calls;
			assert.ok(Array.isArray(toolCalls) && toolCalls.length > 0);
			const firstCall = toolCalls[0];
			assert.ok(firstCall !== undefined);
			assert.equal(firstCall.id, undefined);

			// ToolMessage should have empty string for tool_call_id (LangChain requires it)
			const toolMsg = msgs[2];
			assert.ok(toolMsg !== undefined && "tool_call_id" in toolMsg);
			assert.equal(toolMsg.tool_call_id, "");
		});

		it("preserves different arg key names from LLM", async () => {
			const toolName = "GenerateTreeEditingCode";
			// LLM might use "input" instead of "js"
			const args = { input: 'context.root = "via input key";' };

			const aiResponse = new AIMessage({
				content: "",
				tool_calls: [{ id: "c1", name: toolName, args }],
			});
			const { model } = createMockBaseChatModel(aiResponse);
			const chatModel = createLangchainChatModel(model);

			const response = await invokeModel(chatModel, [{ role: "user", content: "Edit" }]);

			assert.ok(response.type === "tool");
			// The chatModel should NOT rewrite the key — it should pass through as-is
			assert.deepEqual(response.toolArgs, { input: 'context.root = "via input key";' });
		});
	});
});
