/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IndentedWriter as DocumentWriter } from "@microsoft/api-documenter/lib/utils/IndentedWriter";
import { StringBuilder } from "@microsoft/tsdoc";

// Convenience re-export to prevent us from having to tunnel into api-documenter in multiple places
// TODO: consider replacing this with some standard string writer, so we can remove our dependency on api-documenter.
export { IndentedWriter as DocumentWriter } from "@microsoft/api-documenter/lib/utils/IndentedWriter";

/**
 * Creates a new `DocumentWriter` for use in rendering.
 *
 * @remarks Helpful wrapper so that consumers don't have to instantiate their own `StringBuilder`.
 *
 * @public
 */
export function createDocumentWriter(): DocumentWriter {
	return new DocumentWriter(new StringBuilder());
}
