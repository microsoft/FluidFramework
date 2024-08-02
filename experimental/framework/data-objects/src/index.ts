/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Experimental data object providing access to signals infrastructure.
 *
 * @packageDocumentation
 *
 * @privateRemarks
 * This package is tagged despite being experimental to make API surface
 * more visible. Import specs do not need qualified with `/alpha`, etc.
 */

export { IRuntimeSignaler, ISignaler, Signaler, SignalListener } from "./signaler/index.js";
