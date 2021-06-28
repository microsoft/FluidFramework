/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackSchemaValidator, ILumberjackSchemaValidationResult } from "./resources";

export class BaseSchemaValidator implements ILumberjackSchemaValidator {
    protected readonly validators = new Map<string, (propvalue: string) => boolean>();

    // Validators
    protected readonly idValidation = (propValue) => {
        return (typeof propValue === "string")
            && propValue.length > 0;
    };

    protected readonly seqNumberValidation = (propValue) => {
        return (typeof propValue === "number")
            && propValue >= -1;
    };

    public validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        const validationFailedForProperties: string[] = [];
        this.validators.forEach((validator, keyName) => {
            const propertyValue = props.get(keyName);
            if (!validator(propertyValue)) {
                validationFailedForProperties.push(keyName);
            }
        });

        return {
            validationPassed: validationFailedForProperties.length === 0,
            validationFailedForProperties,
        };
    }
}

export class RequestBaseSchemaValidator extends BaseSchemaValidator {
    // Properties to be enforced in the schema
    protected readonly tenantIdKey = "tenantId";
    protected readonly documentIdKey = "documentId";

    constructor() {
        super();
        super.validators.set(this.tenantIdKey, super.idValidation);
        super.validators.set(this.documentIdKey, super.idValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}

export class LambdaSchemaValidator extends RequestBaseSchemaValidator {
    // Properties to be enforced in the schema
    protected readonly clientIdKey = "clientId";
    protected readonly sequenceNumberKey = "sequenceNumber";
    protected readonly clientSequenceNumberKey = "clientSequenceNumber";

    constructor() {
        super();
        super.validators.set(this.clientIdKey, super.idValidation);
        super.validators.set(this.sequenceNumberKey, super.seqNumberValidation);
        super.validators.set(this.clientSequenceNumberKey, super.seqNumberValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}
