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
    protected readonly idValidation = (propValue) => {
        return this.isUndefined(propValue)
            || (this.checkType(propValue, "string") && propValue.length > 0);
    };

    protected readonly seqNumberValidation = (propValue) => {
        return this.isUndefined(propValue)
            || (this.checkType(propValue, "number") && propValue >= -1);
    };

    // Helpers
    private isUndefined(propValue: any) {
        return propValue === undefined;
    }

    private checkType(propValue: any, expectedType: string) {
        return typeof propValue === expectedType;
    }
}

export class RequestSchemaValidator extends BaseLumberjackSchemaValidator {
    constructor() {
        super();
        this.validators.set(SchemaProperties.tenantId, this.idValidation);
        this.validators.set(SchemaProperties.documentId, this.idValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}

export class LambdaSchemaValidator extends RequestSchemaValidator {
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
