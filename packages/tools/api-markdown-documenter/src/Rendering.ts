import { ApiItem } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfig } from "./MarkdownDocumenterConfig";

export function renderApiItem(apiItem: ApiItem, config: MarkdownDocumenterConfig): DocSection {
    const output = new DocSection();
}
