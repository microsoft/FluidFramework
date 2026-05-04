/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChatMessage } from "@ff-internal/eval-framework";

import { OpenAiJudgeClient } from "../llmClient.js";

const mockCreate = jest.fn().mockResolvedValue({
	choices: [{ message: { content: "Judge response text" } }],
});

jest.mock("openai", () => {
	return {
		__esModule: true,
		AzureOpenAI: jest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	};
});

const mockTokenProvider = jest.fn().mockResolvedValue("mock-token");

describe("OpenAiJudgeClient", () => {
	beforeEach(() => {
		mockCreate.mockClear();
	});

	it("transforms string messages and passes correct deployment to Azure OpenAI", async () => {
		const client = new OpenAiJudgeClient({
			azureADTokenProvider: mockTokenProvider,
			deployment: "gpt-4o-mini",
		});

		const messages: ChatMessage[] = [
			{ role: "system", content: "You are a judge." },
			{ role: "user", content: "Evaluate this output." },
		];

		const response = await client.chatCompletion(messages);

		expect(response).toEqual({ content: "Judge response text" });
		expect(mockCreate).toHaveBeenCalledWith({
			model: "gpt-4o-mini",
			messages: [
				{ role: "system", content: "You are a judge." },
				{ role: "user", content: "Evaluate this output." },
			],
		});
	});

	it("transforms ContentBlock[] with images into OpenAI image_url format", async () => {
		const client = new OpenAiJudgeClient({
			azureADTokenProvider: mockTokenProvider,
			deployment: "gpt-4o-mini",
		});

		const messages: ChatMessage[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Look at this image." },
					{ type: "image", mediaType: "image/png", data: "base64data" },
				],
			},
		];

		await client.chatCompletion(messages);

		expect(mockCreate).toHaveBeenCalledWith({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this image." },
						{ type: "image_url", image_url: { url: "data:image/png;base64,base64data" } },
					],
				},
			],
		});
	});

	it("defaults deployment to gpt-4o-mini when not specified", async () => {
		const client = new OpenAiJudgeClient({ azureADTokenProvider: mockTokenProvider });

		await client.chatCompletion([{ role: "user", content: "test" }]);

		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o-mini" }));
	});
});
