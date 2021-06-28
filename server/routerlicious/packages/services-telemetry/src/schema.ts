/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackSchemaValidator, ILumberjackSchemaValidationResult } from "./resources";

export abstract class BaseLumberjackSchemaValidator implements ILumberjackSchemaValidator {
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

export class RequestSchemaValidator extends BaseLumberjackSchemaValidator {
    // Properties to be enforced in the schema
    protected readonly tenantIdKey = "tenantId";
    protected readonly documentIdKey = "documentId";

    constructor() {
        super();
        this.validators.set(this.tenantIdKey, this.idValidation);
        this.validators.set(this.documentIdKey, this.idValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}

export class LambdaSchemaValidator extends RequestSchemaValidator {
    // Properties to be enforced in the schema
    protected readonly clientIdKey = "clientId";
    protected readonly sequenceNumberKey = "sequenceNumber";
    protected readonly clientSequenceNumberKey = "clientSequenceNumber";

    constructor() {
        super();
        this.validators.set(this.clientIdKey, this.idValidation);
        this.validators.set(this.sequenceNumberKey, this.seqNumberValidation);
        this.validators.set(this.clientSequenceNumberKey, this.seqNumberValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}
