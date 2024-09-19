import {
	type PartialArg,
	type StreamedObjectDescriptor,
	type StreamedArrayDescriptor,
	type StreamedType,
	getJsonHandler,
	getCreateResponseHandler,
} from "./jsonHandlerImpl.js";
import type { JsonObject } from "./jsonParser.js";

export interface ResponseHandler {
	jsonSchema(): JsonObject;
	processChars(chars: string): void;
	complete(): void;
}

export const createResponseHandler: (
	streamedType: StreamedType,
	abortController: AbortController,
) => ResponseHandler = getCreateResponseHandler();

export const JsonHandler: {
	object: <Input>(
		getDescriptor: (input: Input) => StreamedObjectDescriptor,
	) => (getInput?: (partial: PartialArg) => Input) => StreamedType;

	array: <Input>(
		getDescriptor: (input: Input) => StreamedArrayDescriptor,
	) => (getInput?: (partial: PartialArg) => Input) => StreamedType;

	streamedStringProperty<
		Parent extends Record<Key, string | undefined>,
		Key extends keyof Parent,
	>(args: {
		description?: string;
		target: (partial: PartialArg) => Parent;
		key: Key;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType;

	streamedString<Parent extends object>(args: {
		description?: string;
		target: (partial: PartialArg) => Parent;
		append: (chars: string, parent: Parent) => void;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType;

	string(args?: {
		description?: string;
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType;

	enum(args: {
		description?: string;
		values: string[];
		complete?: (value: string, partial: PartialArg) => void;
	}): StreamedType;

	number(args?: {
		description?: string;
		complete?: (value: number, partial: PartialArg) => void;
	}): StreamedType;

	boolean(args?: {
		description?: string;
		complete?: (value: boolean, partial: PartialArg) => void;
	}): StreamedType;

	null(args?: {
		description?: string;
		// eslint-disable-next-line @rushstack/no-new-null
		complete?: (value: null, partial: PartialArg) => void;
	}): StreamedType;

	optional(streamedType: StreamedType): StreamedType;

	anyOf(streamedTypes: StreamedType[]): StreamedType;
} = getJsonHandler();
