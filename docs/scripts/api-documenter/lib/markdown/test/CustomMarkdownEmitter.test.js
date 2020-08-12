"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const CustomDocNodeKind_1 = require("../../nodes/CustomDocNodeKind");
const DocHeading_1 = require("../../nodes/DocHeading");
const DocEmphasisSpan_1 = require("../../nodes/DocEmphasisSpan");
const DocTable_1 = require("../../nodes/DocTable");
const DocTableRow_1 = require("../../nodes/DocTableRow");
const DocTableCell_1 = require("../../nodes/DocTableCell");
const CustomMarkdownEmitter_1 = require("../CustomMarkdownEmitter");
const api_extractor_model_1 = require("@microsoft/api-extractor-model");
test('render Markdown from TSDoc', () => {
    const configuration = CustomDocNodeKind_1.CustomDocNodes.configuration;
    const output = new tsdoc_1.DocSection({ configuration });
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Simple bold test' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocPlainText({ configuration, text: 'This is a ' }),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'bold' })]),
            new tsdoc_1.DocPlainText({ configuration, text: ' word.' })
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'All whitespace bold' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: '  ' })])
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Newline bold' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                new tsdoc_1.DocPlainText({ configuration, text: 'line 1' }),
                new tsdoc_1.DocSoftBreak({ configuration }),
                new tsdoc_1.DocPlainText({ configuration, text: 'line 2' })
            ])
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Newline bold with spaces' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                new tsdoc_1.DocPlainText({ configuration, text: '  line 1  ' }),
                new tsdoc_1.DocSoftBreak({ configuration }),
                new tsdoc_1.DocPlainText({ configuration, text: '  line 2  ' }),
                new tsdoc_1.DocSoftBreak({ configuration }),
                new tsdoc_1.DocPlainText({ configuration, text: '  line 3  ' })
            ])
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Adjacent bold regions' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'one' })]),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'two' })]),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                new tsdoc_1.DocPlainText({ configuration, text: ' three ' })
            ]),
            new tsdoc_1.DocPlainText({ configuration, text: '' }),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'four' })]),
            new tsdoc_1.DocPlainText({ configuration, text: 'non-bold' }),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'five' })])
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Adjacent to other characters' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocLinkTag({
                configuration,
                tagName: '@link',
                linkText: 'a link',
                urlDestination: './index.md'
            }),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'bold' })]),
            new tsdoc_1.DocPlainText({ configuration, text: 'non-bold' }),
            new tsdoc_1.DocPlainText({ configuration, text: 'more-non-bold' })
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Unknown block tag' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocBlockTag({
                configuration,
                tagName: '@unknown'
            }),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [new tsdoc_1.DocPlainText({ configuration, text: 'bold' })]),
            new tsdoc_1.DocPlainText({ configuration, text: 'non-bold' }),
            new tsdoc_1.DocPlainText({ configuration, text: 'more-non-bold' })
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Bad characters' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                new tsdoc_1.DocPlainText({ configuration, text: '*one*two*' })
            ]),
            new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                new tsdoc_1.DocPlainText({ configuration, text: 'three*four' })
            ])
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Characters that should be escaped' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocPlainText({ configuration, text: 'Double-encoded JSON: "{ \\"A\\": 123}"' })
        ]),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocPlainText({ configuration, text: 'HTML chars: <script>alert("[You] are #1!");</script>' })
        ]),
        new tsdoc_1.DocParagraph({ configuration }, [new tsdoc_1.DocPlainText({ configuration, text: 'HTML escape: &quot;' })]),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocPlainText({ configuration, text: '3 or more hyphens: - -- --- ---- ----- ------' })
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'HTML tag' }),
        new tsdoc_1.DocParagraph({ configuration }, [
            new tsdoc_1.DocHtmlStartTag({ configuration, name: 'b' }),
            new tsdoc_1.DocPlainText({ configuration, text: 'bold' }),
            new tsdoc_1.DocHtmlEndTag({ configuration, name: 'b' })
        ])
    ]);
    output.appendNodes([
        new DocHeading_1.DocHeading({ configuration, title: 'Table' }),
        new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Header 1', 'Header 2']
        }, [
            new DocTableRow_1.DocTableRow({ configuration }, [
                new DocTableCell_1.DocTableCell({ configuration }, [
                    new tsdoc_1.DocParagraph({ configuration }, [new tsdoc_1.DocPlainText({ configuration, text: 'Cell 1' })])
                ]),
                new DocTableCell_1.DocTableCell({ configuration }, [
                    new tsdoc_1.DocParagraph({ configuration }, [new tsdoc_1.DocPlainText({ configuration, text: 'Cell 2' })])
                ])
            ])
        ])
    ]);
    const stringBuilder = new tsdoc_1.StringBuilder();
    const apiModel = new api_extractor_model_1.ApiModel();
    const markdownEmitter = new CustomMarkdownEmitter_1.CustomMarkdownEmitter(apiModel);
    markdownEmitter.emit(stringBuilder, output, {
        contextApiItem: undefined,
        onGetFilenameForApiItem: (apiItem) => {
            return '#';
        }
    });
    expect(stringBuilder).toMatchSnapshot();
});
//# sourceMappingURL=CustomMarkdownEmitter.test.js.map