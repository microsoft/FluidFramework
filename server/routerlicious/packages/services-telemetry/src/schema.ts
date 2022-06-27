/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackSchemaValidator, ILumberjackSchemaValidationResult,
    BaseTelemetryProperties, QueuedMessageProperties } from "./resources";

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
    protected readonly stringValidation = (propValue: any) => {
        return this.isUndefined(propValue)
            || (this.isString(propValue) && propValue.length > 0);
    };

    protected readonly numberValidation = (propValue: any) => {
        return this.isUndefined(propValue)
            || (this.isNumber(propValue));
    };

    protected readonly positiveNumberValidation = (propValue: any) => {
        return this.isUndefined(propValue)
            || (this.isNumber(propValue) && propValue >= -1);
    };

    // Helpers
    private isUndefined(propValue: any): propValue is undefined {
        return propValue === undefined;
    }

    private isNumber(propValue: any): propValue is number {
        return typeof (propValue) === "number";
    }

    private isString(propValue: any): propValue is string {
        return typeof (propValue) === "string";
    }
}

export class BasePropertiesValidator extends BaseLumberjackSchemaValidator {
    constructor() {
        super();
        this.validators.set(BaseTelemetryProperties.tenantId, this.stringValidation);
        this.validators.set(BaseTelemetryProperties.documentId, this.stringValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}

export class LambdaSchemaValidator extends BasePropertiesValidator {
    constructor() {
        super();
        this.validators.set(QueuedMessageProperties.topic, this.stringValidation);
        this.validators.set(QueuedMessageProperties.partition, this.positiveNumberValidation);
        this.validators.set(QueuedMessageProperties.offset, this.numberValidation);
    }

    validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
        return super.validate(props);
    }
}
