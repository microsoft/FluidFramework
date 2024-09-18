import { assert } from "./debug";
import {
	type JsonArray,
	type JsonBuilder,
	type JsonBuilderContext,
	type JsonObject,
	type JsonPrimitive,
	type StreamedJsonParser,
	contextIsObject,
	createStreamedJsonParser,
} from "./jsonParser";

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
		if (
			streamedType instanceof StreamedStringProperty ||
			streamedType instanceof StreamedString
		) {
			throw new TypeError("StreamedStringProperty and StreamedString cannot be used as root type");
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

	jsonSchema(): JsonObject {
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

	processChars(chars: string): void {
		this.parser.addChars(chars);
	}

	complete(): void {
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
) => {
	return new ResponseHandlerImpl(streamedType, abortController);
};

export const getCreateResponseHandler = () => createResponseHandlerImpl;

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

export const getJsonHandler = () => jsonHandler;

// TODO: Can perhaps not export these after illustrateInteraction re-implemented (and remove all the ?s and !s)
export interface StreamedObjectHandler {
	addObject?(key: string): StreamedObjectHandler;
	addArray?(key: string): StreamedArrayHandler;
	addPrimitive?(value: JsonPrimitive, key: string): void;
	appendText?(chars: string, key: string): void;
	completeProperty?(key: string): void;
	complete?(): void;
}

export interface StreamedArrayHandler {
	addObject?(): StreamedObjectHandler;
	addArray?(): StreamedArrayHandler;
	addPrimitive?(value: JsonPrimitive): void;
	appendText?(chars: string): void;
	completeLast?(): void;
	complete?(): void;
}

type BuilderContext = JsonBuilderContext<StreamedObjectHandler, StreamedArrayHandler>;

class BuilderDispatcher implements JsonBuilder<StreamedObjectHandler, StreamedArrayHandler> {
	public constructor(private readonly rootHandler: StreamedValueHandler) {}

	addObject(context?: BuilderContext): StreamedObjectHandler {
		if (!context) {
			// TODO: This error-handling, which really shouldn't be necessary in principle with Structured Outputs,
			//       is arguably "inside-out", i.e. it should report the expected type of the result, rather than
			//       the handler.
			if (!(this.rootHandler instanceof StreamedObjectHandlerImpl)) {
				throw new TypeError(`Expected object for root`);
			}
			return this.rootHandler;
		} else if (contextIsObject(context)) {
			return context.parentObject.addObject!(context.key);
		} else {
			return context.parentArray.addObject!();
		}
	}

	addArray(context?: BuilderContext): StreamedArrayHandler {
		if (!context) {
			if (!(this.rootHandler instanceof StreamedArrayHandlerImpl)) {
				throw new TypeError(`Expected array for root`);
			}
			return this.rootHandler;
		} else if (contextIsObject(context)) {
			return context.parentObject.addArray!(context.key);
		} else {
			return context.parentArray.addArray!();
		}
	}

	addPrimitive(value: JsonPrimitive, context?: BuilderContext): void {
		if (!context) {
			if (value === null) {
				if (!(this.rootHandler instanceof AtomicNullHandlerImpl)) {
					throw new TypeError(`Expected null for root`);
				}
			} else {
				switch (typeof value) {
					case "string":
						if (
							!(
								this.rootHandler instanceof AtomicStringHandlerImpl ||
								this.rootHandler instanceof AtomicEnumHandlerImpl
							)
						) {
							throw new TypeError(`Expected string or enum for root`);
						}
						break;
					case "number":
						if (!(this.rootHandler instanceof AtomicNumberHandlerImpl)) {
							throw new TypeError(`Expected number for root`);
						}
						break;
					case "boolean":
						if (!(this.rootHandler instanceof AtomicBooleanHandlerImpl)) {
							throw new TypeError(`Expected boolean for root`);
						}
						break;
				}
			}
		} else if (contextIsObject(context)) {
			context.parentObject.addPrimitive!(value, context.key);
		} else {
			context.parentArray.addPrimitive!(value);
		}
	}

	appendText(chars: string, context?: BuilderContext): void {
		assert(context !== undefined);
		if (contextIsObject(context)) {
			context.parentObject.appendText!(chars, context.key);
		} else {
			context.parentArray.appendText!(chars);
		}
	}

	completeContext(context?: BuilderContext): void {
		if (context !== undefined) {
			if (contextIsObject(context)) {
				context.parentObject.completeProperty?.(context.key);
			} else {
				context.parentArray.completeLast?.();
			}
		}
	}

	completeContainer(container: StreamedObjectHandler | StreamedArrayHandler): void {
		container.complete?.();
	}
}

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
	getIdentity(): StreamedTypeIdentity {
		return this;
	}
	abstract findDefinitions(
		visited: Set<StreamedTypeIdentity>,
		definitions: DefinitionMap,
	): void;
	abstract jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject;
}

abstract class InvocableStreamedType<
	T extends StreamedValueHandler | undefined,
> extends SchemaGeneratingStreamedType {
	abstract invoke(parentPartial: PartialArg, partial: PartialArg): T;
}

interface FieldHandlers {
	[key: string]: StreamedValueHandler | null;
}

const findDefinitions = (
	streamedType: StreamedType,
	visited: Set<StreamedTypeIdentity>,
	definitions: DefinitionMap,
) => {
	return (streamedType as InvocableStreamedType<StreamedValueHandler>).findDefinitions(
		visited,
		definitions,
	);
};

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

interface FieldTypes {
	[key: string]: StreamedType;
}

export interface StreamedObjectDescriptor {
	description?: string;
	properties: FieldTypes;
	complete?: (result: JsonObject) => void;
}

class StreamedObject<Input> extends InvocableStreamedType<StreamedObjectHandler> {
	constructor(
		private readonly getDescriptor: (input: Input) => StreamedObjectDescriptor,
		private readonly identity: StreamedTypeIdentity,
		private readonly getInput?: (partial: PartialArg) => Input,
	) {
		super();
	}

	override getIdentity(): StreamedTypeIdentity {
		return this.identity;
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		const identity = this.getIdentity();
		if (visited.has(identity)) {
			addDefinition(identity, definitions);
		} else {
			visited.add(identity);

			// TODO: Cache descriptor here, assert it's cached in jsonSchema (ditto all other types)
			const { properties } = this.getDescriptor(guaranteedErrorObject as Input);
			Object.values(properties).forEach((streamedType) => {
				findDefinitions(streamedType, visited, definitions);
			});
		}
	}

	jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const { description, properties } = this.getDescriptor(guaranteedErrorObject as Input);

		const propertyNames = Object.keys(properties);
		const schemaProperties: { [key: string]: JsonObject } = {};
		propertyNames.forEach((fieldName) => {
			schemaProperties[fieldName] = jsonSchemaFromStreamedType(
				properties[fieldName],
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

	invoke(parentPartial: PartialArg, partial: PartialArg): StreamedObjectHandler {
		return new StreamedObjectHandlerImpl(
			partial,
			this.getDescriptor(this.getInput?.(parentPartial) as Input),
		);
	}

	public get properties(): FieldTypes {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(guaranteedErrorObject as Input).properties;
	}

	public delayedInvoke(parentPartial: PartialArg): StreamedObjectDescriptor {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(this.getInput?.(parentPartial) as Input);
	}
}

class StreamedObjectHandlerImpl implements StreamedObjectHandler {
	constructor(
		private partial: PartialObject,
		private descriptor?: StreamedObjectDescriptor,
		private readonly streamedAnyOf?: StreamedAnyOf,
	) {}

	addObject(key: string): StreamedObjectHandler {
		if (!this.descriptor) {
			// TODO-AnyOf:
		} else {
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
					const childPartial = {} as PartialObject;
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
				const childPartial = {} as PartialObject;
				this.partial[key] = childPartial;
				this.handlers[key] = streamedType.invoke(this.partial, childPartial);
				return this.handlers[key] as StreamedObjectHandler;
			}
		}

		throw new Error(`Expected object for key ${key}`);
	}

	addArray(key: string): StreamedArrayHandler {
		if (!this.descriptor) {
			// TODO-AnyOf:
		} else {
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
					const childPartial = [] as PartialArray;
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
	addPrimitive(value: JsonPrimitive, key: string): void {
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
			const streamedAnyOf = streamedType;
			if (!(streamedType = streamedType.streamedTypeOfFirstMatch(value))) {
				const childPartial = {} as PartialObject;
				this.partial[key] = childPartial;
				this.handlers[key] = new StreamedObjectHandlerImpl(
					childPartial,
					undefined,
					streamedAnyOf,
				);
				return;
			}
		}

		if (value === null) {
			if (streamedType instanceof AtomicNull) {
				this.handlers[key] = streamedType.invoke();
				return;
			}
		} else {
			switch (typeof value) {
				case "string":
					if (streamedType instanceof StreamedStringProperty) {
						this.handlers[key] = streamedType.invoke(this.partial);
						return;
					} else if (streamedType instanceof StreamedString) {
						this.handlers[key] = streamedType.invoke(this.partial);
						return;
					} else if (streamedType instanceof AtomicString) {
						this.handlers[key] = streamedType.invoke();
						return;
					} else if (streamedType instanceof AtomicEnum) {
						this.handlers[key] = streamedType.invoke();
						return;
					}
					break;

				case "number":
					if (streamedType instanceof AtomicNumber) {
						this.handlers[key] = streamedType.invoke();
						return;
					}
					break;

				case "boolean":
					if (streamedType instanceof AtomicBoolean) {
						this.handlers[key] = streamedType.invoke();
					}
					break;
			}
		}

		// Shouldn't happen with Structured Outputs
		throw new Error(`Unexpected ${typeof value} for key ${key}`);
	}

	appendText(chars: string, key: string): void {
		assert(typeof this.partial[key] === "string");
		this.partial[key] += chars;
		if (
			this.handlers[key] instanceof StreamedStringPropertyHandlerImpl ||
			this.handlers[key] instanceof StreamedStringHandlerImpl
		) {
			this.handlers[key].append(chars);
		}
	}

	completeProperty?(key: string): void {
		if (!this.descriptor) {
			const value = this.partial[key];
			// TODO-AnyOf: Need a much more general algorithm
			if (typeof value === "string") {
				assert(this.streamedAnyOf !== undefined);
				for (const option of this.streamedAnyOf!.options) {
					if (option instanceof StreamedObject) {
						const property = option.properties[key];
						if (property instanceof AtomicEnum && property.values.includes(value)) {
							// We now know which option in the AnyOf to use
							this.partial[key] = value;
							this.descriptor = option.delayedInvoke(this.partial);
							this.handlers[key] = property.invoke();
						}
					}
				}
			}
		}

		// Objects and Arrays will have their complete() handler called directly
		if (
			this.handlers[key] instanceof StreamedStringPropertyHandlerImpl ||
			this.handlers[key] instanceof StreamedStringHandlerImpl ||
			this.handlers[key] instanceof AtomicStringHandlerImpl
		) {
			this.handlers[key].complete(this.partial[key] as string, this.partial);
		} else if (this.handlers[key] instanceof AtomicBooleanHandlerImpl) {
			this.handlers[key].complete(this.partial[key] as boolean, this.partial);
		} else if (this.handlers[key] instanceof AtomicNullHandlerImpl) {
			this.handlers[key].complete(this.partial[key] as null, this.partial);
		}
	}

	complete(): void {
		// TODO-AnyOf:
		this.descriptor!.complete?.(this.partial);
	}

	private handlers = {} as FieldHandlers; // TODO: Overkill, since only one needed at a time?
}

type PartialArray = JsonArray;

type ArrayAppendHandler = StreamedValueHandler | null;

export interface StreamedArrayDescriptor {
	description?: string;
	items: StreamedType;
	complete?: (result: JsonArray) => void;
}

class StreamedArray<Input> extends InvocableStreamedType<StreamedArrayHandler> {
	constructor(
		private readonly getDescriptor: (input: Input) => StreamedArrayDescriptor,
		private readonly identity: StreamedTypeIdentity,
		private readonly getInput?: (partial: PartialArg) => Input,
	) {
		super();
	}

	override getIdentity(): StreamedTypeIdentity {
		return this.identity;
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		const identity = this.getIdentity();
		if (visited.has(identity)) {
			addDefinition(identity, definitions);
		} else {
			visited.add(identity);

			const { items } = this.getDescriptor(guaranteedErrorObject as Input);
			findDefinitions(items, visited, definitions);
		}
	}

	jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const { description, items } = this.getDescriptor(guaranteedErrorObject as Input);

		const schema: JsonObject = {
			type: "array",
			items: jsonSchemaFromStreamedType(items, root, definitions),
		};

		if (description !== undefined) {
			schema.description = description;
		}

		return schema;
	}

	invoke(parentPartial: PartialArg, partial: PartialArg): StreamedArrayHandler {
		return new StreamedArrayHandlerImpl(
			partial,
			this.getDescriptor(this.getInput?.(parentPartial) as Input),
		);
	}

	public get items(): StreamedType {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(guaranteedErrorObject as Input).items;
	}

	public delayedInvoke(parentPartial: PartialArg): StreamedArrayDescriptor {
		// TODO-AnyOf: Expose this more gracefully
		return this.getDescriptor(this.getInput?.(parentPartial) as Input);
	}
}

class StreamedArrayHandlerImpl implements StreamedArrayHandler {
	constructor(
		private readonly partial: PartialArray,
		private descriptor?: StreamedArrayDescriptor,
		private readonly streamedAnyOf?: StreamedAnyOf,
	) {}

	addObject(): StreamedObjectHandler {
		if (!this.descriptor) {
			assert(this.streamedAnyOf !== undefined);
			for (const option of this.streamedAnyOf!.options) {
				if (option instanceof StreamedArray) {
					const property = option.items;
					if (property instanceof StreamedObject) {
						// We now know which option in the AnyOf to use
						const childPartial = {} as PartialObject;
						this.partial.push(childPartial);
						this.descriptor = option.delayedInvoke(this.partial);
						this.lastHandler = property.invoke(this.partial, childPartial);
					}
				}
			}
		}

		if (this.descriptor) {
			let streamedType: StreamedType | undefined = this.descriptor.items;

			if (streamedType instanceof StreamedAnyOf) {
				const streamedAnyOf = streamedType;
				if (!(streamedType = streamedType.streamedTypeIfSingleMatch(StreamedObject))) {
					const childPartial = {} as PartialObject;
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
				const childPartial = {} as PartialObject;
				this.partial.push(childPartial);
				this.lastHandler = streamedType.invoke(this.partial, childPartial);
				return this.lastHandler ;
			}
		}

		throw new Error("Expected object for items");
	}

	addArray(): StreamedArrayHandler {
		if (!this.descriptor) {
			// TODO-AnyOf:
		} else {
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

	addPrimitive(value: JsonPrimitive): void {
		if (!this.descriptor) {
			this.partial.push(value);
			return;
		}
		const streamedType = this.descriptor.items;

		this.partial.push(value);

		if (value === null) {
			if (streamedType instanceof AtomicNull) {
				this.lastHandler = streamedType.invoke();
				return;
			}
		} else {
			switch (typeof value) {
				case "string":
					if (streamedType instanceof StreamedStringProperty) {
						this.lastHandler = streamedType.invoke(this.partial);
						return;
					} else if (streamedType instanceof StreamedString) {
						this.lastHandler = streamedType.invoke(this.partial);
						return;
					} else if (streamedType instanceof AtomicString) {
						this.lastHandler = streamedType.invoke();
						return;
					} else if (streamedType instanceof AtomicEnum) {
						this.lastHandler = streamedType.invoke();
						return;
					}
					break;

				case "number":
					if (streamedType instanceof AtomicNumber) {
						this.lastHandler = streamedType.invoke();
						return;
					}
					break;

				case "boolean":
					if (streamedType instanceof AtomicBoolean) {
						this.lastHandler = streamedType.invoke();
						return;
					}
					break;
			}
		}

		// Shouldn't happen with Structured Outputs
		throw new Error(`Unexpected ${typeof value}`);
	}

	appendText(chars: string): void {
		assert(typeof this.partial[this.partial.length - 1] === "string");

		this.partial[this.partial.length - 1] += chars;
		if (this.lastHandler instanceof StreamedStringPropertyHandlerImpl) {
			this.lastHandler.append(chars);
		}
	}

	completeLast?(): void {
		if (!this.descriptor) {
			const value = this.partial[this.partial.length - 1];
			// TODO-AnyOf: Need a much more general algorithm
			if (typeof value === "boolean") {
				assert(this.streamedAnyOf !== undefined);
				for (const option of this.streamedAnyOf!.options) {
					if (option instanceof StreamedArray) {
						const items = option.items;
						if (items instanceof AtomicBoolean) {
							// We now know which option in the AnyOf to use
							this.descriptor = option.delayedInvoke(this.partial);
							this.lastHandler = items.invoke();
						}
					}
				}
			}
		}

		// Objects and Arrays will have their complete() handler called directly
		if (
			this.lastHandler instanceof StreamedStringPropertyHandlerImpl ||
			this.lastHandler instanceof StreamedStringHandlerImpl ||
			this.lastHandler instanceof AtomicStringHandlerImpl
		) {
			this.lastHandler.complete(this.partial[this.partial.length - 1] as string, this.partial);
		} else if (this.lastHandler instanceof AtomicNumberHandlerImpl) {
			this.lastHandler.complete(this.partial[this.partial.length - 1] as number, this.partial);
		} else if (this.lastHandler instanceof AtomicBooleanHandlerImpl) {
			this.lastHandler.complete(
				this.partial[this.partial.length - 1] as boolean,
				this.partial,
			);
		} else if (this.lastHandler instanceof AtomicNullHandlerImpl) {
			this.lastHandler.complete(this.partial[this.partial.length - 1] as null, this.partial);
		}
	}

	complete(): void {
		// TODO-AnyOf:
		this.descriptor!.complete?.(this.partial);
	}

	private lastHandler?: ArrayAppendHandler;
}

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
	constructor(private readonly args: StreamedStringPropertyDescriptor<T, P>) {
		super();
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	jsonSchema(): JsonObject {
		const { description } = this.args;

		const schema: { type: string; description?: string } = {
			type: "string",
		};
		if (this.args.description !== undefined) {
			schema.description = description;
		}
		return schema;
	}

	invoke(parentPartial: PartialArg): StreamedStringPropertyHandler {
		const { target, key, complete } = this.args;

		const item = target(parentPartial);
		item[key] = "" as T[P];
		const append = (chars: string) => (item[key] = (item[key] + chars) as T[P]);

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
	constructor(private readonly args: StreamedStringDescriptor<Parent>) {
		super();
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	jsonSchema(): JsonObject {
		const { description } = this.args;

		const schema: { type: string; description?: string } = {
			type: "string",
		};
		if (this.args.description !== undefined) {
			schema.description = description;
		}
		return schema;
	}

	invoke(parentPartial: PartialArg): StreamedStringHandler {
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
	constructor(protected descriptor?: AtomicPrimitiveDescriptor<T>) {
		super();
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);
		}
	}

	jsonSchema(): JsonObject {
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

	public abstract invoke(): AtomicPrimitiveHandler<T>;

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
	override invoke(): AtomicStringHandler {
		return new AtomicStringHandlerImpl(this.descriptor?.complete);
	}

	override typeName = "string";
}
class AtomicStringHandlerImpl extends AtomicPrimitiveHandlerImpl<string> {}

type AtomicEnumHandler = AtomicPrimitiveHandler<string>;
class AtomicEnum extends AtomicPrimitive<string> {
	override invoke(): AtomicEnumHandler {
		return new AtomicEnumHandlerImpl(this.descriptor?.complete);
	}

	override typeName = "string";

	public get values(): string[] {
		// TODO-AnyOf: Expose this more cleanly
		return this.descriptor!.values!;
	}
}
class AtomicEnumHandlerImpl extends AtomicPrimitiveHandlerImpl<string> {}

type AtomicNumberHandler = AtomicPrimitiveHandler<number>;
class AtomicNumber extends AtomicPrimitive<number> {
	override invoke(): AtomicNumberHandler {
		return new AtomicNumberHandlerImpl(this.descriptor?.complete);
	}

	override typeName = "number";
}
class AtomicNumberHandlerImpl extends AtomicPrimitiveHandlerImpl<number> {}

type AtomicBooleanHandler = AtomicPrimitiveHandler<boolean>;
class AtomicBoolean extends AtomicPrimitive<boolean> {
	override invoke(): AtomicBooleanHandler {
		return new AtomicBooleanHandlerImpl(this.descriptor?.complete);
	}

	override typeName = "boolean";
}
class AtomicBooleanHandlerImpl extends AtomicPrimitiveHandlerImpl<boolean> {}

type AtomicNullHandler = AtomicPrimitiveHandler<null>;
class AtomicNull extends AtomicPrimitive<null> {
	override invoke(): AtomicNullHandler {
		return new AtomicNullHandlerImpl(this.descriptor?.complete);
	}

	override typeName = "null";
}
class AtomicNullHandlerImpl extends AtomicPrimitiveHandlerImpl<null> {}

// TODO: Only make this legal under object properties, not array items
class StreamedOptional extends SchemaGeneratingStreamedType {
	constructor(optionalType: SchemaGeneratingStreamedType) {
		assert(!(optionalType instanceof AtomicNull));

		super();
		this.optionalType = optionalType;
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);

			findDefinitions(this.optionalType, visited, definitions);
		}
	}

	jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
		const schema = jsonSchemaFromStreamedType(this.optionalType, root, definitions);

		if (root === this.optionalType || definitions.has(this.optionalType)) {
			return { anyOf: [schema, { type: "null" }] };
		} else {
			schema.type = [schema.type, "null"];
			return schema;
		}
	}

	public optionalType: SchemaGeneratingStreamedType;
}

class StreamedAnyOf extends SchemaGeneratingStreamedType {
	constructor(options: SchemaGeneratingStreamedType[]) {
		super();
		this.options = options;
	}

	findDefinitions(visited: Set<StreamedTypeIdentity>, definitions: DefinitionMap): void {
		if (visited.has(this)) {
			addDefinition(this, definitions);
		} else {
			visited.add(this);

			for (const streamedType of this.options) {
				findDefinitions(streamedType, visited, definitions);
			}
		}
	}

	jsonSchema(root: StreamedTypeIdentity, definitions: DefinitionMap): JsonObject {
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
				}
			}
		}
		return undefined;
	}

	public options: SchemaGeneratingStreamedType[];
}
