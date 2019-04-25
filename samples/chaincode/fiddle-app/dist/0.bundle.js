(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[0],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/cpp/cpp.js":
/*!**********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/cpp/cpp.js ***!
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
        lineComment: '//',
        blockComment: ['/*', '*/'],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '(', close: ')' },
        { open: '\'', close: '\'', notIn: ['string', 'comment'] },
        { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
    ],
    folding: {
        markers: {
            start: new RegExp("^\\s*#pragma\\s+region\\b"),
            end: new RegExp("^\\s*#pragma\\s+endregion\\b")
        }
    }
};
var language = {
    defaultToken: '',
    tokenPostfix: '.cpp',
    brackets: [
        { token: 'delimiter.curly', open: '{', close: '}' },
        { token: 'delimiter.parenthesis', open: '(', close: ')' },
        { token: 'delimiter.square', open: '[', close: ']' },
        { token: 'delimiter.angle', open: '<', close: '>' }
    ],
    keywords: [
        'abstract',
        'amp',
        'array',
        'auto',
        'bool',
        'break',
        'case',
        'catch',
        'char',
        'class',
        'const',
        'constexpr',
        'const_cast',
        'continue',
        'cpu',
        'decltype',
        'default',
        'delegate',
        'delete',
        'do',
        'double',
        'dynamic_cast',
        'each',
        'else',
        'enum',
        'event',
        'explicit',
        'export',
        'extern',
        'false',
        'final',
        'finally',
        'float',
        'for',
        'friend',
        'gcnew',
        'generic',
        'goto',
        'if',
        'in',
        'initonly',
        'inline',
        'int',
        'interface',
        'interior_ptr',
        'internal',
        'literal',
        'long',
        'mutable',
        'namespace',
        'new',
        'noexcept',
        'nullptr',
        '__nullptr',
        'operator',
        'override',
        'partial',
        'pascal',
        'pin_ptr',
        'private',
        'property',
        'protected',
        'public',
        'ref',
        'register',
        'reinterpret_cast',
        'restrict',
        'return',
        'safe_cast',
        'sealed',
        'short',
        'signed',
        'sizeof',
        'static',
        'static_assert',
        'static_cast',
        'struct',
        'switch',
        'template',
        'this',
        'thread_local',
        'throw',
        'tile_static',
        'true',
        'try',
        'typedef',
        'typeid',
        'typename',
        'union',
        'unsigned',
        'using',
        'virtual',
        'void',
        'volatile',
        'wchar_t',
        'where',
        'while',
        '_asm',
        '_based',
        '_cdecl',
        '_declspec',
        '_fastcall',
        '_if_exists',
        '_if_not_exists',
        '_inline',
        '_multiple_inheritance',
        '_pascal',
        '_single_inheritance',
        '_stdcall',
        '_virtual_inheritance',
        '_w64',
        '__abstract',
        '__alignof',
        '__asm',
        '__assume',
        '__based',
        '__box',
        '__builtin_alignof',
        '__cdecl',
        '__clrcall',
        '__declspec',
        '__delegate',
        '__event',
        '__except',
        '__fastcall',
        '__finally',
        '__forceinline',
        '__gc',
        '__hook',
        '__identifier',
        '__if_exists',
        '__if_not_exists',
        '__inline',
        '__int128',
        '__int16',
        '__int32',
        '__int64',
        '__int8',
        '__interface',
        '__leave',
        '__m128',
        '__m128d',
        '__m128i',
        '__m256',
        '__m256d',
        '__m256i',
        '__m64',
        '__multiple_inheritance',
        '__newslot',
        '__nogc',
        '__noop',
        '__nounwind',
        '__novtordisp',
        '__pascal',
        '__pin',
        '__pragma',
        '__property',
        '__ptr32',
        '__ptr64',
        '__raise',
        '__restrict',
        '__resume',
        '__sealed',
        '__single_inheritance',
        '__stdcall',
        '__super',
        '__thiscall',
        '__try',
        '__try_cast',
        '__typeof',
        '__unaligned',
        '__unhook',
        '__uuidof',
        '__value',
        '__virtual_inheritance',
        '__w64',
        '__wchar_t'
    ],
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
    integersuffix: /(ll|LL|u|U|l|L)?(ll|LL|u|U|l|L)?/,
    floatsuffix: /[fFlL]?/,
    encoding: /u|u8|U|L/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // C++ 11 Raw String
            [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: 'string.raw.begin', next: '@raw.$1' }],
            // identifiers and keywords
            [/[a-zA-Z_]\w*/, {
                    cases: {
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'identifier'
                    }
                }],
            // whitespace
            { include: '@whitespace' },
            // [[ attributes ]].
            [/\[\[.*\]\]/, 'annotation'],
            [/^\s*#include/, { token: 'keyword.directive.include', next: '@include' }],
            // Preprocessor directive
            [/^\s*#\s*\w+/, 'keyword'],
            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
                    cases: {
                        '@operators': 'delimiter',
                        '@default': ''
                    }
                }],
            // numbers
            [/\d*\d+[eE]([\-+]?\d+)?(@floatsuffix)/, 'number.float'],
            [/\d*\.\d+([eE][\-+]?\d+)?(@floatsuffix)/, 'number.float'],
            [/0[xX][0-9a-fA-F']*[0-9a-fA-F](@integersuffix)/, 'number.hex'],
            [/0[0-7']*[0-7](@integersuffix)/, 'number.octal'],
            [/0[bB][0-1']*[0-1](@integersuffix)/, 'number.binary'],
            [/\d[\d']*\d(@integersuffix)/, 'number'],
            [/\d(@integersuffix)/, 'number'],
            // delimiter: after number because of .\d floats
            [/[;,.]/, 'delimiter'],
            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string'],
            // characters
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']
        ],
        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/\/\*\*(?!\/)/, 'comment.doc', '@doccomment'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        //Identical copy of comment above, except for the addition of .doc
        doccomment: [
            [/[^\/*]+/, 'comment.doc'],
            [/\*\//, 'comment.doc', '@pop'],
            [/[\/*]/, 'comment.doc']
        ],
        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
        ],
        raw: [
            [/(.*)(\))(?:([^ ()\\\t]*))(\")/, {
                    cases: {
                        '$3==$S2': ['string.raw', 'string.raw.end', 'string.raw.end', { token: 'string.raw.end', next: '@pop' }],
                        '@default': ['string.raw', 'string.raw', 'string.raw', 'string.raw']
                    }
                }
            ],
            [/.*/, 'string.raw']
        ],
        include: [
            [/(\s*)(<)([^<>]*)(>)/, ['', 'keyword.directive.include.begin', 'string.include.identifier', { token: 'keyword.directive.include.end', next: '@pop' }]],
            [/(\s*)(")([^"]*)(")/, ['', 'keyword.directive.include.begin', 'string.include.identifier', { token: 'keyword.directive.include.end', next: '@pop' }]]
        ]
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvY3BwL2NwcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNOO0FBQ1A7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsV0FBVyxLQUFLO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdEQUF3RDtBQUNqRSxTQUFTLDJDQUEyQztBQUNwRDtBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ087QUFDUDtBQUNBO0FBQ0E7QUFDQSxTQUFTLG1DQUFtQyxZQUFZLEdBQUc7QUFDM0QsU0FBUyx3REFBd0Q7QUFDakUsU0FBUyxtREFBbUQ7QUFDNUQsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDhDQUE4QyxJQUFJLGNBQWMsRUFBRSxjQUFjLEVBQUU7QUFDbEY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxrREFBa0QsNkNBQTZDO0FBQy9GO0FBQ0E7QUFDQTtBQUNBLHNDQUFzQyxzQkFBc0I7QUFDNUQ7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0E7QUFDQSw4QkFBOEIsdURBQXVEO0FBQ3JGO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsdUZBQXVGLHdDQUF3QztBQUMvSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDBHQUEwRyx1REFBdUQ7QUFDaksseUdBQXlHLHVEQUF1RDtBQUNoSztBQUNBLEtBQUs7QUFDTCIsImZpbGUiOiIwLmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcvLycsXHJcbiAgICAgICAgYmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10sXHJcbiAgICB9LFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ10sXHJcbiAgICAgICAgWycoJywgJyknXVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInLCBub3RJbjogWydzdHJpbmcnXSB9LFxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICBdLFxyXG4gICAgZm9sZGluZzoge1xyXG4gICAgICAgIG1hcmtlcnM6IHtcclxuICAgICAgICAgICAgc3RhcnQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqI3ByYWdtYVxcXFxzK3JlZ2lvblxcXFxiXCIpLFxyXG4gICAgICAgICAgICBlbmQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqI3ByYWdtYVxcXFxzK2VuZHJlZ2lvblxcXFxiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgZGVmYXVsdFRva2VuOiAnJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy5jcHAnLFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICB7IHRva2VuOiAnZGVsaW1pdGVyLmN1cmx5Jywgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycsIG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIuc3F1YXJlJywgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5hbmdsZScsIG9wZW46ICc8JywgY2xvc2U6ICc+JyB9XHJcbiAgICBdLFxyXG4gICAga2V5d29yZHM6IFtcclxuICAgICAgICAnYWJzdHJhY3QnLFxyXG4gICAgICAgICdhbXAnLFxyXG4gICAgICAgICdhcnJheScsXHJcbiAgICAgICAgJ2F1dG8nLFxyXG4gICAgICAgICdib29sJyxcclxuICAgICAgICAnYnJlYWsnLFxyXG4gICAgICAgICdjYXNlJyxcclxuICAgICAgICAnY2F0Y2gnLFxyXG4gICAgICAgICdjaGFyJyxcclxuICAgICAgICAnY2xhc3MnLFxyXG4gICAgICAgICdjb25zdCcsXHJcbiAgICAgICAgJ2NvbnN0ZXhwcicsXHJcbiAgICAgICAgJ2NvbnN0X2Nhc3QnLFxyXG4gICAgICAgICdjb250aW51ZScsXHJcbiAgICAgICAgJ2NwdScsXHJcbiAgICAgICAgJ2RlY2x0eXBlJyxcclxuICAgICAgICAnZGVmYXVsdCcsXHJcbiAgICAgICAgJ2RlbGVnYXRlJyxcclxuICAgICAgICAnZGVsZXRlJyxcclxuICAgICAgICAnZG8nLFxyXG4gICAgICAgICdkb3VibGUnLFxyXG4gICAgICAgICdkeW5hbWljX2Nhc3QnLFxyXG4gICAgICAgICdlYWNoJyxcclxuICAgICAgICAnZWxzZScsXHJcbiAgICAgICAgJ2VudW0nLFxyXG4gICAgICAgICdldmVudCcsXHJcbiAgICAgICAgJ2V4cGxpY2l0JyxcclxuICAgICAgICAnZXhwb3J0JyxcclxuICAgICAgICAnZXh0ZXJuJyxcclxuICAgICAgICAnZmFsc2UnLFxyXG4gICAgICAgICdmaW5hbCcsXHJcbiAgICAgICAgJ2ZpbmFsbHknLFxyXG4gICAgICAgICdmbG9hdCcsXHJcbiAgICAgICAgJ2ZvcicsXHJcbiAgICAgICAgJ2ZyaWVuZCcsXHJcbiAgICAgICAgJ2djbmV3JyxcclxuICAgICAgICAnZ2VuZXJpYycsXHJcbiAgICAgICAgJ2dvdG8nLFxyXG4gICAgICAgICdpZicsXHJcbiAgICAgICAgJ2luJyxcclxuICAgICAgICAnaW5pdG9ubHknLFxyXG4gICAgICAgICdpbmxpbmUnLFxyXG4gICAgICAgICdpbnQnLFxyXG4gICAgICAgICdpbnRlcmZhY2UnLFxyXG4gICAgICAgICdpbnRlcmlvcl9wdHInLFxyXG4gICAgICAgICdpbnRlcm5hbCcsXHJcbiAgICAgICAgJ2xpdGVyYWwnLFxyXG4gICAgICAgICdsb25nJyxcclxuICAgICAgICAnbXV0YWJsZScsXHJcbiAgICAgICAgJ25hbWVzcGFjZScsXHJcbiAgICAgICAgJ25ldycsXHJcbiAgICAgICAgJ25vZXhjZXB0JyxcclxuICAgICAgICAnbnVsbHB0cicsXHJcbiAgICAgICAgJ19fbnVsbHB0cicsXHJcbiAgICAgICAgJ29wZXJhdG9yJyxcclxuICAgICAgICAnb3ZlcnJpZGUnLFxyXG4gICAgICAgICdwYXJ0aWFsJyxcclxuICAgICAgICAncGFzY2FsJyxcclxuICAgICAgICAncGluX3B0cicsXHJcbiAgICAgICAgJ3ByaXZhdGUnLFxyXG4gICAgICAgICdwcm9wZXJ0eScsXHJcbiAgICAgICAgJ3Byb3RlY3RlZCcsXHJcbiAgICAgICAgJ3B1YmxpYycsXHJcbiAgICAgICAgJ3JlZicsXHJcbiAgICAgICAgJ3JlZ2lzdGVyJyxcclxuICAgICAgICAncmVpbnRlcnByZXRfY2FzdCcsXHJcbiAgICAgICAgJ3Jlc3RyaWN0JyxcclxuICAgICAgICAncmV0dXJuJyxcclxuICAgICAgICAnc2FmZV9jYXN0JyxcclxuICAgICAgICAnc2VhbGVkJyxcclxuICAgICAgICAnc2hvcnQnLFxyXG4gICAgICAgICdzaWduZWQnLFxyXG4gICAgICAgICdzaXplb2YnLFxyXG4gICAgICAgICdzdGF0aWMnLFxyXG4gICAgICAgICdzdGF0aWNfYXNzZXJ0JyxcclxuICAgICAgICAnc3RhdGljX2Nhc3QnLFxyXG4gICAgICAgICdzdHJ1Y3QnLFxyXG4gICAgICAgICdzd2l0Y2gnLFxyXG4gICAgICAgICd0ZW1wbGF0ZScsXHJcbiAgICAgICAgJ3RoaXMnLFxyXG4gICAgICAgICd0aHJlYWRfbG9jYWwnLFxyXG4gICAgICAgICd0aHJvdycsXHJcbiAgICAgICAgJ3RpbGVfc3RhdGljJyxcclxuICAgICAgICAndHJ1ZScsXHJcbiAgICAgICAgJ3RyeScsXHJcbiAgICAgICAgJ3R5cGVkZWYnLFxyXG4gICAgICAgICd0eXBlaWQnLFxyXG4gICAgICAgICd0eXBlbmFtZScsXHJcbiAgICAgICAgJ3VuaW9uJyxcclxuICAgICAgICAndW5zaWduZWQnLFxyXG4gICAgICAgICd1c2luZycsXHJcbiAgICAgICAgJ3ZpcnR1YWwnLFxyXG4gICAgICAgICd2b2lkJyxcclxuICAgICAgICAndm9sYXRpbGUnLFxyXG4gICAgICAgICd3Y2hhcl90JyxcclxuICAgICAgICAnd2hlcmUnLFxyXG4gICAgICAgICd3aGlsZScsXHJcbiAgICAgICAgJ19hc20nLFxyXG4gICAgICAgICdfYmFzZWQnLFxyXG4gICAgICAgICdfY2RlY2wnLFxyXG4gICAgICAgICdfZGVjbHNwZWMnLFxyXG4gICAgICAgICdfZmFzdGNhbGwnLFxyXG4gICAgICAgICdfaWZfZXhpc3RzJyxcclxuICAgICAgICAnX2lmX25vdF9leGlzdHMnLFxyXG4gICAgICAgICdfaW5saW5lJyxcclxuICAgICAgICAnX211bHRpcGxlX2luaGVyaXRhbmNlJyxcclxuICAgICAgICAnX3Bhc2NhbCcsXHJcbiAgICAgICAgJ19zaW5nbGVfaW5oZXJpdGFuY2UnLFxyXG4gICAgICAgICdfc3RkY2FsbCcsXHJcbiAgICAgICAgJ192aXJ0dWFsX2luaGVyaXRhbmNlJyxcclxuICAgICAgICAnX3c2NCcsXHJcbiAgICAgICAgJ19fYWJzdHJhY3QnLFxyXG4gICAgICAgICdfX2FsaWdub2YnLFxyXG4gICAgICAgICdfX2FzbScsXHJcbiAgICAgICAgJ19fYXNzdW1lJyxcclxuICAgICAgICAnX19iYXNlZCcsXHJcbiAgICAgICAgJ19fYm94JyxcclxuICAgICAgICAnX19idWlsdGluX2FsaWdub2YnLFxyXG4gICAgICAgICdfX2NkZWNsJyxcclxuICAgICAgICAnX19jbHJjYWxsJyxcclxuICAgICAgICAnX19kZWNsc3BlYycsXHJcbiAgICAgICAgJ19fZGVsZWdhdGUnLFxyXG4gICAgICAgICdfX2V2ZW50JyxcclxuICAgICAgICAnX19leGNlcHQnLFxyXG4gICAgICAgICdfX2Zhc3RjYWxsJyxcclxuICAgICAgICAnX19maW5hbGx5JyxcclxuICAgICAgICAnX19mb3JjZWlubGluZScsXHJcbiAgICAgICAgJ19fZ2MnLFxyXG4gICAgICAgICdfX2hvb2snLFxyXG4gICAgICAgICdfX2lkZW50aWZpZXInLFxyXG4gICAgICAgICdfX2lmX2V4aXN0cycsXHJcbiAgICAgICAgJ19faWZfbm90X2V4aXN0cycsXHJcbiAgICAgICAgJ19faW5saW5lJyxcclxuICAgICAgICAnX19pbnQxMjgnLFxyXG4gICAgICAgICdfX2ludDE2JyxcclxuICAgICAgICAnX19pbnQzMicsXHJcbiAgICAgICAgJ19faW50NjQnLFxyXG4gICAgICAgICdfX2ludDgnLFxyXG4gICAgICAgICdfX2ludGVyZmFjZScsXHJcbiAgICAgICAgJ19fbGVhdmUnLFxyXG4gICAgICAgICdfX20xMjgnLFxyXG4gICAgICAgICdfX20xMjhkJyxcclxuICAgICAgICAnX19tMTI4aScsXHJcbiAgICAgICAgJ19fbTI1NicsXHJcbiAgICAgICAgJ19fbTI1NmQnLFxyXG4gICAgICAgICdfX20yNTZpJyxcclxuICAgICAgICAnX19tNjQnLFxyXG4gICAgICAgICdfX211bHRpcGxlX2luaGVyaXRhbmNlJyxcclxuICAgICAgICAnX19uZXdzbG90JyxcclxuICAgICAgICAnX19ub2djJyxcclxuICAgICAgICAnX19ub29wJyxcclxuICAgICAgICAnX19ub3Vud2luZCcsXHJcbiAgICAgICAgJ19fbm92dG9yZGlzcCcsXHJcbiAgICAgICAgJ19fcGFzY2FsJyxcclxuICAgICAgICAnX19waW4nLFxyXG4gICAgICAgICdfX3ByYWdtYScsXHJcbiAgICAgICAgJ19fcHJvcGVydHknLFxyXG4gICAgICAgICdfX3B0cjMyJyxcclxuICAgICAgICAnX19wdHI2NCcsXHJcbiAgICAgICAgJ19fcmFpc2UnLFxyXG4gICAgICAgICdfX3Jlc3RyaWN0JyxcclxuICAgICAgICAnX19yZXN1bWUnLFxyXG4gICAgICAgICdfX3NlYWxlZCcsXHJcbiAgICAgICAgJ19fc2luZ2xlX2luaGVyaXRhbmNlJyxcclxuICAgICAgICAnX19zdGRjYWxsJyxcclxuICAgICAgICAnX19zdXBlcicsXHJcbiAgICAgICAgJ19fdGhpc2NhbGwnLFxyXG4gICAgICAgICdfX3RyeScsXHJcbiAgICAgICAgJ19fdHJ5X2Nhc3QnLFxyXG4gICAgICAgICdfX3R5cGVvZicsXHJcbiAgICAgICAgJ19fdW5hbGlnbmVkJyxcclxuICAgICAgICAnX191bmhvb2snLFxyXG4gICAgICAgICdfX3V1aWRvZicsXHJcbiAgICAgICAgJ19fdmFsdWUnLFxyXG4gICAgICAgICdfX3ZpcnR1YWxfaW5oZXJpdGFuY2UnLFxyXG4gICAgICAgICdfX3c2NCcsXHJcbiAgICAgICAgJ19fd2NoYXJfdCdcclxuICAgIF0sXHJcbiAgICBvcGVyYXRvcnM6IFtcclxuICAgICAgICAnPScsICc+JywgJzwnLCAnIScsICd+JywgJz8nLCAnOicsXHJcbiAgICAgICAgJz09JywgJzw9JywgJz49JywgJyE9JywgJyYmJywgJ3x8JywgJysrJywgJy0tJyxcclxuICAgICAgICAnKycsICctJywgJyonLCAnLycsICcmJywgJ3wnLCAnXicsICclJywgJzw8JyxcclxuICAgICAgICAnPj4nLCAnPj4+JywgJys9JywgJy09JywgJyo9JywgJy89JywgJyY9JywgJ3w9JyxcclxuICAgICAgICAnXj0nLCAnJT0nLCAnPDw9JywgJz4+PScsICc+Pj49J1xyXG4gICAgXSxcclxuICAgIC8vIHdlIGluY2x1ZGUgdGhlc2UgY29tbW9uIHJlZ3VsYXIgZXhwcmVzc2lvbnNcclxuICAgIHN5bWJvbHM6IC9bPT48IX4/OiZ8K1xcLSpcXC9cXF4lXSsvLFxyXG4gICAgZXNjYXBlczogL1xcXFwoPzpbYWJmbnJ0dlxcXFxcIiddfHhbMC05QS1GYS1mXXsxLDR9fHVbMC05QS1GYS1mXXs0fXxVWzAtOUEtRmEtZl17OH0pLyxcclxuICAgIGludGVnZXJzdWZmaXg6IC8obGx8TEx8dXxVfGx8TCk/KGxsfExMfHV8VXxsfEwpPy8sXHJcbiAgICBmbG9hdHN1ZmZpeDogL1tmRmxMXT8vLFxyXG4gICAgZW5jb2Rpbmc6IC91fHU4fFV8TC8sXHJcbiAgICAvLyBUaGUgbWFpbiB0b2tlbml6ZXIgZm9yIG91ciBsYW5ndWFnZXNcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgLy8gQysrIDExIFJhdyBTdHJpbmdcclxuICAgICAgICAgICAgWy9AZW5jb2Rpbmc/UlxcXCIoPzooW14gKClcXFxcXFx0XSopKVxcKC8sIHsgdG9rZW46ICdzdHJpbmcucmF3LmJlZ2luJywgbmV4dDogJ0ByYXcuJDEnIH1dLFxyXG4gICAgICAgICAgICAvLyBpZGVudGlmaWVycyBhbmQga2V5d29yZHNcclxuICAgICAgICAgICAgWy9bYS16QS1aX11cXHcqLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiB7IHRva2VuOiAna2V5d29yZC4kMCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIC8vIHdoaXRlc3BhY2VcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIC8vIFtbIGF0dHJpYnV0ZXMgXV0uXHJcbiAgICAgICAgICAgIFsvXFxbXFxbLipcXF1cXF0vLCAnYW5ub3RhdGlvbiddLFxyXG4gICAgICAgICAgICBbL15cXHMqI2luY2x1ZGUvLCB7IHRva2VuOiAna2V5d29yZC5kaXJlY3RpdmUuaW5jbHVkZScsIG5leHQ6ICdAaW5jbHVkZScgfV0sXHJcbiAgICAgICAgICAgIC8vIFByZXByb2Nlc3NvciBkaXJlY3RpdmVcclxuICAgICAgICAgICAgWy9eXFxzKiNcXHMqXFx3Ky8sICdrZXl3b3JkJ10sXHJcbiAgICAgICAgICAgIC8vIGRlbGltaXRlcnMgYW5kIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBbL1t7fSgpXFxbXFxdXS8sICdAYnJhY2tldHMnXSxcclxuICAgICAgICAgICAgWy9bPD5dKD8hQHN5bWJvbHMpLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbL0BzeW1ib2xzLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAb3BlcmF0b3JzJzogJ2RlbGltaXRlcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICcnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIC8vIG51bWJlcnNcclxuICAgICAgICAgICAgWy9cXGQqXFxkK1tlRV0oW1xcLStdP1xcZCspPyhAZmxvYXRzdWZmaXgpLywgJ251bWJlci5mbG9hdCddLFxyXG4gICAgICAgICAgICBbL1xcZCpcXC5cXGQrKFtlRV1bXFwtK10/XFxkKyk/KEBmbG9hdHN1ZmZpeCkvLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvMFt4WF1bMC05YS1mQS1GJ10qWzAtOWEtZkEtRl0oQGludGVnZXJzdWZmaXgpLywgJ251bWJlci5oZXgnXSxcclxuICAgICAgICAgICAgWy8wWzAtNyddKlswLTddKEBpbnRlZ2Vyc3VmZml4KS8sICdudW1iZXIub2N0YWwnXSxcclxuICAgICAgICAgICAgWy8wW2JCXVswLTEnXSpbMC0xXShAaW50ZWdlcnN1ZmZpeCkvLCAnbnVtYmVyLmJpbmFyeSddLFxyXG4gICAgICAgICAgICBbL1xcZFtcXGQnXSpcXGQoQGludGVnZXJzdWZmaXgpLywgJ251bWJlciddLFxyXG4gICAgICAgICAgICBbL1xcZChAaW50ZWdlcnN1ZmZpeCkvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgICAgIC8vIGRlbGltaXRlcjogYWZ0ZXIgbnVtYmVyIGJlY2F1c2Ugb2YgLlxcZCBmbG9hdHNcclxuICAgICAgICAgICAgWy9bOywuXS8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgLy8gc3RyaW5nc1xyXG4gICAgICAgICAgICBbL1wiKFteXCJcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIC8vIGNoYXJhY3RlcnNcclxuICAgICAgICAgICAgWy8nW15cXFxcJ10nLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbLygnKShAZXNjYXBlcykoJykvLCBbJ3N0cmluZycsICdzdHJpbmcuZXNjYXBlJywgJ3N0cmluZyddXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZy5pbnZhbGlkJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIHdoaXRlc3BhY2U6IFtcclxuICAgICAgICAgICAgWy9bIFxcdFxcclxcbl0rLywgJyddLFxyXG4gICAgICAgICAgICBbL1xcL1xcKlxcKig/IVxcLykvLCAnY29tbWVudC5kb2MnLCAnQGRvY2NvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXC9cXCovLCAnY29tbWVudCcsICdAY29tbWVudCddLFxyXG4gICAgICAgICAgICBbL1xcL1xcLy4qJC8sICdjb21tZW50J10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBjb21tZW50OiBbXHJcbiAgICAgICAgICAgIFsvW15cXC8qXSsvLCAnY29tbWVudCddLFxyXG4gICAgICAgICAgICBbL1xcKlxcLy8sICdjb21tZW50JywgJ0Bwb3AnXSxcclxuICAgICAgICAgICAgWy9bXFwvKl0vLCAnY29tbWVudCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvL0lkZW50aWNhbCBjb3B5IG9mIGNvbW1lbnQgYWJvdmUsIGV4Y2VwdCBmb3IgdGhlIGFkZGl0aW9uIG9mIC5kb2NcclxuICAgICAgICBkb2Njb21tZW50OiBbXHJcbiAgICAgICAgICAgIFsvW15cXC8qXSsvLCAnY29tbWVudC5kb2MnXSxcclxuICAgICAgICAgICAgWy9cXCpcXC8vLCAnY29tbWVudC5kb2MnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1tcXC8qXS8sICdjb21tZW50LmRvYyddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzdHJpbmc6IFtcclxuICAgICAgICAgICAgWy9bXlxcXFxcIl0rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL0Blc2NhcGVzLywgJ3N0cmluZy5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuZXNjYXBlLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcnLCAnQHBvcCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICByYXc6IFtcclxuICAgICAgICAgICAgWy8oLiopKFxcKSkoPzooW14gKClcXFxcXFx0XSopKShcXFwiKS8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnJDM9PSRTMic6IFsnc3RyaW5nLnJhdycsICdzdHJpbmcucmF3LmVuZCcsICdzdHJpbmcucmF3LmVuZCcsIHsgdG9rZW46ICdzdHJpbmcucmF3LmVuZCcsIG5leHQ6ICdAcG9wJyB9XSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogWydzdHJpbmcucmF3JywgJ3N0cmluZy5yYXcnLCAnc3RyaW5nLnJhdycsICdzdHJpbmcucmF3J11cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFsvLiovLCAnc3RyaW5nLnJhdyddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBpbmNsdWRlOiBbXHJcbiAgICAgICAgICAgIFsvKFxccyopKDwpKFtePD5dKikoPikvLCBbJycsICdrZXl3b3JkLmRpcmVjdGl2ZS5pbmNsdWRlLmJlZ2luJywgJ3N0cmluZy5pbmNsdWRlLmlkZW50aWZpZXInLCB7IHRva2VuOiAna2V5d29yZC5kaXJlY3RpdmUuaW5jbHVkZS5lbmQnLCBuZXh0OiAnQHBvcCcgfV1dLFxyXG4gICAgICAgICAgICBbLyhcXHMqKShcIikoW15cIl0qKShcIikvLCBbJycsICdrZXl3b3JkLmRpcmVjdGl2ZS5pbmNsdWRlLmJlZ2luJywgJ3N0cmluZy5pbmNsdWRlLmlkZW50aWZpZXInLCB7IHRva2VuOiAna2V5d29yZC5kaXJlY3RpdmUuaW5jbHVkZS5lbmQnLCBuZXh0OiAnQHBvcCcgfV1dXHJcbiAgICAgICAgXVxyXG4gICAgfSxcclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==