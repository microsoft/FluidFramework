/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { float64, utf8 } from "./scalars";

export const enum SchemaKind {
	Float64,
	Object,
    Utf8,
    Array
}

export type TSchema<TDts = unknown, TKind extends SchemaKind = SchemaKind, TId extends string = string> = {
	readonly dts: TDts;
	readonly kind: TKind;
	readonly id: TId;
}

export class Schema<TRoot extends TSchema = TSchema> {
	public readonly idToSchema = new Map<string, TSchema>();
	public root?: TSchema;

	public get number() { return float64; }
    public get string() { return utf8; }

	private register<T extends TSchema>(
		fn: (input: Typed<T>) => Typed<T>,
		attrs: Record<string, any>
	) {
		const schema = Object.assign(fn, attrs) as T;
		this.idToSchema.set(attrs.id, schema);
		return schema;
	}

	public object<T extends TFieldDecls>(id: string, fields: T): TObject<T> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		const fn = (obj: any) => obj;
		
		return this.register(fn, {
			kind: SchemaKind.Object,
			id,
			fields
		});
	}

    public array<T extends TSchema | TDeferredSchema>(type: T): TArray<T extends TDeferredSchema ? ReturnType<T> : T> {
		const fn = (x: any) => [...x];

		return this.register(fn, {
			kind: SchemaKind.Array,
			id: `Fluid:Array<${type.id}>`,
			typeArgs: [type]
		});
    }

	public setRoot<T extends TSchema>(root: T): Schema<T> {
		this.root = root;
		return this;
	}
}

export type Typed<T extends TSchema> = (T)["dts"];

type TDeferredSchema = () => TSchema;

type TFieldDecls = Record<keyof any, TSchema | TDeferredSchema>;

type Evaluate<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

type PropertiesReducer<T extends TFieldDecls, R extends Record<keyof any, unknown>> = Evaluate<{
	[K in keyof T]: R[K]
}>

type PropertiesReduce<T extends TFieldDecls> = PropertiesReducer<T, {
  	[K in keyof T]: T[K] extends TSchema
	  	? Typed<T[K]>
		: T[K] extends TDeferredSchema
			? Typed<ReturnType<T[K]>>
			: never;
}>

type TCtorFn<T extends TSchema> = (data: Typed<T>) => Typed<T>;

interface TObjectSchema<T extends TFieldDecls = TFieldDecls> {
	readonly id: string;
	readonly kind: SchemaKind.Object;
	readonly dts: PropertiesReduce<T>;
	readonly fields: TFieldDecls;
}

export type TObject<T extends TFieldDecls = TFieldDecls> = TCtorFn<TObjectSchema<T>> & TObjectSchema<T>;

export function isObjectSchema(schema: TSchema): schema is TObject {
	return schema.kind === SchemaKind.Object;
}

type TArrayCtorFn<T extends TSchema> = (data: Typed<T>) => Typed<T>;

interface TArraySchema<T extends TSchema> {
	readonly id: string;
	readonly kind: SchemaKind.Array;
	readonly itemType?: TSchema[];
	readonly dts: Typed<T>[];
}

export type TArray<T extends TSchema> = TArrayCtorFn<TArraySchema<T>> & TArraySchema<T>;
