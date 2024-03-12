import { error } from "console";
import type { OpenAI } from "../openAi";

export class SummarizeTextAction {
	public static async execute(openAi: OpenAI, text: string, textContext?: string) {
		const prompt = SummarizeTextAction.buildFunctionPrompt(text, textContext);
		const llmResponse = await openAi.sendCompletionPrompt(prompt.taskDescription, [
			prompt.functionDescription,
		]);
		if (llmResponse.data.choices.length < 1) {
			throw new Error("Unexpected LLM Response: ChatGPT Failed to call expected function");
		} else if (llmResponse?.data.choices[0].finish_reason !== "function_call") {
			throw new Error("Unexpected LLM Response: Completion reason was not 'function_call'");
		}
		const functionCall: SummarizeTextActionFunction =
			llmResponse?.data.choices[0].message.function_call.arguments;
		return functionCall;
	}

	public static buildFunctionPrompt(sourceText: string, textContext?: string) {
		let taskDescription = `Summarize the following text: ${sourceText}`;
		if (textContext) {
			taskDescription = `Summarize the text given the following context about it: ${textContext}: \n\n \`\`\` Text to be summarized ${sourceText} \n\n \`\`\``;
		}
		const functionDescription = {
			name: "summarize_text",
			description: "Summarize the text",
			parameters: {
				type: "object",
				properties: {
					summary: {
						type: "string",
						description: "The summary of the text",
					},
				},
			},
			required: ["summary"],
		};
		return {
			taskDescription,
			functionDescription,
		};
	}
}

export interface SummarizeTextActionFunction {
	summary: {
		description: string;
	};
}
