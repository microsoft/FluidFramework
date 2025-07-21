/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ID Compressor mode.
 * "on" - compressor is On. It's loaded as part of container load. This mode is sticky - once on, compressor is On for all
 * sessions for a given document. This results in IContainerRuntime.idCompressor to be always available.
 * "delayed" - ID compressor bundle is loaded only on establishing of first delta connection, i.e. it does not impact boot of cotnainer.
 * In such mode IContainerRuntime.idCompressor is not made available (unless previous sessions of same document had it "On").
 * The only thing that is available is IContainerRuntime.generateDocumentUniqueId() that provides opportunistically short IDs.
 * undefined - ID compressor is not loaded.
 * While IContainerRuntime.generateDocumentUniqueId() is available, it will produce long IDs that are do not compress well.
 *
 * @legacy
 * @alpha
 */
export type IdCompressorMode = "on" | "delayed" | undefined;
