(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[33],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/apex/apex.js":
/*!************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/apex/apex.js ***!
  \************************************************************************/
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
    // the default separators except `@$`
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
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
        { open: '<', close: '>' },
    ],
    folding: {
        markers: {
            start: new RegExp("^\\s*//\\s*(?:(?:#?region\\b)|(?:<editor-fold\\b))"),
            end: new RegExp("^\\s*//\\s*(?:(?:#?endregion\\b)|(?:</editor-fold>))")
        }
    }
};
var keywords = [
    'abstract',
    'activate',
    'and',
    'any',
    'array',
    'as',
    'asc',
    'assert',
    'autonomous',
    'begin',
    'bigdecimal',
    'blob',
    'boolean',
    'break',
    'bulk',
    'by',
    'case',
    'cast',
    'catch',
    'char',
    'class',
    'collect',
    'commit',
    'const',
    'continue',
    'convertcurrency',
    'decimal',
    'default',
    'delete',
    'desc',
    'do',
    'double',
    'else',
    'end',
    'enum',
    'exception',
    'exit',
    'export',
    'extends',
    'false',
    'final',
    'finally',
    'float',
    'for',
    'from',
    'future',
    'get',
    'global',
    'goto',
    'group',
    'having',
    'hint',
    'if',
    'implements',
    'import',
    'in',
    'inner',
    'insert',
    'instanceof',
    'int',
    'interface',
    'into',
    'join',
    'last_90_days',
    'last_month',
    'last_n_days',
    'last_week',
    'like',
    'limit',
    'list',
    'long',
    'loop',
    'map',
    'merge',
    'native',
    'new',
    'next_90_days',
    'next_month',
    'next_n_days',
    'next_week',
    'not',
    'null',
    'nulls',
    'number',
    'object',
    'of',
    'on',
    'or',
    'outer',
    'override',
    'package',
    'parallel',
    'pragma',
    'private',
    'protected',
    'public',
    'retrieve',
    'return',
    'returning',
    'rollback',
    'savepoint',
    'search',
    'select',
    'set',
    'short',
    'sort',
    'stat',
    'static',
    'strictfp',
    'super',
    'switch',
    'synchronized',
    'system',
    'testmethod',
    'then',
    'this',
    'this_month',
    'this_week',
    'throw',
    'throws',
    'today',
    'tolabel',
    'tomorrow',
    'transaction',
    'transient',
    'trigger',
    'true',
    'try',
    'type',
    'undelete',
    'update',
    'upsert',
    'using',
    'virtual',
    'void',
    'volatile',
    'webservice',
    'when',
    'where',
    'while',
    'yesterday'
];
// create case variations of the keywords - apex is case insensitive, but we can't make the highlighter case insensitive
// because we use a heuristic to assume that identifiers starting with an upper case letter are types.
var uppercaseFirstLetter = function (lowercase) { return lowercase.charAt(0).toUpperCase() + lowercase.substr(1); };
var keywordsWithCaseVariations = [];
keywords.forEach(function (lowercase) {
    keywordsWithCaseVariations.push(lowercase);
    keywordsWithCaseVariations.push(lowercase.toUpperCase());
    keywordsWithCaseVariations.push(uppercaseFirstLetter(lowercase));
});
var language = {
    defaultToken: '',
    tokenPostfix: '.apex',
    keywords: keywordsWithCaseVariations,
    operators: [
        '=', '>', '<', '!', '~', '?', ':',
        '==', '<=', '>=', '!=', '&&', '||', '++', '--',
        '+', '-', '*', '/', '&', '|', '^', '%', '<<',
        '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=',
        '^=', '%=', '<<=', '>>=', '>>>='
    ],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // identifiers and keywords
            [/[a-z_$][\w$]*/, {
                    cases: {
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'identifier'
                    }
                }],
            // assume that identifiers starting with an uppercase letter are types
            [/[A-Z][\w\$]*/, {
                    cases: {
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'type.identifier'
                    }
                }],
            // whitespace
            { include: '@whitespace' },
            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
                    cases: {
                        '@operators': 'delimiter',
                        '@default': ''
                    }
                }],
            // @ annotations.
            [/@\s*[a-zA-Z_\$][\w\$]*/, 'annotation'],
            // numbers
            [/(@digits)[eE]([\-+]?(@digits))?[fFdD]?/, 'number.float'],
            [/(@digits)\.(@digits)([eE][\-+]?(@digits))?[fFdD]?/, 'number.float'],
            [/(@digits)[fFdD]/, 'number.float'],
            [/(@digits)[lL]?/, 'number'],
            // delimiter: after number because of .\d floats
            [/[;,.]/, 'delimiter'],
            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string."'],
            [/'/, 'string', '@string.\''],
            // characters
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']
        ],
        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/\/\*\*(?!\/)/, 'comment.doc', '@apexdoc'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            // [/\/\*/, 'comment', '@push' ],    // nested comment not allowed :-(
            // [/\/\*/,    'comment.invalid' ],    // this breaks block comments in the shape of /* //*/
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        //Identical copy of comment above, except for the addition of .doc
        apexdoc: [
            [/[^\/*]+/, 'comment.doc'],
            [/\*\//, 'comment.doc', '@pop'],
            [/[\/*]/, 'comment.doc']
        ],
        string: [
            [/[^\\"']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/["']/, { cases: { '$#==$S2': { token: 'string', next: '@pop' },
                        '@default': 'string' } }]
        ],
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvYXBleC9hcGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNhO0FBQ047QUFDUDtBQUNBLGtFQUFrRSxJQUFJLE1BQU07QUFDNUU7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsV0FBVyxLQUFLO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQztBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpREFBaUQsZ0VBQWdFO0FBQ2pIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDO0FBQ007QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw4Q0FBOEMsSUFBSSxjQUFjLEVBQUUsY0FBYyxFQUFFO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esc0NBQXNDLHNCQUFzQjtBQUM1RDtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBLHNDQUFzQyxzQkFBc0I7QUFDNUQ7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHNCQUFzQixTQUFTLGFBQWEsZ0NBQWdDO0FBQzVFLDhDQUE4QyxFQUFFO0FBQ2hEO0FBQ0EsS0FBSztBQUNMIiwiZmlsZSI6IjMzLmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIC8vIHRoZSBkZWZhdWx0IHNlcGFyYXRvcnMgZXhjZXB0IGBAJGBcclxuICAgIHdvcmRQYXR0ZXJuOiAvKC0/XFxkKlxcLlxcZFxcdyopfChbXlxcYFxcflxcIVxcI1xcJVxcXlxcJlxcKlxcKFxcKVxcLVxcPVxcK1xcW1xce1xcXVxcfVxcXFxcXHxcXDtcXDpcXCdcXFwiXFwsXFwuXFw8XFw+XFwvXFw/XFxzXSspL2csXHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnLy8nLFxyXG4gICAgICAgIGJsb2NrQ29tbWVudDogWycvKicsICcqLyddLFxyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgWyd7JywgJ30nXSxcclxuICAgICAgICBbJ1snLCAnXSddLFxyXG4gICAgICAgIFsnKCcsICcpJ10sXHJcbiAgICBdLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcclxuICAgICAgICB7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycgfSxcclxuICAgIF0sXHJcbiAgICBzdXJyb3VuZGluZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJzwnLCBjbG9zZTogJz4nIH0sXHJcbiAgICBdLFxyXG4gICAgZm9sZGluZzoge1xyXG4gICAgICAgIG1hcmtlcnM6IHtcclxuICAgICAgICAgICAgc3RhcnQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqLy9cXFxccyooPzooPzojP3JlZ2lvblxcXFxiKXwoPzo8ZWRpdG9yLWZvbGRcXFxcYikpXCIpLFxyXG4gICAgICAgICAgICBlbmQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqLy9cXFxccyooPzooPzojP2VuZHJlZ2lvblxcXFxiKXwoPzo8L2VkaXRvci1mb2xkPikpXCIpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG52YXIga2V5d29yZHMgPSBbXHJcbiAgICAnYWJzdHJhY3QnLFxyXG4gICAgJ2FjdGl2YXRlJyxcclxuICAgICdhbmQnLFxyXG4gICAgJ2FueScsXHJcbiAgICAnYXJyYXknLFxyXG4gICAgJ2FzJyxcclxuICAgICdhc2MnLFxyXG4gICAgJ2Fzc2VydCcsXHJcbiAgICAnYXV0b25vbW91cycsXHJcbiAgICAnYmVnaW4nLFxyXG4gICAgJ2JpZ2RlY2ltYWwnLFxyXG4gICAgJ2Jsb2InLFxyXG4gICAgJ2Jvb2xlYW4nLFxyXG4gICAgJ2JyZWFrJyxcclxuICAgICdidWxrJyxcclxuICAgICdieScsXHJcbiAgICAnY2FzZScsXHJcbiAgICAnY2FzdCcsXHJcbiAgICAnY2F0Y2gnLFxyXG4gICAgJ2NoYXInLFxyXG4gICAgJ2NsYXNzJyxcclxuICAgICdjb2xsZWN0JyxcclxuICAgICdjb21taXQnLFxyXG4gICAgJ2NvbnN0JyxcclxuICAgICdjb250aW51ZScsXHJcbiAgICAnY29udmVydGN1cnJlbmN5JyxcclxuICAgICdkZWNpbWFsJyxcclxuICAgICdkZWZhdWx0JyxcclxuICAgICdkZWxldGUnLFxyXG4gICAgJ2Rlc2MnLFxyXG4gICAgJ2RvJyxcclxuICAgICdkb3VibGUnLFxyXG4gICAgJ2Vsc2UnLFxyXG4gICAgJ2VuZCcsXHJcbiAgICAnZW51bScsXHJcbiAgICAnZXhjZXB0aW9uJyxcclxuICAgICdleGl0JyxcclxuICAgICdleHBvcnQnLFxyXG4gICAgJ2V4dGVuZHMnLFxyXG4gICAgJ2ZhbHNlJyxcclxuICAgICdmaW5hbCcsXHJcbiAgICAnZmluYWxseScsXHJcbiAgICAnZmxvYXQnLFxyXG4gICAgJ2ZvcicsXHJcbiAgICAnZnJvbScsXHJcbiAgICAnZnV0dXJlJyxcclxuICAgICdnZXQnLFxyXG4gICAgJ2dsb2JhbCcsXHJcbiAgICAnZ290bycsXHJcbiAgICAnZ3JvdXAnLFxyXG4gICAgJ2hhdmluZycsXHJcbiAgICAnaGludCcsXHJcbiAgICAnaWYnLFxyXG4gICAgJ2ltcGxlbWVudHMnLFxyXG4gICAgJ2ltcG9ydCcsXHJcbiAgICAnaW4nLFxyXG4gICAgJ2lubmVyJyxcclxuICAgICdpbnNlcnQnLFxyXG4gICAgJ2luc3RhbmNlb2YnLFxyXG4gICAgJ2ludCcsXHJcbiAgICAnaW50ZXJmYWNlJyxcclxuICAgICdpbnRvJyxcclxuICAgICdqb2luJyxcclxuICAgICdsYXN0XzkwX2RheXMnLFxyXG4gICAgJ2xhc3RfbW9udGgnLFxyXG4gICAgJ2xhc3Rfbl9kYXlzJyxcclxuICAgICdsYXN0X3dlZWsnLFxyXG4gICAgJ2xpa2UnLFxyXG4gICAgJ2xpbWl0JyxcclxuICAgICdsaXN0JyxcclxuICAgICdsb25nJyxcclxuICAgICdsb29wJyxcclxuICAgICdtYXAnLFxyXG4gICAgJ21lcmdlJyxcclxuICAgICduYXRpdmUnLFxyXG4gICAgJ25ldycsXHJcbiAgICAnbmV4dF85MF9kYXlzJyxcclxuICAgICduZXh0X21vbnRoJyxcclxuICAgICduZXh0X25fZGF5cycsXHJcbiAgICAnbmV4dF93ZWVrJyxcclxuICAgICdub3QnLFxyXG4gICAgJ251bGwnLFxyXG4gICAgJ251bGxzJyxcclxuICAgICdudW1iZXInLFxyXG4gICAgJ29iamVjdCcsXHJcbiAgICAnb2YnLFxyXG4gICAgJ29uJyxcclxuICAgICdvcicsXHJcbiAgICAnb3V0ZXInLFxyXG4gICAgJ292ZXJyaWRlJyxcclxuICAgICdwYWNrYWdlJyxcclxuICAgICdwYXJhbGxlbCcsXHJcbiAgICAncHJhZ21hJyxcclxuICAgICdwcml2YXRlJyxcclxuICAgICdwcm90ZWN0ZWQnLFxyXG4gICAgJ3B1YmxpYycsXHJcbiAgICAncmV0cmlldmUnLFxyXG4gICAgJ3JldHVybicsXHJcbiAgICAncmV0dXJuaW5nJyxcclxuICAgICdyb2xsYmFjaycsXHJcbiAgICAnc2F2ZXBvaW50JyxcclxuICAgICdzZWFyY2gnLFxyXG4gICAgJ3NlbGVjdCcsXHJcbiAgICAnc2V0JyxcclxuICAgICdzaG9ydCcsXHJcbiAgICAnc29ydCcsXHJcbiAgICAnc3RhdCcsXHJcbiAgICAnc3RhdGljJyxcclxuICAgICdzdHJpY3RmcCcsXHJcbiAgICAnc3VwZXInLFxyXG4gICAgJ3N3aXRjaCcsXHJcbiAgICAnc3luY2hyb25pemVkJyxcclxuICAgICdzeXN0ZW0nLFxyXG4gICAgJ3Rlc3RtZXRob2QnLFxyXG4gICAgJ3RoZW4nLFxyXG4gICAgJ3RoaXMnLFxyXG4gICAgJ3RoaXNfbW9udGgnLFxyXG4gICAgJ3RoaXNfd2VlaycsXHJcbiAgICAndGhyb3cnLFxyXG4gICAgJ3Rocm93cycsXHJcbiAgICAndG9kYXknLFxyXG4gICAgJ3RvbGFiZWwnLFxyXG4gICAgJ3RvbW9ycm93JyxcclxuICAgICd0cmFuc2FjdGlvbicsXHJcbiAgICAndHJhbnNpZW50JyxcclxuICAgICd0cmlnZ2VyJyxcclxuICAgICd0cnVlJyxcclxuICAgICd0cnknLFxyXG4gICAgJ3R5cGUnLFxyXG4gICAgJ3VuZGVsZXRlJyxcclxuICAgICd1cGRhdGUnLFxyXG4gICAgJ3Vwc2VydCcsXHJcbiAgICAndXNpbmcnLFxyXG4gICAgJ3ZpcnR1YWwnLFxyXG4gICAgJ3ZvaWQnLFxyXG4gICAgJ3ZvbGF0aWxlJyxcclxuICAgICd3ZWJzZXJ2aWNlJyxcclxuICAgICd3aGVuJyxcclxuICAgICd3aGVyZScsXHJcbiAgICAnd2hpbGUnLFxyXG4gICAgJ3llc3RlcmRheSdcclxuXTtcclxuLy8gY3JlYXRlIGNhc2UgdmFyaWF0aW9ucyBvZiB0aGUga2V5d29yZHMgLSBhcGV4IGlzIGNhc2UgaW5zZW5zaXRpdmUsIGJ1dCB3ZSBjYW4ndCBtYWtlIHRoZSBoaWdobGlnaHRlciBjYXNlIGluc2Vuc2l0aXZlXHJcbi8vIGJlY2F1c2Ugd2UgdXNlIGEgaGV1cmlzdGljIHRvIGFzc3VtZSB0aGF0IGlkZW50aWZpZXJzIHN0YXJ0aW5nIHdpdGggYW4gdXBwZXIgY2FzZSBsZXR0ZXIgYXJlIHR5cGVzLlxyXG52YXIgdXBwZXJjYXNlRmlyc3RMZXR0ZXIgPSBmdW5jdGlvbiAobG93ZXJjYXNlKSB7IHJldHVybiBsb3dlcmNhc2UuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBsb3dlcmNhc2Uuc3Vic3RyKDEpOyB9O1xyXG52YXIga2V5d29yZHNXaXRoQ2FzZVZhcmlhdGlvbnMgPSBbXTtcclxua2V5d29yZHMuZm9yRWFjaChmdW5jdGlvbiAobG93ZXJjYXNlKSB7XHJcbiAgICBrZXl3b3Jkc1dpdGhDYXNlVmFyaWF0aW9ucy5wdXNoKGxvd2VyY2FzZSk7XHJcbiAgICBrZXl3b3Jkc1dpdGhDYXNlVmFyaWF0aW9ucy5wdXNoKGxvd2VyY2FzZS50b1VwcGVyQ2FzZSgpKTtcclxuICAgIGtleXdvcmRzV2l0aENhc2VWYXJpYXRpb25zLnB1c2godXBwZXJjYXNlRmlyc3RMZXR0ZXIobG93ZXJjYXNlKSk7XHJcbn0pO1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgZGVmYXVsdFRva2VuOiAnJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy5hcGV4JyxcclxuICAgIGtleXdvcmRzOiBrZXl3b3Jkc1dpdGhDYXNlVmFyaWF0aW9ucyxcclxuICAgIG9wZXJhdG9yczogW1xyXG4gICAgICAgICc9JywgJz4nLCAnPCcsICchJywgJ34nLCAnPycsICc6JyxcclxuICAgICAgICAnPT0nLCAnPD0nLCAnPj0nLCAnIT0nLCAnJiYnLCAnfHwnLCAnKysnLCAnLS0nLFxyXG4gICAgICAgICcrJywgJy0nLCAnKicsICcvJywgJyYnLCAnfCcsICdeJywgJyUnLCAnPDwnLFxyXG4gICAgICAgICc+PicsICc+Pj4nLCAnKz0nLCAnLT0nLCAnKj0nLCAnLz0nLCAnJj0nLCAnfD0nLFxyXG4gICAgICAgICdePScsICclPScsICc8PD0nLCAnPj49JywgJz4+Pj0nXHJcbiAgICBdLFxyXG4gICAgLy8gd2UgaW5jbHVkZSB0aGVzZSBjb21tb24gcmVndWxhciBleHByZXNzaW9uc1xyXG4gICAgc3ltYm9sczogL1s9Pjwhfj86JnwrXFwtKlxcL1xcXiVdKy8sXHJcbiAgICBlc2NhcGVzOiAvXFxcXCg/OlthYmZucnR2XFxcXFwiJ118eFswLTlBLUZhLWZdezEsNH18dVswLTlBLUZhLWZdezR9fFVbMC05QS1GYS1mXXs4fSkvLFxyXG4gICAgZGlnaXRzOiAvXFxkKyhfK1xcZCspKi8sXHJcbiAgICBvY3RhbGRpZ2l0czogL1swLTddKyhfK1swLTddKykqLyxcclxuICAgIGJpbmFyeWRpZ2l0czogL1swLTFdKyhfK1swLTFdKykqLyxcclxuICAgIGhleGRpZ2l0czogL1tbMC05YS1mQS1GXSsoXytbMC05YS1mQS1GXSspKi8sXHJcbiAgICAvLyBUaGUgbWFpbiB0b2tlbml6ZXIgZm9yIG91ciBsYW5ndWFnZXNcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgLy8gaWRlbnRpZmllcnMgYW5kIGtleXdvcmRzXHJcbiAgICAgICAgICAgIFsvW2Etel8kXVtcXHckXSovLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6IHsgdG9rZW46ICdrZXl3b3JkLiQwJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgLy8gYXNzdW1lIHRoYXQgaWRlbnRpZmllcnMgc3RhcnRpbmcgd2l0aCBhbiB1cHBlcmNhc2UgbGV0dGVyIGFyZSB0eXBlc1xyXG4gICAgICAgICAgICBbL1tBLVpdW1xcd1xcJF0qLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiB7IHRva2VuOiAna2V5d29yZC4kMCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ3R5cGUuaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgLy8gd2hpdGVzcGFjZVxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAd2hpdGVzcGFjZScgfSxcclxuICAgICAgICAgICAgLy8gZGVsaW1pdGVycyBhbmQgb3BlcmF0b3JzXHJcbiAgICAgICAgICAgIFsvW3t9KClcXFtcXF1dLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbL1s8Pl0oPyFAc3ltYm9scykvLCAnQGJyYWNrZXRzJ10sXHJcbiAgICAgICAgICAgIFsvQHN5bWJvbHMvLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BvcGVyYXRvcnMnOiAnZGVsaW1pdGVyJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJydcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgLy8gQCBhbm5vdGF0aW9ucy5cclxuICAgICAgICAgICAgWy9AXFxzKlthLXpBLVpfXFwkXVtcXHdcXCRdKi8sICdhbm5vdGF0aW9uJ10sXHJcbiAgICAgICAgICAgIC8vIG51bWJlcnNcclxuICAgICAgICAgICAgWy8oQGRpZ2l0cylbZUVdKFtcXC0rXT8oQGRpZ2l0cykpP1tmRmREXT8vLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvKEBkaWdpdHMpXFwuKEBkaWdpdHMpKFtlRV1bXFwtK10/KEBkaWdpdHMpKT9bZkZkRF0/LywgJ251bWJlci5mbG9hdCddLFxyXG4gICAgICAgICAgICBbLyhAZGlnaXRzKVtmRmREXS8sICdudW1iZXIuZmxvYXQnXSxcclxuICAgICAgICAgICAgWy8oQGRpZ2l0cylbbExdPy8sICdudW1iZXInXSxcclxuICAgICAgICAgICAgLy8gZGVsaW1pdGVyOiBhZnRlciBudW1iZXIgYmVjYXVzZSBvZiAuXFxkIGZsb2F0c1xyXG4gICAgICAgICAgICBbL1s7LC5dLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgICAgICAvLyBzdHJpbmdzXHJcbiAgICAgICAgICAgIFsvXCIoW15cIlxcXFxdfFxcXFwuKSokLywgJ3N0cmluZy5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvJyhbXidcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAc3RyaW5nLlwiJ10sXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcnLCAnQHN0cmluZy5cXCcnXSxcclxuICAgICAgICAgICAgLy8gY2hhcmFjdGVyc1xyXG4gICAgICAgICAgICBbLydbXlxcXFwnXScvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvKCcpKEBlc2NhcGVzKSgnKS8sIFsnc3RyaW5nJywgJ3N0cmluZy5lc2NhcGUnLCAnc3RyaW5nJ11dLFxyXG4gICAgICAgICAgICBbLycvLCAnc3RyaW5nLmludmFsaWQnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgd2hpdGVzcGFjZTogW1xyXG4gICAgICAgICAgICBbL1sgXFx0XFxyXFxuXSsvLCAnJ10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwqXFwqKD8hXFwvKS8sICdjb21tZW50LmRvYycsICdAYXBleGRvYyddLFxyXG4gICAgICAgICAgICBbL1xcL1xcKi8sICdjb21tZW50JywgJ0Bjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwvLiokLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGNvbW1lbnQ6IFtcclxuICAgICAgICAgICAgWy9bXlxcLypdKy8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIC8vIFsvXFwvXFwqLywgJ2NvbW1lbnQnLCAnQHB1c2gnIF0sICAgIC8vIG5lc3RlZCBjb21tZW50IG5vdCBhbGxvd2VkIDotKFxyXG4gICAgICAgICAgICAvLyBbL1xcL1xcKi8sICAgICdjb21tZW50LmludmFsaWQnIF0sICAgIC8vIHRoaXMgYnJlYWtzIGJsb2NrIGNvbW1lbnRzIGluIHRoZSBzaGFwZSBvZiAvKiAvLyovXHJcbiAgICAgICAgICAgIFsvXFwqXFwvLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1tcXC8qXS8sICdjb21tZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vSWRlbnRpY2FsIGNvcHkgb2YgY29tbWVudCBhYm92ZSwgZXhjZXB0IGZvciB0aGUgYWRkaXRpb24gb2YgLmRvY1xyXG4gICAgICAgIGFwZXhkb2M6IFtcclxuICAgICAgICAgICAgWy9bXlxcLypdKy8sICdjb21tZW50LmRvYyddLFxyXG4gICAgICAgICAgICBbL1xcKlxcLy8sICdjb21tZW50LmRvYycsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvW1xcLypdLywgJ2NvbW1lbnQuZG9jJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZzogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiJ10rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL0Blc2NhcGVzLywgJ3N0cmluZy5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuZXNjYXBlLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9bXCInXS8sIHsgY2FzZXM6IHsgJyQjPT0kUzInOiB7IHRva2VuOiAnc3RyaW5nJywgbmV4dDogJ0Bwb3AnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdzdHJpbmcnIH0gfV1cclxuICAgICAgICBdLFxyXG4gICAgfSxcclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==