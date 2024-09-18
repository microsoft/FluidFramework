import { strict as assert } from "assert";

// eslint-disable-next-line import/no-internal-modules
import { createResponseHandler, JsonHandler as jh } from "../../json-handler/jsonHandler.js";
// eslint-disable-next-line import/no-internal-modules
import type { JsonObject } from "../../json-handler/jsonParser.js";

const exampleGeneratedEdit = jh.array(() => ({
	items: jh.anyOf([setRoot(), insert(), modify(), remove(), move()]),
}));

const agentSchema_vector = jh.object(() => ({
	properties: {
		x: jh.number(),
		y: jh.number(),
		z: jh.optional(jh.number()),
	},
}));

const agentSchema_rootObject = jh.object(() => ({
	properties: {
		str: jh.string(),
		vectors: jh.array(() => ({ items: agentSchema_vector(() => {}) }))(),
		booleans: jh.array(() => ({ items: jh.boolean() }))(),
	},
}));

interface Target {
	objectId: number;
}

const target = jh.object(() => ({
	properties: {
		objectId: jh.number(),
	},
}));

interface Place {
	objectId: number;
	place: "before" | "after";
}

const place = jh.object(() => ({
	properties: {
		objectId: jh.number(),
		place: jh.enum({ values: ["before", "after"] }),
	},
}));

interface Range {
	from: Place;
	to: Place;
}

const range = jh.object(() => ({
	properties: {
		from: place(),
		to: place(),
	},
}));

const setRoot = jh.object(() => ({
	properties: {
		type: jh.enum({ values: ["setRoot"] }),
		content: jh.anyOf([jh.number(), agentSchema_rootObject()]),
	},
	complete: (result: JsonObject) => {
		const setRootOp = result as unknown as { content: number | object };
		console.log(`---> set root to ${JSON.stringify(setRootOp.content)}`);
	},
}));

const insert = jh.object(() => ({
	properties: {
		type: jh.enum({ values: ["insert"] }),
		content: agentSchema_vector(),
		destination: place(),
	},
	complete: (result: JsonObject) => {
		const { content, destination } = result as unknown as {
			content: object;
			destination: Place;
		};
		console.log(`---> insert ${JSON.stringify(content)} into ${JSON.stringify(destination)}`);
	},
}));

const modify = jh.object(() => ({
	properties: {
		type: jh.enum({ values: ["modify"] }),
		target: target(),
		field: jh.enum({ values: ["x", "y", "z", "str", "vectors", "booleans"] }),
		modification: jh.anyOf([
			jh.number(),
			jh.null(),
			jh.string(),
			jh.array(() => ({ items: agentSchema_vector() }))(),
			jh.array(() => ({ items: jh.boolean() }))(),
		]),
	},
	complete: (result: JsonObject) => {
		const modifyOp = result as unknown as {
			target: Target;
			field: string;
			modification: number | null | string | object[] | boolean[];
		};
		console.log(
			`---> modify ${modifyOp.target.objectId}.${modifyOp.field} to ${JSON.stringify(modifyOp.modification)}`,
		);
	},
}));

const move = jh.object(() => ({
	properties: {
		type: jh.enum({ values: ["move"] }),
		source: range(),
		destination: place(),
	},
	complete: (result: JsonObject) => {
		const moveOp = result as unknown as { source: Range; destination: Place };
		console.log(
			`---> move from ${JSON.stringify(moveOp.source)} to ${JSON.stringify(moveOp.destination)}`,
		);
	},
}));

const remove = jh.object(() => ({
	properties: {
		type: jh.enum({ values: ["remove"] }),
		source: range(),
	},
	complete: (result: JsonObject) => {
		const removeOp = result as unknown as { source: Range };
		console.log(`---> remove ${JSON.stringify(removeOp.source)}`);
	},
}));

const sampleOps = [
	{
		type: "setRoot",
		content: 42,
	},
	{
		type: "setRoot",
		content: {
			str: "rootString",
			vectors: [
				{ x: 1, y: 2, z: 3 },
				{ x: 4, y: 5, z: 6 },
			],
			booleans: [true, false, true],
		},
	},
	{
		type: "insert",
		content: { x: 7, y: 8, z: 9 },
		destination: { objectId: 1, place: "after" },
	},
	{
		type: "modify",
		target: { objectId: 1 },
		field: "str",
		modification: "modifiedString",
	},
	{
		type: "modify",
		target: { objectId: 2 },
		field: "x",
		modification: 42,
	},
	{
		type: "modify",
		target: { objectId: 3 },
		field: "z",
		modification: null,
	},
	{
		type: "modify",
		target: { objectId: 4 },
		field: "vectors",
		modification: [
			{ x: 6, y: 5, z: 4 },
			{ x: 3, y: 2, z: null },
		],
	},
	{
        type: 'modify',
        target: { objectId: 4 },
        field: 'booleans',
        modification: [false, false, true, true],
    },
	{
		type: "remove",
		source: {
			from: { objectId: 1, place: "before" },
			to: { objectId: 2, place: "after" },
		},
	},
	{
		type: "move",
		source: {
			from: { objectId: 1, place: "before" },
			to: { objectId: 2, place: "after" },
		},
		destination: { objectId: 3, place: "before" },
	},
];

const opText = JSON.stringify(sampleOps);

const testHandler = (chunkSize: number) => {
	const testResponseHandler = createResponseHandler(
		exampleGeneratedEdit(),
		new AbortController(),
	);
	console.log(`Breaking json into ${chunkSize}-character chunks`);
	for (let i = 0; i < opText.length; i += chunkSize) {
		const chunk = opText.slice(i, i + chunkSize);
		console.log(chunk);
		testResponseHandler.processChars(chunk);
	}
	testResponseHandler.complete();
};

describe("JsonHandler", () => {
	it("Test", async () => {
		testHandler(33);
		assert(true);
	});
});
