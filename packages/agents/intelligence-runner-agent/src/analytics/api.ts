/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * An intelligent service plugin
 */
export interface IIntelligentService {
    /**
     * The name of the intelligent service
     */
    name: string;

    /**
     * The shared documents understood by the intelligent service
     */
    // supportedTypes: string[];

    /**
     * Runs the intelligent service on the provided input
     */
    run(value: any): Promise<any>;
}

/**
 * Factory interface for the creation of a new intelligent service
 */
export interface IIntelligentServiceFactory {
    /**
     * Constructs a new intelligent service
     */
    create(config: any): IIntelligentService;
}
