(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[38],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/javascript/javascript.js":
/*!************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/javascript/javascript.js ***!
  \************************************************************************************/
/*! exports provided: conf, language */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "conf", function() { return conf; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "language", function() { return language; });
/* harmony import */ var _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../typescript/typescript.js */ "./node_modules/monaco-editor/esm/vs/basic-languages/typescript/typescript.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// Allow for running under nodejs/requirejs in tests
var _monaco = (typeof monaco === 'undefined' ? self.monaco : monaco);
var conf = _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["conf"];
var language = {
    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: 'invalid',
    tokenPostfix: '.js',
    keywords: [
        'break', 'case', 'catch', 'class', 'continue', 'const',
        'constructor', 'debugger', 'default', 'delete', 'do', 'else',
        'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
        'get', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
        'return', 'set', 'super', 'switch', 'symbol', 'this', 'throw', 'true',
        'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
        'async', 'await', 'of'
    ],
    typeKeywords: [],
    operators: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].operators,
    symbols: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].symbols,
    escapes: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].escapes,
    digits: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].digits,
    octaldigits: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].octaldigits,
    binarydigits: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].binarydigits,
    hexdigits: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].hexdigits,
    regexpctl: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].regexpctl,
    regexpesc: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].regexpesc,
    tokenizer: _typescript_typescript_js__WEBPACK_IMPORTED_MODULE_0__["language"].tokenizer,
};


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/typescript/typescript.js":
/*!************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/typescript/typescript.js ***!
  \************************************************************************************/
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

// Allow for running under nodejs/requirejs in tests
var _monaco = (typeof monaco === 'undefined' ? self.monaco : monaco);
var conf = {
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    onEnterRules: [
        {
            // e.g. /** | */
            beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
            afterText: /^\s*\*\/$/,
            action: { indentAction: _monaco.languages.IndentAction.IndentOutdent, appendText: ' * ' }
        },
        {
            // e.g. /** ...|
            beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
            action: { indentAction: _monaco.languages.IndentAction.None, appendText: ' * ' }
        },
        {
            // e.g.  * ...|
            beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
            action: { indentAction: _monaco.languages.IndentAction.None, appendText: '* ' }
        },
        {
            // e.g.  */|
            beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
            action: { indentAction: _monaco.languages.IndentAction.None, removeText: 1 }
        }
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: '\'', close: '\'', notIn: ['string', 'comment'] },
        { open: '`', close: '`', notIn: ['string', 'comment'] },
        { open: "/**", close: " */", notIn: ["string"] }
    ],
    folding: {
        markers: {
            start: new RegExp("^\\s*//\\s*#?region\\b"),
            end: new RegExp("^\\s*//\\s*#?endregion\\b")
        }
    }
};
var language = {
    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: 'invalid',
    tokenPostfix: '.ts',
    keywords: [
        'abstract', 'as', 'break', 'case', 'catch', 'class', 'continue', 'const',
        'constructor', 'debugger', 'declare', 'default', 'delete', 'do', 'else',
        'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
        'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface',
        'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'package',
        'private', 'protected', 'public', 'readonly', 'require', 'global', 'return',
        'set', 'static', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try',
        'type', 'typeof', 'unique', 'var', 'void', 'while', 'with', 'yield', 'async',
        'await', 'of'
    ],
    typeKeywords: [
        'any', 'boolean', 'number', 'object', 'string', 'undefined'
    ],
    operators: [
        '<=', '>=', '==', '!=', '===', '!==', '=>', '+', '-', '**',
        '*', '/', '%', '++', '--', '<<', '</', '>>', '>>>', '&',
        '|', '^', '!', '~', '&&', '||', '?', ':', '=', '+=', '-=',
        '*=', '**=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=',
        '^=', '@',
    ],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
    regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            [/[{}]/, 'delimiter.bracket'],
            { include: 'common' }
        ],
        common: [
            // identifiers and keywords
            [/[a-z_$][\w$]*/, {
                    cases: {
                        '@typeKeywords': 'keyword',
                        '@keywords': 'keyword',
                        '@default': 'identifier'
                    }
                }],
            [/[A-Z][\w\$]*/, 'type.identifier'],
            // [/[A-Z][\w\$]*/, 'identifier'],
            // whitespace
            { include: '@whitespace' },
            // regular expression: ensure it is terminated before beginning (otherwise it is an opeator)
            [/\/(?=([^\\\/]|\\.)+\/([gimsuy]*)(\s*)(\.|;|\/|,|\)|\]|\}|$))/, { token: 'regexp', bracket: '@open', next: '@regexp' }],
            // delimiters and operators
            [/[()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
                    cases: {
                        '@operators': 'delimiter',
                        '@default': ''
                    }
                }],
            // numbers
            [/(@digits)[eE]([\-+]?(@digits))?/, 'number.float'],
            [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, 'number.float'],
            [/0[xX](@hexdigits)/, 'number.hex'],
            [/0[oO]?(@octaldigits)/, 'number.octal'],
            [/0[bB](@binarydigits)/, 'number.binary'],
            [/(@digits)/, 'number'],
            // delimiter: after number because of .\d floats
            [/[;,.]/, 'delimiter'],
            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string_double'],
            [/'/, 'string', '@string_single'],
            [/`/, 'string', '@string_backtick'],
        ],
        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/\/\*\*(?!\/)/, 'comment.doc', '@jsdoc'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        jsdoc: [
            [/[^\/*]+/, 'comment.doc'],
            [/\*\//, 'comment.doc', '@pop'],
            [/[\/*]/, 'comment.doc']
        ],
        // We match regular expression quite precisely
        regexp: [
            [/(\{)(\d+(?:,\d*)?)(\})/, ['regexp.escape.control', 'regexp.escape.control', 'regexp.escape.control']],
            [/(\[)(\^?)(?=(?:[^\]\\\/]|\\.)+)/, ['regexp.escape.control', { token: 'regexp.escape.control', next: '@regexrange' }]],
            [/(\()(\?:|\?=|\?!)/, ['regexp.escape.control', 'regexp.escape.control']],
            [/[()]/, 'regexp.escape.control'],
            [/@regexpctl/, 'regexp.escape.control'],
            [/[^\\\/]/, 'regexp'],
            [/@regexpesc/, 'regexp.escape'],
            [/\\\./, 'regexp.invalid'],
            [/(\/)([gimsuy]*)/, [{ token: 'regexp', bracket: '@close', next: '@pop' }, 'keyword.other']],
        ],
        regexrange: [
            [/-/, 'regexp.escape.control'],
            [/\^/, 'regexp.invalid'],
            [/@regexpesc/, 'regexp.escape'],
            [/[^\]]/, 'regexp'],
            [/\]/, '@brackets.regexp.escape.control', '@pop'],
        ],
        string_double: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
        ],
        string_single: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, 'string', '@pop']
        ],
        string_backtick: [
            [/\$\{/, { token: 'delimiter.bracket', next: '@bracketCounting' }],
            [/[^\\`$]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/`/, 'string', '@pop']
        ],
        bracketCounting: [
            [/\{/, 'delimiter.bracket', '@bracketCounting'],
            [/\}/, 'delimiter.bracket', '@pop'],
            { include: 'common' }
        ],
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvamF2YXNjcmlwdC9qYXZhc2NyaXB0LmpzIiwid2VicGFjazovL2NoYWluY29kZS9jb3VudGVyLy4vbm9kZV9tb2R1bGVzL21vbmFjby1lZGl0b3IvZXNtL3ZzL2Jhc2ljLWxhbmd1YWdlcy90eXBlc2NyaXB0L3R5cGVzY3JpcHQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUN3RTtBQUNyRjtBQUNBO0FBQ08sV0FBVyw4REFBTTtBQUNqQjtBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZUFBZSxrRUFBVTtBQUN6QixhQUFhLGtFQUFVO0FBQ3ZCLGFBQWEsa0VBQVU7QUFDdkIsWUFBWSxrRUFBVTtBQUN0QixpQkFBaUIsa0VBQVU7QUFDM0Isa0JBQWtCLGtFQUFVO0FBQzVCLGVBQWUsa0VBQVU7QUFDekIsZUFBZSxrRUFBVTtBQUN6QixlQUFlLGtFQUFVO0FBQ3pCLGVBQWUsa0VBQVU7QUFDekI7Ozs7Ozs7Ozs7Ozs7QUNqQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNiO0FBQ0E7QUFDTztBQUNQLG9FQUFvRSxJQUFJLE1BQU07QUFDOUU7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsV0FBVyxLQUFLO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckIsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBLHFCQUFxQjtBQUNyQixTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0EscUJBQXFCO0FBQ3JCLFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckI7QUFDQTtBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHdEQUF3RDtBQUNqRSxTQUFTLHNEQUFzRDtBQUMvRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDhDQUE4QyxJQUFJLGNBQWMsRUFBRSxjQUFjLEVBQUU7QUFDbEY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckIseUVBQXlFLEVBQUUsY0FBYyxFQUFFO0FBQzNGO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0Esd0RBQXdELGNBQWMsUUFBUSxxREFBcUQ7QUFDbkk7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCLGtCQUFrQjtBQUNuQywyRUFBMkUsc0RBQXNEO0FBQ2pJO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtDQUFrQyxtREFBbUQ7QUFDckY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0JBQWtCLElBQUksdURBQXVEO0FBQzdFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQjtBQUNoQixnQkFBZ0I7QUFDaEIsYUFBYTtBQUNiO0FBQ0EsS0FBSztBQUNMIiwiZmlsZSI6IjM4LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmltcG9ydCB7IGNvbmYgYXMgdHNDb25mLCBsYW5ndWFnZSBhcyB0c0xhbmd1YWdlIH0gZnJvbSAnLi4vdHlwZXNjcmlwdC90eXBlc2NyaXB0LmpzJztcclxuLy8gQWxsb3cgZm9yIHJ1bm5pbmcgdW5kZXIgbm9kZWpzL3JlcXVpcmVqcyBpbiB0ZXN0c1xyXG52YXIgX21vbmFjbyA9ICh0eXBlb2YgbW9uYWNvID09PSAndW5kZWZpbmVkJyA/IHNlbGYubW9uYWNvIDogbW9uYWNvKTtcclxuZXhwb3J0IHZhciBjb25mID0gdHNDb25mO1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgLy8gU2V0IGRlZmF1bHRUb2tlbiB0byBpbnZhbGlkIHRvIHNlZSB3aGF0IHlvdSBkbyBub3QgdG9rZW5pemUgeWV0XHJcbiAgICBkZWZhdWx0VG9rZW46ICdpbnZhbGlkJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy5qcycsXHJcbiAgICBrZXl3b3JkczogW1xyXG4gICAgICAgICdicmVhaycsICdjYXNlJywgJ2NhdGNoJywgJ2NsYXNzJywgJ2NvbnRpbnVlJywgJ2NvbnN0JyxcclxuICAgICAgICAnY29uc3RydWN0b3InLCAnZGVidWdnZXInLCAnZGVmYXVsdCcsICdkZWxldGUnLCAnZG8nLCAnZWxzZScsXHJcbiAgICAgICAgJ2V4cG9ydCcsICdleHRlbmRzJywgJ2ZhbHNlJywgJ2ZpbmFsbHknLCAnZm9yJywgJ2Zyb20nLCAnZnVuY3Rpb24nLFxyXG4gICAgICAgICdnZXQnLCAnaWYnLCAnaW1wb3J0JywgJ2luJywgJ2luc3RhbmNlb2YnLCAnbGV0JywgJ25ldycsICdudWxsJyxcclxuICAgICAgICAncmV0dXJuJywgJ3NldCcsICdzdXBlcicsICdzd2l0Y2gnLCAnc3ltYm9sJywgJ3RoaXMnLCAndGhyb3cnLCAndHJ1ZScsXHJcbiAgICAgICAgJ3RyeScsICd0eXBlb2YnLCAndW5kZWZpbmVkJywgJ3ZhcicsICd2b2lkJywgJ3doaWxlJywgJ3dpdGgnLCAneWllbGQnLFxyXG4gICAgICAgICdhc3luYycsICdhd2FpdCcsICdvZidcclxuICAgIF0sXHJcbiAgICB0eXBlS2V5d29yZHM6IFtdLFxyXG4gICAgb3BlcmF0b3JzOiB0c0xhbmd1YWdlLm9wZXJhdG9ycyxcclxuICAgIHN5bWJvbHM6IHRzTGFuZ3VhZ2Uuc3ltYm9scyxcclxuICAgIGVzY2FwZXM6IHRzTGFuZ3VhZ2UuZXNjYXBlcyxcclxuICAgIGRpZ2l0czogdHNMYW5ndWFnZS5kaWdpdHMsXHJcbiAgICBvY3RhbGRpZ2l0czogdHNMYW5ndWFnZS5vY3RhbGRpZ2l0cyxcclxuICAgIGJpbmFyeWRpZ2l0czogdHNMYW5ndWFnZS5iaW5hcnlkaWdpdHMsXHJcbiAgICBoZXhkaWdpdHM6IHRzTGFuZ3VhZ2UuaGV4ZGlnaXRzLFxyXG4gICAgcmVnZXhwY3RsOiB0c0xhbmd1YWdlLnJlZ2V4cGN0bCxcclxuICAgIHJlZ2V4cGVzYzogdHNMYW5ndWFnZS5yZWdleHBlc2MsXHJcbiAgICB0b2tlbml6ZXI6IHRzTGFuZ3VhZ2UudG9rZW5pemVyLFxyXG59O1xyXG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG4vLyBBbGxvdyBmb3IgcnVubmluZyB1bmRlciBub2RlanMvcmVxdWlyZWpzIGluIHRlc3RzXHJcbnZhciBfbW9uYWNvID0gKHR5cGVvZiBtb25hY28gPT09ICd1bmRlZmluZWQnID8gc2VsZi5tb25hY28gOiBtb25hY28pO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICB3b3JkUGF0dGVybjogLygtP1xcZCpcXC5cXGRcXHcqKXwoW15cXGBcXH5cXCFcXEBcXCNcXCVcXF5cXCZcXCpcXChcXClcXC1cXD1cXCtcXFtcXHtcXF1cXH1cXFxcXFx8XFw7XFw6XFwnXFxcIlxcLFxcLlxcPFxcPlxcL1xcP1xcc10rKS9nLFxyXG4gICAgY29tbWVudHM6IHtcclxuICAgICAgICBsaW5lQ29tbWVudDogJy8vJyxcclxuICAgICAgICBibG9ja0NvbW1lbnQ6IFsnLyonLCAnKi8nXVxyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgWyd7JywgJ30nXSxcclxuICAgICAgICBbJ1snLCAnXSddLFxyXG4gICAgICAgIFsnKCcsICcpJ11cclxuICAgIF0sXHJcbiAgICBvbkVudGVyUnVsZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIGUuZy4gLyoqIHwgKi9cclxuICAgICAgICAgICAgYmVmb3JlVGV4dDogL15cXHMqXFwvXFwqXFwqKD8hXFwvKShbXlxcKl18XFwqKD8hXFwvKSkqJC8sXHJcbiAgICAgICAgICAgIGFmdGVyVGV4dDogL15cXHMqXFwqXFwvJC8sXHJcbiAgICAgICAgICAgIGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IF9tb25hY28ubGFuZ3VhZ2VzLkluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50LCBhcHBlbmRUZXh0OiAnICogJyB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIGUuZy4gLyoqIC4uLnxcclxuICAgICAgICAgICAgYmVmb3JlVGV4dDogL15cXHMqXFwvXFwqXFwqKD8hXFwvKShbXlxcKl18XFwqKD8hXFwvKSkqJC8sXHJcbiAgICAgICAgICAgIGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IF9tb25hY28ubGFuZ3VhZ2VzLkluZGVudEFjdGlvbi5Ob25lLCBhcHBlbmRUZXh0OiAnICogJyB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIGUuZy4gICogLi4ufFxyXG4gICAgICAgICAgICBiZWZvcmVUZXh0OiAvXihcXHR8KFxcIFxcICkpKlxcIFxcKihcXCAoW15cXCpdfFxcKig/IVxcLykpKik/JC8sXHJcbiAgICAgICAgICAgIGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IF9tb25hY28ubGFuZ3VhZ2VzLkluZGVudEFjdGlvbi5Ob25lLCBhcHBlbmRUZXh0OiAnKiAnIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gZS5nLiAgKi98XHJcbiAgICAgICAgICAgIGJlZm9yZVRleHQ6IC9eKFxcdHwoXFwgXFwgKSkqXFwgXFwqXFwvXFxzKiQvLFxyXG4gICAgICAgICAgICBhY3Rpb246IHsgaW5kZW50QWN0aW9uOiBfbW9uYWNvLmxhbmd1YWdlcy5JbmRlbnRBY3Rpb24uTm9uZSwgcmVtb3ZlVGV4dDogMSB9XHJcbiAgICAgICAgfVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInLCBub3RJbjogWydzdHJpbmcnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2AnLCBjbG9zZTogJ2AnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXHJcbiAgICAgICAgeyBvcGVuOiBcIi8qKlwiLCBjbG9zZTogXCIgKi9cIiwgbm90SW46IFtcInN0cmluZ1wiXSB9XHJcbiAgICBdLFxyXG4gICAgZm9sZGluZzoge1xyXG4gICAgICAgIG1hcmtlcnM6IHtcclxuICAgICAgICAgICAgc3RhcnQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqLy9cXFxccyojP3JlZ2lvblxcXFxiXCIpLFxyXG4gICAgICAgICAgICBlbmQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqLy9cXFxccyojP2VuZHJlZ2lvblxcXFxiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgLy8gU2V0IGRlZmF1bHRUb2tlbiB0byBpbnZhbGlkIHRvIHNlZSB3aGF0IHlvdSBkbyBub3QgdG9rZW5pemUgeWV0XHJcbiAgICBkZWZhdWx0VG9rZW46ICdpbnZhbGlkJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy50cycsXHJcbiAgICBrZXl3b3JkczogW1xyXG4gICAgICAgICdhYnN0cmFjdCcsICdhcycsICdicmVhaycsICdjYXNlJywgJ2NhdGNoJywgJ2NsYXNzJywgJ2NvbnRpbnVlJywgJ2NvbnN0JyxcclxuICAgICAgICAnY29uc3RydWN0b3InLCAnZGVidWdnZXInLCAnZGVjbGFyZScsICdkZWZhdWx0JywgJ2RlbGV0ZScsICdkbycsICdlbHNlJyxcclxuICAgICAgICAnZW51bScsICdleHBvcnQnLCAnZXh0ZW5kcycsICdmYWxzZScsICdmaW5hbGx5JywgJ2ZvcicsICdmcm9tJywgJ2Z1bmN0aW9uJyxcclxuICAgICAgICAnZ2V0JywgJ2lmJywgJ2ltcGxlbWVudHMnLCAnaW1wb3J0JywgJ2luJywgJ2luZmVyJywgJ2luc3RhbmNlb2YnLCAnaW50ZXJmYWNlJyxcclxuICAgICAgICAnaXMnLCAna2V5b2YnLCAnbGV0JywgJ21vZHVsZScsICduYW1lc3BhY2UnLCAnbmV2ZXInLCAnbmV3JywgJ251bGwnLCAncGFja2FnZScsXHJcbiAgICAgICAgJ3ByaXZhdGUnLCAncHJvdGVjdGVkJywgJ3B1YmxpYycsICdyZWFkb25seScsICdyZXF1aXJlJywgJ2dsb2JhbCcsICdyZXR1cm4nLFxyXG4gICAgICAgICdzZXQnLCAnc3RhdGljJywgJ3N1cGVyJywgJ3N3aXRjaCcsICdzeW1ib2wnLCAndGhpcycsICd0aHJvdycsICd0cnVlJywgJ3RyeScsXHJcbiAgICAgICAgJ3R5cGUnLCAndHlwZW9mJywgJ3VuaXF1ZScsICd2YXInLCAndm9pZCcsICd3aGlsZScsICd3aXRoJywgJ3lpZWxkJywgJ2FzeW5jJyxcclxuICAgICAgICAnYXdhaXQnLCAnb2YnXHJcbiAgICBdLFxyXG4gICAgdHlwZUtleXdvcmRzOiBbXHJcbiAgICAgICAgJ2FueScsICdib29sZWFuJywgJ251bWJlcicsICdvYmplY3QnLCAnc3RyaW5nJywgJ3VuZGVmaW5lZCdcclxuICAgIF0sXHJcbiAgICBvcGVyYXRvcnM6IFtcclxuICAgICAgICAnPD0nLCAnPj0nLCAnPT0nLCAnIT0nLCAnPT09JywgJyE9PScsICc9PicsICcrJywgJy0nLCAnKionLFxyXG4gICAgICAgICcqJywgJy8nLCAnJScsICcrKycsICctLScsICc8PCcsICc8LycsICc+PicsICc+Pj4nLCAnJicsXHJcbiAgICAgICAgJ3wnLCAnXicsICchJywgJ34nLCAnJiYnLCAnfHwnLCAnPycsICc6JywgJz0nLCAnKz0nLCAnLT0nLFxyXG4gICAgICAgICcqPScsICcqKj0nLCAnLz0nLCAnJT0nLCAnPDw9JywgJz4+PScsICc+Pj49JywgJyY9JywgJ3w9JyxcclxuICAgICAgICAnXj0nLCAnQCcsXHJcbiAgICBdLFxyXG4gICAgLy8gd2UgaW5jbHVkZSB0aGVzZSBjb21tb24gcmVndWxhciBleHByZXNzaW9uc1xyXG4gICAgc3ltYm9sczogL1s9Pjwhfj86JnwrXFwtKlxcL1xcXiVdKy8sXHJcbiAgICBlc2NhcGVzOiAvXFxcXCg/OlthYmZucnR2XFxcXFwiJ118eFswLTlBLUZhLWZdezEsNH18dVswLTlBLUZhLWZdezR9fFVbMC05QS1GYS1mXXs4fSkvLFxyXG4gICAgZGlnaXRzOiAvXFxkKyhfK1xcZCspKi8sXHJcbiAgICBvY3RhbGRpZ2l0czogL1swLTddKyhfK1swLTddKykqLyxcclxuICAgIGJpbmFyeWRpZ2l0czogL1swLTFdKyhfK1swLTFdKykqLyxcclxuICAgIGhleGRpZ2l0czogL1tbMC05YS1mQS1GXSsoXytbMC05YS1mQS1GXSspKi8sXHJcbiAgICByZWdleHBjdGw6IC9bKCl7fVxcW1xcXVxcJFxcXnxcXC0qKz9cXC5dLyxcclxuICAgIHJlZ2V4cGVzYzogL1xcXFwoPzpbYkJkRGZucnN0dndXbjBcXFxcXFwvXXxAcmVnZXhwY3RsfGNbQS1aXXx4WzAtOWEtZkEtRl17Mn18dVswLTlhLWZBLUZdezR9KS8sXHJcbiAgICAvLyBUaGUgbWFpbiB0b2tlbml6ZXIgZm9yIG91ciBsYW5ndWFnZXNcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgWy9be31dLywgJ2RlbGltaXRlci5icmFja2V0J10sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ2NvbW1vbicgfVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbW9uOiBbXHJcbiAgICAgICAgICAgIC8vIGlkZW50aWZpZXJzIGFuZCBrZXl3b3Jkc1xyXG4gICAgICAgICAgICBbL1thLXpfJF1bXFx3JF0qLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAdHlwZUtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9bQS1aXVtcXHdcXCRdKi8sICd0eXBlLmlkZW50aWZpZXInXSxcclxuICAgICAgICAgICAgLy8gWy9bQS1aXVtcXHdcXCRdKi8sICdpZGVudGlmaWVyJ10sXHJcbiAgICAgICAgICAgIC8vIHdoaXRlc3BhY2VcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIC8vIHJlZ3VsYXIgZXhwcmVzc2lvbjogZW5zdXJlIGl0IGlzIHRlcm1pbmF0ZWQgYmVmb3JlIGJlZ2lubmluZyAob3RoZXJ3aXNlIGl0IGlzIGFuIG9wZWF0b3IpXHJcbiAgICAgICAgICAgIFsvXFwvKD89KFteXFxcXFxcL118XFxcXC4pK1xcLyhbZ2ltc3V5XSopKFxccyopKFxcLnw7fFxcL3wsfFxcKXxcXF18XFx9fCQpKS8sIHsgdG9rZW46ICdyZWdleHAnLCBicmFja2V0OiAnQG9wZW4nLCBuZXh0OiAnQHJlZ2V4cCcgfV0sXHJcbiAgICAgICAgICAgIC8vIGRlbGltaXRlcnMgYW5kIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBbL1soKVxcW1xcXV0vLCAnQGJyYWNrZXRzJ10sXHJcbiAgICAgICAgICAgIFsvWzw+XSg/IUBzeW1ib2xzKS8sICdAYnJhY2tldHMnXSxcclxuICAgICAgICAgICAgWy9Ac3ltYm9scy8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQG9wZXJhdG9ycyc6ICdkZWxpbWl0ZXInLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBudW1iZXJzXHJcbiAgICAgICAgICAgIFsvKEBkaWdpdHMpW2VFXShbXFwtK10/KEBkaWdpdHMpKT8vLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvKEBkaWdpdHMpXFwuKEBkaWdpdHMpKFtlRV1bXFwtK10/KEBkaWdpdHMpKT8vLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvMFt4WF0oQGhleGRpZ2l0cykvLCAnbnVtYmVyLmhleCddLFxyXG4gICAgICAgICAgICBbLzBbb09dPyhAb2N0YWxkaWdpdHMpLywgJ251bWJlci5vY3RhbCddLFxyXG4gICAgICAgICAgICBbLzBbYkJdKEBiaW5hcnlkaWdpdHMpLywgJ251bWJlci5iaW5hcnknXSxcclxuICAgICAgICAgICAgWy8oQGRpZ2l0cykvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgICAgIC8vIGRlbGltaXRlcjogYWZ0ZXIgbnVtYmVyIGJlY2F1c2Ugb2YgLlxcZCBmbG9hdHNcclxuICAgICAgICAgICAgWy9bOywuXS8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgLy8gc3RyaW5nc1xyXG4gICAgICAgICAgICBbL1wiKFteXCJcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbLycoW14nXFxcXF18XFxcXC4pKiQvLCAnc3RyaW5nLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcnLCAnQHN0cmluZ19kb3VibGUnXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZycsICdAc3RyaW5nX3NpbmdsZSddLFxyXG4gICAgICAgICAgICBbL2AvLCAnc3RyaW5nJywgJ0BzdHJpbmdfYmFja3RpY2snXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHdoaXRlc3BhY2U6IFtcclxuICAgICAgICAgICAgWy9bIFxcdFxcclxcbl0rLywgJyddLFxyXG4gICAgICAgICAgICBbL1xcL1xcKlxcKig/IVxcLykvLCAnY29tbWVudC5kb2MnLCAnQGpzZG9jJ10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwqLywgJ2NvbW1lbnQnLCAnQGNvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXC9cXC8uKiQvLCAnY29tbWVudCddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbWVudDogW1xyXG4gICAgICAgICAgICBbL1teXFwvKl0rLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXCpcXC8vLCAnY29tbWVudCcsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvW1xcLypdLywgJ2NvbW1lbnQnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAganNkb2M6IFtcclxuICAgICAgICAgICAgWy9bXlxcLypdKy8sICdjb21tZW50LmRvYyddLFxyXG4gICAgICAgICAgICBbL1xcKlxcLy8sICdjb21tZW50LmRvYycsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvW1xcLypdLywgJ2NvbW1lbnQuZG9jJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIFdlIG1hdGNoIHJlZ3VsYXIgZXhwcmVzc2lvbiBxdWl0ZSBwcmVjaXNlbHlcclxuICAgICAgICByZWdleHA6IFtcclxuICAgICAgICAgICAgWy8oXFx7KShcXGQrKD86LFxcZCopPykoXFx9KS8sIFsncmVnZXhwLmVzY2FwZS5jb250cm9sJywgJ3JlZ2V4cC5lc2NhcGUuY29udHJvbCcsICdyZWdleHAuZXNjYXBlLmNvbnRyb2wnXV0sXHJcbiAgICAgICAgICAgIFsvKFxcWykoXFxePykoPz0oPzpbXlxcXVxcXFxcXC9dfFxcXFwuKSspLywgWydyZWdleHAuZXNjYXBlLmNvbnRyb2wnLCB7IHRva2VuOiAncmVnZXhwLmVzY2FwZS5jb250cm9sJywgbmV4dDogJ0ByZWdleHJhbmdlJyB9XV0sXHJcbiAgICAgICAgICAgIFsvKFxcKCkoXFw/OnxcXD89fFxcPyEpLywgWydyZWdleHAuZXNjYXBlLmNvbnRyb2wnLCAncmVnZXhwLmVzY2FwZS5jb250cm9sJ11dLFxyXG4gICAgICAgICAgICBbL1soKV0vLCAncmVnZXhwLmVzY2FwZS5jb250cm9sJ10sXHJcbiAgICAgICAgICAgIFsvQHJlZ2V4cGN0bC8sICdyZWdleHAuZXNjYXBlLmNvbnRyb2wnXSxcclxuICAgICAgICAgICAgWy9bXlxcXFxcXC9dLywgJ3JlZ2V4cCddLFxyXG4gICAgICAgICAgICBbL0ByZWdleHBlc2MvLCAncmVnZXhwLmVzY2FwZSddLFxyXG4gICAgICAgICAgICBbL1xcXFxcXC4vLCAncmVnZXhwLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy8oXFwvKShbZ2ltc3V5XSopLywgW3sgdG9rZW46ICdyZWdleHAnLCBicmFja2V0OiAnQGNsb3NlJywgbmV4dDogJ0Bwb3AnIH0sICdrZXl3b3JkLm90aGVyJ11dLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVnZXhyYW5nZTogW1xyXG4gICAgICAgICAgICBbLy0vLCAncmVnZXhwLmVzY2FwZS5jb250cm9sJ10sXHJcbiAgICAgICAgICAgIFsvXFxeLywgJ3JlZ2V4cC5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvQHJlZ2V4cGVzYy8sICdyZWdleHAuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvW15cXF1dLywgJ3JlZ2V4cCddLFxyXG4gICAgICAgICAgICBbL1xcXS8sICdAYnJhY2tldHMucmVnZXhwLmVzY2FwZS5jb250cm9sJywgJ0Bwb3AnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZ19kb3VibGU6IFtcclxuICAgICAgICAgICAgWy9bXlxcXFxcIl0rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL0Blc2NhcGVzLywgJ3N0cmluZy5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuZXNjYXBlLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcnLCAnQHBvcCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzdHJpbmdfc2luZ2xlOiBbXHJcbiAgICAgICAgICAgIFsvW15cXFxcJ10rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL0Blc2NhcGVzLywgJ3N0cmluZy5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuZXNjYXBlLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZycsICdAcG9wJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZ19iYWNrdGljazogW1xyXG4gICAgICAgICAgICBbL1xcJFxcey8sIHsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2tldCcsIG5leHQ6ICdAYnJhY2tldENvdW50aW5nJyB9XSxcclxuICAgICAgICAgICAgWy9bXlxcXFxgJF0rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL0Blc2NhcGVzLywgJ3N0cmluZy5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuZXNjYXBlLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9gLywgJ3N0cmluZycsICdAcG9wJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGJyYWNrZXRDb3VudGluZzogW1xyXG4gICAgICAgICAgICBbL1xcey8sICdkZWxpbWl0ZXIuYnJhY2tldCcsICdAYnJhY2tldENvdW50aW5nJ10sXHJcbiAgICAgICAgICAgIFsvXFx9LywgJ2RlbGltaXRlci5icmFja2V0JywgJ0Bwb3AnXSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnY29tbW9uJyB9XHJcbiAgICAgICAgXSxcclxuICAgIH0sXHJcbn07XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=