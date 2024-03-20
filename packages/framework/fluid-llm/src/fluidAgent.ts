import type { OpenAI } from "./openAi";

export class FluidAgent {
	private tools: any[];

	constructor(
		private readonly openAi: OpenAI,
		private messageHistory: { role: string; content: string }[] = [],
	) {
		this.messageHistory.unshift({
			role: "system",
			content:
				"You are an assistant that has a few tools you can use to help a user. They may be just looking to chat or they may request something of you that is best completed using one of your tools.",
		});
		this.tools = [
			{
				name: "summarize_text",
				description: "Use the summarize text tool",
				parameters: {
					type: "object",
					properties: {
						invokeTool: {
							description: "Whether to invoke the tool or not",
							type: "string",
							enum: ["true", "false"],
						},
					},
				},
			},
			{
				name: "translate_text",
				description: "Use the translate text tool",
				parameters: {
					type: "object",
					properties: {
						invokeTool: {
							description: "Whether to invoke the tool or not",
							type: "string",
							enum: ["true", "false"],
						},
					},
				},
			},
			{
				name: "modify_app",
				description: "Use the app modification tool",
				parameters: {
					type: "object",
					properties: {
						invokeTool: {
							description: "Whether to invoke the tool or not",
							type: "string",
							enum: ["true", "false"],
						},
					},
				},
			},
		];
	}

	public async userChat(message: string) {
		const newMessageHistory = [...this.messageHistory, { role: "user", content: message }];
		let response;
		try {
			response = await this.openAi.sendCompletionPrompt(newMessageHistory, this.tools);
			this.messageHistory = newMessageHistory;
		} catch (error) {
			console.log(error);
			throw error;
		}

		return response;
	}
}
