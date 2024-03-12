import axios, { type AxiosResponse } from "axios";
import "dotenv/config";

export class OpenAI {
	private readonly apiKey: string;

	constructor(apiKey?: string) {
		if (!apiKey) {
			const envApiKey = process.env.OPENAI_API_KEY;
			if (envApiKey === undefined) {
				throw new Error("Could not find Open AI API key for chatGPT LLM.");
			}
			this.apiKey = envApiKey as string;
		} else {
			this.apiKey = apiKey;
		}
	}

	public async sendCompletionPrompt(
		prompt: string,
		functionDefinitions: Record<string, unknown>[],
	) {
		const requestBody = {
			model: "gpt-3.5-turbo",
			messages: [{ role: "user", content: prompt }],
			functions: functionDefinitions,
			max_tokens: 4096,
			n: 1,
			temperature: 0, // Setting this makes chatGPT as deterministic as possible
		};
		const requestMetaData = {
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.apiKey}`,
			},
		};
		let response: AxiosResponse<any>;
		try {
			response = await axios.post(
				"https://api.openai.com/v1/chat/completions",
				requestBody,
				requestMetaData,
			);
		} catch (error) {
			// eventually, attempt to handle different error types.
			throw error;
		}

		this.logTokenMetrics(response);
		return response;
	}

	private logTokenMetrics(chatGPTResponse: AxiosResponse<any>) {
		console.log(`Consumed ${chatGPTResponse.data?.usage?.total_tokens} OpenAi Tokens`);
	}
}
