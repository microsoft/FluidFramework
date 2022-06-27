/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Utility class in charge of input validation.
 */
export class InputValidator {
    /**
     * Validate that a string is not null, undefined, empty or entirely whitespace
     */
    public static validateNotEmpty(value: string) {
      if (value === undefined || value === null) {
        throw new Error(`asset, component or property name of value: <${ value }> is not a valid value`);
      } else if (typeof value !== "string") {
        throw new TypeError(`asset, component or property name of value: <${ value }> should be of type string`);
      } else if (value.length === 0 || value.trim().length === 0) {
        throw new Error(`asset, component or property name of value: <${ value }> should not be empty`);
      }
    }
  }
