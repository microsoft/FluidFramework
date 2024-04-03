// Gives an idea of data that might be computed by diffing two schemas.
// This exact diff is not intended to be possible for a particular set of two schemas or a reasonable update scenario.
const foo: NodeIncompatibility[] = [
	{
		identifier: "Point",
		mismatch: "nodeType",
		view: "object",
		stored: "array",
	},
	{
		identifier: "Point",
		mismatch: "fields",
		differences: [
			{
				identifier: "x", // scoped field name derived from the name passed to schema factory builder methods
				mismatch: "allowedTypes",
				view: ["number", "string"],
				stored: ["number"],
			},
			{
				identifier: "x", // scoped field name derived from the name passed to schema factory builder methods
				mismatch: "fieldKind", // Literal
				view: "array",
				stored: "optional",
			},
			{
				identifier: "y", // scoped field name derived from the name passed to schema factory builder methods
				mismatch: "fieldKind", // Literal
				view: undefined,
				stored: "optional",
			},
		],
	},
];

interface AllowedTypeIncompatibility {
	identifier: string;
	mismatch: "allowedTypes";
	/**
	 * List of allowed type identifiers
	 */
	view: string[];
	/**
	 * List of allowed type identifiers
	 */
	stored: string[];
}

type SchemaFactoryFieldKind = "required" | "optional" | "array";

interface FieldKindIncompatibility {
	identifier: string;
	mismatch: "fieldKind";
	// undefined allows representing that the field doesn't exist in either view or stored schema.
	view: SchemaFactoryFieldKind | undefined;
	stored: SchemaFactoryFieldKind | undefined;
}

type FieldIncompatibility = AllowedTypeIncompatibility | FieldKindIncompatibility;

// TODO: I think "leaf" is not necessary here because SchemaFactory doesn't let you create leaf types.
// This should be confirmed.
type SchemaFactoryNodeType = "object" | "array" | "map";

interface NodeTypeIncompatibility {
	identifier: string;
	mismatch: "nodeType";
	view: SchemaFactoryNodeType;
	stored: SchemaFactoryNodeType;
}

interface NodeFieldsIncompatibility {
	identifier: string;
	mismatch: "fields";
	differences: FieldIncompatibility[];
}

export type NodeIncompatibility = NodeTypeIncompatibility | NodeFieldsIncompatibility;
