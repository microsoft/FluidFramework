/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LambdaSchemaValidator, RequestSchemaValidator } from "../schema";
import assert from "assert";

describe("LumberjackSchemaValidator", () => {
    it("Makes sure RequestSchemaValidator can use BaseLumberjackSchemaValidator's base functionality and validation passes.", async () => {
        const validator = new RequestSchemaValidator();
        const props = new Map<string, any>();
        props.set("tenantId", "testTenant");
        props.set("documentId", "testDocument");

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure RequestSchemaValidator validation fails due to missing properties on the object being validated.", async () => {
        const validator = new RequestSchemaValidator();
        const props = new Map<string, any>();
        props.set("tenantId", "testTenant");
        // 'documentId' is missing and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 1);
        assert.strictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure RequestSchemaValidator validation fails due to incorrect data types and values.", async () => {
        const validator = new RequestSchemaValidator();
        const props = new Map<string, any>();
        props.set("tenantId", ""); // 'tenantId' is an empty string and validation should fail
        props.set("documentId", 5); // 'documentId' type is wrong - the validator expects it to be a string

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 2);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure LambdaSchemaValidator can use RequestSchemaValidator's base functionality and validation passes.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set("tenantId", "testTenant");
        props.set("documentId", "testDocument");
        props.set("clientId", "testClient");
        props.set("sequenceNumber", 1);
        props.set("clientSequenceNumber", 2);

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure LambdaSchemaValidator validation fails if RequestSchemaValidator's required properties are not present.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set("clientId", "testClient");
        props.set("sequenceNumber", 1);
        props.set("clientSequenceNumber", 2);
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
        props.set("tenantId", "testTenant");
        props.set("documentId", "testDocument");
        // 'clientId' is missing and validation should fail
        props.set("sequenceNumber", -4); // value is out of allowed range and validation should fail
        props.set("clientSequenceNumber", "test"); // type is wrong and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 3);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("clientId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("sequenceNumber"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("clientSequenceNumber"), -1);
    });
});
