/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Basic implementation of part of the PropertyFactory needed to run test on validation.
 */

import { TemplateValidator } from "../templateValidator";
import { TypeIdHelper } from "../helpers/typeidHelper";

export class SchemaValidator {
    schemaMap: Record<string, any>;
    constructor() {
        this.schemaMap = {};
    }

    inheritsFrom(in_templateTypeid: any, in_baseTypeid: string | number, in_options: { includeSelf?: any; }) {
        in_options = in_options || {};

        if (in_templateTypeid === in_baseTypeid &&
            (!!in_options.includeSelf || in_options.includeSelf === undefined)) {
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

    async inheritsFromAsync(child, ancestor) {
        return new Promise(function(resolve, reject) {
            setTimeout(function() {
                try {
                    resolve(this.inheritsFrom(child, ancestor));
                } catch (error) {
                    console.error("Error in inheritsFrom: ", error);
                    reject(error);
                }
            }, 5);
        });
    }

    hasSchemaAsync = async (typeid) => new Promise(function(resolve, reject) {
        setTimeout(function() {
            resolve(this.schemaMap[typeid] !== undefined);
        }, 5);
    });

    getAllParentsForTemplate(in_typeid, out_parents, in_includeBaseProperty) {
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
            const parents = Array.isArray(template.inherits) ? template.inherits : [template.inherits];

            for (let i = 0; i < parents.length; i++) {
                // Mark it as parent
                out_parents[parents[i]] = true;

                // Continue recursively
                this.getAllParentsForTemplate(parents[i], out_parents, undefined);
            }
        }
    }

    validate(in_schema, in_previousSchema?, in_async?, in_skipSemver?, in_allowDraft?): any {
        in_skipSemver = in_skipSemver || false;

        if (in_async) {
            let options = {
                inheritsFromAsync: this.inheritsFromAsync as any,
                hasSchemaAsync: this.hasSchemaAsync as any,
                skipSemver: in_skipSemver as boolean,
                allowDraft: in_allowDraft as boolean,
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
