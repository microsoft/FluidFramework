import { ISharedTreeView, FieldKey, singleJsonCursor } from "@fluid-internal/tree";
import { Schema } from "../schema";
import { moveToDetachedField } from "@fluid-internal/tree/dist/core";

class ApiContext<T> {
	constructor (
		private readonly view: ISharedTreeView,
		private readonly schema: Schema
	) {
		if (this.schema === undefined) throw new Error();

		const forest = this.view.forest;
		const cursor = forest.allocateCursor();
		const editor = this.view.editor;

		moveToDetachedField(forest, cursor);
		
		editor.valueField(cursor.getPath(), "bool" as FieldKey).set(singleJsonCursor(true));
	}
}

export function api<T>(view: ISharedTreeView, schema: Schema) {
	return new ApiContext<T>(view, schema);
}