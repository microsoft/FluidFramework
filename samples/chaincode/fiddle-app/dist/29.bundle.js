(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[29],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/yaml/yaml.js":
/*!************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/yaml/yaml.js ***!
  \************************************************************************/
/*! exports provided: conf, language */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "conf", function() { return conf; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "language", function() { return language; });
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
        { open: '\'', close: '\'' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
    ],
    folding: {
        offSide: true
    }
};
var language = {
    tokenPostfix: '.yaml',
    brackets: [
        { token: 'delimiter.bracket', open: '{', close: '}' },
        { token: 'delimiter.square', open: '[', close: ']' }
    ],
    keywords: ['true', 'True', 'TRUE', 'false', 'False', 'FALSE', 'null', 'Null', 'Null', '~'],
    numberInteger: /(?:0|[+-]?[0-9]+)/,
    numberFloat: /(?:0|[+-]?[0-9]+)(?:\.[0-9]+)?(?:e[-+][1-9][0-9]*)?/,
    numberOctal: /0o[0-7]+/,
    numberHex: /0x[0-9a-fA-F]+/,
    numberInfinity: /[+-]?\.(?:inf|Inf|INF)/,
    numberNaN: /\.(?:nan|Nan|NAN)/,
    numberDate: /\d{4}-\d\d-\d\d([Tt ]\d\d:\d\d:\d\d(\.\d+)?(( ?[+-]\d\d?(:\d\d)?)|Z)?)?/,
    escapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,
    tokenizer: {
        root: [
            { include: '@whitespace' },
            { include: '@comment' },
            // Directive
            [/%[^ ]+.*$/, 'meta.directive'],
            // Document Markers
            [/---/, 'operators.directivesEnd'],
            [/\.{3}/, 'operators.documentEnd'],
            // Block Structure Indicators
            [/[-?:](?= )/, 'operators'],
            { include: '@anchor' },
            { include: '@tagHandle' },
            { include: '@flowCollections' },
            { include: '@blockStyle' },
            // Numbers
            [/@numberInteger(?![ \t]*\S+)/, 'number'],
            [/@numberFloat(?![ \t]*\S+)/, 'number.float'],
            [/@numberOctal(?![ \t]*\S+)/, 'number.octal'],
            [/@numberHex(?![ \t]*\S+)/, 'number.hex'],
            [/@numberInfinity(?![ \t]*\S+)/, 'number.infinity'],
            [/@numberNaN(?![ \t]*\S+)/, 'number.nan'],
            [/@numberDate(?![ \t]*\S+)/, 'number.date'],
            // Key:Value pair
            [/(".*?"|'.*?'|.*?)([ \t]*)(:)( |$)/, ['type', 'white', 'operators', 'white']],
            { include: '@flowScalars' },
            // String nodes
            [/.+$/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'string'
                    }
                }]
        ],
        // Flow Collection: Flow Mapping
        object: [
            { include: '@whitespace' },
            { include: '@comment' },
            // Flow Mapping termination
            [/\}/, '@brackets', '@pop'],
            // Flow Mapping delimiter
            [/,/, 'delimiter.comma'],
            // Flow Mapping Key:Value delimiter
            [/:(?= )/, 'operators'],
            // Flow Mapping Key:Value key
            [/(?:".*?"|'.*?'|[^,\{\[]+?)(?=: )/, 'type'],
            // Start Flow Style
            { include: '@flowCollections' },
            { include: '@flowScalars' },
            // Scalar Data types
            { include: '@tagHandle' },
            { include: '@anchor' },
            { include: '@flowNumber' },
            // Other value (keyword or string)
            [/[^\},]+/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'string'
                    }
                }]
        ],
        // Flow Collection: Flow Sequence
        array: [
            { include: '@whitespace' },
            { include: '@comment' },
            // Flow Sequence termination
            [/\]/, '@brackets', '@pop'],
            // Flow Sequence delimiter
            [/,/, 'delimiter.comma'],
            // Start Flow Style
            { include: '@flowCollections' },
            { include: '@flowScalars' },
            // Scalar Data types
            { include: '@tagHandle' },
            { include: '@anchor' },
            { include: '@flowNumber' },
            // Other value (keyword or string)
            [/[^\],]+/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'string'
                    }
                }]
        ],
        // First line of a Block Style
        multiString: [
            [/^( +).+$/, 'string', '@multiStringContinued.$1']
        ],
        // Further lines of a Block Style
        //   Workaround for indentation detection
        multiStringContinued: [
            [/^( *).+$/, {
                    cases: {
                        '$1==$S2': 'string',
                        '@default': { token: '@rematch', next: '@popall' }
                    }
                }]
        ],
        whitespace: [
            [/[ \t\r\n]+/, 'white']
        ],
        // Only line comments
        comment: [
            [/#.*$/, 'comment']
        ],
        // Start Flow Collections
        flowCollections: [
            [/\[/, '@brackets', '@array'],
            [/\{/, '@brackets', '@object']
        ],
        // Start Flow Scalars (quoted strings)
        flowScalars: [
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'[^']*'/, 'string'],
            [/"/, 'string', '@doubleQuotedString']
        ],
        doubleQuotedString: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
        ],
        // Start Block Scalar
        blockStyle: [
            [/[>|][0-9]*[+-]?$/, 'operators', '@multiString']
        ],
        // Numbers in Flow Collections (terminate with ,]})
        flowNumber: [
            [/@numberInteger(?=[ \t]*[,\]\}])/, 'number'],
            [/@numberFloat(?=[ \t]*[,\]\}])/, 'number.float'],
            [/@numberOctal(?=[ \t]*[,\]\}])/, 'number.octal'],
            [/@numberHex(?=[ \t]*[,\]\}])/, 'number.hex'],
            [/@numberInfinity(?=[ \t]*[,\]\}])/, 'number.infinity'],
            [/@numberNaN(?=[ \t]*[,\]\}])/, 'number.nan'],
            [/@numberDate(?=[ \t]*[,\]\}])/, 'number.date']
        ],
        tagHandle: [
            [/\![^ ]*/, 'tag']
        ],
        anchor: [
            [/[&*][^ ]+/, 'namespace']
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMveWFtbC95YW1sLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBTztBQUNQO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxXQUFXLEtBQUs7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQSxTQUFTLHFDQUFxQyxZQUFZLEdBQUc7QUFDN0QsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxvQkFBb0IsRUFBRTtBQUN0QixzREFBc0QsRUFBRTtBQUN4RDtBQUNBO0FBQ0EsYUFBYSx5QkFBeUI7QUFDdEMsYUFBYSxzQkFBc0I7QUFDbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUIsRUFBRTtBQUNuQjtBQUNBO0FBQ0EsYUFBYSxxQkFBcUI7QUFDbEMsYUFBYSx3QkFBd0I7QUFDckMsYUFBYSw4QkFBOEI7QUFDM0MsYUFBYSx5QkFBeUI7QUFDdEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFhLDBCQUEwQjtBQUN2QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0EsYUFBYSx5QkFBeUI7QUFDdEMsYUFBYSxzQkFBc0I7QUFDbkM7QUFDQSxnQkFBZ0I7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtDQUFrQztBQUNsQztBQUNBLGFBQWEsOEJBQThCO0FBQzNDLGFBQWEsMEJBQTBCO0FBQ3ZDO0FBQ0EsYUFBYSx3QkFBd0I7QUFDckMsYUFBYSxxQkFBcUI7QUFDbEMsYUFBYSx5QkFBeUI7QUFDdEM7QUFDQSxrQkFBa0I7QUFDbEI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0EsYUFBYSx5QkFBeUI7QUFDdEMsYUFBYSxzQkFBc0I7QUFDbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWEsOEJBQThCO0FBQzNDLGFBQWEsMEJBQTBCO0FBQ3ZDO0FBQ0EsYUFBYSx3QkFBd0I7QUFDckMsYUFBYSxxQkFBcUI7QUFDbEMsYUFBYSx5QkFBeUI7QUFDdEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQ0FBcUM7QUFDckM7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQjtBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwwREFBMEQ7QUFDMUQ7QUFDQSwyQ0FBMkM7QUFDM0MseUNBQXlDO0FBQ3pDLHlDQUF5QztBQUN6Qyx1Q0FBdUM7QUFDdkMsNENBQTRDO0FBQzVDLHVDQUF1QztBQUN2Qyx3Q0FBd0M7QUFDeEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6IjI5LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcjJ1xyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgWyd7JywgJ30nXSxcclxuICAgICAgICBbJ1snLCAnXSddLFxyXG4gICAgICAgIFsnKCcsICcpJ11cclxuICAgIF0sXHJcbiAgICBhdXRvQ2xvc2luZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJyB9LFxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICBdLFxyXG4gICAgZm9sZGluZzoge1xyXG4gICAgICAgIG9mZlNpZGU6IHRydWVcclxuICAgIH1cclxufTtcclxuZXhwb3J0IHZhciBsYW5ndWFnZSA9IHtcclxuICAgIHRva2VuUG9zdGZpeDogJy55YW1sJyxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5icmFja2V0Jywgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5zcXVhcmUnLCBvcGVuOiAnWycsIGNsb3NlOiAnXScgfVxyXG4gICAgXSxcclxuICAgIGtleXdvcmRzOiBbJ3RydWUnLCAnVHJ1ZScsICdUUlVFJywgJ2ZhbHNlJywgJ0ZhbHNlJywgJ0ZBTFNFJywgJ251bGwnLCAnTnVsbCcsICdOdWxsJywgJ34nXSxcclxuICAgIG51bWJlckludGVnZXI6IC8oPzowfFsrLV0/WzAtOV0rKS8sXHJcbiAgICBudW1iZXJGbG9hdDogLyg/OjB8WystXT9bMC05XSspKD86XFwuWzAtOV0rKT8oPzplWy0rXVsxLTldWzAtOV0qKT8vLFxyXG4gICAgbnVtYmVyT2N0YWw6IC8wb1swLTddKy8sXHJcbiAgICBudW1iZXJIZXg6IC8weFswLTlhLWZBLUZdKy8sXHJcbiAgICBudW1iZXJJbmZpbml0eTogL1srLV0/XFwuKD86aW5mfEluZnxJTkYpLyxcclxuICAgIG51bWJlck5hTjogL1xcLig/Om5hbnxOYW58TkFOKS8sXHJcbiAgICBudW1iZXJEYXRlOiAvXFxkezR9LVxcZFxcZC1cXGRcXGQoW1R0IF1cXGRcXGQ6XFxkXFxkOlxcZFxcZChcXC5cXGQrKT8oKCA/WystXVxcZFxcZD8oOlxcZFxcZCk/KXxaKT8pPy8sXHJcbiAgICBlc2NhcGVzOiAvXFxcXCg/OltidG5mclxcXFxcIiddfFswLTddWzAtN10/fFswLTNdWzAtN117Mn0pLyxcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0Bjb21tZW50JyB9LFxyXG4gICAgICAgICAgICAvLyBEaXJlY3RpdmVcclxuICAgICAgICAgICAgWy8lW14gXSsuKiQvLCAnbWV0YS5kaXJlY3RpdmUnXSxcclxuICAgICAgICAgICAgLy8gRG9jdW1lbnQgTWFya2Vyc1xyXG4gICAgICAgICAgICBbLy0tLS8sICdvcGVyYXRvcnMuZGlyZWN0aXZlc0VuZCddLFxyXG4gICAgICAgICAgICBbL1xcLnszfS8sICdvcGVyYXRvcnMuZG9jdW1lbnRFbmQnXSxcclxuICAgICAgICAgICAgLy8gQmxvY2sgU3RydWN0dXJlIEluZGljYXRvcnNcclxuICAgICAgICAgICAgWy9bLT86XSg/PSApLywgJ29wZXJhdG9ycyddLFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAYW5jaG9yJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAdGFnSGFuZGxlJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAZmxvd0NvbGxlY3Rpb25zJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAYmxvY2tTdHlsZScgfSxcclxuICAgICAgICAgICAgLy8gTnVtYmVyc1xyXG4gICAgICAgICAgICBbL0BudW1iZXJJbnRlZ2VyKD8hWyBcXHRdKlxcUyspLywgJ251bWJlciddLFxyXG4gICAgICAgICAgICBbL0BudW1iZXJGbG9hdCg/IVsgXFx0XSpcXFMrKS8sICdudW1iZXIuZmxvYXQnXSxcclxuICAgICAgICAgICAgWy9AbnVtYmVyT2N0YWwoPyFbIFxcdF0qXFxTKykvLCAnbnVtYmVyLm9jdGFsJ10sXHJcbiAgICAgICAgICAgIFsvQG51bWJlckhleCg/IVsgXFx0XSpcXFMrKS8sICdudW1iZXIuaGV4J10sXHJcbiAgICAgICAgICAgIFsvQG51bWJlckluZmluaXR5KD8hWyBcXHRdKlxcUyspLywgJ251bWJlci5pbmZpbml0eSddLFxyXG4gICAgICAgICAgICBbL0BudW1iZXJOYU4oPyFbIFxcdF0qXFxTKykvLCAnbnVtYmVyLm5hbiddLFxyXG4gICAgICAgICAgICBbL0BudW1iZXJEYXRlKD8hWyBcXHRdKlxcUyspLywgJ251bWJlci5kYXRlJ10sXHJcbiAgICAgICAgICAgIC8vIEtleTpWYWx1ZSBwYWlyXHJcbiAgICAgICAgICAgIFsvKFwiLio/XCJ8Jy4qPyd8Lio/KShbIFxcdF0qKSg6KSggfCQpLywgWyd0eXBlJywgJ3doaXRlJywgJ29wZXJhdG9ycycsICd3aGl0ZSddXSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGZsb3dTY2FsYXJzJyB9LFxyXG4gICAgICAgICAgICAvLyBTdHJpbmcgbm9kZXNcclxuICAgICAgICAgICAgWy8uKyQvLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6ICdrZXl3b3JkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ3N0cmluZydcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gRmxvdyBDb2xsZWN0aW9uOiBGbG93IE1hcHBpbmdcclxuICAgICAgICBvYmplY3Q6IFtcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0Bjb21tZW50JyB9LFxyXG4gICAgICAgICAgICAvLyBGbG93IE1hcHBpbmcgdGVybWluYXRpb25cclxuICAgICAgICAgICAgWy9cXH0vLCAnQGJyYWNrZXRzJywgJ0Bwb3AnXSxcclxuICAgICAgICAgICAgLy8gRmxvdyBNYXBwaW5nIGRlbGltaXRlclxyXG4gICAgICAgICAgICBbLywvLCAnZGVsaW1pdGVyLmNvbW1hJ10sXHJcbiAgICAgICAgICAgIC8vIEZsb3cgTWFwcGluZyBLZXk6VmFsdWUgZGVsaW1pdGVyXHJcbiAgICAgICAgICAgIFsvOig/PSApLywgJ29wZXJhdG9ycyddLFxyXG4gICAgICAgICAgICAvLyBGbG93IE1hcHBpbmcgS2V5OlZhbHVlIGtleVxyXG4gICAgICAgICAgICBbLyg/OlwiLio/XCJ8Jy4qPyd8W14sXFx7XFxbXSs/KSg/PTogKS8sICd0eXBlJ10sXHJcbiAgICAgICAgICAgIC8vIFN0YXJ0IEZsb3cgU3R5bGVcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGZsb3dDb2xsZWN0aW9ucycgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGZsb3dTY2FsYXJzJyB9LFxyXG4gICAgICAgICAgICAvLyBTY2FsYXIgRGF0YSB0eXBlc1xyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAdGFnSGFuZGxlJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAYW5jaG9yJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAZmxvd051bWJlcicgfSxcclxuICAgICAgICAgICAgLy8gT3RoZXIgdmFsdWUgKGtleXdvcmQgb3Igc3RyaW5nKVxyXG4gICAgICAgICAgICBbL1teXFx9LF0rLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdzdHJpbmcnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIEZsb3cgQ29sbGVjdGlvbjogRmxvdyBTZXF1ZW5jZVxyXG4gICAgICAgIGFycmF5OiBbXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0B3aGl0ZXNwYWNlJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAY29tbWVudCcgfSxcclxuICAgICAgICAgICAgLy8gRmxvdyBTZXF1ZW5jZSB0ZXJtaW5hdGlvblxyXG4gICAgICAgICAgICBbL1xcXS8sICdAYnJhY2tldHMnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICAvLyBGbG93IFNlcXVlbmNlIGRlbGltaXRlclxyXG4gICAgICAgICAgICBbLywvLCAnZGVsaW1pdGVyLmNvbW1hJ10sXHJcbiAgICAgICAgICAgIC8vIFN0YXJ0IEZsb3cgU3R5bGVcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGZsb3dDb2xsZWN0aW9ucycgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGZsb3dTY2FsYXJzJyB9LFxyXG4gICAgICAgICAgICAvLyBTY2FsYXIgRGF0YSB0eXBlc1xyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAdGFnSGFuZGxlJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAYW5jaG9yJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAZmxvd051bWJlcicgfSxcclxuICAgICAgICAgICAgLy8gT3RoZXIgdmFsdWUgKGtleXdvcmQgb3Igc3RyaW5nKVxyXG4gICAgICAgICAgICBbL1teXFxdLF0rLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdzdHJpbmcnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIEZpcnN0IGxpbmUgb2YgYSBCbG9jayBTdHlsZVxyXG4gICAgICAgIG11bHRpU3RyaW5nOiBbXHJcbiAgICAgICAgICAgIFsvXiggKykuKyQvLCAnc3RyaW5nJywgJ0BtdWx0aVN0cmluZ0NvbnRpbnVlZC4kMSddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBGdXJ0aGVyIGxpbmVzIG9mIGEgQmxvY2sgU3R5bGVcclxuICAgICAgICAvLyAgIFdvcmthcm91bmQgZm9yIGluZGVudGF0aW9uIGRldGVjdGlvblxyXG4gICAgICAgIG11bHRpU3RyaW5nQ29udGludWVkOiBbXHJcbiAgICAgICAgICAgIFsvXiggKikuKyQvLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQxPT0kUzInOiAnc3RyaW5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogeyB0b2tlbjogJ0ByZW1hdGNoJywgbmV4dDogJ0Bwb3BhbGwnIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgd2hpdGVzcGFjZTogW1xyXG4gICAgICAgICAgICBbL1sgXFx0XFxyXFxuXSsvLCAnd2hpdGUnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gT25seSBsaW5lIGNvbW1lbnRzXHJcbiAgICAgICAgY29tbWVudDogW1xyXG4gICAgICAgICAgICBbLyMuKiQvLCAnY29tbWVudCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBTdGFydCBGbG93IENvbGxlY3Rpb25zXHJcbiAgICAgICAgZmxvd0NvbGxlY3Rpb25zOiBbXHJcbiAgICAgICAgICAgIFsvXFxbLywgJ0BicmFja2V0cycsICdAYXJyYXknXSxcclxuICAgICAgICAgICAgWy9cXHsvLCAnQGJyYWNrZXRzJywgJ0BvYmplY3QnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gU3RhcnQgRmxvdyBTY2FsYXJzIChxdW90ZWQgc3RyaW5ncylcclxuICAgICAgICBmbG93U2NhbGFyczogW1xyXG4gICAgICAgICAgICBbL1wiKFteXCJcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbLycoW14nXFxcXF18XFxcXC4pKiQvLCAnc3RyaW5nLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy8nW14nXSonLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAZG91YmxlUXVvdGVkU3RyaW5nJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGRvdWJsZVF1b3RlZFN0cmluZzogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiXSsvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnc3RyaW5nLmVzY2FwZSddLFxyXG4gICAgICAgICAgICBbL1xcXFwuLywgJ3N0cmluZy5lc2NhcGUuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAcG9wJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIFN0YXJ0IEJsb2NrIFNjYWxhclxyXG4gICAgICAgIGJsb2NrU3R5bGU6IFtcclxuICAgICAgICAgICAgWy9bPnxdWzAtOV0qWystXT8kLywgJ29wZXJhdG9ycycsICdAbXVsdGlTdHJpbmcnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gTnVtYmVycyBpbiBGbG93IENvbGxlY3Rpb25zICh0ZXJtaW5hdGUgd2l0aCAsXX0pXHJcbiAgICAgICAgZmxvd051bWJlcjogW1xyXG4gICAgICAgICAgICBbL0BudW1iZXJJbnRlZ2VyKD89WyBcXHRdKlssXFxdXFx9XSkvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgICAgIFsvQG51bWJlckZsb2F0KD89WyBcXHRdKlssXFxdXFx9XSkvLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvQG51bWJlck9jdGFsKD89WyBcXHRdKlssXFxdXFx9XSkvLCAnbnVtYmVyLm9jdGFsJ10sXHJcbiAgICAgICAgICAgIFsvQG51bWJlckhleCg/PVsgXFx0XSpbLFxcXVxcfV0pLywgJ251bWJlci5oZXgnXSxcclxuICAgICAgICAgICAgWy9AbnVtYmVySW5maW5pdHkoPz1bIFxcdF0qWyxcXF1cXH1dKS8sICdudW1iZXIuaW5maW5pdHknXSxcclxuICAgICAgICAgICAgWy9AbnVtYmVyTmFOKD89WyBcXHRdKlssXFxdXFx9XSkvLCAnbnVtYmVyLm5hbiddLFxyXG4gICAgICAgICAgICBbL0BudW1iZXJEYXRlKD89WyBcXHRdKlssXFxdXFx9XSkvLCAnbnVtYmVyLmRhdGUnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgdGFnSGFuZGxlOiBbXHJcbiAgICAgICAgICAgIFsvXFwhW14gXSovLCAndGFnJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGFuY2hvcjogW1xyXG4gICAgICAgICAgICBbL1smKl1bXiBdKy8sICduYW1lc3BhY2UnXVxyXG4gICAgICAgIF1cclxuICAgIH1cclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==