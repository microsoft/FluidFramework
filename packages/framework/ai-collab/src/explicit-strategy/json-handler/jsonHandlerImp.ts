/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { assert } from "./debug.js";
import {
	type JsonArray,
	type JsonBuilder,
	type JsonBuilderContext,
	type JsonObject,
	type JsonPrimitive,
	type JsonValue,
	type StreamedJsonParser,
	contextIsObject,
	createStreamedJsonParser,
} from "./jsonParser.js";

type StreamedTypeGetter = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getInput?: (partial: PartialArg) => any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => StreamedObject<any> | StreamedArray<any>;
type StreamedTypeIdentity = StreamedType | StreamedTypeGetter;
type DefinitionMap = Map<StreamedTypeIdentity, string>;

class ResponseHandlerImpl {
	public constructor(
		private readonly streamedType: StreamedType,
		abortController: AbortController,
	) {
		if (streamedType instanceof StreamedAnyOf) {
			throw new TypeError("anyOf cannot be used as root type");
		}

		if (
			streamedType instanceof StreamedStringProperty ||
			streamedType instanceof StreamedString
		) {
			throw new TypeError(
				"StreamedStringProperty and StreamedString cannot be used as root type",
			);
		}

		const streamedValueHandler = (
			streamedType as InvocableStreamedType<StreamedValueHandler>
		).invoke(
			undefined,
			streamedType instanceof StreamedObject
				? {}
				: streamedType instanceof StreamedArray
					? []
					: undefined,
		);
		const builder = new BuilderDispatcher(streamedValueHandler);
		this.parser = createStreamedJsonParser(builder, abortController);
	}

	public jsonSchema(): JsonObject {
		const definitions = new Map<StreamedTypeIdentity, string>();
		const visited = new Set<StreamedTypeIdentity>();

		findDefinitions(this.streamedType, visited, definitions);

		const rootIdentity = (
			this.streamedType as InvocableStreamedType<StreamedValueHandler>
		).getIdentity();

		// Don't call jsonSchemaFromStreamedType, as we must force the method call on the root
		const schema = (
			this.streamedType as InvocableStreamedType<StreamedValueHandler>
		).jsonSchema(rootIdentity, definitions);

		definitions.forEach((definitionName, streamedTypeOrGetter) => {
			if (streamedTypeOrGetter !== rootIdentity) {
				schema.$defs ??= {};

				const streamedType =
					streamedTypeOrGetter instanceof Function
						? streamedTypeOrGetter(() => guaranteedErrorObject) // No-one will call this, but this return value emphasizes this point
						: streamedTypeOrGetter;

				// Again, don't call jsonSchemaFromStreamedType, as we must force the method call on each definition root
				(schema.$defs as JsonObject)[definitionName] = (
					streamedType as InvocableStreamedType<StreamedValueHandler>
				).jsonSchema(this.streamedType, definitions);
			}
		});

		return schema;
	}

	public async processResponse(responseGenerator: {
		[Symbol.asyncIterator](): AsyncGenerator<string, void>;
	}): Promise<void> {
		for await (const fragment of responseGenerator) {
			this.processChars(fragment);
		}
		this.complete();
	}

	public processChars(chars: string): void {
		this.parser.addChars(chars);
	}

	public complete(): void {
		// Send one more whitespace token, just to ensure the parser knows we're finished
		// (this is necessary for the case of a schema comprising a single number)
		this.parser.addChars("\n");
	}

	private readonly parser: StreamedJsonParser;
}

// The one createResponseHandlerImpl
const createResponseHandlerImpl = (
	streamedType: StreamedType,
	abortController: AbortController,
): ResponseHandlerImpl => {
	return new ResponseHandlerImpl(streamedType, abortController);
};

/**
 * TBD
 */
export const getCreateResponseHandler: () => (
	streamedType: StreamedType,
	abortController: AbortController,
) => ResponseHandlerImpl = () => createResponseHandlerImpl;

/**
 * TBD
 */
export class StreamedType {
	private readonly _brand = Symbol();
}

class JsonHandlerImpl {
	public object<Input>(
		getDescriptor: (input: Input) => StreamedObjectDescriptor,
	): (getInput?: (partial: PartialArg) => Input) => StreamedType {
		// The function created here serves as the identity of this type's schema,
		// since the schema is independent of the input passed to the handler
		return function getStreamedObject(
			getInput?: (partial: PartialArg) => Input,
		): StreamedObject<Input> {
			return new StreamedObject(getDescriptor, getStreamedObject, getInput);
		};
	}

	public array<Input>(
		getDescriptor: (input: Input) => StreamedArrayDescriptor,
	): (getInput?: (partial: PartialArg) => Input) => StreamedType {
		// The function created here serves as the identity of this type's schema,
		// since the schema is independent of the input passed to the handler
		return function getStreamedArray(
			getInput?: (partial: PartialArg) => Input,
		): StreamedArray<Input> {
			return new StreamedArray(getDescriptor, getStreamedArray, getInput);
		};
	}

	public streamedStringProperty<
		T extends Record<P, string | undefined>,
		P extends keyof T,
	>(args: {
		description?: string;
		target: (partial: PartialArg) => T;
		key: P;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType {
		return new StreamedStringProperty(args);
	}

	public streamedString<Parent extends object>(args: {
		description?: string;
		target: (partial: PartialArg) => Parent;
		append: (chars: string, parent: Parent) => void;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType {
		return new StreamedString(args);
	}

	public string(args?: {
		description?: string;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType {
		return new AtomicString(args);
	}

	public enum(args: {
		description?: string;
		values: string[];
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType {
		return new AtomicEnum(args);
	}

	public number(args?: {
		description?: string;
		complete?: (value: number, partial: PartialArg) => void;
	}): StreamedType {
		return new AtomicNumber(args);
	}

	public boolean(args?: {
		description?: string;
		complete?: (value: boolean, partial: PartialArg) => void;
	}): StreamedType {
		return new AtomicBoolean(args);
	}

	public null(args?: {
		description?: string;
		// eslint-disable-next-line @rushstack/no-new-null
		complete?: (value: null, partial: PartialArg) => void;
	}): StreamedType {
		return new AtomicNull(args);
	}

	public optional(streamedType: StreamedType): StreamedType {
		if (streamedType instanceof AtomicNull) {
			throw new TypeError("Cannot have an optional null value");
		}
		return new StreamedOptional(streamedType as InvocableStreamedType<StreamedValueHandler>);
	}

	public anyOf(streamedTypes: StreamedType[]): StreamedType {
		return new StreamedAnyOf(streamedTypes as InvocableStreamedType<StreamedValueHandler>[]);
	}
}

// The one JsonHandler
const jsonHandler = new JsonHandlerImpl();

/**
 * TBD
 */
export const getJsonHandler: () => JsonHandlerImpl = () => jsonHandler;

/**
 * TBD
 * @remarks - TODO: Can perhaps not export these after illustrateInteraction re-implemented (and remove all the ?s and !s)
 */
export interface StreamedObjectHandler {
	addObject(key: string): StreamedObjectHandler;
	addArray(key: string): StreamedArrayHandler;
	addPrimitive(value: JsonPrimitive, key: string): void;
	appendText(chars: string, key: string): void;
	completeProperty(key: string): void;
	complete(): void;
}

/**
 * TBD
 */
export interface StreamedArrayHandler {
	addObject(): StreamedObjectHandler;
	addArray(): StreamedArrayHandler;
	addPrimitive(value: JsonPrimitive): void;
	appendText(chars: string): void;
	completeLast(): void;
	complete(): void;
}

type BuilderContext = JsonBuilderContext<StreamedObjectHandler, StreamedArrayHandler>;

class BuilderDispatcher implements JsonBuilder<StreamedObjectHandler, StreamedArrayHandler> {
	public constructor(private readonly rootHandler: StreamedValueHandler) {}

	public addObject(context?: BuilderContext): StreamedObjectHandler {
		if (!context) {
			// TODO: This error-handling, which really shouldn't be necessary in principle with Structured Outputs,
			//       is arguably "inside-out", i.e. it should report the expected type of the result, rather than
			//       the handler.
			if (!(this.rootHandler instanceof StreamedObjectHandlerImpl)) {
				throw new TypeError(`Expected object for root`);
			}
			return this.rootHandler;
		} else if (contextIsObject(context)) {
			return context.parentObject.addObject(context.key);
		} else {
			return context.parentArray.addObject();
		}
	}

	public addArray(context?: BuilderContext): StreamedArrayHandler {
		if (!context) {
			if (!(this.rootHandler instanceof StreamedArrayHandlerImpl)) {
				throw new TypeError(`Expected array for root`);
			}
			return this.rootHandler;
		} else if (contextIsObject(context)) {
			return context.parentObject.addArray(context.key);
		} else {
			return context.parentArray.addArray();
		}
	}

	public addPrimitive(value: JsonPrimitive, context?: BuilderContext): void {
		if (!context) {
			if (value === null) {
				if (!(this.rootHandler instanceof AtomicNullHandlerImpl)) {
					throw new TypeError(`Expected null for root`);
				}
				this.rootHandler.complete(value, undefined);
			} else {
				switch (typeof value) {
					case "string": {
						if (
							!(
								this.rootHandler instanceof AtomicStringHandlerImpl ||
								this.rootHandler instanceof AtomicEnumHandlerImpl
							)
						) {
							throw new TypeError(`Expected string or enum for root`);
						}
						this.rootHandler.complete(value, undefined);
						break;
					}
					case "number": {
						if (!(this.rootHandler instanceof AtomicNumberHandlerImpl)) {
							throw new TypeError(`Expected number for root`);
						}
						this.rootHandler.complete(value, undefined);
						break;
					}
					case "boolean": {
						if (!(this.rootHandler instanceof AtomicBooleanHandlerImpl)) {
							throw new TypeError(`Expected boolean for root`);
						}
						this.rootHandler.complete(value, undefined);
						break;
					}

					default: {
						break;
					}
				}
			}
		} else if (contextIsObject(context)) {
			context.parentObject.addPrimitive(value, context.key);
		} else {
			context.parentArray.addPrimitive(value);
		}
	}

	public appendText(chars: string, context?: BuilderContext): void {
		assert(context !== undefined);
		if (contextIsObject(context)) {
			context.parentObject.appendText(chars, context.key);
		} else {
			context!.parentArray.appendText(chars);
		}
	}

	public completeContext(context?: BuilderContext): void {
		if (context !== undefined) {
			if (contextIsObject(context)) {
				context.parentObject.completeProperty?.(context.key);
			} else {
				context.parentArray.completeLast?.();
			}
		}
	}

	public completeContainer(container: StreamedObjectHandler | StreamedArrayHandler): void {
		container.complete?.();
	}
}

/**
 * TBD
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartialArg = any; // Would be PartialObject | PartialArray | undefined, but doesn't work for function arguments

type PartialObject = JsonObject;

// TODO: May be better to distinguish between streamed object properties and array elements (because strings)
type StreamedValueHandler =
	| StreamedObjectHandler
	| StreamedArrayHandler
	| StreamedStringPropertyHandler
	| StreamedStringHandler
	| AtomicStringHandler
	| AtomicEnumHandler
	| AtomicNumberHandler
	| AtomicBooleanHandler
	| AtomicNullHandler
	| AtomicPrimitiveHandler<PrimitiveType>; // Needed so AtomicPrimitive<T extends PrimitiveType> can implement StreamedType<AtomicPrimitiveHandler<T>>

abstract class SchemaGeneratingStreamedType extends StreamedType {
	public getIdentity(): StreamedTypeIdentity {
		return this;
	}
	public abstract findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void;
	public abstract jsonSchema(
		root: StreamedTypeIdentity,
		definitions: DefinitionMap,
	): JsonObject;
}

abstract class InvocableStreamedType<
	T extends StreamedValueHandler | undefined,
> extends SchemaGeneratingStreamedType {
	public abstract invoke(parentPartial: PartialArg, partial: PartialArg): T;
}

// eslint-disable-next-line @rushstack/no-new-null
type FieldHandlers = Record<string, StreamedValueHandler | null>;

const findDefinitions = (
	streamedType: StreamedType,
	visited: Set<StreamedTypeIdentity>,
	definitions: DefinitionMap,
): void =>
	(streamedType as InvocableStreamedType<StreamedValueHandler>).findDefinitions(
		visited,
		definitions,
	);

const addDefinition = (
	streamedType: StreamedTypeIdentity,
	definitions: DefinitionMap,
): void => {
	if (!definitions.has(streamedType)) {
		definitions.set(streamedType, `d${definitions.size.toString()}`);
	}
};

const jsonSchemaFromStreamedType = (
	streamedType: StreamedType,
	root: StreamedTypeIdentity,
	definitions: DefinitionMap,
): JsonObject => {
	const identity = (streamedType as InvocableStreamedType<StreamedValueHandler>).getIdentity();

	if (root === identity) {
		return { $ref: "#" };
	} else if (definitions.has(identity)) {
		return { $ref: `#/$defs/${definitions.get(identity)}` };
	} else {
		return (streamedType as InvocableStreamedType<StreamedValueHandler>).jsonSchema(
			root,
			definitions,
		);
	}
};

const guaranteedErrorHandler = {
	get<T>(target: T, prop: string) {
		throw new Error(`Attempted to access property "${prop}" outside a handler body.`);
	},
	set<T, V>(target: T, prop: string, value: V) {
		throw new Error(
			`Attempted to set property "${prop}" to "${value}" outside a handler body.`,
		);
	},
	has<T>(target: T, prop: string) {
		throw new Error(
			`Attempted to check existence of property "${prop}" outside a handler body.`,
		);
	},
	deleteProperty<T>(target: T, prop: string) {
		throw new Error(`Attempted to delete property "${prop}" outside a handler body.`);
	},
};
const guaranteedErrorObject = new Proxy({}, guaranteedErrorHandler);

type FieldTypes = Record<string, StreamedType>;

/**
 * TBD
 */
export interface StreamedObjectDescriptor {
	description?: string;
	properties: FieldTypes;
	complete?: (result: JsonObject) => void;
}

class StreamedObject<Input> extends InvocableStreamedType<StreamedObjectHandler> {
	public constructor(
		private readonly getDescriptor: (input: Input) => StreamedObjectDescriptor,
		private readonly identity: StreamedTypeIdentity,
		private readonly getInput?: (partial: PartialArg) => Input,
	) {
		super();
	}

	public override getIdentity(): StreamedTypeIdentity {
		return this.identity;
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		const identity = this.getIdentity();
		if (visited.has(identity)) {
			addDefinition(identity, definitions);
		} else {
			visited.add(identity);

			// TODO: Cache descriptor here, assert it's cached in jsonSchema (ditto all other types)
			const { properties } = this.getDummyDescriptor();
			Object.values(properties).forEach((streamedType) => {
				findDefinitions(streamedType, visited, definitions);
			});
		}
	}

	public jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const { description, properties } = this.getDummyDescriptor();

		const propertyNames = Object.keys(properties);
		const schemaProperties: Record<string, JsonObject> = {};
		propertyNames.forEach((fieldName) => {
			schemaProperties[fieldName] = jsonSchemaFromStreamedType(
				properties[fieldName]!,
				root,
				definitions,
			);
		});

		const schema: JsonObject = {
			type: "object",
			properties: schemaProperties,
		};

		if (description !== undefined) {
			schema.description = description;
		}

		schema.required = Object.keys(schemaProperties);
		schema.additionalProperties = false;

		return schema;
	}

	public invoke(parentPartial: PartialArg, partial: PartialArg): StreamedObjectHandler {
		return new StreamedObjectHandlerImpl(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			partial,
			this.getDescriptor(this.getInput?.(parentPartial) as Input),
		);
	}

	public get properties(): FieldTypes {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDummyDescriptor().properties;
	}

	public delayedInvoke(parentPartial: PartialArg): StreamedObjectDescriptor {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(this.getInput?.(parentPartial) as Input);
	}

	private getDummyDescriptor(): StreamedObjectDescriptor {
		if (this.dummyDescriptor === undefined) {
			this.dummyDescriptor = this.getDescriptor(guaranteedErrorObject as Input);
		}

		return this.dummyDescriptor;
	}

	private dummyDescriptor?: StreamedObjectDescriptor;
}

class StreamedObjectHandlerImpl implements StreamedObjectHandler {
	public constructor(
		private partial: PartialObject,
		private descriptor?: StreamedObjectDescriptor,
		private readonly streamedAnyOf?: StreamedAnyOf,
	) {}

	public addObject(key: string): StreamedObjectHandler {
		this.attemptResolution(key, StreamedObject);

		if (this.descriptor) {
			let streamedType: StreamedType | undefined = this.descriptor.properties[key];

			if (streamedType === undefined) {
				throw new Error(`Unhandled key ${key}`);
			}

			if (streamedType instanceof StreamedOptional) {
				streamedType = streamedType.optionalType;
			}

			if (streamedType instanceof StreamedAnyOf) {
				const streamedAnyOf = streamedType;
				if (!(streamedType = streamedType.streamedTypeIfSingleMatch(StreamedObject))) {
					// The type is ambiguous, so create an "unbound" StreamedObjectHandler and wait for more input
					const childPartial: PartialObject = {};
					this.partial[key] = childPartial;
					this.handlers[key] = new StreamedObjectHandlerImpl(
						childPartial,
						undefined,
						streamedAnyOf,
					);
					return this.handlers[key] as StreamedObjectHandler;
				}
			}

			if (streamedType instanceof StreamedObject) {
				const childPartial: PartialObject = {};
				this.partial[key] = childPartial;
				this.handlers[key] = streamedType.invoke(this.partial, this.partial[key]);
				return this.handlers[key] as StreamedObjectHandler;
			}
		}

		throw new Error(`Expected object for key ${key}`);
	}

	public addArray(key: string): StreamedArrayHandler {
		this.attemptResolution(key, StreamedArray);

		if (this.descriptor) {
			let streamedType: StreamedType | undefined = this.descriptor.properties[key];

			if (streamedType === undefined) {
				throw new Error(`Unhandled key ${key}`);
			}

			if (streamedType instanceof StreamedOptional) {
				streamedType = streamedType.optionalType;
			}

			if (streamedType instanceof StreamedAnyOf) {
				const streamedAnyOf = streamedType;
				if (!(streamedType = streamedType.streamedTypeIfSingleMatch(StreamedArray))) {
					// The type is ambiguous, so create an "unbound" StreamedObjectHandler and wait for more input
					const childPartial: PartialArray = [];
					this.partial[key] = childPartial;
					this.handlers[key] = new StreamedArrayHandlerImpl(
						childPartial,
						undefined,
						streamedAnyOf,
					);
					return this.handlers[key] as StreamedArrayHandler;
				}
			}

			if (streamedType instanceof StreamedArray) {
				const childPartial = [] as PartialArray;
				this.partial[key] = childPartial;
				this.handlers[key] = streamedType.invoke(this.partial, childPartial);
				return this.handlers[key] as StreamedArrayHandler;
			}
		}

		throw new Error(`Expected array for key ${key}`);
	}

	// TODO: Return boolean requesting throttling if StreamedString (also in StreamedArrayHandlerImpl)
	public addPrimitive(value: JsonPrimitive, key: string): void {
		if (!this.descriptor) {
			this.partial[key] = value;
			return;
		}

		let streamedType: StreamedType | undefined = this.descriptor.properties[key];

		if (streamedType === undefined) {
			throw new Error(`Unhandled key ${key}`);
		}

		this.partial[key] = value;

		if (streamedType instanceof StreamedOptional) {
			if (value === null) {
				// Don't call the (non-null) handler, as the optional value wasn't present
				return;
			}
			streamedType = streamedType.optionalType;
		}

		if (streamedType instanceof StreamedAnyOf) {
			streamedType = streamedType.streamedTypeOfFirstMatch(value);
		}

		if (primitiveMatchesStreamedType(value, streamedType!)) {
			this.handlers[key] = (
				streamedType as InvocableStreamedType<StreamedValueHandler>
			).invoke(this.partial, undefined);
			return;
		}

		// Shouldn't happen with Structured Outputs
		throw new Error(`Unexpected ${typeof value} for key ${key}`);
	}

	public appendText(chars: string, key: string): void {
		assert(typeof this.partial[key] === "string");
		(this.partial[key] as string) += chars;
		if (
			this.handlers[key] instanceof StreamedStringPropertyHandlerImpl ||
			this.handlers[key] instanceof StreamedStringHandlerImpl
		) {
			(this.handlers[key] as { append: (chars: string) => void }).append(chars);
		}
	}

	public completeProperty(key: string): void {
		const value = this.partial[key];
		if (isPrimitiveValue(value!)) {
			this.attemptResolution(key, value as PrimitiveType);

			// Objects and Arrays will have their complete() handler called directly
			completePrimitive(this.handlers[key]!, value as PrimitiveType, this.partial);
		}
	}

	public complete(): void {
		// TODO-AnyOf:
		this.descriptor!.complete?.(this.partial);
	}

	private attemptResolution(
		key: string,
		typeOrValue: typeof StreamedObject | typeof StreamedArray | PrimitiveType,
	): void {
		if (!this.descriptor) {
			assert(this.streamedAnyOf !== undefined);
			for (const option of this.streamedAnyOf!.options) {
				if (option instanceof StreamedObject) {
					const property = option.properties[key];
					if (streamedTypeMatches(property!, typeOrValue)) {
						// We now know which option in the AnyOf to use
						this.descriptor = option.delayedInvoke(this.partial);
					}
				}
			}
		}
	}

	private handlers: FieldHandlers = {}; // TODO: Overkill, since only one needed at a time?
}

type PartialArray = JsonArray;

// eslint-disable-next-line @rushstack/no-new-null
type ArrayAppendHandler = StreamedValueHandler | null;

/**
 * TBD
 */
export interface StreamedArrayDescriptor {
	description?: string;
	items: StreamedType;
	complete?: (result: JsonArray) => void;
}

class StreamedArray<Input> extends InvocableStreamedType<StreamedArrayHandler> {
	public constructor(
		private readonly getDescriptor: (input: Input) => StreamedArrayDescriptor,
		private readonly identity: StreamedTypeIdentity,
		private readonly getInput?: (partial: PartialArg) => Input,
	) {
		super();
	}

	public override getIdentity(): StreamedTypeIdentity {
		return this.identity;
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		const identity = this.getIdentity();
		if (visited.has(identity)) {
			addDefinition(identity, definitions);
		} else {
			visited.add(identity);

			const { items } = this.getDummyDescriptor();
			findDefinitions(items, visited, definitions);
		}
	}

	public jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const { description, items } = this.getDummyDescriptor();

		const schema: JsonObject = {
			type: "array",
			items: jsonSchemaFromStreamedType(items, root, definitions),
		};

		if (description !== undefined) {
			schema.description = description;
		}

		return schema;
	}

	public invoke(parentPartial: PartialArg, partial: PartialArg): StreamedArrayHandler {
		return new StreamedArrayHandlerImpl(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			partial,
			this.getDescriptor(this.getInput?.(parentPartial) as Input),
		);
	}

	public get items(): StreamedType {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDummyDescriptor().items;
	}

	public delayedInvoke(parentPartial: PartialArg): StreamedArrayDescriptor {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(this.getInput?.(parentPartial) as Input);
	}

	private getDummyDescriptor(): StreamedArrayDescriptor {
		if (this.dummyDescriptor === undefined) {
			this.dummyDescriptor = this.getDescriptor(guaranteedErrorObject as Input);
		}

		return this.dummyDescriptor;
	}

	private dummyDescriptor?: StreamedArrayDescriptor;
}

class StreamedArrayHandlerImpl implements StreamedArrayHandler {
	public constructor(
		private readonly partial: PartialArray,
		private descriptor?: StreamedArrayDescriptor,
		private readonly streamedAnyOf?: StreamedAnyOf,
	) {}

	public addObject(): StreamedObjectHandler {
		this.attemptResolution(StreamedObject);

		if (this.descriptor) {
			let streamedType: StreamedType | undefined = this.descriptor.items;

			if (streamedType instanceof StreamedAnyOf) {
				const streamedAnyOf = streamedType;
				if (!(streamedType = streamedType.streamedTypeIfSingleMatch(StreamedObject))) {
					const childPartial: PartialObject = {};
					this.partial.push(childPartial);
					this.lastHandler = new StreamedObjectHandlerImpl(
						childPartial,
						undefined,
						streamedAnyOf,
					);
					return this.lastHandler as StreamedObjectHandler;
				}
			}

			if (streamedType instanceof StreamedObject) {
				const childPartial: PartialObject = {};
				this.partial.push(childPartial);
				this.lastHandler = streamedType.invoke(this.partial, childPartial);
				return this.lastHandler as StreamedObjectHandler;
			}
		}

		throw new Error("Expected object for items");
	}

	public addArray(): StreamedArrayHandler {
		this.attemptResolution(StreamedArray);

		if (this.descriptor) {
			const streamedType = this.descriptor.items;

			if (streamedType instanceof StreamedObject) {
				const childPartial = [] as PartialArray;
				this.partial.push(childPartial);
				this.lastHandler = streamedType.invoke(this.partial, childPartial);
				return this.lastHandler as StreamedArrayHandler;
			}
		}

		throw new Error("Expected array for items");
	}

	public addPrimitive(value: JsonPrimitive): void {
		if (!this.descriptor) {
			this.partial.push(value);
			return;
		}
		const streamedType = this.descriptor.items;

		this.partial.push(value);

		if (primitiveMatchesStreamedType(value, streamedType)) {
			this.lastHandler = (streamedType as InvocableStreamedType<StreamedValueHandler>).invoke(
				this.partial,
				undefined,
			);
			return;
		}

		// Shouldn't happen with Structured Outputs
		throw new Error(`Unexpected ${typeof value}`);
	}

	public appendText(chars: string): void {
		assert(typeof this.partial[this.partial.length - 1] === "string");

		(this.partial[this.partial.length - 1] as string) += chars;
		if (this.lastHandler instanceof StreamedStringPropertyHandlerImpl) {
			this.lastHandler.append(chars);
		}
	}

	public completeLast(): void {
		const value = this.partial[this.partial.length - 1];

		if (isPrimitiveValue(value!)) {
			this.attemptResolution(value as PrimitiveType);

			// Objects and Arrays will have their complete() handler called directly
			completePrimitive(this.lastHandler!, value as PrimitiveType, this.partial);
		}
	}

	public complete(): void {
		// TODO-AnyOf:
		this.descriptor!.complete?.(this.partial);
	}

	private attemptResolution(
		typeOrValue: typeof StreamedObject | typeof StreamedArray | PrimitiveType,
	): void {
		if (!this.descriptor) {
			assert(this.streamedAnyOf !== undefined);
			for (const option of this.streamedAnyOf!.options) {
				if (option instanceof StreamedArray) {
					const property = option.items;
					if (streamedTypeMatches(property, typeOrValue)) {
						// We now know which option in the AnyOf to use
						this.descriptor = option.delayedInvoke(this.partial);
					}
				}
			}
		}
	}

	private lastHandler?: ArrayAppendHandler;
}

const primitiveMatchesStreamedType = (
	value: JsonPrimitive,
	streamedType: StreamedType,
): boolean => {
	if (value === null) {
		return streamedType instanceof AtomicNull;
	} else {
		switch (typeof value) {
			case "string":
				return (
					streamedType instanceof StreamedStringProperty ||
					streamedType instanceof StreamedString ||
					streamedType instanceof AtomicString ||
					streamedType instanceof AtomicEnum
				);
			case "number":
				return streamedType instanceof AtomicNumber;
			case "boolean":
				return streamedType instanceof AtomicBoolean;
			default:
				assert(false);
				return false;
		}
	}
};

const isPrimitiveValue = (value: JsonValue): value is JsonPrimitive => {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
};

const completePrimitive = (
	handler: StreamedValueHandler,
	value: PrimitiveType,
	partialParent: PartialArg,
): void => {
	if (
		handler instanceof StreamedStringPropertyHandlerImpl ||
		handler instanceof StreamedStringHandlerImpl ||
		handler instanceof AtomicStringHandlerImpl
	) {
		handler.complete(value as string, partialParent);
	} else if (handler instanceof AtomicNumberHandlerImpl) {
		handler.complete(value as number, partialParent);
	} else if (handler instanceof AtomicBooleanHandlerImpl) {
		handler.complete(value as boolean, partialParent);
	} else if (handler instanceof AtomicNullHandlerImpl) {
		handler.complete(value as null, partialParent);
	}
};

const streamedTypeMatches = (
	streamedType: StreamedType,
	typeOrValue: typeof StreamedObject | typeof StreamedArray | PrimitiveType,
): boolean => {
	if (typeOrValue === StreamedObject || typeOrValue === StreamedArray) {
		return streamedType instanceof typeOrValue;
	} else {
		if (typeOrValue === null) {
			return streamedType instanceof AtomicNull;
		} else {
			switch (typeof typeOrValue) {
				case "string":
					return (
						streamedType instanceof AtomicString ||
						(streamedType instanceof AtomicEnum && streamedType.values.includes(typeOrValue))
					);
				case "number":
					return streamedType instanceof AtomicNumber;
				case "boolean":
					return streamedType instanceof AtomicBoolean;
				default:
					assert(false);
					return false;
			}
		}
	}
};

interface SchemaArgs {
	description?: string;
}

// TODO: Also need StreamedStringElementHandler, usable only under array items:? - implementation just appends to last item in array?
interface StreamedStringPropertyHandler {
	append(chars: string): void;
	complete?(value: string, partial: PartialArg): void;
}

type StreamedStringPropertyDescriptor<
	T extends Record<P, string | undefined>,
	P extends keyof T,
> = SchemaArgs & {
	target: (partial: PartialArg) => T;
	key: P;
	complete?: (value: string, partial: PartialArg) => void;
};

class StreamedStringProperty<
	T extends Record<P, string | undefined>,
	P extends keyof T,
> extends InvocableStreamedType<StreamedStringPropertyHandler> {
	public constructor(private readonly args: StreamedStringPropertyDescriptor<T, P>) {
		super();
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	public jsonSchema(): JsonObject {
		const { description } = this.args;

		const schema: { type: string; description?: string } = {
			type: "string",
		};
		if (description !== undefined) {
			schema.description = description;
		}
		return schema;
	}

	public invoke(parentPartial: PartialArg): StreamedStringPropertyHandler {
		const { target, key, complete } = this.args;

		const item = target(parentPartial);
		item[key] = "" as T[P];
		const append = (chars: string): void => {
			item[key] = (item[key] + chars) as T[P];
		};

		return new StreamedStringPropertyHandlerImpl(append, complete);
	}
}

class StreamedStringPropertyHandlerImpl<
	T extends Record<P, string | undefined>,
	P extends keyof T,
> implements StreamedStringPropertyHandler
{
	public constructor(
		private readonly onAppend: (chars: string) => void,
		private readonly onComplete?: (value: string, partial: PartialArg) => void,
	) {}

	public append(chars: string): void {
		return this.onAppend(chars);
	}

	public complete(value: string, partial: PartialArg): void {
		this.onComplete?.(value, partial);
	}
}

interface StreamedStringHandler {
	append(chars: string): void;
	complete?(value: string, partial: PartialArg): void;
}

type StreamedStringDescriptor<Parent extends object> = SchemaArgs & {
	target: (partial: PartialArg) => Parent;
	append: (chars: string, parent: Parent) => void;
	complete?: (value: string, partial: PartialArg) => void;
};

class StreamedString<
	Parent extends object,
> extends InvocableStreamedType<StreamedStringHandler> {
	public constructor(private readonly args: StreamedStringDescriptor<Parent>) {
		super();
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	public jsonSchema(): JsonObject {
		const { description } = this.args;

		const schema: { type: string; description?: string } = {
			type: "string",
		};
		if (description !== undefined) {
			schema.description = description;
		}
		return schema;
	}

	public invoke(parentPartial: PartialArg): StreamedStringHandler {
		const { target, append, complete } = this.args;

		const parent = target?.(parentPartial);

		return new StreamedStringHandlerImpl(parent, append, complete);
	}
}

class StreamedStringHandlerImpl<Parent extends object> implements StreamedStringHandler {
	public constructor(
		private readonly parent: Parent,
		private readonly onAppend: (chars: string, parent: Parent) => void,
		private readonly onComplete?: (value: string, partial: PartialArg) => void,
	) {}

	public append(chars: string): void {
		return this.onAppend(chars, this.parent);
	}

	public complete(value: string, partial: PartialArg): void {
		this.onComplete?.(value, partial);
	}
}

// eslint-disable-next-line @rushstack/no-new-null
type PrimitiveType = string | number | boolean | null;

interface AtomicPrimitiveHandler<T extends PrimitiveType> {
	complete(value: T, partial: PartialArg): void;
}

type AtomicPrimitiveDescriptor<T extends PrimitiveType> = SchemaArgs & {
	values?: string[];
	complete?: (value: T, partial: PartialArg) => void;
};

abstract class AtomicPrimitive<T extends PrimitiveType> extends InvocableStreamedType<
	AtomicPrimitiveHandler<T>
> {
	public constructor(protected descriptor?: AtomicPrimitiveDescriptor<T>) {
		super();
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	public jsonSchema(): JsonObject {
		const description = this.descriptor?.description;

		const schema: { type: string; enum?: string[]; description?: string } = {
			type: this.typeName,
		};
		if (this.descriptor?.values !== undefined) {
			schema.enum = this.descriptor.values;
		}
		if (this.descriptor?.description !== undefined) {
			schema.description = description;
		}
		return schema;
	}

	public abstract override invoke(): AtomicPrimitiveHandler<T>;

	protected abstract typeName: string;
}

class AtomicPrimitiveHandlerImpl<T extends PrimitiveType>
	implements AtomicPrimitiveHandler<T>
{
	public constructor(private readonly onComplete?: (value: T, partial: PartialArg) => void) {}

	public complete(value: T, partial: PartialArg): void {
		if (this.onComplete) {
			this.onComplete(value, partial);
		}
	}
}

type AtomicStringHandler = AtomicPrimitiveHandler<string>;
class AtomicString extends AtomicPrimitive<string> {
	public override invoke(): AtomicStringHandler {
		return new AtomicStringHandlerImpl(this.descriptor?.complete);
	}

	public override typeName = "string";
}
class AtomicStringHandlerImpl extends AtomicPrimitiveHandlerImpl<string> {}

type AtomicEnumHandler = AtomicPrimitiveHandler<string>;
class AtomicEnum extends AtomicPrimitive<string> {
	public override invoke(): AtomicEnumHandler {
		return new AtomicEnumHandlerImpl(this.descriptor?.complete);
	}

	public override typeName = "string";

	public get values(): string[] {
		// TODO-AnyOf: Expose this more cleanly
		return this.descriptor!.values!;
	}
}
class AtomicEnumHandlerImpl extends AtomicPrimitiveHandlerImpl<string> {}

type AtomicNumberHandler = AtomicPrimitiveHandler<number>;
class AtomicNumber extends AtomicPrimitive<number> {
	public override invoke(): AtomicNumberHandler {
		return new AtomicNumberHandlerImpl(this.descriptor?.complete);
	}

	public override typeName = "number";
}
class AtomicNumberHandlerImpl extends AtomicPrimitiveHandlerImpl<number> {}

type AtomicBooleanHandler = AtomicPrimitiveHandler<boolean>;
class AtomicBoolean extends AtomicPrimitive<boolean> {
	public override invoke(): AtomicBooleanHandler {
		return new AtomicBooleanHandlerImpl(this.descriptor?.complete);
	}

	public override typeName = "boolean";
}
class AtomicBooleanHandlerImpl extends AtomicPrimitiveHandlerImpl<boolean> {}

// eslint-disable-next-line @rushstack/no-new-null
type AtomicNullHandler = AtomicPrimitiveHandler<null>;
class AtomicNull extends AtomicPrimitive<null> {
	public override invoke(): AtomicNullHandler {
		return new AtomicNullHandlerImpl(this.descriptor?.complete);
	}

	public override typeName = "null";
}
class AtomicNullHandlerImpl extends AtomicPrimitiveHandlerImpl<null> {}

// TODO: Only make this legal under object properties, not array items
class StreamedOptional extends SchemaGeneratingStreamedType {
	public constructor(optionalType: SchemaGeneratingStreamedType) {
		assert(!(optionalType instanceof AtomicNull));

		super();
		this.optionalType = optionalType;
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);

			findDefinitions(this.optionalType, visited, definitions);
		}
	}

	public jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const schema = jsonSchemaFromStreamedType(this.optionalType, root, definitions);
		if (root === this.optionalType || definitions.has(this.optionalType)) {
			return { anyOf: [schema, { type: "null" }] };
		} else {
			assert(typeof schema.type === "string");
			schema.type = [schema.type!, "null"];
			return schema;
		}
	}

	public optionalType: SchemaGeneratingStreamedType;
}

class StreamedAnyOf extends SchemaGeneratingStreamedType {
	public constructor(options: SchemaGeneratingStreamedType[]) {
		super();
		this.options = options;
	}

	public findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);

			for (const streamedType of this.options) {
				findDefinitions(streamedType, visited, definitions);
			}
		}
	}

	public jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		return {
			anyOf: this.options.map((streamedType) =>
				jsonSchemaFromStreamedType(streamedType, root, definitions),
			),
		};
	}

	public streamedTypeIfSingleMatch(
		classType: typeof StreamedObject | typeof StreamedArray,
	): StreamedType | undefined {
		// If there is exactly one child StreamedType that is of the given type, return it
		let streamedType: StreamedType | undefined;
		for (const option of this.options) {
			// TODO-AnyOf: Must also consider Optional and AnyOf
			if (option instanceof classType) {
				if (streamedType) {
					return undefined;
				}
				streamedType = option;
			}
		}
		return streamedType;
	}

	public streamedTypeOfFirstMatch(
		// eslint-disable-next-line @rushstack/no-new-null
		value: string | number | boolean | null,
	): StreamedType | undefined {
		for (const option of this.options) {
			// TODO-AnyOf: Must also consider Optional and AnyOf
			if (value === null && option instanceof AtomicNull) {
				return option;
			} else {
				switch (typeof value) {
					case "string":
						if (option instanceof AtomicString || option instanceof AtomicEnum) {
							return option;
						}
						break;
					case "number":
						if (option instanceof AtomicNumber) {
							return option;
						}
						break;
					case "boolean":
						if (option instanceof AtomicBoolean) {
							return option;
						}
						break;
					default:
						break;
				}
			}
		}
		return undefined;
	}

	public options: SchemaGeneratingStreamedType[];
}
