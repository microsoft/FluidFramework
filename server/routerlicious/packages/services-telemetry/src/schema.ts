/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackSchemaValidator, ILumberjackSchemaValidationResult, SchemaProperties } from "./resources";

export abstract class BaseLumberjackSchemaValidator implements ILumberjackSchemaValidator {
    protected readonly validators = new Map<string, (propvalue: string) => boolean>();

    public validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        const validationFailedForProperties: string[] = [];
        this.validators.forEach((validator, keyName) => {
            // Validation should pass if the required propery is included and satisfies the requirements.
            if (props.has(keyName) && validator(props.get(keyName))) {
                return;
            }

            // Otherwise, validation should fail and the property name is added to the "failed" list.
            validationFailedForProperties.push(keyName);
        });

        return {
            validationPassed: validationFailedForProperties.length === 0,
            validationFailedForProperties,
        };
    }

    // Validators
    protected readonly idValidation = (propValue: any) => {
        return this.isUndefined(propValue)
            || (this.isString(propValue) && propValue.length > 0);
    };

    protected readonly seqNumberValidation = (propValue: any) => {
        return this.isUndefined(propValue)
            || (this.isNumber(propValue) && propValue >= -1);
    };

    // Helpers
    private isUndefined(propValue: any): propValue is undefined {
        return propValue === undefined;
    }

    private isNumber(propValue: any): propValue is number {
        return typeof(propValue) === "number";
    }

    private isString(propValue: any): propValue is string {
        return typeof(propValue) === "string";
    }
}

export class DocumentSchemaValidator extends BaseLumberjackSchemaValidator {
    constructor() {
        super();
        this.validators.set(SchemaProperties.tenantId, this.idValidation);
        this.validators.set(SchemaProperties.documentId, this.idValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}

export class LambdaSchemaValidator extends DocumentSchemaValidator {
    constructor() {
        super();
        this.validators.set(SchemaProperties.clientId, this.idValidation);
        this.validators.set(SchemaProperties.sequenceNumber, this.seqNumberValidation);
        this.validators.set(SchemaProperties.clientSequenceNumber, this.seqNumberValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}
