(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[19],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/pug/pug.js":
/*!**********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/pug/pug.js ***!
  \**********************************************************************/
/*! exports provided: conf, language */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "conf", function() { return conf; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "language", function() { return language; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var conf = {
    comments: {
        lineComment: '//'
    },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
        { open: '"', close: '"', notIn: ['string', 'comment'] },
        { open: '\'', close: '\'', notIn: ['string', 'comment'] },
        { open: '{', close: '}', notIn: ['string', 'comment'] },
        { open: '[', close: ']', notIn: ['string', 'comment'] },
        { open: '(', close: ')', notIn: ['string', 'comment'] },
    ],
    folding: {
        offSide: true
    }
};
var language = {
    defaultToken: '',
    tokenPostfix: '.pug',
    ignoreCase: true,
    brackets: [
        { token: 'delimiter.curly', open: '{', close: '}' },
        { token: 'delimiter.array', open: '[', close: ']' },
        { token: 'delimiter.parenthesis', open: '(', close: ')' }
    ],
    keywords: ['append', 'block', 'case', 'default', 'doctype', 'each', 'else', 'extends',
        'for', 'if', 'in', 'include', 'mixin', 'typeof', 'unless', 'var', 'when'],
    tags: [
        'a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio',
        'b', 'base', 'basefont', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
        'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command',
        'datalist', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
        'em', 'embed',
        'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
        'i', 'iframe', 'img', 'input', 'ins',
        'keygen', 'kbd',
        'label', 'li', 'link',
        'map', 'mark', 'menu', 'meta', 'meter',
        'nav', 'noframes', 'noscript',
        'object', 'ol', 'optgroup', 'option', 'output',
        'p', 'param', 'pre', 'progress',
        'q',
        'rp', 'rt', 'ruby',
        's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup',
        'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'tracks', 'tt',
        'u', 'ul',
        'video',
        'wbr'
    ],
    // we include these common regular expressions
    symbols: /[\+\-\*\%\&\|\!\=\/\.\,\:]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
        root: [
            // Tag or a keyword at start
            [/^(\s*)([a-zA-Z_-][\w-]*)/,
                {
                    cases: {
                        '$2@tags': {
                            cases: {
                                '@eos': ['', 'tag'],
                                '@default': ['', { token: 'tag', next: '@tag.$1' },]
                            }
                        },
                        '$2@keywords': ['', { token: 'keyword.$2' },],
                        '@default': ['', '',]
                    }
                }
            ],
            // id
            [/^(\s*)(#[a-zA-Z_-][\w-]*)/, {
                    cases: {
                        '@eos': ['', 'tag.id'],
                        '@default': ['', { token: 'tag.id', next: '@tag.$1' }]
                    }
                }],
            // class
            [/^(\s*)(\.[a-zA-Z_-][\w-]*)/, {
                    cases: {
                        '@eos': ['', 'tag.class'],
                        '@default': ['', { token: 'tag.class', next: '@tag.$1' }]
                    }
                }],
            // plain text with pipe
            [/^(\s*)(\|.*)$/, ''],
            { include: '@whitespace' },
            // keywords
            [/[a-zA-Z_$][\w$]*/, {
                    cases: {
                        '@keywords': { token: 'keyword.$0' },
                        '@default': ''
                    }
                }],
            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/@symbols/, 'delimiter'],
            // numbers
            [/\d+\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/\d+/, 'number'],
            // strings:
            [/"/, 'string', '@string."'],
            [/'/, 'string', '@string.\''],
        ],
        tag: [
            [/(\.)(\s*$)/, [{ token: 'delimiter', next: '@blockText.$S2.' }, '']],
            [/\s+/, { token: '', next: '@simpleText' }],
            // id
            [/#[a-zA-Z_-][\w-]*/, {
                    cases: {
                        '@eos': { token: 'tag.id', next: '@pop' },
                        '@default': 'tag.id'
                    }
                }],
            // class
            [/\.[a-zA-Z_-][\w-]*/, {
                    cases: {
                        '@eos': { token: 'tag.class', next: '@pop' },
                        '@default': 'tag.class'
                    }
                }],
            // attributes
            [/\(/, { token: 'delimiter.parenthesis', next: '@attributeList' }],
        ],
        simpleText: [
            [/[^#]+$/, { token: '', next: '@popall' }],
            [/[^#]+/, { token: '' }],
            // interpolation
            [/(#{)([^}]*)(})/, {
                    cases: {
                        '@eos': ['interpolation.delimiter', 'interpolation', { token: 'interpolation.delimiter', next: '@popall' }],
                        '@default': ['interpolation.delimiter', 'interpolation', 'interpolation.delimiter']
                    }
                }],
            [/#$/, { token: '', next: '@popall' }],
            [/#/, '']
        ],
        attributeList: [
            [/\s+/, ''],
            [/(\w+)(\s*=\s*)("|')/, ['attribute.name', 'delimiter', { token: 'attribute.value', next: '@value.$3' }]],
            [/\w+/, 'attribute.name'],
            [/,/, {
                    cases: {
                        '@eos': { token: 'attribute.delimiter', next: '@popall' },
                        '@default': 'attribute.delimiter'
                    }
                }],
            [/\)$/, { token: 'delimiter.parenthesis', next: '@popall' }],
            [/\)/, { token: 'delimiter.parenthesis', next: '@pop' }],
        ],
        whitespace: [
            [/^(\s*)(\/\/.*)$/, { token: 'comment', next: '@blockText.$1.comment' }],
            [/[ \t\r\n]+/, ''],
            [/<!--/, { token: 'comment', next: '@comment' }],
        ],
        blockText: [
            [/^\s+.*$/, {
                    cases: {
                        '($S2\\s+.*$)': { token: '$S3' },
                        '@default': { token: '@rematch', next: '@popall' }
                    }
                }],
            [/./, { token: '@rematch', next: '@popall' }]
        ],
        comment: [
            [/[^<\-]+/, 'comment.content'],
            [/-->/, { token: 'comment', next: '@pop' }],
            [/<!--/, 'comment.content.invalid'],
            [/[<\-]/, 'comment.content']
        ],
        string: [
            [/[^\\"'#]+/, {
                    cases: {
                        '@eos': { token: 'string', next: '@popall' },
                        '@default': 'string'
                    }
                }],
            [/@escapes/, {
                    cases: {
                        '@eos': { token: 'string.escape', next: '@popall' },
                        '@default': 'string.escape'
                    }
                }],
            [/\\./, {
                    cases: {
                        '@eos': { token: 'string.escape.invalid', next: '@popall' },
                        '@default': 'string.escape.invalid'
                    }
                }],
            // interpolation
            [/(#{)([^}]*)(})/, ['interpolation.delimiter', 'interpolation', 'interpolation.delimiter']],
            [/#/, 'string'],
            [/["']/, {
                    cases: {
                        '$#==$S2': { token: 'string', next: '@pop' },
                        '@default': { token: 'string' }
                    }
                }],
        ],
        // Almost identical to above, except for escapes and the output token
        value: [
            [/[^\\"']+/, {
                    cases: {
                        '@eos': { token: 'attribute.value', next: '@popall' },
                        '@default': 'attribute.value'
                    }
                }],
            [/\\./, {
                    cases: {
                        '@eos': { token: 'attribute.value', next: '@popall' },
                        '@default': 'attribute.value'
                    }
                }],
            [/["']/, {
                    cases: {
                        '$#==$S2': { token: 'attribute.value', next: '@pop' },
                        '@default': { token: 'attribute.value' }
                    }
                }],
        ],
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvcHVnL3B1Zy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNOO0FBQ1A7QUFDQTtBQUNBLEtBQUs7QUFDTCxrQkFBa0IsS0FBSztBQUN2QjtBQUNBLFNBQVMsc0RBQXNEO0FBQy9ELFNBQVMsd0RBQXdEO0FBQ2pFLFNBQVMsU0FBUyxZQUFZLGlDQUFpQztBQUMvRCxTQUFTLHNEQUFzRDtBQUMvRCxTQUFTLHNEQUFzRDtBQUMvRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ087QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMsbUNBQW1DLFlBQVksR0FBRztBQUMzRCxTQUFTLGtEQUFrRDtBQUMzRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw4Q0FBOEMsSUFBSSxjQUFjLEVBQUUsY0FBYyxFQUFFO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtEQUFrRCxnQ0FBZ0M7QUFDbEY7QUFDQSx5QkFBeUI7QUFDekIsNkNBQTZDLHNCQUFzQjtBQUNuRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMENBQTBDLG1DQUFtQztBQUM3RTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLDBDQUEwQyxzQ0FBc0M7QUFDaEY7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0E7QUFDQTtBQUNBLHNDQUFzQyxzQkFBc0I7QUFDNUQ7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2QkFBNkIsOENBQThDO0FBQzNFLHFCQUFxQixpQ0FBaUM7QUFDdEQ7QUFDQTtBQUNBO0FBQ0EsaUNBQWlDLGdDQUFnQztBQUNqRTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBLGlDQUFpQyxtQ0FBbUM7QUFDcEU7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBLG9CQUFvQix5REFBeUQ7QUFDN0U7QUFDQTtBQUNBLHdCQUF3Qiw2QkFBNkI7QUFDckQsdUJBQXVCLFlBQVk7QUFDbkM7QUFDQSxpQkFBaUIsS0FBSyxLQUFLO0FBQzNCO0FBQ0EsOEVBQThFLG9EQUFvRDtBQUNsSTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCLG9CQUFvQiw2QkFBNkI7QUFDakQ7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxRUFBcUUsOENBQThDO0FBQ25IO0FBQ0E7QUFDQTtBQUNBLGlDQUFpQyxnREFBZ0Q7QUFDakY7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQixxQkFBcUIsa0RBQWtEO0FBQ3ZFLG9CQUFvQiwrQ0FBK0M7QUFDbkU7QUFDQTtBQUNBLGlDQUFpQyxrREFBa0Q7QUFDbkY7QUFDQSxzQkFBc0IscUNBQXFDO0FBQzNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0EseUNBQXlDLGVBQWU7QUFDeEQscUNBQXFDO0FBQ3JDO0FBQ0EsaUJBQWlCO0FBQ2pCLG1CQUFtQixxQ0FBcUM7QUFDeEQ7QUFDQTtBQUNBO0FBQ0EscUJBQXFCLGlDQUFpQztBQUN0RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQ0FBaUMsbUNBQW1DO0FBQ3BFO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBLGlDQUFpQywwQ0FBMEM7QUFDM0U7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsaUNBQWlDLGtEQUFrRDtBQUNuRjtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0EsaUJBQWlCLEtBQUssS0FBSztBQUMzQjtBQUNBO0FBQ0E7QUFDQSxvQ0FBb0MsZ0NBQWdDO0FBQ3BFLHFDQUFxQztBQUNyQztBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUNBQWlDLDRDQUE0QztBQUM3RTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxpQ0FBaUMsNENBQTRDO0FBQzdFO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBLG9DQUFvQyx5Q0FBeUM7QUFDN0UscUNBQXFDO0FBQ3JDO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0EsS0FBSztBQUNMIiwiZmlsZSI6IjE5LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcvLydcclxuICAgIH0sXHJcbiAgICBicmFja2V0czogW1sneycsICd9J10sIFsnWycsICddJ10sIFsnKCcsICcpJ11dLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9Jywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgIF0sXHJcbiAgICBmb2xkaW5nOiB7XHJcbiAgICAgICAgb2ZmU2lkZTogdHJ1ZVxyXG4gICAgfVxyXG59O1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgZGVmYXVsdFRva2VuOiAnJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy5wdWcnLFxyXG4gICAgaWdub3JlQ2FzZTogdHJ1ZSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5jdXJseScsIG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIuYXJyYXknLCBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJywgb3BlbjogJygnLCBjbG9zZTogJyknIH1cclxuICAgIF0sXHJcbiAgICBrZXl3b3JkczogWydhcHBlbmQnLCAnYmxvY2snLCAnY2FzZScsICdkZWZhdWx0JywgJ2RvY3R5cGUnLCAnZWFjaCcsICdlbHNlJywgJ2V4dGVuZHMnLFxyXG4gICAgICAgICdmb3InLCAnaWYnLCAnaW4nLCAnaW5jbHVkZScsICdtaXhpbicsICd0eXBlb2YnLCAndW5sZXNzJywgJ3ZhcicsICd3aGVuJ10sXHJcbiAgICB0YWdzOiBbXHJcbiAgICAgICAgJ2EnLCAnYWJicicsICdhY3JvbnltJywgJ2FkZHJlc3MnLCAnYXJlYScsICdhcnRpY2xlJywgJ2FzaWRlJywgJ2F1ZGlvJyxcclxuICAgICAgICAnYicsICdiYXNlJywgJ2Jhc2Vmb250JywgJ2JkaScsICdiZG8nLCAnYmxvY2txdW90ZScsICdib2R5JywgJ2JyJywgJ2J1dHRvbicsXHJcbiAgICAgICAgJ2NhbnZhcycsICdjYXB0aW9uJywgJ2NlbnRlcicsICdjaXRlJywgJ2NvZGUnLCAnY29sJywgJ2NvbGdyb3VwJywgJ2NvbW1hbmQnLFxyXG4gICAgICAgICdkYXRhbGlzdCcsICdkZCcsICdkZWwnLCAnZGV0YWlscycsICdkZm4nLCAnZGl2JywgJ2RsJywgJ2R0JyxcclxuICAgICAgICAnZW0nLCAnZW1iZWQnLFxyXG4gICAgICAgICdmaWVsZHNldCcsICdmaWdjYXB0aW9uJywgJ2ZpZ3VyZScsICdmb250JywgJ2Zvb3RlcicsICdmb3JtJywgJ2ZyYW1lJywgJ2ZyYW1lc2V0JyxcclxuICAgICAgICAnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnaDUnLCAnaDYnLCAnaGVhZCcsICdoZWFkZXInLCAnaGdyb3VwJywgJ2hyJywgJ2h0bWwnLFxyXG4gICAgICAgICdpJywgJ2lmcmFtZScsICdpbWcnLCAnaW5wdXQnLCAnaW5zJyxcclxuICAgICAgICAna2V5Z2VuJywgJ2tiZCcsXHJcbiAgICAgICAgJ2xhYmVsJywgJ2xpJywgJ2xpbmsnLFxyXG4gICAgICAgICdtYXAnLCAnbWFyaycsICdtZW51JywgJ21ldGEnLCAnbWV0ZXInLFxyXG4gICAgICAgICduYXYnLCAnbm9mcmFtZXMnLCAnbm9zY3JpcHQnLFxyXG4gICAgICAgICdvYmplY3QnLCAnb2wnLCAnb3B0Z3JvdXAnLCAnb3B0aW9uJywgJ291dHB1dCcsXHJcbiAgICAgICAgJ3AnLCAncGFyYW0nLCAncHJlJywgJ3Byb2dyZXNzJyxcclxuICAgICAgICAncScsXHJcbiAgICAgICAgJ3JwJywgJ3J0JywgJ3J1YnknLFxyXG4gICAgICAgICdzJywgJ3NhbXAnLCAnc2NyaXB0JywgJ3NlY3Rpb24nLCAnc2VsZWN0JywgJ3NtYWxsJywgJ3NvdXJjZScsICdzcGFuJywgJ3N0cmlrZScsICdzdHJvbmcnLCAnc3R5bGUnLCAnc3ViJywgJ3N1bW1hcnknLCAnc3VwJyxcclxuICAgICAgICAndGFibGUnLCAndGJvZHknLCAndGQnLCAndGV4dGFyZWEnLCAndGZvb3QnLCAndGgnLCAndGhlYWQnLCAndGltZScsICd0aXRsZScsICd0cicsICd0cmFja3MnLCAndHQnLFxyXG4gICAgICAgICd1JywgJ3VsJyxcclxuICAgICAgICAndmlkZW8nLFxyXG4gICAgICAgICd3YnInXHJcbiAgICBdLFxyXG4gICAgLy8gd2UgaW5jbHVkZSB0aGVzZSBjb21tb24gcmVndWxhciBleHByZXNzaW9uc1xyXG4gICAgc3ltYm9sczogL1tcXCtcXC1cXCpcXCVcXCZcXHxcXCFcXD1cXC9cXC5cXCxcXDpdKy8sXHJcbiAgICBlc2NhcGVzOiAvXFxcXCg/OlthYmZucnR2XFxcXFwiJ118eFswLTlBLUZhLWZdezEsNH18dVswLTlBLUZhLWZdezR9fFVbMC05QS1GYS1mXXs4fSkvLFxyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICAvLyBUYWcgb3IgYSBrZXl3b3JkIGF0IHN0YXJ0XHJcbiAgICAgICAgICAgIFsvXihcXHMqKShbYS16QS1aXy1dW1xcdy1dKikvLFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICckMkB0YWdzJzoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IFsnJywgJ3RhZyddLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IFsnJywgeyB0b2tlbjogJ3RhZycsIG5leHQ6ICdAdGFnLiQxJyB9LF1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQyQGtleXdvcmRzJzogWycnLCB7IHRva2VuOiAna2V5d29yZC4kMicgfSxdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiBbJycsICcnLF1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIC8vIGlkXHJcbiAgICAgICAgICAgIFsvXihcXHMqKSgjW2EtekEtWl8tXVtcXHctXSopLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogWycnLCAndGFnLmlkJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IFsnJywgeyB0b2tlbjogJ3RhZy5pZCcsIG5leHQ6ICdAdGFnLiQxJyB9XVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBjbGFzc1xyXG4gICAgICAgICAgICBbL14oXFxzKikoXFwuW2EtekEtWl8tXVtcXHctXSopLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogWycnLCAndGFnLmNsYXNzJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IFsnJywgeyB0b2tlbjogJ3RhZy5jbGFzcycsIG5leHQ6ICdAdGFnLiQxJyB9XVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBwbGFpbiB0ZXh0IHdpdGggcGlwZVxyXG4gICAgICAgICAgICBbL14oXFxzKikoXFx8LiopJC8sICcnXSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIC8vIGtleXdvcmRzXHJcbiAgICAgICAgICAgIFsvW2EtekEtWl8kXVtcXHckXSovLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6IHsgdG9rZW46ICdrZXl3b3JkLiQwJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBkZWxpbWl0ZXJzIGFuZCBvcGVyYXRvcnNcclxuICAgICAgICAgICAgWy9be30oKVxcW1xcXV0vLCAnQGJyYWNrZXRzJ10sXHJcbiAgICAgICAgICAgIFsvQHN5bWJvbHMvLCAnZGVsaW1pdGVyJ10sXHJcbiAgICAgICAgICAgIC8vIG51bWJlcnNcclxuICAgICAgICAgICAgWy9cXGQrXFwuXFxkKyhbZUVdW1xcLStdP1xcZCspPy8sICdudW1iZXIuZmxvYXQnXSxcclxuICAgICAgICAgICAgWy9cXGQrLywgJ251bWJlciddLFxyXG4gICAgICAgICAgICAvLyBzdHJpbmdzOlxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAc3RyaW5nLlwiJ10sXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcnLCAnQHN0cmluZy5cXCcnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHRhZzogW1xyXG4gICAgICAgICAgICBbLyhcXC4pKFxccyokKS8sIFt7IHRva2VuOiAnZGVsaW1pdGVyJywgbmV4dDogJ0BibG9ja1RleHQuJFMyLicgfSwgJyddXSxcclxuICAgICAgICAgICAgWy9cXHMrLywgeyB0b2tlbjogJycsIG5leHQ6ICdAc2ltcGxlVGV4dCcgfV0sXHJcbiAgICAgICAgICAgIC8vIGlkXHJcbiAgICAgICAgICAgIFsvI1thLXpBLVpfLV1bXFx3LV0qLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogeyB0b2tlbjogJ3RhZy5pZCcsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAndGFnLmlkJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBjbGFzc1xyXG4gICAgICAgICAgICBbL1xcLlthLXpBLVpfLV1bXFx3LV0qLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogeyB0b2tlbjogJ3RhZy5jbGFzcycsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAndGFnLmNsYXNzJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBhdHRyaWJ1dGVzXHJcbiAgICAgICAgICAgIFsvXFwoLywgeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycsIG5leHQ6ICdAYXR0cmlidXRlTGlzdCcgfV0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzaW1wbGVUZXh0OiBbXHJcbiAgICAgICAgICAgIFsvW14jXSskLywgeyB0b2tlbjogJycsIG5leHQ6ICdAcG9wYWxsJyB9XSxcclxuICAgICAgICAgICAgWy9bXiNdKy8sIHsgdG9rZW46ICcnIH1dLFxyXG4gICAgICAgICAgICAvLyBpbnRlcnBvbGF0aW9uXHJcbiAgICAgICAgICAgIFsvKCN7KShbXn1dKikofSkvLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0Blb3MnOiBbJ2ludGVycG9sYXRpb24uZGVsaW1pdGVyJywgJ2ludGVycG9sYXRpb24nLCB7IHRva2VuOiAnaW50ZXJwb2xhdGlvbi5kZWxpbWl0ZXInLCBuZXh0OiAnQHBvcGFsbCcgfV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IFsnaW50ZXJwb2xhdGlvbi5kZWxpbWl0ZXInLCAnaW50ZXJwb2xhdGlvbicsICdpbnRlcnBvbGF0aW9uLmRlbGltaXRlciddXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIFsvIyQvLCB7IHRva2VuOiAnJywgbmV4dDogJ0Bwb3BhbGwnIH1dLFxyXG4gICAgICAgICAgICBbLyMvLCAnJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGF0dHJpYnV0ZUxpc3Q6IFtcclxuICAgICAgICAgICAgWy9cXHMrLywgJyddLFxyXG4gICAgICAgICAgICBbLyhcXHcrKShcXHMqPVxccyopKFwifCcpLywgWydhdHRyaWJ1dGUubmFtZScsICdkZWxpbWl0ZXInLCB7IHRva2VuOiAnYXR0cmlidXRlLnZhbHVlJywgbmV4dDogJ0B2YWx1ZS4kMycgfV1dLFxyXG4gICAgICAgICAgICBbL1xcdysvLCAnYXR0cmlidXRlLm5hbWUnXSxcclxuICAgICAgICAgICAgWy8sLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogeyB0b2tlbjogJ2F0dHJpYnV0ZS5kZWxpbWl0ZXInLCBuZXh0OiAnQHBvcGFsbCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2F0dHJpYnV0ZS5kZWxpbWl0ZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIFsvXFwpJC8sIHsgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnLCBuZXh0OiAnQHBvcGFsbCcgfV0sXHJcbiAgICAgICAgICAgIFsvXFwpLywgeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycsIG5leHQ6ICdAcG9wJyB9XSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHdoaXRlc3BhY2U6IFtcclxuICAgICAgICAgICAgWy9eKFxccyopKFxcL1xcLy4qKSQvLCB7IHRva2VuOiAnY29tbWVudCcsIG5leHQ6ICdAYmxvY2tUZXh0LiQxLmNvbW1lbnQnIH1dLFxyXG4gICAgICAgICAgICBbL1sgXFx0XFxyXFxuXSsvLCAnJ10sXHJcbiAgICAgICAgICAgIFsvPCEtLS8sIHsgdG9rZW46ICdjb21tZW50JywgbmV4dDogJ0Bjb21tZW50JyB9XSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGJsb2NrVGV4dDogW1xyXG4gICAgICAgICAgICBbL15cXHMrLiokLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICcoJFMyXFxcXHMrLiokKSc6IHsgdG9rZW46ICckUzMnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAcG9wYWxsJyB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIFsvLi8sIHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAcG9wYWxsJyB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbWVudDogW1xyXG4gICAgICAgICAgICBbL1tePFxcLV0rLywgJ2NvbW1lbnQuY29udGVudCddLFxyXG4gICAgICAgICAgICBbLy0tPi8sIHsgdG9rZW46ICdjb21tZW50JywgbmV4dDogJ0Bwb3AnIH1dLFxyXG4gICAgICAgICAgICBbLzwhLS0vLCAnY29tbWVudC5jb250ZW50LmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9bPFxcLV0vLCAnY29tbWVudC5jb250ZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZzogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiJyNdKy8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQHBvcGFsbCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ3N0cmluZydcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9AZXNjYXBlcy8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdzdHJpbmcuZXNjYXBlJywgbmV4dDogJ0Bwb3BhbGwnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdzdHJpbmcuZXNjYXBlJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICBbL1xcXFwuLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW9zJzogeyB0b2tlbjogJ3N0cmluZy5lc2NhcGUuaW52YWxpZCcsIG5leHQ6ICdAcG9wYWxsJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnc3RyaW5nLmVzY2FwZS5pbnZhbGlkJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBpbnRlcnBvbGF0aW9uXHJcbiAgICAgICAgICAgIFsvKCN7KShbXn1dKikofSkvLCBbJ2ludGVycG9sYXRpb24uZGVsaW1pdGVyJywgJ2ludGVycG9sYXRpb24nLCAnaW50ZXJwb2xhdGlvbi5kZWxpbWl0ZXInXV0sXHJcbiAgICAgICAgICAgIFsvIy8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9bXCInXS8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnJCM9PSRTMic6IHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQHBvcCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogeyB0b2tlbjogJ3N0cmluZycgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gQWxtb3N0IGlkZW50aWNhbCB0byBhYm92ZSwgZXhjZXB0IGZvciBlc2NhcGVzIGFuZCB0aGUgb3V0cHV0IHRva2VuXHJcbiAgICAgICAgdmFsdWU6IFtcclxuICAgICAgICAgICAgWy9bXlxcXFxcIiddKy8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdhdHRyaWJ1dGUudmFsdWUnLCBuZXh0OiAnQHBvcGFsbCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2F0dHJpYnV0ZS52YWx1ZSdcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdhdHRyaWJ1dGUudmFsdWUnLCBuZXh0OiAnQHBvcGFsbCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2F0dHJpYnV0ZS52YWx1ZSdcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9bXCInXS8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnJCM9PSRTMic6IHsgdG9rZW46ICdhdHRyaWJ1dGUudmFsdWUnLCBuZXh0OiAnQHBvcCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogeyB0b2tlbjogJ2F0dHJpYnV0ZS52YWx1ZScgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgIF0sXHJcbiAgICB9LFxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9