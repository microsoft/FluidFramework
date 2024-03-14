import type { OpenAI } from "../openAi";

export class JsonModificationAction {
	public static async execute<T>(
		openAi: OpenAI,
		jsonSchema: Record<string, any>,
		sourceJson: Record<string, any>,
		modificationTaskDescription: string,
		textContext?: string,
	): Promise<T> {
		const prompt = JsonModificationAction.buildFunctionPrompt(
			jsonSchema,
			sourceJson,
			modificationTaskDescription,
			textContext,
		);
		const llmResponse = await openAi.sendCompletionPrompt(prompt.messages, [
			prompt.functionDescription,
		]);
		console.log(prompt.messages);
		if (llmResponse.data.choices.length < 1) {
			throw new Error("Unexpected LLM Response: ChatGPT Failed to call expected function");
		} else if (llmResponse?.data.choices[0].finish_reason !== "function_call") {
			throw new Error("Unexpected LLM Response: Completion reason was not 'function_call'");
		}
		const functionCall = llmResponse?.data.choices[0].message.function_call.arguments;
		return functionCall;
	}

	public static buildFunctionPrompt(
		jsonSchema: Record<string, any>,
		sourceJson: Record<string, any>,
		userTaskDescription: string,
		jsonContext?: string,
	) {
		let taskDescription = `Given the json schema: \n\n \`\`\` \n ${JSON.stringify(
			jsonSchema,
		)} \n\n \`\`\` \n for this following json object: \n\n \`\`\` \n ${JSON.stringify(
			sourceJson,
		)}\n\n \`\`\` \n\n Modify the json based on the following request: ${userTaskDescription}`;
		// if (jsonContext) {
		// 	taskDescription = `Summarize the text given the following context about it: ${textContext}: \n\n \`\`\` Text to be summarized ${sourceText} \n\n \`\`\``;
		// }
		const functionDescription = {
			name: "modify_json",
			...jsonSchema,
		};

		const messages = [
			{
				role: "user",
				content: taskDescription,
			},
		];

		return {
			messages,
			functionDescription,
		};
	}
}

// export interface JsonModificationActionResponse {
// 	summary: {
// 		description: string;
// 	};
// }
