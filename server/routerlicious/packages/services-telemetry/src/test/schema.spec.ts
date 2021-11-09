/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseTelemetryProperties, QueuedMessageProperties } from "../resources";
import { LambdaSchemaValidator, BasePropertiesValidator } from "../schema";
import assert from "assert";

describe("LumberjackSchemaValidator", () => {
    it("Makes sure BasePropertiesValidator can use BaseLumberjackSchemaValidator's base functionality and validation passes.", async () => {
        const validator = new BasePropertiesValidator();
        const props = new Map<string, any>();
        props.set(BaseTelemetryProperties.tenantId, "testTenant");
        props.set(BaseTelemetryProperties.documentId, "testDocument");

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure BasePropertiesValidator validation fails due to missing properties on the object being validated.", async () => {
        const validator = new BasePropertiesValidator();
        const props = new Map<string, any>();
        props.set(BaseTelemetryProperties.tenantId, undefined);
        // 'documentId' is missing and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 1);
        assert.strictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure BasePropertiesValidator validation fails due to incorrect data types and values.", async () => {
        const validator = new BasePropertiesValidator();
        const props = new Map<string, any>();
        props.set(BaseTelemetryProperties.tenantId, ""); // 'tenantId' is an empty string and validation should fail
        props.set(BaseTelemetryProperties.documentId, 5); // 'documentId' type is wrong - the validator expects it to be a string

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 2);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure LambdaSchemaValidator can use BasePropertiesValidator's base functionality and validation passes.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set(BaseTelemetryProperties.tenantId, "testTenant");
        props.set(BaseTelemetryProperties.documentId, "testDocument");
        props.set(QueuedMessageProperties.topic, "testClient");
        props.set(QueuedMessageProperties.partition, 1);
        props.set(QueuedMessageProperties.offset, 2);

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure LambdaSchemaValidator validation fails if BasePropertiesValidator's required properties are not present.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set(QueuedMessageProperties.topic, "testClient");
        props.set(QueuedMessageProperties.partition, 1);
        props.set(QueuedMessageProperties.offset, undefined);
        // 'tenantId' and 'documentId' are missing and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 2);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure LambdaSchemaValidator validation fails if properties are missing or types/values are incorrect.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set(BaseTelemetryProperties.tenantId, "testTenant");
        props.set(BaseTelemetryProperties.documentId, "testDocument");
        // 'clientId' is missing and validation should fail
        props.set(QueuedMessageProperties.partition, -4); // value is out of allowed range and validation should fail
        props.set(QueuedMessageProperties.offset, "test"); // type is wrong and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 3);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("topic"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("partition"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("offset"), -1);
    });
});
