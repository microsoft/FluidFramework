(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[21],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/r/r.js":
/*!******************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/r/r.js ***!
  \******************************************************************/
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
        lineComment: '#'
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
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
    ]
};
var language = {
    defaultToken: '',
    tokenPostfix: '.r',
    roxygen: [
        '@param',
        '@return',
        '@name',
        '@rdname',
        '@examples',
        '@include',
        '@docType',
        '@S3method',
        '@TODO',
        '@aliases',
        '@alias',
        '@assignee',
        '@author',
        '@callGraphDepth',
        '@callGraph',
        '@callGraphPrimitives',
        '@concept',
        '@exportClass',
        '@exportMethod',
        '@exportPattern',
        '@export',
        '@formals',
        '@format',
        '@importClassesFrom',
        '@importFrom',
        '@importMethodsFrom',
        '@import',
        '@keywords',
        '@method',
        '@nord',
        '@note',
        '@references',
        '@seealso',
        '@setClass',
        '@slot',
        '@source',
        '@title',
        '@usage'
    ],
    constants: [
        'NULL',
        'FALSE',
        'TRUE',
        'NA',
        'Inf',
        'NaN ',
        'NA_integer_',
        'NA_real_',
        'NA_complex_',
        'NA_character_ ',
        'T',
        'F',
        'LETTERS',
        'letters',
        'month.abb',
        'month.name',
        'pi',
        'R.version.string'
    ],
    keywords: [
        'break',
        'next',
        'return',
        'if',
        'else',
        'for',
        'in',
        'repeat',
        'while',
        'array',
        'category',
        'character',
        'complex',
        'double',
        'function',
        'integer',
        'list',
        'logical',
        'matrix',
        'numeric',
        'vector',
        'data.frame',
        'factor',
        'library',
        'require',
        'attach',
        'detach',
        'source'
    ],
    special: [
        '\\n',
        '\\r',
        '\\t',
        '\\b',
        '\\a',
        '\\f',
        '\\v',
        '\\\'',
        '\\"',
        '\\\\'
    ],
    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.bracket' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' }
    ],
    tokenizer: {
        root: [
            { include: '@numbers' },
            { include: '@strings' },
            [/[{}\[\]()]/, '@brackets'],
            { include: '@operators' },
            [/#'/, 'comment.doc', '@roxygen'],
            [/(^#.*$)/, 'comment'],
            [/\s+/, 'white'],
            [/[,:;]/, 'delimiter'],
            [/@[a-zA-Z]\w*/, 'tag'],
            [/[a-zA-Z]\w*/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@constants': 'constant',
                        '@default': 'identifier'
                    }
                }]
        ],
        // Recognize Roxygen comments
        roxygen: [
            [/@\w+/, {
                    cases: {
                        '@roxygen': 'tag',
                        '@eos': { token: 'comment.doc', next: '@pop' },
                        '@default': 'comment.doc'
                    }
                }],
            [/\s+/, {
                    cases: {
                        '@eos': { token: 'comment.doc', next: '@pop' },
                        '@default': 'comment.doc'
                    }
                }],
            [/.*/, { token: 'comment.doc', next: '@pop' }]
        ],
        // Recognize positives, negatives, decimals, imaginaries, and scientific notation
        numbers: [
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/-?(\d*\.)?\d+([eE][+\-]?\d+)?/, 'number']
        ],
        // Recognize operators
        operators: [
            [/<{1,2}-/, 'operator'],
            [/->{1,2}/, 'operator'],
            [/%[^%\s]+%/, 'operator'],
            [/\*\*/, 'operator'],
            [/%%/, 'operator'],
            [/&&/, 'operator'],
            [/\|\|/, 'operator'],
            [/<</, 'operator'],
            [/>>/, 'operator'],
            [/[-+=&|!<>^~*/:$]/, 'operator']
        ],
        // Recognize strings, including those broken across lines
        strings: [
            [/'/, 'string.escape', '@stringBody'],
            [/"/, 'string.escape', '@dblStringBody']
        ],
        stringBody: [
            [/\\./, {
                    cases: {
                        '@special': 'string',
                        '@default': 'error-token'
                    }
                }],
            [/'/, 'string.escape', '@popall'],
            [/./, 'string'],
        ],
        dblStringBody: [
            [/\\./, {
                    cases: {
                        '@special': 'string',
                        '@default': 'error-token'
                    }
                }],
            [/"/, 'string.escape', '@popall'],
            [/./, 'string'],
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvci9yLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNhO0FBQ047QUFDUDtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsV0FBVyxLQUFLO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQztBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQztBQUNBO0FBQ087QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSw2QkFBNkI7QUFDM0QsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBLGFBQWEsc0JBQXNCO0FBQ25DLGFBQWEsc0JBQXNCO0FBQ25DLGlCQUFpQjtBQUNqQixhQUFhLHdCQUF3QjtBQUNyQztBQUNBO0FBQ0E7QUFDQSxrQkFBa0I7QUFDbEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUNBQWlDLHFDQUFxQztBQUN0RTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxpQ0FBaUMscUNBQXFDO0FBQ3RFO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakIsb0JBQW9CLHFDQUFxQztBQUN6RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCLElBQUk7QUFDcEIsaUJBQWlCLElBQUk7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiIyMS5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnIydcclxuICAgIH0sXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIFsneycsICd9J10sXHJcbiAgICAgICAgWydbJywgJ10nXSxcclxuICAgICAgICBbJygnLCAnKSddXHJcbiAgICBdLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcclxuICAgIF0sXHJcbiAgICBzdXJyb3VuZGluZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxyXG4gICAgXVxyXG59O1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgZGVmYXVsdFRva2VuOiAnJyxcclxuICAgIHRva2VuUG9zdGZpeDogJy5yJyxcclxuICAgIHJveHlnZW46IFtcclxuICAgICAgICAnQHBhcmFtJyxcclxuICAgICAgICAnQHJldHVybicsXHJcbiAgICAgICAgJ0BuYW1lJyxcclxuICAgICAgICAnQHJkbmFtZScsXHJcbiAgICAgICAgJ0BleGFtcGxlcycsXHJcbiAgICAgICAgJ0BpbmNsdWRlJyxcclxuICAgICAgICAnQGRvY1R5cGUnLFxyXG4gICAgICAgICdAUzNtZXRob2QnLFxyXG4gICAgICAgICdAVE9ETycsXHJcbiAgICAgICAgJ0BhbGlhc2VzJyxcclxuICAgICAgICAnQGFsaWFzJyxcclxuICAgICAgICAnQGFzc2lnbmVlJyxcclxuICAgICAgICAnQGF1dGhvcicsXHJcbiAgICAgICAgJ0BjYWxsR3JhcGhEZXB0aCcsXHJcbiAgICAgICAgJ0BjYWxsR3JhcGgnLFxyXG4gICAgICAgICdAY2FsbEdyYXBoUHJpbWl0aXZlcycsXHJcbiAgICAgICAgJ0Bjb25jZXB0JyxcclxuICAgICAgICAnQGV4cG9ydENsYXNzJyxcclxuICAgICAgICAnQGV4cG9ydE1ldGhvZCcsXHJcbiAgICAgICAgJ0BleHBvcnRQYXR0ZXJuJyxcclxuICAgICAgICAnQGV4cG9ydCcsXHJcbiAgICAgICAgJ0Bmb3JtYWxzJyxcclxuICAgICAgICAnQGZvcm1hdCcsXHJcbiAgICAgICAgJ0BpbXBvcnRDbGFzc2VzRnJvbScsXHJcbiAgICAgICAgJ0BpbXBvcnRGcm9tJyxcclxuICAgICAgICAnQGltcG9ydE1ldGhvZHNGcm9tJyxcclxuICAgICAgICAnQGltcG9ydCcsXHJcbiAgICAgICAgJ0BrZXl3b3JkcycsXHJcbiAgICAgICAgJ0BtZXRob2QnLFxyXG4gICAgICAgICdAbm9yZCcsXHJcbiAgICAgICAgJ0Bub3RlJyxcclxuICAgICAgICAnQHJlZmVyZW5jZXMnLFxyXG4gICAgICAgICdAc2VlYWxzbycsXHJcbiAgICAgICAgJ0BzZXRDbGFzcycsXHJcbiAgICAgICAgJ0BzbG90JyxcclxuICAgICAgICAnQHNvdXJjZScsXHJcbiAgICAgICAgJ0B0aXRsZScsXHJcbiAgICAgICAgJ0B1c2FnZSdcclxuICAgIF0sXHJcbiAgICBjb25zdGFudHM6IFtcclxuICAgICAgICAnTlVMTCcsXHJcbiAgICAgICAgJ0ZBTFNFJyxcclxuICAgICAgICAnVFJVRScsXHJcbiAgICAgICAgJ05BJyxcclxuICAgICAgICAnSW5mJyxcclxuICAgICAgICAnTmFOICcsXHJcbiAgICAgICAgJ05BX2ludGVnZXJfJyxcclxuICAgICAgICAnTkFfcmVhbF8nLFxyXG4gICAgICAgICdOQV9jb21wbGV4XycsXHJcbiAgICAgICAgJ05BX2NoYXJhY3Rlcl8gJyxcclxuICAgICAgICAnVCcsXHJcbiAgICAgICAgJ0YnLFxyXG4gICAgICAgICdMRVRURVJTJyxcclxuICAgICAgICAnbGV0dGVycycsXHJcbiAgICAgICAgJ21vbnRoLmFiYicsXHJcbiAgICAgICAgJ21vbnRoLm5hbWUnLFxyXG4gICAgICAgICdwaScsXHJcbiAgICAgICAgJ1IudmVyc2lvbi5zdHJpbmcnXHJcbiAgICBdLFxyXG4gICAga2V5d29yZHM6IFtcclxuICAgICAgICAnYnJlYWsnLFxyXG4gICAgICAgICduZXh0JyxcclxuICAgICAgICAncmV0dXJuJyxcclxuICAgICAgICAnaWYnLFxyXG4gICAgICAgICdlbHNlJyxcclxuICAgICAgICAnZm9yJyxcclxuICAgICAgICAnaW4nLFxyXG4gICAgICAgICdyZXBlYXQnLFxyXG4gICAgICAgICd3aGlsZScsXHJcbiAgICAgICAgJ2FycmF5JyxcclxuICAgICAgICAnY2F0ZWdvcnknLFxyXG4gICAgICAgICdjaGFyYWN0ZXInLFxyXG4gICAgICAgICdjb21wbGV4JyxcclxuICAgICAgICAnZG91YmxlJyxcclxuICAgICAgICAnZnVuY3Rpb24nLFxyXG4gICAgICAgICdpbnRlZ2VyJyxcclxuICAgICAgICAnbGlzdCcsXHJcbiAgICAgICAgJ2xvZ2ljYWwnLFxyXG4gICAgICAgICdtYXRyaXgnLFxyXG4gICAgICAgICdudW1lcmljJyxcclxuICAgICAgICAndmVjdG9yJyxcclxuICAgICAgICAnZGF0YS5mcmFtZScsXHJcbiAgICAgICAgJ2ZhY3RvcicsXHJcbiAgICAgICAgJ2xpYnJhcnknLFxyXG4gICAgICAgICdyZXF1aXJlJyxcclxuICAgICAgICAnYXR0YWNoJyxcclxuICAgICAgICAnZGV0YWNoJyxcclxuICAgICAgICAnc291cmNlJ1xyXG4gICAgXSxcclxuICAgIHNwZWNpYWw6IFtcclxuICAgICAgICAnXFxcXG4nLFxyXG4gICAgICAgICdcXFxccicsXHJcbiAgICAgICAgJ1xcXFx0JyxcclxuICAgICAgICAnXFxcXGInLFxyXG4gICAgICAgICdcXFxcYScsXHJcbiAgICAgICAgJ1xcXFxmJyxcclxuICAgICAgICAnXFxcXHYnLFxyXG4gICAgICAgICdcXFxcXFwnJyxcclxuICAgICAgICAnXFxcXFwiJyxcclxuICAgICAgICAnXFxcXFxcXFwnXHJcbiAgICBdLFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JywgdG9rZW46ICdkZWxpbWl0ZXIuY3VybHknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIHRva2VuOiAnZGVsaW1pdGVyLmJyYWNrZXQnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScsIHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJyB9XHJcbiAgICBdLFxyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAbnVtYmVycycgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHN0cmluZ3MnIH0sXHJcbiAgICAgICAgICAgIFsvW3t9XFxbXFxdKCldLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAb3BlcmF0b3JzJyB9LFxyXG4gICAgICAgICAgICBbLyMnLywgJ2NvbW1lbnQuZG9jJywgJ0Byb3h5Z2VuJ10sXHJcbiAgICAgICAgICAgIFsvKF4jLiokKS8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFxzKy8sICd3aGl0ZSddLFxyXG4gICAgICAgICAgICBbL1ssOjtdLywgJ2RlbGltaXRlciddLFxyXG4gICAgICAgICAgICBbL0BbYS16QS1aXVxcdyovLCAndGFnJ10sXHJcbiAgICAgICAgICAgIFsvW2EtekEtWl1cXHcqLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAY29uc3RhbnRzJzogJ2NvbnN0YW50JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIFJlY29nbml6ZSBSb3h5Z2VuIGNvbW1lbnRzXHJcbiAgICAgICAgcm94eWdlbjogW1xyXG4gICAgICAgICAgICBbL0BcXHcrLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAcm94eWdlbic6ICd0YWcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdjb21tZW50LmRvYycsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnY29tbWVudC5kb2MnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIFsvXFxzKy8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGVvcyc6IHsgdG9rZW46ICdjb21tZW50LmRvYycsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnY29tbWVudC5kb2MnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIFsvLiovLCB7IHRva2VuOiAnY29tbWVudC5kb2MnLCBuZXh0OiAnQHBvcCcgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIFJlY29nbml6ZSBwb3NpdGl2ZXMsIG5lZ2F0aXZlcywgZGVjaW1hbHMsIGltYWdpbmFyaWVzLCBhbmQgc2NpZW50aWZpYyBub3RhdGlvblxyXG4gICAgICAgIG51bWJlcnM6IFtcclxuICAgICAgICAgICAgWy8wW3hYXVswLTlhLWZBLUZdKy8sICdudW1iZXIuaGV4J10sXHJcbiAgICAgICAgICAgIFsvLT8oXFxkKlxcLik/XFxkKyhbZUVdWytcXC1dP1xcZCspPy8sICdudW1iZXInXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gUmVjb2duaXplIG9wZXJhdG9yc1xyXG4gICAgICAgIG9wZXJhdG9yczogW1xyXG4gICAgICAgICAgICBbLzx7MSwyfS0vLCAnb3BlcmF0b3InXSxcclxuICAgICAgICAgICAgWy8tPnsxLDJ9LywgJ29wZXJhdG9yJ10sXHJcbiAgICAgICAgICAgIFsvJVteJVxcc10rJS8sICdvcGVyYXRvciddLFxyXG4gICAgICAgICAgICBbL1xcKlxcKi8sICdvcGVyYXRvciddLFxyXG4gICAgICAgICAgICBbLyUlLywgJ29wZXJhdG9yJ10sXHJcbiAgICAgICAgICAgIFsvJiYvLCAnb3BlcmF0b3InXSxcclxuICAgICAgICAgICAgWy9cXHxcXHwvLCAnb3BlcmF0b3InXSxcclxuICAgICAgICAgICAgWy88PC8sICdvcGVyYXRvciddLFxyXG4gICAgICAgICAgICBbLz4+LywgJ29wZXJhdG9yJ10sXHJcbiAgICAgICAgICAgIFsvWy0rPSZ8ITw+Xn4qLzokXS8sICdvcGVyYXRvciddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBSZWNvZ25pemUgc3RyaW5ncywgaW5jbHVkaW5nIHRob3NlIGJyb2tlbiBhY3Jvc3MgbGluZXNcclxuICAgICAgICBzdHJpbmdzOiBbXHJcbiAgICAgICAgICAgIFsvJy8sICdzdHJpbmcuZXNjYXBlJywgJ0BzdHJpbmdCb2R5J10sXHJcbiAgICAgICAgICAgIFsvXCIvLCAnc3RyaW5nLmVzY2FwZScsICdAZGJsU3RyaW5nQm9keSddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzdHJpbmdCb2R5OiBbXHJcbiAgICAgICAgICAgIFsvXFxcXC4vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BzcGVjaWFsJzogJ3N0cmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdlcnJvci10b2tlbidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZy5lc2NhcGUnLCAnQHBvcGFsbCddLFxyXG4gICAgICAgICAgICBbLy4vLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBkYmxTdHJpbmdCb2R5OiBbXHJcbiAgICAgICAgICAgIFsvXFxcXC4vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BzcGVjaWFsJzogJ3N0cmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdlcnJvci10b2tlbidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9cIi8sICdzdHJpbmcuZXNjYXBlJywgJ0Bwb3BhbGwnXSxcclxuICAgICAgICAgICAgWy8uLywgJ3N0cmluZyddLFxyXG4gICAgICAgIF1cclxuICAgIH1cclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==