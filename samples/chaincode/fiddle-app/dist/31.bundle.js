(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[31],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/shell/shell.js":
/*!**************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/shell/shell.js ***!
  \**************************************************************************/
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
        lineComment: '#',
    },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '`', close: '`' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '`', close: '`' },
    ],
};
var language = {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.shell',
    brackets: [
        { token: 'delimiter.bracket', open: '{', close: '}' },
        { token: 'delimiter.parenthesis', open: '(', close: ')' },
        { token: 'delimiter.square', open: '[', close: ']' },
    ],
    keywords: [
        'if',
        'then',
        'do',
        'else',
        'elif',
        'while',
        'until',
        'for',
        'in',
        'esac',
        'fi',
        'fin',
        'fil',
        'done',
        'exit',
        'set',
        'unset',
        'export',
        'function',
    ],
    builtins: [
        'ab',
        'awk',
        'bash',
        'beep',
        'cat',
        'cc',
        'cd',
        'chown',
        'chmod',
        'chroot',
        'clear',
        'cp',
        'curl',
        'cut',
        'diff',
        'echo',
        'find',
        'gawk',
        'gcc',
        'get',
        'git',
        'grep',
        'hg',
        'kill',
        'killall',
        'ln',
        'ls',
        'make',
        'mkdir',
        'openssl',
        'mv',
        'nc',
        'node',
        'npm',
        'ping',
        'ps',
        'restart',
        'rm',
        'rmdir',
        'sed',
        'service',
        'sh',
        'shopt',
        'shred',
        'source',
        'sort',
        'sleep',
        'ssh',
        'start',
        'stop',
        'su',
        'sudo',
        'svn',
        'tee',
        'telnet',
        'top',
        'touch',
        'vi',
        'vim',
        'wall',
        'wc',
        'wget',
        'who',
        'write',
        'yes',
        'zsh',
    ],
    // we include these common regular expressions
    symbols: /[=><!~?&|+\-*\/\^;\.,]+/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            { include: '@whitespace' },
            [
                /[a-zA-Z]\w*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@builtins': 'type.identifier',
                        '@default': ''
                    },
                },
            ],
            { include: '@strings' },
            { include: '@parameters' },
            { include: '@heredoc' },
            [/[{}\[\]()]/, '@brackets'],
            [/-+\w+/, 'attribute.name'],
            [/@symbols/, 'delimiter'],
            { include: '@numbers' },
            [/[,;]/, 'delimiter'],
        ],
        whitespace: [
            [/\s+/, 'white'],
            [/(^#!.*$)/, 'metatag'],
            [/(^#.*$)/, 'comment'],
        ],
        numbers: [
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F_]*[0-9a-fA-F]/, 'number.hex'],
            [/\d+/, 'number'],
        ],
        // Recognize strings, including those broken across lines
        strings: [
            [/'/, 'string', '@stringBody'],
            [/"/, 'string', '@dblStringBody']
        ],
        stringBody: [
            [/'/, 'string', '@popall'],
            [/./, 'string'],
        ],
        dblStringBody: [
            [/"/, 'string', '@popall'],
            [/./, 'string'],
        ],
        heredoc: [
            [/(<<[-<]?)(\s*)(['"`]?)([\w\-]+)(['"`]?)/, ['constants', 'white', 'string.heredoc.delimiter', 'string.heredoc', 'string.heredoc.delimiter']]
        ],
        parameters: [
            [/\$\d+/, 'variable.predefined'],
            [/\$\w+/, 'variable'],
            [/\$[*@#?\-$!0_]/, 'variable'],
            [/\$'/, 'variable', '@parameterBodyQuote'],
            [/\$"/, 'variable', '@parameterBodyDoubleQuote'],
            [/\$\(/, 'variable', '@parameterBodyParen'],
            [/\$\{/, 'variable', '@parameterBodyCurlyBrace'],
        ],
        parameterBodyQuote: [
            [/[^#:%*@\-!_']+/, 'variable'],
            [/[#:%*@\-!_]/, 'delimiter'],
            [/[']/, 'variable', '@pop'],
        ],
        parameterBodyDoubleQuote: [
            [/[^#:%*@\-!_"]+/, 'variable'],
            [/[#:%*@\-!_]/, 'delimiter'],
            [/["]/, 'variable', '@pop'],
        ],
        parameterBodyParen: [
            [/[^#:%*@\-!_)]+/, 'variable'],
            [/[#:%*@\-!_]/, 'delimiter'],
            [/[)]/, 'variable', '@pop'],
        ],
        parameterBodyCurlyBrace: [
            [/[^#:%*@\-!_}]+/, 'variable'],
            [/[#:%*@\-!_]/, 'delimiter'],
            [/[}]/, 'variable', '@pop'],
        ],
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvc2hlbGwvc2hlbGwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDTjtBQUNQO0FBQ0E7QUFDQSxLQUFLO0FBQ0wsa0JBQWtCLEtBQUs7QUFDdkI7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyxxQ0FBcUMsWUFBWSxHQUFHO0FBQzdELFNBQVMsd0RBQXdEO0FBQ2pFLFNBQVMsbURBQW1EO0FBQzVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0NBQWdDO0FBQ2hDO0FBQ0E7QUFDQTtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EscUJBQXFCO0FBQ3JCLGlCQUFpQjtBQUNqQjtBQUNBLGFBQWEsc0JBQXNCO0FBQ25DLGFBQWEseUJBQXlCO0FBQ3RDLGFBQWEsc0JBQXNCO0FBQ25DLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsYUFBYSxzQkFBc0I7QUFDbkMsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0JBQWtCO0FBQ2xCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwwQkFBMEI7QUFDMUI7QUFDQSxnQkFBZ0I7QUFDaEI7QUFDQTtBQUNBIiwiZmlsZSI6IjMxLmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4qICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcjJyxcclxuICAgIH0sXHJcbiAgICBicmFja2V0czogW1sneycsICd9J10sIFsnWycsICddJ10sIFsnKCcsICcpJ11dLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcclxuICAgICAgICB7IG9wZW46IFwiJ1wiLCBjbG9zZTogXCInXCIgfSxcclxuICAgICAgICB7IG9wZW46ICdgJywgY2xvc2U6ICdgJyB9LFxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiBcIidcIiwgY2xvc2U6IFwiJ1wiIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcgfSxcclxuICAgIF0sXHJcbn07XHJcbmV4cG9ydCB2YXIgbGFuZ3VhZ2UgPSB7XHJcbiAgICBkZWZhdWx0VG9rZW46ICcnLFxyXG4gICAgaWdub3JlQ2FzZTogdHJ1ZSxcclxuICAgIHRva2VuUG9zdGZpeDogJy5zaGVsbCcsXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2tldCcsIG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnLCBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IHRva2VuOiAnZGVsaW1pdGVyLnNxdWFyZScsIG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgXSxcclxuICAgIGtleXdvcmRzOiBbXHJcbiAgICAgICAgJ2lmJyxcclxuICAgICAgICAndGhlbicsXHJcbiAgICAgICAgJ2RvJyxcclxuICAgICAgICAnZWxzZScsXHJcbiAgICAgICAgJ2VsaWYnLFxyXG4gICAgICAgICd3aGlsZScsXHJcbiAgICAgICAgJ3VudGlsJyxcclxuICAgICAgICAnZm9yJyxcclxuICAgICAgICAnaW4nLFxyXG4gICAgICAgICdlc2FjJyxcclxuICAgICAgICAnZmknLFxyXG4gICAgICAgICdmaW4nLFxyXG4gICAgICAgICdmaWwnLFxyXG4gICAgICAgICdkb25lJyxcclxuICAgICAgICAnZXhpdCcsXHJcbiAgICAgICAgJ3NldCcsXHJcbiAgICAgICAgJ3Vuc2V0JyxcclxuICAgICAgICAnZXhwb3J0JyxcclxuICAgICAgICAnZnVuY3Rpb24nLFxyXG4gICAgXSxcclxuICAgIGJ1aWx0aW5zOiBbXHJcbiAgICAgICAgJ2FiJyxcclxuICAgICAgICAnYXdrJyxcclxuICAgICAgICAnYmFzaCcsXHJcbiAgICAgICAgJ2JlZXAnLFxyXG4gICAgICAgICdjYXQnLFxyXG4gICAgICAgICdjYycsXHJcbiAgICAgICAgJ2NkJyxcclxuICAgICAgICAnY2hvd24nLFxyXG4gICAgICAgICdjaG1vZCcsXHJcbiAgICAgICAgJ2Nocm9vdCcsXHJcbiAgICAgICAgJ2NsZWFyJyxcclxuICAgICAgICAnY3AnLFxyXG4gICAgICAgICdjdXJsJyxcclxuICAgICAgICAnY3V0JyxcclxuICAgICAgICAnZGlmZicsXHJcbiAgICAgICAgJ2VjaG8nLFxyXG4gICAgICAgICdmaW5kJyxcclxuICAgICAgICAnZ2F3aycsXHJcbiAgICAgICAgJ2djYycsXHJcbiAgICAgICAgJ2dldCcsXHJcbiAgICAgICAgJ2dpdCcsXHJcbiAgICAgICAgJ2dyZXAnLFxyXG4gICAgICAgICdoZycsXHJcbiAgICAgICAgJ2tpbGwnLFxyXG4gICAgICAgICdraWxsYWxsJyxcclxuICAgICAgICAnbG4nLFxyXG4gICAgICAgICdscycsXHJcbiAgICAgICAgJ21ha2UnLFxyXG4gICAgICAgICdta2RpcicsXHJcbiAgICAgICAgJ29wZW5zc2wnLFxyXG4gICAgICAgICdtdicsXHJcbiAgICAgICAgJ25jJyxcclxuICAgICAgICAnbm9kZScsXHJcbiAgICAgICAgJ25wbScsXHJcbiAgICAgICAgJ3BpbmcnLFxyXG4gICAgICAgICdwcycsXHJcbiAgICAgICAgJ3Jlc3RhcnQnLFxyXG4gICAgICAgICdybScsXHJcbiAgICAgICAgJ3JtZGlyJyxcclxuICAgICAgICAnc2VkJyxcclxuICAgICAgICAnc2VydmljZScsXHJcbiAgICAgICAgJ3NoJyxcclxuICAgICAgICAnc2hvcHQnLFxyXG4gICAgICAgICdzaHJlZCcsXHJcbiAgICAgICAgJ3NvdXJjZScsXHJcbiAgICAgICAgJ3NvcnQnLFxyXG4gICAgICAgICdzbGVlcCcsXHJcbiAgICAgICAgJ3NzaCcsXHJcbiAgICAgICAgJ3N0YXJ0JyxcclxuICAgICAgICAnc3RvcCcsXHJcbiAgICAgICAgJ3N1JyxcclxuICAgICAgICAnc3VkbycsXHJcbiAgICAgICAgJ3N2bicsXHJcbiAgICAgICAgJ3RlZScsXHJcbiAgICAgICAgJ3RlbG5ldCcsXHJcbiAgICAgICAgJ3RvcCcsXHJcbiAgICAgICAgJ3RvdWNoJyxcclxuICAgICAgICAndmknLFxyXG4gICAgICAgICd2aW0nLFxyXG4gICAgICAgICd3YWxsJyxcclxuICAgICAgICAnd2MnLFxyXG4gICAgICAgICd3Z2V0JyxcclxuICAgICAgICAnd2hvJyxcclxuICAgICAgICAnd3JpdGUnLFxyXG4gICAgICAgICd5ZXMnLFxyXG4gICAgICAgICd6c2gnLFxyXG4gICAgXSxcclxuICAgIC8vIHdlIGluY2x1ZGUgdGhlc2UgY29tbW9uIHJlZ3VsYXIgZXhwcmVzc2lvbnNcclxuICAgIHN5bWJvbHM6IC9bPT48IX4/JnwrXFwtKlxcL1xcXjtcXC4sXSsvLFxyXG4gICAgLy8gVGhlIG1haW4gdG9rZW5pemVyIGZvciBvdXIgbGFuZ3VhZ2VzXHJcbiAgICB0b2tlbml6ZXI6IHtcclxuICAgICAgICByb290OiBbXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0B3aGl0ZXNwYWNlJyB9LFxyXG4gICAgICAgICAgICBbXHJcbiAgICAgICAgICAgICAgICAvW2EtekEtWl1cXHcqLyxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGJ1aWx0aW5zJzogJ3R5cGUuaWRlbnRpZmllcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICcnXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BzdHJpbmdzJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAcGFyYW1ldGVycycgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGhlcmVkb2MnIH0sXHJcbiAgICAgICAgICAgIFsvW3t9XFxbXFxdKCldLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbLy0rXFx3Ky8sICdhdHRyaWJ1dGUubmFtZSddLFxyXG4gICAgICAgICAgICBbL0BzeW1ib2xzLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAbnVtYmVycycgfSxcclxuICAgICAgICAgICAgWy9bLDtdLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgd2hpdGVzcGFjZTogW1xyXG4gICAgICAgICAgICBbL1xccysvLCAnd2hpdGUnXSxcclxuICAgICAgICAgICAgWy8oXiMhLiokKS8sICdtZXRhdGFnJ10sXHJcbiAgICAgICAgICAgIFsvKF4jLiokKS8sICdjb21tZW50J10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBudW1iZXJzOiBbXHJcbiAgICAgICAgICAgIFsvXFxkKlxcLlxcZCsoW2VFXVtcXC0rXT9cXGQrKT8vLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvMFt4WF1bMC05YS1mQS1GX10qWzAtOWEtZkEtRl0vLCAnbnVtYmVyLmhleCddLFxyXG4gICAgICAgICAgICBbL1xcZCsvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBSZWNvZ25pemUgc3RyaW5ncywgaW5jbHVkaW5nIHRob3NlIGJyb2tlbiBhY3Jvc3MgbGluZXNcclxuICAgICAgICBzdHJpbmdzOiBbXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcnLCAnQHN0cmluZ0JvZHknXSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcnLCAnQGRibFN0cmluZ0JvZHknXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgc3RyaW5nQm9keTogW1xyXG4gICAgICAgICAgICBbLycvLCAnc3RyaW5nJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy8uLywgJ3N0cmluZyddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZGJsU3RyaW5nQm9keTogW1xyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAcG9wYWxsJ10sXHJcbiAgICAgICAgICAgIFsvLi8sICdzdHJpbmcnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGhlcmVkb2M6IFtcclxuICAgICAgICAgICAgWy8oPDxbLTxdPykoXFxzKikoWydcImBdPykoW1xcd1xcLV0rKShbJ1wiYF0/KS8sIFsnY29uc3RhbnRzJywgJ3doaXRlJywgJ3N0cmluZy5oZXJlZG9jLmRlbGltaXRlcicsICdzdHJpbmcuaGVyZWRvYycsICdzdHJpbmcuaGVyZWRvYy5kZWxpbWl0ZXInXV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIHBhcmFtZXRlcnM6IFtcclxuICAgICAgICAgICAgWy9cXCRcXGQrLywgJ3ZhcmlhYmxlLnByZWRlZmluZWQnXSxcclxuICAgICAgICAgICAgWy9cXCRcXHcrLywgJ3ZhcmlhYmxlJ10sXHJcbiAgICAgICAgICAgIFsvXFwkWypAIz9cXC0kITBfXS8sICd2YXJpYWJsZSddLFxyXG4gICAgICAgICAgICBbL1xcJCcvLCAndmFyaWFibGUnLCAnQHBhcmFtZXRlckJvZHlRdW90ZSddLFxyXG4gICAgICAgICAgICBbL1xcJFwiLywgJ3ZhcmlhYmxlJywgJ0BwYXJhbWV0ZXJCb2R5RG91YmxlUXVvdGUnXSxcclxuICAgICAgICAgICAgWy9cXCRcXCgvLCAndmFyaWFibGUnLCAnQHBhcmFtZXRlckJvZHlQYXJlbiddLFxyXG4gICAgICAgICAgICBbL1xcJFxcey8sICd2YXJpYWJsZScsICdAcGFyYW1ldGVyQm9keUN1cmx5QnJhY2UnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHBhcmFtZXRlckJvZHlRdW90ZTogW1xyXG4gICAgICAgICAgICBbL1teIzolKkBcXC0hXyddKy8sICd2YXJpYWJsZSddLFxyXG4gICAgICAgICAgICBbL1sjOiUqQFxcLSFfXS8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgWy9bJ10vLCAndmFyaWFibGUnLCAnQHBvcCddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcGFyYW1ldGVyQm9keURvdWJsZVF1b3RlOiBbXHJcbiAgICAgICAgICAgIFsvW14jOiUqQFxcLSFfXCJdKy8sICd2YXJpYWJsZSddLFxyXG4gICAgICAgICAgICBbL1sjOiUqQFxcLSFfXS8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgWy9bXCJdLywgJ3ZhcmlhYmxlJywgJ0Bwb3AnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHBhcmFtZXRlckJvZHlQYXJlbjogW1xyXG4gICAgICAgICAgICBbL1teIzolKkBcXC0hXyldKy8sICd2YXJpYWJsZSddLFxyXG4gICAgICAgICAgICBbL1sjOiUqQFxcLSFfXS8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgWy9bKV0vLCAndmFyaWFibGUnLCAnQHBvcCddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcGFyYW1ldGVyQm9keUN1cmx5QnJhY2U6IFtcclxuICAgICAgICAgICAgWy9bXiM6JSpAXFwtIV99XSsvLCAndmFyaWFibGUnXSxcclxuICAgICAgICAgICAgWy9bIzolKkBcXC0hX10vLCAnZGVsaW1pdGVyJ10sXHJcbiAgICAgICAgICAgIFsvW31dLywgJ3ZhcmlhYmxlJywgJ0Bwb3AnXSxcclxuICAgICAgICBdLFxyXG4gICAgfVxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9