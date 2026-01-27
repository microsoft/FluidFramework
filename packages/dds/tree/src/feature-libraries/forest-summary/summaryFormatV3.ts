/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * From {@link ForestSummaryFormatVersion.v3 | version 3} onwards, the inline portion of the top-level forest content
 * is stored in a summary blob with this key.
 * If the summary is not incremental, the content stored is the entire forest content.
 * If the summary is incremental, the contents of the incremental chunks is stored separately:
 * The contents of an incremental chunk is under a summary tree node with its {@link ChunkReferenceId} as the key.
 * The inline portion of the chunk content is encoded with the forest codec and is stored in a blob with this key as
 * well. The rest of the chunk contents  is stored in the summary tree under the summary tree node.
 *
 * @remarks
 * See the summary format in {@link ForestIncrementalSummaryBuilder} for more details.
 */
export const summaryContentBlobKey = "contents";
