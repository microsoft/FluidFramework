/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackageEnvironment, IFluidPackage, isFluidPackage } from "./fluidPackage";

/**
 * A specific Fluid package environment for browsers
 */
export interface IFluidBrowserPackageEnvironment extends IFluidPackageEnvironment{
    /**
     * The Universal Module Definition (umd) target specifics the scripts necessary for
     *  loading a packages in a browser environment and finding its entry point
     */
    umd: {
        /**
         * The bundled js files for loading this package. These files will be loaded
         * and executed in order
         */
        files: string[];

        /**
         * The global name that the script entry points will be exposed.
         * This entry point should be an IFluidModule
         */
        library: string;

    };

    /*
     * These targets should include required elements only. Optional, elements
     * should be delay loaded via the script(s) supplied  in the umd target
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link
     */
    audio?: { files: string[] }; // <audio> elements
    document?: { files: string[] }; // <iframe> and <frame> elements
    embed?: { files: string[] }; // <embed> elements
    fetch?: { files: string[] }; // fetch, XHR This value also requires <link> to contain the crossorigin attribute.
    font?: { files: string[] }; // CSS @font-face
    // eslint-disable-next-line max-len
    image?: { files: string[] }; // <img> and <picture> elements with src set or image set attributes, SVG <image> elements, CSS *-image rules
    object?: { files: string[] }; // <object> elements
    script?: { files: string[] }; // <script> elements, Worker importScripts
    style?: { files: string[] }; // <link rel=stylesheet> elements, CSS @import
    track?: { files: string[] }; // <track> elements
    video?: { files: string[] }; // <video> elements
    worker?: { files: string[] }; // Worker, SharedWorker
}

/**
 * A Fluid package for specification for browser environments
 */
export interface IFluidBrowserPackage extends IFluidPackage {
    /**
     * {@inheritdoc}
     */
    fluid: {
        /**
         * The browser specific package information for this package
         */
        browser: IFluidBrowserPackageEnvironment;
        /**
         * {@inheritdoc}
         */
        [environment: string]: IFluidPackageEnvironment;
    }
}

/**
 * Determines if any object is an IFluidBrowserPackage
 * @param maybePkg - The object to check for compatibility with IFluidBrowserPackage
 */
export const isFluidBrowserPackage = (maybePkg: any): maybePkg is Readonly<IFluidBrowserPackage>  =>
    isFluidPackage(maybePkg)
    && typeof maybePkg?.fluid?.browser?.umd?.library === "string"
    && Array.isArray(maybePkg?.fluid?.browser?.umd?.files);
