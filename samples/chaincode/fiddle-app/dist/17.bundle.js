(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[17],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/objective-c/objective-c.js":
/*!**************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/objective-c/objective-c.js ***!
  \**************************************************************************************/
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
        lineComment: '//',
        blockComment: ['/*', '*/'],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
    ]
};
var language = {
    defaultToken: '',
    tokenPostfix: '.objective-c',
    keywords: [
        '#import',
        '#include',
        '#define',
        '#else',
        '#endif',
        '#if',
        '#ifdef',
        '#ifndef',
        '#ident',
        '#undef',
        '@class',
        '@defs',
        '@dynamic',
        '@encode',
        '@end',
        '@implementation',
        '@interface',
        '@package',
        '@private',
        '@protected',
        '@property',
        '@protocol',
        '@public',
        '@selector',
        '@synthesize',
        '__declspec',
        'assign',
        'auto',
        'BOOL',
        'break',
        'bycopy',
        'byref',
        'case',
        'char',
        'Class',
        'const',
        'copy',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extern',
        'FALSE',
        'false',
        'float',
        'for',
        'goto',
        'if',
        'in',
        'int',
        'id',
        'inout',
        'IMP',
        'long',
        'nil',
        'nonatomic',
        'NULL',
        'oneway',
        'out',
        'private',
        'public',
        'protected',
        'readwrite',
        'readonly',
        'register',
        'return',
        'SEL',
        'self',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'super',
        'switch',
        'typedef',
        'TRUE',
        'true',
        'union',
        'unsigned',
        'volatile',
        'void',
        'while',
    ],
    decpart: /\d(_?\d)*/,
    decimal: /0|@decpart/,
    tokenizer: {
        root: [
            { include: '@comments' },
            { include: '@whitespace' },
            { include: '@numbers' },
            { include: '@strings' },
            [/[,:;]/, 'delimiter'],
            [/[{}\[\]()<>]/, '@brackets'],
            [/[a-zA-Z@#]\w*/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier'
                    }
                }],
            [/[<>=\\+\\-\\*\\/\\^\\|\\~,]|and\\b|or\\b|not\\b]/, 'operator'],
        ],
        whitespace: [
            [/\s+/, 'white'],
        ],
        comments: [
            ['\\/\\*', 'comment', '@comment'],
            ['\\/\\/+.*', 'comment'],
        ],
        comment: [
            ['\\*\\/', 'comment', '@pop'],
            ['.', 'comment',],
        ],
        numbers: [
            [/0[xX][0-9a-fA-F]*(_?[0-9a-fA-F])*/, 'number.hex'],
            [/@decimal((\.@decpart)?([eE][\-+]?@decpart)?)[fF]*/, {
                    cases: {
                        '(\\d)*': 'number',
                        '$0': 'number.float'
                    }
                }]
        ],
        // Recognize strings, including those broken across lines with \ (but not without)
        strings: [
            [/'$/, 'string.escape', '@popall'],
            [/'/, 'string.escape', '@stringBody'],
            [/"$/, 'string.escape', '@popall'],
            [/"/, 'string.escape', '@dblStringBody']
        ],
        stringBody: [
            [/[^\\']+$/, 'string', '@popall'],
            [/[^\\']+/, 'string'],
            [/\\./, 'string'],
            [/'/, 'string.escape', '@popall'],
            [/\\$/, 'string']
        ],
        dblStringBody: [
            [/[^\\"]+$/, 'string', '@popall'],
            [/[^\\"]+/, 'string'],
            [/\\./, 'string'],
            [/"/, 'string.escape', '@popall'],
            [/\\$/, 'string']
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvb2JqZWN0aXZlLWMvb2JqZWN0aXZlLWMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDTjtBQUNQO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLFdBQVcsS0FBSztBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMsU0FBUyxZQUFZLEdBQUc7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkM7QUFDQTtBQUNBLFNBQVMsU0FBUyxZQUFZLEdBQUc7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkM7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYSx1QkFBdUI7QUFDcEMsYUFBYSx5QkFBeUI7QUFDdEMsYUFBYSxzQkFBc0I7QUFDbkMsYUFBYSxzQkFBc0I7QUFDbkMsa0JBQWtCO0FBQ2xCLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6IjE3LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcvLycsXHJcbiAgICAgICAgYmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10sXHJcbiAgICB9LFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ10sXHJcbiAgICAgICAgWycoJywgJyknXVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICBdLFxyXG4gICAgc3Vycm91bmRpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcclxuICAgICAgICB7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycgfSxcclxuICAgIF1cclxufTtcclxuZXhwb3J0IHZhciBsYW5ndWFnZSA9IHtcclxuICAgIGRlZmF1bHRUb2tlbjogJycsXHJcbiAgICB0b2tlblBvc3RmaXg6ICcub2JqZWN0aXZlLWMnLFxyXG4gICAga2V5d29yZHM6IFtcclxuICAgICAgICAnI2ltcG9ydCcsXHJcbiAgICAgICAgJyNpbmNsdWRlJyxcclxuICAgICAgICAnI2RlZmluZScsXHJcbiAgICAgICAgJyNlbHNlJyxcclxuICAgICAgICAnI2VuZGlmJyxcclxuICAgICAgICAnI2lmJyxcclxuICAgICAgICAnI2lmZGVmJyxcclxuICAgICAgICAnI2lmbmRlZicsXHJcbiAgICAgICAgJyNpZGVudCcsXHJcbiAgICAgICAgJyN1bmRlZicsXHJcbiAgICAgICAgJ0BjbGFzcycsXHJcbiAgICAgICAgJ0BkZWZzJyxcclxuICAgICAgICAnQGR5bmFtaWMnLFxyXG4gICAgICAgICdAZW5jb2RlJyxcclxuICAgICAgICAnQGVuZCcsXHJcbiAgICAgICAgJ0BpbXBsZW1lbnRhdGlvbicsXHJcbiAgICAgICAgJ0BpbnRlcmZhY2UnLFxyXG4gICAgICAgICdAcGFja2FnZScsXHJcbiAgICAgICAgJ0Bwcml2YXRlJyxcclxuICAgICAgICAnQHByb3RlY3RlZCcsXHJcbiAgICAgICAgJ0Bwcm9wZXJ0eScsXHJcbiAgICAgICAgJ0Bwcm90b2NvbCcsXHJcbiAgICAgICAgJ0BwdWJsaWMnLFxyXG4gICAgICAgICdAc2VsZWN0b3InLFxyXG4gICAgICAgICdAc3ludGhlc2l6ZScsXHJcbiAgICAgICAgJ19fZGVjbHNwZWMnLFxyXG4gICAgICAgICdhc3NpZ24nLFxyXG4gICAgICAgICdhdXRvJyxcclxuICAgICAgICAnQk9PTCcsXHJcbiAgICAgICAgJ2JyZWFrJyxcclxuICAgICAgICAnYnljb3B5JyxcclxuICAgICAgICAnYnlyZWYnLFxyXG4gICAgICAgICdjYXNlJyxcclxuICAgICAgICAnY2hhcicsXHJcbiAgICAgICAgJ0NsYXNzJyxcclxuICAgICAgICAnY29uc3QnLFxyXG4gICAgICAgICdjb3B5JyxcclxuICAgICAgICAnY29udGludWUnLFxyXG4gICAgICAgICdkZWZhdWx0JyxcclxuICAgICAgICAnZG8nLFxyXG4gICAgICAgICdkb3VibGUnLFxyXG4gICAgICAgICdlbHNlJyxcclxuICAgICAgICAnZW51bScsXHJcbiAgICAgICAgJ2V4dGVybicsXHJcbiAgICAgICAgJ0ZBTFNFJyxcclxuICAgICAgICAnZmFsc2UnLFxyXG4gICAgICAgICdmbG9hdCcsXHJcbiAgICAgICAgJ2ZvcicsXHJcbiAgICAgICAgJ2dvdG8nLFxyXG4gICAgICAgICdpZicsXHJcbiAgICAgICAgJ2luJyxcclxuICAgICAgICAnaW50JyxcclxuICAgICAgICAnaWQnLFxyXG4gICAgICAgICdpbm91dCcsXHJcbiAgICAgICAgJ0lNUCcsXHJcbiAgICAgICAgJ2xvbmcnLFxyXG4gICAgICAgICduaWwnLFxyXG4gICAgICAgICdub25hdG9taWMnLFxyXG4gICAgICAgICdOVUxMJyxcclxuICAgICAgICAnb25ld2F5JyxcclxuICAgICAgICAnb3V0JyxcclxuICAgICAgICAncHJpdmF0ZScsXHJcbiAgICAgICAgJ3B1YmxpYycsXHJcbiAgICAgICAgJ3Byb3RlY3RlZCcsXHJcbiAgICAgICAgJ3JlYWR3cml0ZScsXHJcbiAgICAgICAgJ3JlYWRvbmx5JyxcclxuICAgICAgICAncmVnaXN0ZXInLFxyXG4gICAgICAgICdyZXR1cm4nLFxyXG4gICAgICAgICdTRUwnLFxyXG4gICAgICAgICdzZWxmJyxcclxuICAgICAgICAnc2hvcnQnLFxyXG4gICAgICAgICdzaWduZWQnLFxyXG4gICAgICAgICdzaXplb2YnLFxyXG4gICAgICAgICdzdGF0aWMnLFxyXG4gICAgICAgICdzdHJ1Y3QnLFxyXG4gICAgICAgICdzdXBlcicsXHJcbiAgICAgICAgJ3N3aXRjaCcsXHJcbiAgICAgICAgJ3R5cGVkZWYnLFxyXG4gICAgICAgICdUUlVFJyxcclxuICAgICAgICAndHJ1ZScsXHJcbiAgICAgICAgJ3VuaW9uJyxcclxuICAgICAgICAndW5zaWduZWQnLFxyXG4gICAgICAgICd2b2xhdGlsZScsXHJcbiAgICAgICAgJ3ZvaWQnLFxyXG4gICAgICAgICd3aGlsZScsXHJcbiAgICBdLFxyXG4gICAgZGVjcGFydDogL1xcZChfP1xcZCkqLyxcclxuICAgIGRlY2ltYWw6IC8wfEBkZWNwYXJ0LyxcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGNvbW1lbnRzJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAd2hpdGVzcGFjZScgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQG51bWJlcnMnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BzdHJpbmdzJyB9LFxyXG4gICAgICAgICAgICBbL1ssOjtdLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgICAgICBbL1t7fVxcW1xcXSgpPD5dLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbL1thLXpBLVpAI11cXHcqLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdpZGVudGlmaWVyJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICBbL1s8Pj1cXFxcK1xcXFwtXFxcXCpcXFxcL1xcXFxeXFxcXHxcXFxcfixdfGFuZFxcXFxifG9yXFxcXGJ8bm90XFxcXGJdLywgJ29wZXJhdG9yJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICB3aGl0ZXNwYWNlOiBbXHJcbiAgICAgICAgICAgIFsvXFxzKy8sICd3aGl0ZSddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbWVudHM6IFtcclxuICAgICAgICAgICAgWydcXFxcL1xcXFwqJywgJ2NvbW1lbnQnLCAnQGNvbW1lbnQnXSxcclxuICAgICAgICAgICAgWydcXFxcL1xcXFwvKy4qJywgJ2NvbW1lbnQnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGNvbW1lbnQ6IFtcclxuICAgICAgICAgICAgWydcXFxcKlxcXFwvJywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbJy4nLCAnY29tbWVudCcsXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIG51bWJlcnM6IFtcclxuICAgICAgICAgICAgWy8wW3hYXVswLTlhLWZBLUZdKihfP1swLTlhLWZBLUZdKSovLCAnbnVtYmVyLmhleCddLFxyXG4gICAgICAgICAgICBbL0BkZWNpbWFsKChcXC5AZGVjcGFydCk/KFtlRV1bXFwtK10/QGRlY3BhcnQpPylbZkZdKi8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnKFxcXFxkKSonOiAnbnVtYmVyJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQwJzogJ251bWJlci5mbG9hdCdcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gUmVjb2duaXplIHN0cmluZ3MsIGluY2x1ZGluZyB0aG9zZSBicm9rZW4gYWNyb3NzIGxpbmVzIHdpdGggXFwgKGJ1dCBub3Qgd2l0aG91dClcclxuICAgICAgICBzdHJpbmdzOiBbXHJcbiAgICAgICAgICAgIFsvJyQvLCAnc3RyaW5nLmVzY2FwZScsICdAcG9wYWxsJ10sXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcuZXNjYXBlJywgJ0BzdHJpbmdCb2R5J10sXHJcbiAgICAgICAgICAgIFsvXCIkLywgJ3N0cmluZy5lc2NhcGUnLCAnQHBvcGFsbCddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZy5lc2NhcGUnLCAnQGRibFN0cmluZ0JvZHknXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgc3RyaW5nQm9keTogW1xyXG4gICAgICAgICAgICBbL1teXFxcXCddKyQvLCAnc3RyaW5nJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy9bXlxcXFwnXSsvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXC4vLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcuZXNjYXBlJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy9cXFxcJC8sICdzdHJpbmcnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZGJsU3RyaW5nQm9keTogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiXSskLywgJ3N0cmluZycsICdAcG9wYWxsJ10sXHJcbiAgICAgICAgICAgIFsvW15cXFxcXCJdKy8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcuZXNjYXBlJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy9cXFxcJC8sICdzdHJpbmcnXVxyXG4gICAgICAgIF1cclxuICAgIH1cclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==