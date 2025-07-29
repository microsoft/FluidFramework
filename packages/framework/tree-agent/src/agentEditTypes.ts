/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 *
 * TODO: Add a prompt suggestion API!
 *
 * TODO: Handle rate limit errors.
 *
 * TODO: Pass descriptions from schema metadata to the generated TS types that we put in the prompt
 *
 * TODO make the Ids be "Vector-2" instead of "Vector2" (or else it gets weird when you have a type called "Vector2")
 */

/**
 * This is the field we force the LLM to generate to avoid any type ambiguity (e.g. a vector and a point both have x/y and are ambiguous without the LLM telling us which it means).
 */
export const typeField = "__schemaType";

/**
 * A field that is  auto-generated and injected into nodes before passing data to the LLM to ensure the LLM can refer to nodes in a stable way.
 */
export const objectIdKey = "__objectId";

/**
 * TODO
 */
export const objectIdType = "ObjectId";
