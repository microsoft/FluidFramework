/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaProperties } from "../resources";
import { LambdaSchemaValidator, DocumentSchemaValidator } from "../schema";
import assert from "assert";

describe("LumberjackSchemaValidator", () => {
    it("Makes sure DocumentSchemaValidator can use BaseLumberjackSchemaValidator's base functionality and validation passes.", async () => {
        const validator = new DocumentSchemaValidator();
        const props = new Map<string, any>();
        props.set(SchemaProperties.tenantId, "testTenant");
        props.set(SchemaProperties.documentId, "testDocument");

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure DocumentSchemaValidator validation fails due to missing properties on the object being validated.", async () => {
        const validator = new DocumentSchemaValidator();
        const props = new Map<string, any>();
        props.set(SchemaProperties.tenantId, undefined);
        // 'documentId' is missing and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 1);
        assert.strictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure DocumentSchemaValidator validation fails due to incorrect data types and values.", async () => {
        const validator = new DocumentSchemaValidator();
        const props = new Map<string, any>();
        props.set(SchemaProperties.tenantId, ""); // 'tenantId' is an empty string and validation should fail
        props.set(SchemaProperties.documentId, 5); // 'documentId' type is wrong - the validator expects it to be a string

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 2);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("tenantId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("documentId"), -1);
    });

    it("Makes sure LambdaSchemaValidator can use DocumentSchemaValidator's base functionality and validation passes.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set(SchemaProperties.tenantId, "testTenant");
        props.set(SchemaProperties.documentId, "testDocument");
        props.set(SchemaProperties.clientId, "testClient");
        props.set(SchemaProperties.sequenceNumber, 1);
        props.set(SchemaProperties.clientSequenceNumber, 2);

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, true);
        assert.strictEqual(result.validationFailedForProperties.length, 0);
    });

    it("Makes sure LambdaSchemaValidator validation fails if DocumentSchemaValidator's required properties are not present.", async () => {
        const validator = new LambdaSchemaValidator();
        const props = new Map<string, any>();
        props.set(SchemaProperties.clientId, "testClient");
        props.set(SchemaProperties.sequenceNumber, 1);
        props.set(SchemaProperties.clientSequenceNumber, undefined);
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
        props.set(SchemaProperties.tenantId, "testTenant");
        props.set(SchemaProperties.documentId, "testDocument");
        // 'clientId' is missing and validation should fail
        props.set(SchemaProperties.sequenceNumber, -4); // value is out of allowed range and validation should fail
        props.set(SchemaProperties.clientSequenceNumber, "test"); // type is wrong and validation should fail

        const result = validator.validate(props);
        assert.strictEqual(result.validationPassed, false);
        assert.strictEqual(result.validationFailedForProperties.length, 3);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("clientId"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("sequenceNumber"), -1);
        assert.notStrictEqual(result.validationFailedForProperties.indexOf("clientSequenceNumber"), -1);
    });
});
