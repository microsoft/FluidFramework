(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[20],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/python/python.js":
/*!****************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/python/python.js ***!
  \****************************************************************************/
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
    comments: {
        lineComment: '#',
        blockComment: ['\'\'\'', '\'\'\''],
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
        { open: '"', close: '"', notIn: ['string'] },
        { open: '\'', close: '\'', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
    ],
    onEnterRules: [
        {
            beforeText: new RegExp("^\\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async).*?:\\s*$"),
            action: { indentAction: _monaco.languages.IndentAction.Indent }
        }
    ],
    folding: {
        offSide: true,
        markers: {
            start: new RegExp("^\\s*#region\\b"),
            end: new RegExp("^\\s*#endregion\\b")
        }
    }
};
var language = {
    defaultToken: '',
    tokenPostfix: '.python',
    keywords: [
        'and',
        'as',
        'assert',
        'break',
        'class',
        'continue',
        'def',
        'del',
        'elif',
        'else',
        'except',
        'exec',
        'finally',
        'for',
        'from',
        'global',
        'if',
        'import',
        'in',
        'is',
        'lambda',
        'None',
        'not',
        'or',
        'pass',
        'print',
        'raise',
        'return',
        'self',
        'try',
        'while',
        'with',
        'yield',
        'int',
        'float',
        'long',
        'complex',
        'hex',
        'abs',
        'all',
        'any',
        'apply',
        'basestring',
        'bin',
        'bool',
        'buffer',
        'bytearray',
        'callable',
        'chr',
        'classmethod',
        'cmp',
        'coerce',
        'compile',
        'complex',
        'delattr',
        'dict',
        'dir',
        'divmod',
        'enumerate',
        'eval',
        'execfile',
        'file',
        'filter',
        'format',
        'frozenset',
        'getattr',
        'globals',
        'hasattr',
        'hash',
        'help',
        'id',
        'input',
        'intern',
        'isinstance',
        'issubclass',
        'iter',
        'len',
        'locals',
        'list',
        'map',
        'max',
        'memoryview',
        'min',
        'next',
        'object',
        'oct',
        'open',
        'ord',
        'pow',
        'print',
        'property',
        'reversed',
        'range',
        'raw_input',
        'reduce',
        'reload',
        'repr',
        'reversed',
        'round',
        'set',
        'setattr',
        'slice',
        'sorted',
        'staticmethod',
        'str',
        'sum',
        'super',
        'tuple',
        'type',
        'unichr',
        'unicode',
        'vars',
        'xrange',
        'zip',
        'True',
        'False',
        '__dict__',
        '__methods__',
        '__members__',
        '__class__',
        '__bases__',
        '__name__',
        '__mro__',
        '__subclasses__',
        '__init__',
        '__import__'
    ],
    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.bracket' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' }
    ],
    tokenizer: {
        root: [
            { include: '@whitespace' },
            { include: '@numbers' },
            { include: '@strings' },
            [/[,:;]/, 'delimiter'],
            [/[{}\[\]()]/, '@brackets'],
            [/@[a-zA-Z]\w*/, 'tag'],
            [/[a-zA-Z]\w*/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier'
                    }
                }]
        ],
        // Deal with white space, including single and multi-line comments
        whitespace: [
            [/\s+/, 'white'],
            [/(^#.*$)/, 'comment'],
            [/'''/, 'string', '@endDocString'],
            [/"""/, 'string', '@endDblDocString']
        ],
        endDocString: [
            [/[^']+/, 'string'],
            [/\\'/, 'string'],
            [/'''/, 'string', '@popall'],
            [/'/, 'string']
        ],
        endDblDocString: [
            [/[^"]+/, 'string'],
            [/\\"/, 'string'],
            [/"""/, 'string', '@popall'],
            [/"/, 'string']
        ],
        // Recognize hex, negatives, decimals, imaginaries, longs, and scientific notation
        numbers: [
            [/-?0x([abcdef]|[ABCDEF]|\d)+[lL]?/, 'number.hex'],
            [/-?(\d*\.)?\d+([eE][+\-]?\d+)?[jJ]?[lL]?/, 'number']
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvcHl0aG9uL3B5dGhvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNiO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLFdBQVcsS0FBSztBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMsU0FBUyxZQUFZLEdBQUc7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyx3REFBd0Q7QUFDakU7QUFDQTtBQUNBLFNBQVMsU0FBUyxZQUFZLEdBQUc7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSw2QkFBNkI7QUFDM0QsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDLGFBQWEsc0JBQXNCO0FBQ25DLGFBQWEsc0JBQXNCO0FBQ25DLGtCQUFrQjtBQUNsQixpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiIyMC5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG4vLyBBbGxvdyBmb3IgcnVubmluZyB1bmRlciBub2RlanMvcmVxdWlyZWpzIGluIHRlc3RzXHJcbnZhciBfbW9uYWNvID0gKHR5cGVvZiBtb25hY28gPT09ICd1bmRlZmluZWQnID8gc2VsZi5tb25hY28gOiBtb25hY28pO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnIycsXHJcbiAgICAgICAgYmxvY2tDb21tZW50OiBbJ1xcJ1xcJ1xcJycsICdcXCdcXCdcXCcnXSxcclxuICAgIH0sXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIFsneycsICd9J10sXHJcbiAgICAgICAgWydbJywgJ10nXSxcclxuICAgICAgICBbJygnLCAnKSddXHJcbiAgICBdLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicsIG5vdEluOiBbJ3N0cmluZyddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXHJcbiAgICBdLFxyXG4gICAgc3Vycm91bmRpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcclxuICAgICAgICB7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycgfSxcclxuICAgIF0sXHJcbiAgICBvbkVudGVyUnVsZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGJlZm9yZVRleHQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqKD86ZGVmfGNsYXNzfGZvcnxpZnxlbGlmfGVsc2V8d2hpbGV8dHJ5fHdpdGh8ZmluYWxseXxleGNlcHR8YXN5bmMpLio/OlxcXFxzKiRcIiksXHJcbiAgICAgICAgICAgIGFjdGlvbjogeyBpbmRlbnRBY3Rpb246IF9tb25hY28ubGFuZ3VhZ2VzLkluZGVudEFjdGlvbi5JbmRlbnQgfVxyXG4gICAgICAgIH1cclxuICAgIF0sXHJcbiAgICBmb2xkaW5nOiB7XHJcbiAgICAgICAgb2ZmU2lkZTogdHJ1ZSxcclxuICAgICAgICBtYXJrZXJzOiB7XHJcbiAgICAgICAgICAgIHN0YXJ0OiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNyZWdpb25cXFxcYlwiKSxcclxuICAgICAgICAgICAgZW5kOiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNlbmRyZWdpb25cXFxcYlwiKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuZXhwb3J0IHZhciBsYW5ndWFnZSA9IHtcclxuICAgIGRlZmF1bHRUb2tlbjogJycsXHJcbiAgICB0b2tlblBvc3RmaXg6ICcucHl0aG9uJyxcclxuICAgIGtleXdvcmRzOiBbXHJcbiAgICAgICAgJ2FuZCcsXHJcbiAgICAgICAgJ2FzJyxcclxuICAgICAgICAnYXNzZXJ0JyxcclxuICAgICAgICAnYnJlYWsnLFxyXG4gICAgICAgICdjbGFzcycsXHJcbiAgICAgICAgJ2NvbnRpbnVlJyxcclxuICAgICAgICAnZGVmJyxcclxuICAgICAgICAnZGVsJyxcclxuICAgICAgICAnZWxpZicsXHJcbiAgICAgICAgJ2Vsc2UnLFxyXG4gICAgICAgICdleGNlcHQnLFxyXG4gICAgICAgICdleGVjJyxcclxuICAgICAgICAnZmluYWxseScsXHJcbiAgICAgICAgJ2ZvcicsXHJcbiAgICAgICAgJ2Zyb20nLFxyXG4gICAgICAgICdnbG9iYWwnLFxyXG4gICAgICAgICdpZicsXHJcbiAgICAgICAgJ2ltcG9ydCcsXHJcbiAgICAgICAgJ2luJyxcclxuICAgICAgICAnaXMnLFxyXG4gICAgICAgICdsYW1iZGEnLFxyXG4gICAgICAgICdOb25lJyxcclxuICAgICAgICAnbm90JyxcclxuICAgICAgICAnb3InLFxyXG4gICAgICAgICdwYXNzJyxcclxuICAgICAgICAncHJpbnQnLFxyXG4gICAgICAgICdyYWlzZScsXHJcbiAgICAgICAgJ3JldHVybicsXHJcbiAgICAgICAgJ3NlbGYnLFxyXG4gICAgICAgICd0cnknLFxyXG4gICAgICAgICd3aGlsZScsXHJcbiAgICAgICAgJ3dpdGgnLFxyXG4gICAgICAgICd5aWVsZCcsXHJcbiAgICAgICAgJ2ludCcsXHJcbiAgICAgICAgJ2Zsb2F0JyxcclxuICAgICAgICAnbG9uZycsXHJcbiAgICAgICAgJ2NvbXBsZXgnLFxyXG4gICAgICAgICdoZXgnLFxyXG4gICAgICAgICdhYnMnLFxyXG4gICAgICAgICdhbGwnLFxyXG4gICAgICAgICdhbnknLFxyXG4gICAgICAgICdhcHBseScsXHJcbiAgICAgICAgJ2Jhc2VzdHJpbmcnLFxyXG4gICAgICAgICdiaW4nLFxyXG4gICAgICAgICdib29sJyxcclxuICAgICAgICAnYnVmZmVyJyxcclxuICAgICAgICAnYnl0ZWFycmF5JyxcclxuICAgICAgICAnY2FsbGFibGUnLFxyXG4gICAgICAgICdjaHInLFxyXG4gICAgICAgICdjbGFzc21ldGhvZCcsXHJcbiAgICAgICAgJ2NtcCcsXHJcbiAgICAgICAgJ2NvZXJjZScsXHJcbiAgICAgICAgJ2NvbXBpbGUnLFxyXG4gICAgICAgICdjb21wbGV4JyxcclxuICAgICAgICAnZGVsYXR0cicsXHJcbiAgICAgICAgJ2RpY3QnLFxyXG4gICAgICAgICdkaXInLFxyXG4gICAgICAgICdkaXZtb2QnLFxyXG4gICAgICAgICdlbnVtZXJhdGUnLFxyXG4gICAgICAgICdldmFsJyxcclxuICAgICAgICAnZXhlY2ZpbGUnLFxyXG4gICAgICAgICdmaWxlJyxcclxuICAgICAgICAnZmlsdGVyJyxcclxuICAgICAgICAnZm9ybWF0JyxcclxuICAgICAgICAnZnJvemVuc2V0JyxcclxuICAgICAgICAnZ2V0YXR0cicsXHJcbiAgICAgICAgJ2dsb2JhbHMnLFxyXG4gICAgICAgICdoYXNhdHRyJyxcclxuICAgICAgICAnaGFzaCcsXHJcbiAgICAgICAgJ2hlbHAnLFxyXG4gICAgICAgICdpZCcsXHJcbiAgICAgICAgJ2lucHV0JyxcclxuICAgICAgICAnaW50ZXJuJyxcclxuICAgICAgICAnaXNpbnN0YW5jZScsXHJcbiAgICAgICAgJ2lzc3ViY2xhc3MnLFxyXG4gICAgICAgICdpdGVyJyxcclxuICAgICAgICAnbGVuJyxcclxuICAgICAgICAnbG9jYWxzJyxcclxuICAgICAgICAnbGlzdCcsXHJcbiAgICAgICAgJ21hcCcsXHJcbiAgICAgICAgJ21heCcsXHJcbiAgICAgICAgJ21lbW9yeXZpZXcnLFxyXG4gICAgICAgICdtaW4nLFxyXG4gICAgICAgICduZXh0JyxcclxuICAgICAgICAnb2JqZWN0JyxcclxuICAgICAgICAnb2N0JyxcclxuICAgICAgICAnb3BlbicsXHJcbiAgICAgICAgJ29yZCcsXHJcbiAgICAgICAgJ3BvdycsXHJcbiAgICAgICAgJ3ByaW50JyxcclxuICAgICAgICAncHJvcGVydHknLFxyXG4gICAgICAgICdyZXZlcnNlZCcsXHJcbiAgICAgICAgJ3JhbmdlJyxcclxuICAgICAgICAncmF3X2lucHV0JyxcclxuICAgICAgICAncmVkdWNlJyxcclxuICAgICAgICAncmVsb2FkJyxcclxuICAgICAgICAncmVwcicsXHJcbiAgICAgICAgJ3JldmVyc2VkJyxcclxuICAgICAgICAncm91bmQnLFxyXG4gICAgICAgICdzZXQnLFxyXG4gICAgICAgICdzZXRhdHRyJyxcclxuICAgICAgICAnc2xpY2UnLFxyXG4gICAgICAgICdzb3J0ZWQnLFxyXG4gICAgICAgICdzdGF0aWNtZXRob2QnLFxyXG4gICAgICAgICdzdHInLFxyXG4gICAgICAgICdzdW0nLFxyXG4gICAgICAgICdzdXBlcicsXHJcbiAgICAgICAgJ3R1cGxlJyxcclxuICAgICAgICAndHlwZScsXHJcbiAgICAgICAgJ3VuaWNocicsXHJcbiAgICAgICAgJ3VuaWNvZGUnLFxyXG4gICAgICAgICd2YXJzJyxcclxuICAgICAgICAneHJhbmdlJyxcclxuICAgICAgICAnemlwJyxcclxuICAgICAgICAnVHJ1ZScsXHJcbiAgICAgICAgJ0ZhbHNlJyxcclxuICAgICAgICAnX19kaWN0X18nLFxyXG4gICAgICAgICdfX21ldGhvZHNfXycsXHJcbiAgICAgICAgJ19fbWVtYmVyc19fJyxcclxuICAgICAgICAnX19jbGFzc19fJyxcclxuICAgICAgICAnX19iYXNlc19fJyxcclxuICAgICAgICAnX19uYW1lX18nLFxyXG4gICAgICAgICdfX21yb19fJyxcclxuICAgICAgICAnX19zdWJjbGFzc2VzX18nLFxyXG4gICAgICAgICdfX2luaXRfXycsXHJcbiAgICAgICAgJ19faW1wb3J0X18nXHJcbiAgICBdLFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JywgdG9rZW46ICdkZWxpbWl0ZXIuY3VybHknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIHRva2VuOiAnZGVsaW1pdGVyLmJyYWNrZXQnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScsIHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJyB9XHJcbiAgICBdLFxyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAd2hpdGVzcGFjZScgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQG51bWJlcnMnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BzdHJpbmdzJyB9LFxyXG4gICAgICAgICAgICBbL1ssOjtdLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgICAgICBbL1t7fVxcW1xcXSgpXS8sICdAYnJhY2tldHMnXSxcclxuICAgICAgICAgICAgWy9AW2EtekEtWl1cXHcqLywgJ3RhZyddLFxyXG4gICAgICAgICAgICBbL1thLXpBLVpdXFx3Ki8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gRGVhbCB3aXRoIHdoaXRlIHNwYWNlLCBpbmNsdWRpbmcgc2luZ2xlIGFuZCBtdWx0aS1saW5lIGNvbW1lbnRzXHJcbiAgICAgICAgd2hpdGVzcGFjZTogW1xyXG4gICAgICAgICAgICBbL1xccysvLCAnd2hpdGUnXSxcclxuICAgICAgICAgICAgWy8oXiMuKiQpLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy8nJycvLCAnc3RyaW5nJywgJ0BlbmREb2NTdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9cIlwiXCIvLCAnc3RyaW5nJywgJ0BlbmREYmxEb2NTdHJpbmcnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZW5kRG9jU3RyaW5nOiBbXHJcbiAgICAgICAgICAgIFsvW14nXSsvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXCcvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvJycnLywgJ3N0cmluZycsICdAcG9wYWxsJ10sXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZW5kRGJsRG9jU3RyaW5nOiBbXHJcbiAgICAgICAgICAgIFsvW15cIl0rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL1xcXFxcIi8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9cIlwiXCIvLCAnc3RyaW5nJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gUmVjb2duaXplIGhleCwgbmVnYXRpdmVzLCBkZWNpbWFscywgaW1hZ2luYXJpZXMsIGxvbmdzLCBhbmQgc2NpZW50aWZpYyBub3RhdGlvblxyXG4gICAgICAgIG51bWJlcnM6IFtcclxuICAgICAgICAgICAgWy8tPzB4KFthYmNkZWZdfFtBQkNERUZdfFxcZCkrW2xMXT8vLCAnbnVtYmVyLmhleCddLFxyXG4gICAgICAgICAgICBbLy0/KFxcZCpcXC4pP1xcZCsoW2VFXVsrXFwtXT9cXGQrKT9bakpdP1tsTF0/LywgJ251bWJlciddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBSZWNvZ25pemUgc3RyaW5ncywgaW5jbHVkaW5nIHRob3NlIGJyb2tlbiBhY3Jvc3MgbGluZXMgd2l0aCBcXCAoYnV0IG5vdCB3aXRob3V0KVxyXG4gICAgICAgIHN0cmluZ3M6IFtcclxuICAgICAgICAgICAgWy8nJC8sICdzdHJpbmcuZXNjYXBlJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZy5lc2NhcGUnLCAnQHN0cmluZ0JvZHknXSxcclxuICAgICAgICAgICAgWy9cIiQvLCAnc3RyaW5nLmVzY2FwZScsICdAcG9wYWxsJ10sXHJcbiAgICAgICAgICAgIFsvXCIvLCAnc3RyaW5nLmVzY2FwZScsICdAZGJsU3RyaW5nQm9keSddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzdHJpbmdCb2R5OiBbXHJcbiAgICAgICAgICAgIFsvW15cXFxcJ10rJC8sICdzdHJpbmcnLCAnQHBvcGFsbCddLFxyXG4gICAgICAgICAgICBbL1teXFxcXCddKy8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZy5lc2NhcGUnLCAnQHBvcGFsbCddLFxyXG4gICAgICAgICAgICBbL1xcXFwkLywgJ3N0cmluZyddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBkYmxTdHJpbmdCb2R5OiBbXHJcbiAgICAgICAgICAgIFsvW15cXFxcXCJdKyQvLCAnc3RyaW5nJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy9bXlxcXFxcIl0rLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL1xcXFwuLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZy5lc2NhcGUnLCAnQHBvcGFsbCddLFxyXG4gICAgICAgICAgICBbL1xcXFwkLywgJ3N0cmluZyddXHJcbiAgICAgICAgXVxyXG4gICAgfVxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9