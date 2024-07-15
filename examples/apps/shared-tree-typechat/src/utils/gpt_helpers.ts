/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { createAzureOpenAILanguageModel, createJsonTranslator } from "typechat";
import { Session } from "../schema/app_schema.js";

const generatedSchema = `
interface GeneratedSessions {
	sessions: GeneratedSession[];
}
interface GeneratedSession {
	title: string;
	abstract: string;
	sessionType: "session" | "workshop" | "panel" | "keynote";
}
`;

interface GeneratedSessions {
	sessions: GeneratedSession[];
}

const sessionTypes = ["session", "workshop", "panel", "keynote"] as const;
interface GeneratedSession {
	title: string;
	abstract: string;
	sessionType: (typeof sessionTypes)[number];
}

function isGeneratedSessions(value: object): value is GeneratedSessions {
	const sessions = value as Partial<GeneratedSessions>;
	if (!Array.isArray(sessions.sessions)) {
		return false;
	}

	for (const session of sessions.sessions) {
		if (!isGeneratedSession(session)) {
			return false;
		}
	}

	return true;
}

function isGeneratedSession(value: object): value is GeneratedSession {
	const session = value as Partial<GeneratedSession>;
	return (
		typeof session.title === "string" &&
		typeof session.abstract === "string" &&
		sessionTypes.find((s) => s === session.sessionType) !== undefined
	);
}

const sessionSystemPrompt = `You are a service named Copilot that takes a user prompt and generates session topics for a "speaking event" scheduling application.
The "sessionType" is a string that indicates the type of the session. It can be one of 'session', 'keynote', 'panel', or 'workshop'.
For example, if a user asks for three lectures about green energy, you might output:
{
	"title": "Wind Power",
	"abstract": "Dr. Alexander Pardes provides an analysis of the latest wind turbine designs and how they've improved upon existing technologies.",
	"sessionType": "session"
},
{
	"title": "Solar Complacency",
	"abstract": "Recent trends in solar panel efficiency point to a future of diminishing returns. How can we encourage new ideas in a competitive engineering space?",
	"sessionType": "session"
},
{
	"title": "Exploring Deeper: Geothermal Energy with a Twist",
	"abstract": "Several leading scientists discuss how we can tap the pressure differentials in the earth's crust to generate 'friction-energy', a technique that has only recently moved beyond pure theoretical speculation.",
	"sessionType": "session"
}


Or, another example, if a user asks for two lectures about raccoons where one is a keynote, you might output:
{
	"title": "Furry Friends or Furious Foes?",
	"abstract": "Raccoon banditry is on the rise and homeowners aren't happy. However, with a few adjustments to our behavior, we can make a welcoming space for these critters rather than being their enemy.",
	"sessionType": "keynote"
},
{
	"title": "Recent Developments in Raccoon Chew-Toys",
	"abstract": "Thanks to their opposable thumbs, raccoons are capable of enjoying chew toys that are significantly more complex than those made for cats and docs. We'll discuss how and why raccoons need more interesting toy designs, and what that means for current trends in chew toy manufacturing.",
	"sessionType": "session"
}
`;

export function createSessionPrompter(): (
	prompt: string,
) => Promise<Iterable<Session> | undefined> {
	const endpoint =
		process.env.AZURE_OPENAI_ENDPOINT ?? localStorage.getItem("AZURE_OPENAI_ENDPOINT");

	if (endpoint === undefined || endpoint === null) {
		throw Error(
			"Expected AZURE_OPENAI_ENDPOINT to be set in environment variables or local storage",
		);
	}
	const apiKey = process.env.AZURE_OPENAI_API_KEY ?? localStorage.getItem("AZURE_OPENAI_API_KEY");

	if (apiKey === undefined || apiKey === null) {
		throw Error(
			"Expected AZURE_OPENAI_API_KEY to be set in environment variables or local storage",
		);
	}

	const model = createAzureOpenAILanguageModel(apiKey, endpoint);
	const translator = createJsonTranslator<GeneratedSessions>(model, {
		getTypeName: () => "GeneratedSessions",
		getSchemaText: () => generatedSchema,
		validate(jsonObject: object) {
			if (isGeneratedSessions(jsonObject)) {
				return {
					success: true,
					data: jsonObject,
				};
			}

			return {
				success: false,
				message: "Malformed generated sessions",
			};
		},
	});

	return async (prompt) => {
		try {
			const result = await translator.translate(prompt, sessionSystemPrompt);
			if (!result.success) {
				throw new Error("AI did not return result");
			}
			const sessions: Session[] = result.data.sessions.map((l) => {
				const currentTime = new Date().getTime();
				return new Session({
					title: l.title,
					abstract: l.abstract,
					created: currentTime,
					sessionType: l.sessionType,
					lastChanged: currentTime,
					id: uuid(),
				});
			});
			return sessions;
		} catch (e) {
			return undefined;
		}
	};
}
