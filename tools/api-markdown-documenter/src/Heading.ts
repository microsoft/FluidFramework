/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a document heading.
 */
export interface Heading {
    /**
     * Heading text content.
     */
    title: string;

    /**
     * Heading ID.
     * If not specified, no explicit ID will be associated with the heading.
     */
    id?: string;

    /**
     * Level of the heading.
     * If not specified, it will be automatically generated based on context.
     */
    level?: number;
}
