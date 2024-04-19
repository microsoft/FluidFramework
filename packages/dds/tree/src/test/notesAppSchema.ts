import { SchemaFactory, treeNodeApi, type TreeNode } from "../simple-tree/index.js";

const schemaFactory = new SchemaFactory("Notes");

export class Note extends schemaFactory.object("Note", {
	width: schemaFactory.number, // AI ignored
	height: schemaFactory.number, // AI ignored
	text: schemaFactory.string,
}) {}

export class Canvas extends schemaFactory.object("Canvas", {
	width: schemaFactory.number, // AI ignored
	height: schemaFactory.number, // AI ignored
	notes: schemaFactory.array(Note),
}) {}

export function getAISummary(canvas: Canvas): string {
	return JSON.stringify(canvas, (key: string | number, value: TreeNode) =>
		(treeNodeApi.schema(value) as any).aiIgnored === true ? undefined : value,
	);
}
