(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[15],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/markdown/markdown.js":
/*!********************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/markdown/markdown.js ***!
  \********************************************************************************/
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
        blockComment: ['<!--', '-->',]
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
        { open: '<', close: '>', notIn: ['string'] }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '`', close: '`' },
    ],
    folding: {
        markers: {
            start: new RegExp("^\\s*<!--\\s*#?region\\b.*-->"),
            end: new RegExp("^\\s*<!--\\s*#?endregion\\b.*-->")
        }
    }
};
var language = {
    defaultToken: '',
    tokenPostfix: '.md',
    // escape codes
    control: /[\\`*_\[\]{}()#+\-\.!]/,
    noncontrol: /[^\\`*_\[\]{}()#+\-\.!]/,
    escapes: /\\(?:@control)/,
    // escape codes for javascript/CSS strings
    jsescapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,
    // non matched elements
    empty: [
        'area', 'base', 'basefont', 'br', 'col', 'frame',
        'hr', 'img', 'input', 'isindex', 'link', 'meta', 'param'
    ],
    tokenizer: {
        root: [
            // headers (with #)
            [/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', 'keyword', 'keyword', 'keyword']],
            // headers (with =)
            [/^\s*(=+|\-+)\s*$/, 'keyword'],
            // headers (with ***)
            [/^\s*((\*[ ]?)+)\s*$/, 'meta.separator'],
            // quote
            [/^\s*>+/, 'comment'],
            // list (starting with * or number)
            [/^\s*([\*\-+:]|\d+\.)\s/, 'keyword'],
            // code block (4 spaces indent)
            [/^(\t|[ ]{4})[^ ].*$/, 'string'],
            // code block (3 tilde)
            [/^\s*~~~\s*((?:\w|[\/\-#])+)?\s*$/, { token: 'string', next: '@codeblock' }],
            // github style code blocks (with backticks and language)
            [/^\s*```\s*((?:\w|[\/\-#])+)\s*$/, { token: 'string', next: '@codeblockgh', nextEmbedded: '$1' }],
            // github style code blocks (with backticks but no language)
            [/^\s*```\s*$/, { token: 'string', next: '@codeblock' }],
            // markup within lines
            { include: '@linecontent' },
        ],
        codeblock: [
            [/^\s*~~~\s*$/, { token: 'string', next: '@pop' }],
            [/^\s*```\s*$/, { token: 'string', next: '@pop' }],
            [/.*$/, 'variable.source'],
        ],
        // github style code blocks
        codeblockgh: [
            [/```\s*$/, { token: 'variable.source', next: '@pop', nextEmbedded: '@pop' }],
            [/[^`]+/, 'variable.source'],
        ],
        linecontent: [
            // escapes
            [/&\w+;/, 'string.escape'],
            [/@escapes/, 'escape'],
            // various markup
            [/\b__([^\\_]|@escapes|_(?!_))+__\b/, 'strong'],
            [/\*\*([^\\*]|@escapes|\*(?!\*))+\*\*/, 'strong'],
            [/\b_[^_]+_\b/, 'emphasis'],
            [/\*([^\\*]|@escapes)+\*/, 'emphasis'],
            [/`([^\\`]|@escapes)+`/, 'variable'],
            // links
            [/\{+[^}]+\}+/, 'string.target'],
            [/(!?\[)((?:[^\]\\]|@escapes)*)(\]\([^\)]+\))/, ['string.link', '', 'string.link']],
            [/(!?\[)((?:[^\]\\]|@escapes)*)(\])/, 'string.link'],
            // or html
            { include: 'html' },
        ],
        // Note: it is tempting to rather switch to the real HTML mode instead of building our own here
        // but currently there is a limitation in Monarch that prevents us from doing it: The opening
        // '<' would start the HTML mode, however there is no way to jump 1 character back to let the
        // HTML mode also tokenize the opening angle bracket. Thus, even though we could jump to HTML,
        // we cannot correctly tokenize it in that mode yet.
        html: [
            // html tags
            [/<(\w+)\/>/, 'tag'],
            [/<(\w+)/, {
                    cases: {
                        '@empty': { token: 'tag', next: '@tag.$1' },
                        '@default': { token: 'tag', next: '@tag.$1' }
                    }
                }],
            [/<\/(\w+)\s*>/, { token: 'tag' }],
            [/<!--/, 'comment', '@comment']
        ],
        comment: [
            [/[^<\-]+/, 'comment.content'],
            [/-->/, 'comment', '@pop'],
            [/<!--/, 'comment.content.invalid'],
            [/[<\-]/, 'comment.content']
        ],
        // Almost full HTML tag matching, complete with embedded scripts & styles
        tag: [
            [/[ \t\r\n]+/, 'white'],
            [/(type)(\s*=\s*)(")([^"]+)(")/, ['attribute.name.html', 'delimiter.html', 'string.html',
                    { token: 'string.html', switchTo: '@tag.$S2.$4' },
                    'string.html']],
            [/(type)(\s*=\s*)(')([^']+)(')/, ['attribute.name.html', 'delimiter.html', 'string.html',
                    { token: 'string.html', switchTo: '@tag.$S2.$4' },
                    'string.html']],
            [/(\w+)(\s*=\s*)("[^"]*"|'[^']*')/, ['attribute.name.html', 'delimiter.html', 'string.html']],
            [/\w+/, 'attribute.name.html'],
            [/\/>/, 'tag', '@pop'],
            [/>/, {
                    cases: {
                        '$S2==style': { token: 'tag', switchTo: 'embeddedStyle', nextEmbedded: 'text/css' },
                        '$S2==script': {
                            cases: {
                                '$S3': { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: '$S3' },
                                '@default': { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: 'text/javascript' }
                            }
                        },
                        '@default': { token: 'tag', next: '@pop' }
                    }
                }],
        ],
        embeddedStyle: [
            [/[^<]+/, ''],
            [/<\/style\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
            [/</, '']
        ],
        embeddedScript: [
            [/[^<]+/, ''],
            [/<\/script\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
            [/</, '']
        ],
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvbWFya2Rvd24vbWFya2Rvd24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDTjtBQUNQO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxXQUFXLEtBQUs7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVM7QUFDVDtBQUNBO0FBQ0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0EsMEJBQTBCO0FBQzFCLDhCQUE4QjtBQUM5QjtBQUNBO0FBQ0Esd0RBQXdELEVBQUU7QUFDMUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG1CQUFtQixJQUFJO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHVCQUF1QixFQUFFO0FBQ3pCO0FBQ0Esa0RBQWtELHNDQUFzQztBQUN4RjtBQUNBLGlEQUFpRCw0REFBNEQ7QUFDN0c7QUFDQSw2QkFBNkIsc0NBQXNDO0FBQ25FO0FBQ0EsYUFBYSwwQkFBMEI7QUFDdkM7QUFDQTtBQUNBLDZCQUE2QixnQ0FBZ0M7QUFDN0QsNkJBQTZCLGdDQUFnQztBQUM3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBLHlCQUF5QiwrREFBK0Q7QUFDeEY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxtQkFBbUI7QUFDbkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixJQUFJLElBQUk7QUFDeEI7QUFDQTtBQUNBO0FBQ0EsYUFBYSxrQkFBa0I7QUFDL0I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG1DQUFtQyxnQ0FBZ0M7QUFDbkUscUNBQXFDO0FBQ3JDO0FBQ0EsaUJBQWlCO0FBQ2pCLDhCQUE4QixlQUFlO0FBQzdDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHFCQUFxQixnREFBZ0Q7QUFDckU7QUFDQTtBQUNBLHFCQUFxQixnREFBZ0Q7QUFDckU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsdUNBQXVDLG9FQUFvRTtBQUMzRztBQUNBO0FBQ0Esd0NBQXdDLGdFQUFnRTtBQUN4Ryw2Q0FBNkM7QUFDN0M7QUFDQSx5QkFBeUI7QUFDekIscUNBQXFDO0FBQ3JDO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBLDhCQUE4Qix3REFBd0Q7QUFDdEY7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrQkFBK0Isd0RBQXdEO0FBQ3ZGO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6IjE1LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgYmxvY2tDb21tZW50OiBbJzwhLS0nLCAnLS0+JyxdXHJcbiAgICB9LFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ10sXHJcbiAgICAgICAgWycoJywgJyknXVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICc8JywgY2xvc2U6ICc+Jywgbm90SW46IFsnc3RyaW5nJ10gfVxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcgfSxcclxuICAgIF0sXHJcbiAgICBmb2xkaW5nOiB7XHJcbiAgICAgICAgbWFya2Vyczoge1xyXG4gICAgICAgICAgICBzdGFydDogbmV3IFJlZ0V4cChcIl5cXFxccyo8IS0tXFxcXHMqIz9yZWdpb25cXFxcYi4qLS0+XCIpLFxyXG4gICAgICAgICAgICBlbmQ6IG5ldyBSZWdFeHAoXCJeXFxcXHMqPCEtLVxcXFxzKiM/ZW5kcmVnaW9uXFxcXGIuKi0tPlwiKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuZXhwb3J0IHZhciBsYW5ndWFnZSA9IHtcclxuICAgIGRlZmF1bHRUb2tlbjogJycsXHJcbiAgICB0b2tlblBvc3RmaXg6ICcubWQnLFxyXG4gICAgLy8gZXNjYXBlIGNvZGVzXHJcbiAgICBjb250cm9sOiAvW1xcXFxgKl9cXFtcXF17fSgpIytcXC1cXC4hXS8sXHJcbiAgICBub25jb250cm9sOiAvW15cXFxcYCpfXFxbXFxde30oKSMrXFwtXFwuIV0vLFxyXG4gICAgZXNjYXBlczogL1xcXFwoPzpAY29udHJvbCkvLFxyXG4gICAgLy8gZXNjYXBlIGNvZGVzIGZvciBqYXZhc2NyaXB0L0NTUyBzdHJpbmdzXHJcbiAgICBqc2VzY2FwZXM6IC9cXFxcKD86W2J0bmZyXFxcXFwiJ118WzAtN11bMC03XT98WzAtM11bMC03XXsyfSkvLFxyXG4gICAgLy8gbm9uIG1hdGNoZWQgZWxlbWVudHNcclxuICAgIGVtcHR5OiBbXHJcbiAgICAgICAgJ2FyZWEnLCAnYmFzZScsICdiYXNlZm9udCcsICdicicsICdjb2wnLCAnZnJhbWUnLFxyXG4gICAgICAgICdocicsICdpbWcnLCAnaW5wdXQnLCAnaXNpbmRleCcsICdsaW5rJywgJ21ldGEnLCAncGFyYW0nXHJcbiAgICBdLFxyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICAvLyBoZWFkZXJzICh3aXRoICMpXHJcbiAgICAgICAgICAgIFsvXihcXHN7MCwzfSkoIyspKCg/OlteXFxcXCNdfEBlc2NhcGVzKSspKCg/OiMrKT8pLywgWyd3aGl0ZScsICdrZXl3b3JkJywgJ2tleXdvcmQnLCAna2V5d29yZCddXSxcclxuICAgICAgICAgICAgLy8gaGVhZGVycyAod2l0aCA9KVxyXG4gICAgICAgICAgICBbL15cXHMqKD0rfFxcLSspXFxzKiQvLCAna2V5d29yZCddLFxyXG4gICAgICAgICAgICAvLyBoZWFkZXJzICh3aXRoICoqKilcclxuICAgICAgICAgICAgWy9eXFxzKigoXFwqWyBdPykrKVxccyokLywgJ21ldGEuc2VwYXJhdG9yJ10sXHJcbiAgICAgICAgICAgIC8vIHF1b3RlXHJcbiAgICAgICAgICAgIFsvXlxccyo+Ky8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIC8vIGxpc3QgKHN0YXJ0aW5nIHdpdGggKiBvciBudW1iZXIpXHJcbiAgICAgICAgICAgIFsvXlxccyooW1xcKlxcLSs6XXxcXGQrXFwuKVxccy8sICdrZXl3b3JkJ10sXHJcbiAgICAgICAgICAgIC8vIGNvZGUgYmxvY2sgKDQgc3BhY2VzIGluZGVudClcclxuICAgICAgICAgICAgWy9eKFxcdHxbIF17NH0pW14gXS4qJC8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgLy8gY29kZSBibG9jayAoMyB0aWxkZSlcclxuICAgICAgICAgICAgWy9eXFxzKn5+flxccyooKD86XFx3fFtcXC9cXC0jXSkrKT9cXHMqJC8sIHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQGNvZGVibG9jaycgfV0sXHJcbiAgICAgICAgICAgIC8vIGdpdGh1YiBzdHlsZSBjb2RlIGJsb2NrcyAod2l0aCBiYWNrdGlja3MgYW5kIGxhbmd1YWdlKVxyXG4gICAgICAgICAgICBbL15cXHMqYGBgXFxzKigoPzpcXHd8W1xcL1xcLSNdKSspXFxzKiQvLCB7IHRva2VuOiAnc3RyaW5nJywgbmV4dDogJ0Bjb2RlYmxvY2tnaCcsIG5leHRFbWJlZGRlZDogJyQxJyB9XSxcclxuICAgICAgICAgICAgLy8gZ2l0aHViIHN0eWxlIGNvZGUgYmxvY2tzICh3aXRoIGJhY2t0aWNrcyBidXQgbm8gbGFuZ3VhZ2UpXHJcbiAgICAgICAgICAgIFsvXlxccypgYGBcXHMqJC8sIHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQGNvZGVibG9jaycgfV0sXHJcbiAgICAgICAgICAgIC8vIG1hcmt1cCB3aXRoaW4gbGluZXNcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGxpbmVjb250ZW50JyB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29kZWJsb2NrOiBbXHJcbiAgICAgICAgICAgIFsvXlxccyp+fn5cXHMqJC8sIHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQHBvcCcgfV0sXHJcbiAgICAgICAgICAgIFsvXlxccypgYGBcXHMqJC8sIHsgdG9rZW46ICdzdHJpbmcnLCBuZXh0OiAnQHBvcCcgfV0sXHJcbiAgICAgICAgICAgIFsvLiokLywgJ3ZhcmlhYmxlLnNvdXJjZSddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gZ2l0aHViIHN0eWxlIGNvZGUgYmxvY2tzXHJcbiAgICAgICAgY29kZWJsb2NrZ2g6IFtcclxuICAgICAgICAgICAgWy9gYGBcXHMqJC8sIHsgdG9rZW46ICd2YXJpYWJsZS5zb3VyY2UnLCBuZXh0OiAnQHBvcCcsIG5leHRFbWJlZGRlZDogJ0Bwb3AnIH1dLFxyXG4gICAgICAgICAgICBbL1teYF0rLywgJ3ZhcmlhYmxlLnNvdXJjZSddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgbGluZWNvbnRlbnQ6IFtcclxuICAgICAgICAgICAgLy8gZXNjYXBlc1xyXG4gICAgICAgICAgICBbLyZcXHcrOy8sICdzdHJpbmcuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIC8vIHZhcmlvdXMgbWFya3VwXHJcbiAgICAgICAgICAgIFsvXFxiX18oW15cXFxcX118QGVzY2FwZXN8Xyg/IV8pKStfX1xcYi8sICdzdHJvbmcnXSxcclxuICAgICAgICAgICAgWy9cXCpcXCooW15cXFxcKl18QGVzY2FwZXN8XFwqKD8hXFwqKSkrXFwqXFwqLywgJ3N0cm9uZyddLFxyXG4gICAgICAgICAgICBbL1xcYl9bXl9dK19cXGIvLCAnZW1waGFzaXMnXSxcclxuICAgICAgICAgICAgWy9cXCooW15cXFxcKl18QGVzY2FwZXMpK1xcKi8sICdlbXBoYXNpcyddLFxyXG4gICAgICAgICAgICBbL2AoW15cXFxcYF18QGVzY2FwZXMpK2AvLCAndmFyaWFibGUnXSxcclxuICAgICAgICAgICAgLy8gbGlua3NcclxuICAgICAgICAgICAgWy9cXHsrW159XStcXH0rLywgJ3N0cmluZy50YXJnZXQnXSxcclxuICAgICAgICAgICAgWy8oIT9cXFspKCg/OlteXFxdXFxcXF18QGVzY2FwZXMpKikoXFxdXFwoW15cXCldK1xcKSkvLCBbJ3N0cmluZy5saW5rJywgJycsICdzdHJpbmcubGluayddXSxcclxuICAgICAgICAgICAgWy8oIT9cXFspKCg/OlteXFxdXFxcXF18QGVzY2FwZXMpKikoXFxdKS8sICdzdHJpbmcubGluayddLFxyXG4gICAgICAgICAgICAvLyBvciBodG1sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ2h0bWwnIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBOb3RlOiBpdCBpcyB0ZW1wdGluZyB0byByYXRoZXIgc3dpdGNoIHRvIHRoZSByZWFsIEhUTUwgbW9kZSBpbnN0ZWFkIG9mIGJ1aWxkaW5nIG91ciBvd24gaGVyZVxyXG4gICAgICAgIC8vIGJ1dCBjdXJyZW50bHkgdGhlcmUgaXMgYSBsaW1pdGF0aW9uIGluIE1vbmFyY2ggdGhhdCBwcmV2ZW50cyB1cyBmcm9tIGRvaW5nIGl0OiBUaGUgb3BlbmluZ1xyXG4gICAgICAgIC8vICc8JyB3b3VsZCBzdGFydCB0aGUgSFRNTCBtb2RlLCBob3dldmVyIHRoZXJlIGlzIG5vIHdheSB0byBqdW1wIDEgY2hhcmFjdGVyIGJhY2sgdG8gbGV0IHRoZVxyXG4gICAgICAgIC8vIEhUTUwgbW9kZSBhbHNvIHRva2VuaXplIHRoZSBvcGVuaW5nIGFuZ2xlIGJyYWNrZXQuIFRodXMsIGV2ZW4gdGhvdWdoIHdlIGNvdWxkIGp1bXAgdG8gSFRNTCxcclxuICAgICAgICAvLyB3ZSBjYW5ub3QgY29ycmVjdGx5IHRva2VuaXplIGl0IGluIHRoYXQgbW9kZSB5ZXQuXHJcbiAgICAgICAgaHRtbDogW1xyXG4gICAgICAgICAgICAvLyBodG1sIHRhZ3NcclxuICAgICAgICAgICAgWy88KFxcdyspXFwvPi8sICd0YWcnXSxcclxuICAgICAgICAgICAgWy88KFxcdyspLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZW1wdHknOiB7IHRva2VuOiAndGFnJywgbmV4dDogJ0B0YWcuJDEnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IHsgdG9rZW46ICd0YWcnLCBuZXh0OiAnQHRhZy4kMScgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICBbLzxcXC8oXFx3KylcXHMqPi8sIHsgdG9rZW46ICd0YWcnIH1dLFxyXG4gICAgICAgICAgICBbLzwhLS0vLCAnY29tbWVudCcsICdAY29tbWVudCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBjb21tZW50OiBbXHJcbiAgICAgICAgICAgIFsvW148XFwtXSsvLCAnY29tbWVudC5jb250ZW50J10sXHJcbiAgICAgICAgICAgIFsvLS0+LywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbLzwhLS0vLCAnY29tbWVudC5jb250ZW50LmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9bPFxcLV0vLCAnY29tbWVudC5jb250ZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIEFsbW9zdCBmdWxsIEhUTUwgdGFnIG1hdGNoaW5nLCBjb21wbGV0ZSB3aXRoIGVtYmVkZGVkIHNjcmlwdHMgJiBzdHlsZXNcclxuICAgICAgICB0YWc6IFtcclxuICAgICAgICAgICAgWy9bIFxcdFxcclxcbl0rLywgJ3doaXRlJ10sXHJcbiAgICAgICAgICAgIFsvKHR5cGUpKFxccyo9XFxzKikoXCIpKFteXCJdKykoXCIpLywgWydhdHRyaWJ1dGUubmFtZS5odG1sJywgJ2RlbGltaXRlci5odG1sJywgJ3N0cmluZy5odG1sJyxcclxuICAgICAgICAgICAgICAgICAgICB7IHRva2VuOiAnc3RyaW5nLmh0bWwnLCBzd2l0Y2hUbzogJ0B0YWcuJFMyLiQ0JyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICdzdHJpbmcuaHRtbCddXSxcclxuICAgICAgICAgICAgWy8odHlwZSkoXFxzKj1cXHMqKSgnKShbXiddKykoJykvLCBbJ2F0dHJpYnV0ZS5uYW1lLmh0bWwnLCAnZGVsaW1pdGVyLmh0bWwnLCAnc3RyaW5nLmh0bWwnLFxyXG4gICAgICAgICAgICAgICAgICAgIHsgdG9rZW46ICdzdHJpbmcuaHRtbCcsIHN3aXRjaFRvOiAnQHRhZy4kUzIuJDQnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgJ3N0cmluZy5odG1sJ11dLFxyXG4gICAgICAgICAgICBbLyhcXHcrKShcXHMqPVxccyopKFwiW15cIl0qXCJ8J1teJ10qJykvLCBbJ2F0dHJpYnV0ZS5uYW1lLmh0bWwnLCAnZGVsaW1pdGVyLmh0bWwnLCAnc3RyaW5nLmh0bWwnXV0sXHJcbiAgICAgICAgICAgIFsvXFx3Ky8sICdhdHRyaWJ1dGUubmFtZS5odG1sJ10sXHJcbiAgICAgICAgICAgIFsvXFwvPi8sICd0YWcnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbLz4vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyRTMj09c3R5bGUnOiB7IHRva2VuOiAndGFnJywgc3dpdGNoVG86ICdlbWJlZGRlZFN0eWxlJywgbmV4dEVtYmVkZGVkOiAndGV4dC9jc3MnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICckUzI9PXNjcmlwdCc6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJyRTMyc6IHsgdG9rZW46ICd0YWcnLCBzd2l0Y2hUbzogJ2VtYmVkZGVkU2NyaXB0JywgbmV4dEVtYmVkZGVkOiAnJFMzJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IHsgdG9rZW46ICd0YWcnLCBzd2l0Y2hUbzogJ2VtYmVkZGVkU2NyaXB0JywgbmV4dEVtYmVkZGVkOiAndGV4dC9qYXZhc2NyaXB0JyB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IHsgdG9rZW46ICd0YWcnLCBuZXh0OiAnQHBvcCcgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZW1iZWRkZWRTdHlsZTogW1xyXG4gICAgICAgICAgICBbL1tePF0rLywgJyddLFxyXG4gICAgICAgICAgICBbLzxcXC9zdHlsZVxccyo+LywgeyB0b2tlbjogJ0ByZW1hdGNoJywgbmV4dDogJ0Bwb3AnLCBuZXh0RW1iZWRkZWQ6ICdAcG9wJyB9XSxcclxuICAgICAgICAgICAgWy88LywgJyddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBlbWJlZGRlZFNjcmlwdDogW1xyXG4gICAgICAgICAgICBbL1tePF0rLywgJyddLFxyXG4gICAgICAgICAgICBbLzxcXC9zY3JpcHRcXHMqPi8sIHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAcG9wJywgbmV4dEVtYmVkZGVkOiAnQHBvcCcgfV0sXHJcbiAgICAgICAgICAgIFsvPC8sICcnXVxyXG4gICAgICAgIF0sXHJcbiAgICB9XHJcbn07XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=