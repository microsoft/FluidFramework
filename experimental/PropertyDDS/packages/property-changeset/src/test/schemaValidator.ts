/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Basic implementation of part of the PropertyFactory needed to run test on validation.
 */

import { TypeIdHelper } from "../helpers/typeidHelper.js";
import { type PropertySchema, TemplateValidator } from "../templateValidator.js";
import type { SchemaValidationResult } from "../validationResultBuilder.js";

export class SchemaValidator {
	schemaMap: Record<string, any>;
	constructor() {
		this.schemaMap = {};
	}

	inheritsFrom(
		in_templateTypeid: string,
		in_baseTypeid: string | number,
		in_options?: { includeSelf?: any },
	) {
		in_options = in_options || {};

		if (
			in_templateTypeid === in_baseTypeid &&
			(!!in_options.includeSelf || in_options.includeSelf === undefined)
		) {
			return true;
		}

		const parents = {};
		this.getAllParentsForTemplate(in_templateTypeid, parents, true);

		return parents[in_baseTypeid] !== undefined;
	}

	hasSchema(typeid: string | number) {
		return this.schemaMap[typeid] !== undefined;
	}

	register(schema) {
		this.schemaMap[schema.typeid] = schema;
	}

	async inheritsFromAsync(child, ancestor): Promise<boolean> {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					resolve(this.inheritsFrom(child, ancestor));
				} catch (error) {
					console.error("Error in inheritsFrom: ", error);
					reject(error);
				}
			}, 5);
		});
	}

	hasSchemaAsync = async (typeid) =>
		new Promise((resolve, reject) => {
			setTimeout(() => {
				resolve(this.schemaMap[typeid] !== undefined);
			}, 5);
		});

	getAllParentsForTemplate(in_typeid: string, out_parents, in_includeBaseProperty) {
		if (TypeIdHelper.isPrimitiveType(in_typeid)) {
			// Everything inherits from BaseProperty.
			if (in_includeBaseProperty) {
				out_parents.ContainerProperty = true;
			}

			return;
		}

		const template = this.schemaMap[in_typeid];
		if (!template) {
			throw new Error(`Missing typeid: ${in_typeid}`);
		}

		// Everything inherits from BaseProperty.
		if (in_includeBaseProperty) {
			out_parents.ContainerProperty = true;
		}

		// Run over all parents and insert them into the parents array
		if (template.inherits) {
			// We have to distinguish the cases where the parents are either specified as a single string or an array
			const parents = Array.isArray(template.inherits)
				? template.inherits
				: [template.inherits];

			for (let i = 0; i < parents.length; i++) {
				// Mark it as parent
				out_parents[parents[i]] = true;

				// Continue recursively
				this.getAllParentsForTemplate(parents[i], out_parents, undefined);
			}
		}
	}

	validate(
		in_schema: PropertySchema,
		in_previousSchema: PropertySchema,
		in_async: true,
		in_skipSemver?: boolean,
		in_allowDraft?: boolean,
	): Promise<SchemaValidationResult>;
	validate(
		in_schema: PropertySchema,
		in_previousSchema?: PropertySchema,
		in_async?: false,
		in_skipSemver?: boolean,
		in_allowDraft?: boolean,
	): SchemaValidationResult;
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	validate(
		in_schema: PropertySchema,
		in_previousSchema?: PropertySchema,
		in_async?: boolean,
		in_skipSemver?: boolean,
		in_allowDraft?: boolean,
	) {
		in_skipSemver = in_skipSemver || false;

		if (in_async) {
			let options = {
				inheritsFromAsync: this.inheritsFromAsync as any,
				hasSchemaAsync: this.hasSchemaAsync as any,
				skipSemver: in_skipSemver,
				allowDraft: in_allowDraft,
			};
			let templateValidator = new TemplateValidator(options);

			return templateValidator.validateAsync(in_schema, in_previousSchema);
		} else {
			let options = {
				inheritsFrom: this.inheritsFrom as any,
				hasSchema: this.hasSchema as any,
				skipSemver: in_skipSemver,
				allowDraft: in_allowDraft,
			};
			let templateValidator = new TemplateValidator(options);

			return templateValidator.validate(in_schema, in_previousSchema);
		}
	}
}
