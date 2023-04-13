import { SchemaKind, TSchema } from ".";

export const enum ScalarTypeId {
	Float64 = "Fluid:F64",
	Utf8 = "Fluid:Utf8",
}

function makeScalar<TDts, TKind extends SchemaKind, TId extends ScalarTypeId>(kind: TKind, id: TId): TSchema<TDts, TKind, TId> {
	return { kind, id } as unknown as TSchema<TDts, TKind, TId>
}

export const float64 = makeScalar<number, SchemaKind.Float64, ScalarTypeId.Float64>(SchemaKind.Float64, ScalarTypeId.Float64);
export const utf8 = makeScalar<string, SchemaKind.Utf8, ScalarTypeId.Utf8>(SchemaKind.Utf8, ScalarTypeId.Utf8);
