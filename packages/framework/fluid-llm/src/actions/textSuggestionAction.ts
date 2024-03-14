import type { OpenAI } from "../openAi";

export class TextSuggestionAction {
	public static async execute(openAi: OpenAI, text: string, textContext?: string) {
		const prompt = TextSuggestionAction.buildFunctionPrompt(text, textContext);
		const llmResponse = await openAi.sendCompletionPrompt(
			[{ role: "system", content: prompt.taskDescription }],
			[prompt.functionDescription],
		);
		if (llmResponse.data.choices.length < 1) {
			throw new Error("Unexpected LLM Response: ChatGPT Failed to call expected function");
		} else if (llmResponse?.data.choices[0].finish_reason !== "function_call") {
			throw new Error("Unexpected LLM Response: Completion reason was not 'function_call'");
		}
		const functionCall: TextSuggestionActionResponse =
			llmResponse?.data.choices[0].message.function_call.arguments;
		return functionCall;
	}

	public static buildFunctionPrompt(sourceText: string, textContext?: string) {
		let taskDescription = `Suggest new ideas, fixes and/or modifications for the following text: ${sourceText}`;
		if (textContext) {
			taskDescription = `Suggest new ideas, fixes and/or modifications for the text given the following context about it: ${textContext}: \n\n \`\`\` Text you should give suggestions about ${sourceText} \n\n \`\`\``;
		}
		const functionDescription = {
			name: "give_suggestions",
			description: "Suggest new ideas, fixes and/or modifications for the text",
			parameters: {
				type: "object",
				properties: {
					grammatical_suggestions: {
						type: "array",
						description:
							"An array of grammatical suggestions for the text. Leave empty if there are no issues.",
						items: {
							description:
								"A clearly explained grammatical suggestions for the text.",
							type: "string",
						},
					},
					content_suggestions: {
						type: "array",
						description:
							"An array of suggestions for new content ideas, fixes and/or modification for the text",
						items: {
							description:
								"A suggestion for new content ideas, fixes and/or modification for the text",
							type: "string",
						},
					},
				},
			},
			required: ["grammatical_suggestions, content_suggestions"],
		};
		return {
			taskDescription,
			functionDescription,
		};
	}
}

export interface TextSuggestionActionResponse {
	suggestions: {
		description: string;
	};
}
