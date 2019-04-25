(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[25],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/swift/swift.js":
/*!**************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/swift/swift.js ***!
  \**************************************************************************/
/*! exports provided: conf, language */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "conf", function() { return conf; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "language", function() { return language; });
/*!---------------------------------------------------------------------------------------------
 *  Copyright (C) David Owens II, owensd.io. All rights reserved.
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
        { open: '`', close: '`' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
        { open: '`', close: '`' },
    ]
};
var language = {
    defaultToken: '',
    tokenPostfix: '.swift',
    // TODO(owensd): Support the full range of unicode valid identifiers.
    identifier: /[a-zA-Z_][\w$]*/,
    // TODO(owensd): Support the @availability macro properly.
    attributes: [
        '@autoclosure', '@noescape', '@noreturn', '@NSApplicationMain', '@NSCopying', '@NSManaged',
        '@objc', '@UIApplicationMain', '@noreturn', '@availability', '@IBAction', '@IBDesignable', '@IBInspectable', '@IBOutlet'
    ],
    accessmodifiers: ['public', 'private', 'internal'],
    keywords: [
        '__COLUMN__', '__FILE__', '__FUNCTION__', '__LINE__', 'as', 'as!', 'as?', 'associativity', 'break', 'case', 'catch',
        'class', 'continue', 'convenience', 'default', 'deinit', 'didSet', 'do', 'dynamic', 'dynamicType',
        'else', 'enum', 'extension', 'fallthrough', 'final', 'for', 'func', 'get', 'guard', 'if', 'import', 'in', 'infix',
        'init', 'inout', 'internal', 'is', 'lazy', 'left', 'let', 'mutating', 'nil', 'none', 'nonmutating', 'operator',
        'optional', 'override', 'postfix', 'precedence', 'prefix', 'private', 'protocol', 'Protocol', 'public',
        'repeat', 'required', 'return', 'right', 'self', 'Self', 'set', 'static', 'struct', 'subscript', 'super', 'switch',
        'throw', 'throws', 'try', 'try!', 'Type', 'typealias', 'unowned', 'var', 'weak', 'where', 'while', 'willSet', 'FALSE', 'TRUE'
    ],
    symbols: /[=(){}\[\].,:;@#\_&\-<>`?!+*\\\/]/,
    // Moved . to operatorstart so it can be a delimiter
    operatorstart: /[\/=\-+!*%<>&|^~?\u00A1-\u00A7\u00A9\u00AB\u00AC\u00AE\u00B0-\u00B1\u00B6\u00BB\u00BF\u00D7\u00F7\u2016-\u2017\u2020-\u2027\u2030-\u203E\u2041-\u2053\u2055-\u205E\u2190-\u23FF\u2500-\u2775\u2794-\u2BFF\u2E00-\u2E7F\u3001-\u3003\u3008-\u3030]/,
    operatorend: /[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE00-\uFE0F\uFE20-\uFE2F\uE0100-\uE01EF]/,
    operators: /(@operatorstart)((@operatorstart)|(@operatorend))*/,
    // TODO(owensd): These are borrowed from C#; need to validate correctness for Swift.
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
        root: [
            { include: '@comment' },
            { include: '@attribute' },
            { include: '@literal' },
            { include: '@keyword' },
            { include: '@invokedmethod' },
            { include: '@symbol' },
        ],
        symbol: [
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/[.]/, 'delimiter'],
            [/@operators/, 'operator'],
            [/@symbols/, 'operator']
        ],
        comment: [
            [/\/\/\/.*$/, 'comment.doc'],
            [/\/\*\*/, 'comment.doc', '@commentdocbody'],
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@commentbody']
        ],
        commentdocbody: [
            [/\/\*/, 'comment', '@commentbody'],
            [/\*\//, 'comment.doc', '@pop'],
            [/\:[a-zA-Z]+\:/, 'comment.doc.param'],
            [/./, 'comment.doc']
        ],
        commentbody: [
            [/\/\*/, 'comment', '@commentbody'],
            [/\*\//, 'comment', '@pop'],
            [/./, 'comment']
        ],
        attribute: [
            [/\@@identifier/, {
                    cases: {
                        '@attributes': 'keyword.control',
                        '@default': ''
                    }
                }]
        ],
        literal: [
            [/"/, { token: 'string.quote', next: '@stringlit' }],
            [/0[b]([01]_?)+/, 'number.binary'],
            [/0[o]([0-7]_?)+/, 'number.octal'],
            [/0[x]([0-9a-fA-F]_?)+([pP][\-+](\d_?)+)?/, 'number.hex'],
            [/(\d_?)*\.(\d_?)+([eE][\-+]?(\d_?)+)?/, 'number.float'],
            [/(\d_?)+/, 'number']
        ],
        stringlit: [
            [/\\\(/, { token: 'operator', next: '@interpolatedexpression' }],
            [/@escapes/, 'string'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', next: '@pop' }],
            [/./, 'string']
        ],
        interpolatedexpression: [
            [/\(/, { token: 'operator', next: '@interpolatedexpression' }],
            [/\)/, { token: 'operator', next: '@pop' }],
            { include: '@literal' },
            { include: '@keyword' },
            { include: '@symbol' }
        ],
        keyword: [
            [/`/, { token: 'operator', next: '@escapedkeyword' }],
            [/@identifier/, {
                    cases: {
                        '@keywords': 'keyword', '[A-Z][\a-zA-Z0-9$]*': 'type.identifier',
                        '@default': 'identifier'
                    }
                }]
        ],
        escapedkeyword: [
            [/`/, { token: 'operator', next: '@pop' }],
            [/./, 'identifier']
        ],
        //		symbol: [
        //			[ /@symbols/, 'operator' ],
        //			[ /@operators/, 'operator' ]
        //		],
        invokedmethod: [
            [/([.])(@identifier)/, {
                    cases: {
                        '$2': ['delimeter', 'type.identifier'],
                        '@default': ''
                    }
                }],
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvc3dpZnQvc3dpZnQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNhO0FBQ047QUFDUDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxXQUFXLEtBQUs7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLFFBQVE7QUFDNUI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnREFBZ0Q7QUFDaEQsOENBQThDLElBQUksY0FBYyxFQUFFLGNBQWMsRUFBRTtBQUNsRjtBQUNBO0FBQ0EsYUFBYSxzQkFBc0I7QUFDbkMsYUFBYSx3QkFBd0I7QUFDckMsYUFBYSxzQkFBc0I7QUFDbkMsYUFBYSxzQkFBc0I7QUFDbkMsYUFBYSw0QkFBNEI7QUFDekMsYUFBYSxxQkFBcUI7QUFDbEM7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsbUJBQW1CLDRDQUE0QztBQUMvRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHNCQUFzQixxREFBcUQ7QUFDM0U7QUFDQTtBQUNBLG1CQUFtQixzQ0FBc0M7QUFDekQ7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLHFEQUFxRDtBQUN6RSxvQkFBb0Isa0NBQWtDO0FBQ3RELGFBQWEsc0JBQXNCO0FBQ25DLGFBQWEsc0JBQXNCO0FBQ25DLGFBQWE7QUFDYjtBQUNBO0FBQ0EsbUJBQW1CLDZDQUE2QztBQUNoRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxtQkFBbUIsa0NBQWtDO0FBQ3JEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EiLCJmaWxlIjoiMjUuYnVuZGxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyohLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKEMpIERhdmlkIE93ZW5zIElJLCBvd2Vuc2QuaW8uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmV4cG9ydCB2YXIgY29uZiA9IHtcclxuICAgIGNvbW1lbnRzOiB7XHJcbiAgICAgICAgbGluZUNvbW1lbnQ6ICcvLycsXHJcbiAgICAgICAgYmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10sXHJcbiAgICB9LFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ10sXHJcbiAgICAgICAgWycoJywgJyknXVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcgfSxcclxuICAgIF0sXHJcbiAgICBzdXJyb3VuZGluZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2AnLCBjbG9zZTogJ2AnIH0sXHJcbiAgICBdXHJcbn07XHJcbmV4cG9ydCB2YXIgbGFuZ3VhZ2UgPSB7XHJcbiAgICBkZWZhdWx0VG9rZW46ICcnLFxyXG4gICAgdG9rZW5Qb3N0Zml4OiAnLnN3aWZ0JyxcclxuICAgIC8vIFRPRE8ob3dlbnNkKTogU3VwcG9ydCB0aGUgZnVsbCByYW5nZSBvZiB1bmljb2RlIHZhbGlkIGlkZW50aWZpZXJzLlxyXG4gICAgaWRlbnRpZmllcjogL1thLXpBLVpfXVtcXHckXSovLFxyXG4gICAgLy8gVE9ETyhvd2Vuc2QpOiBTdXBwb3J0IHRoZSBAYXZhaWxhYmlsaXR5IG1hY3JvIHByb3Blcmx5LlxyXG4gICAgYXR0cmlidXRlczogW1xyXG4gICAgICAgICdAYXV0b2Nsb3N1cmUnLCAnQG5vZXNjYXBlJywgJ0Bub3JldHVybicsICdATlNBcHBsaWNhdGlvbk1haW4nLCAnQE5TQ29weWluZycsICdATlNNYW5hZ2VkJyxcclxuICAgICAgICAnQG9iamMnLCAnQFVJQXBwbGljYXRpb25NYWluJywgJ0Bub3JldHVybicsICdAYXZhaWxhYmlsaXR5JywgJ0BJQkFjdGlvbicsICdASUJEZXNpZ25hYmxlJywgJ0BJQkluc3BlY3RhYmxlJywgJ0BJQk91dGxldCdcclxuICAgIF0sXHJcbiAgICBhY2Nlc3Ntb2RpZmllcnM6IFsncHVibGljJywgJ3ByaXZhdGUnLCAnaW50ZXJuYWwnXSxcclxuICAgIGtleXdvcmRzOiBbXHJcbiAgICAgICAgJ19fQ09MVU1OX18nLCAnX19GSUxFX18nLCAnX19GVU5DVElPTl9fJywgJ19fTElORV9fJywgJ2FzJywgJ2FzIScsICdhcz8nLCAnYXNzb2NpYXRpdml0eScsICdicmVhaycsICdjYXNlJywgJ2NhdGNoJyxcclxuICAgICAgICAnY2xhc3MnLCAnY29udGludWUnLCAnY29udmVuaWVuY2UnLCAnZGVmYXVsdCcsICdkZWluaXQnLCAnZGlkU2V0JywgJ2RvJywgJ2R5bmFtaWMnLCAnZHluYW1pY1R5cGUnLFxyXG4gICAgICAgICdlbHNlJywgJ2VudW0nLCAnZXh0ZW5zaW9uJywgJ2ZhbGx0aHJvdWdoJywgJ2ZpbmFsJywgJ2ZvcicsICdmdW5jJywgJ2dldCcsICdndWFyZCcsICdpZicsICdpbXBvcnQnLCAnaW4nLCAnaW5maXgnLFxyXG4gICAgICAgICdpbml0JywgJ2lub3V0JywgJ2ludGVybmFsJywgJ2lzJywgJ2xhenknLCAnbGVmdCcsICdsZXQnLCAnbXV0YXRpbmcnLCAnbmlsJywgJ25vbmUnLCAnbm9ubXV0YXRpbmcnLCAnb3BlcmF0b3InLFxyXG4gICAgICAgICdvcHRpb25hbCcsICdvdmVycmlkZScsICdwb3N0Zml4JywgJ3ByZWNlZGVuY2UnLCAncHJlZml4JywgJ3ByaXZhdGUnLCAncHJvdG9jb2wnLCAnUHJvdG9jb2wnLCAncHVibGljJyxcclxuICAgICAgICAncmVwZWF0JywgJ3JlcXVpcmVkJywgJ3JldHVybicsICdyaWdodCcsICdzZWxmJywgJ1NlbGYnLCAnc2V0JywgJ3N0YXRpYycsICdzdHJ1Y3QnLCAnc3Vic2NyaXB0JywgJ3N1cGVyJywgJ3N3aXRjaCcsXHJcbiAgICAgICAgJ3Rocm93JywgJ3Rocm93cycsICd0cnknLCAndHJ5IScsICdUeXBlJywgJ3R5cGVhbGlhcycsICd1bm93bmVkJywgJ3ZhcicsICd3ZWFrJywgJ3doZXJlJywgJ3doaWxlJywgJ3dpbGxTZXQnLCAnRkFMU0UnLCAnVFJVRSdcclxuICAgIF0sXHJcbiAgICBzeW1ib2xzOiAvWz0oKXt9XFxbXFxdLiw6O0AjXFxfJlxcLTw+YD8hKypcXFxcXFwvXS8sXHJcbiAgICAvLyBNb3ZlZCAuIHRvIG9wZXJhdG9yc3RhcnQgc28gaXQgY2FuIGJlIGEgZGVsaW1pdGVyXHJcbiAgICBvcGVyYXRvcnN0YXJ0OiAvW1xcLz1cXC0rISolPD4mfF5+P1xcdTAwQTEtXFx1MDBBN1xcdTAwQTlcXHUwMEFCXFx1MDBBQ1xcdTAwQUVcXHUwMEIwLVxcdTAwQjFcXHUwMEI2XFx1MDBCQlxcdTAwQkZcXHUwMEQ3XFx1MDBGN1xcdTIwMTYtXFx1MjAxN1xcdTIwMjAtXFx1MjAyN1xcdTIwMzAtXFx1MjAzRVxcdTIwNDEtXFx1MjA1M1xcdTIwNTUtXFx1MjA1RVxcdTIxOTAtXFx1MjNGRlxcdTI1MDAtXFx1Mjc3NVxcdTI3OTQtXFx1MkJGRlxcdTJFMDAtXFx1MkU3RlxcdTMwMDEtXFx1MzAwM1xcdTMwMDgtXFx1MzAzMF0vLFxyXG4gICAgb3BlcmF0b3JlbmQ6IC9bXFx1MDMwMC1cXHUwMzZGXFx1MURDMC1cXHUxREZGXFx1MjBEMC1cXHUyMEZGXFx1RkUwMC1cXHVGRTBGXFx1RkUyMC1cXHVGRTJGXFx1RTAxMDAtXFx1RTAxRUZdLyxcclxuICAgIG9wZXJhdG9yczogLyhAb3BlcmF0b3JzdGFydCkoKEBvcGVyYXRvcnN0YXJ0KXwoQG9wZXJhdG9yZW5kKSkqLyxcclxuICAgIC8vIFRPRE8ob3dlbnNkKTogVGhlc2UgYXJlIGJvcnJvd2VkIGZyb20gQyM7IG5lZWQgdG8gdmFsaWRhdGUgY29ycmVjdG5lc3MgZm9yIFN3aWZ0LlxyXG4gICAgZXNjYXBlczogL1xcXFwoPzpbYWJmbnJ0dlxcXFxcIiddfHhbMC05QS1GYS1mXXsxLDR9fHVbMC05QS1GYS1mXXs0fXxVWzAtOUEtRmEtZl17OH0pLyxcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGNvbW1lbnQnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BhdHRyaWJ1dGUnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BsaXRlcmFsJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAa2V5d29yZCcgfSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGludm9rZWRtZXRob2QnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BzeW1ib2wnIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBzeW1ib2w6IFtcclxuICAgICAgICAgICAgWy9be30oKVxcW1xcXV0vLCAnQGJyYWNrZXRzJ10sXHJcbiAgICAgICAgICAgIFsvWzw+XSg/IUBzeW1ib2xzKS8sICdAYnJhY2tldHMnXSxcclxuICAgICAgICAgICAgWy9bLl0vLCAnZGVsaW1pdGVyJ10sXHJcbiAgICAgICAgICAgIFsvQG9wZXJhdG9ycy8sICdvcGVyYXRvciddLFxyXG4gICAgICAgICAgICBbL0BzeW1ib2xzLywgJ29wZXJhdG9yJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGNvbW1lbnQ6IFtcclxuICAgICAgICAgICAgWy9cXC9cXC9cXC8uKiQvLCAnY29tbWVudC5kb2MnXSxcclxuICAgICAgICAgICAgWy9cXC9cXCpcXCovLCAnY29tbWVudC5kb2MnLCAnQGNvbW1lbnRkb2Nib2R5J10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwvLiokLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXC9cXCovLCAnY29tbWVudCcsICdAY29tbWVudGJvZHknXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbWVudGRvY2JvZHk6IFtcclxuICAgICAgICAgICAgWy9cXC9cXCovLCAnY29tbWVudCcsICdAY29tbWVudGJvZHknXSxcclxuICAgICAgICAgICAgWy9cXCpcXC8vLCAnY29tbWVudC5kb2MnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1xcOlthLXpBLVpdK1xcOi8sICdjb21tZW50LmRvYy5wYXJhbSddLFxyXG4gICAgICAgICAgICBbLy4vLCAnY29tbWVudC5kb2MnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY29tbWVudGJvZHk6IFtcclxuICAgICAgICAgICAgWy9cXC9cXCovLCAnY29tbWVudCcsICdAY29tbWVudGJvZHknXSxcclxuICAgICAgICAgICAgWy9cXCpcXC8vLCAnY29tbWVudCcsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvLi8sICdjb21tZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGF0dHJpYnV0ZTogW1xyXG4gICAgICAgICAgICBbL1xcQEBpZGVudGlmaWVyLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAYXR0cmlidXRlcyc6ICdrZXl3b3JkLmNvbnRyb2wnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dXHJcbiAgICAgICAgXSxcclxuICAgICAgICBsaXRlcmFsOiBbXHJcbiAgICAgICAgICAgIFsvXCIvLCB7IHRva2VuOiAnc3RyaW5nLnF1b3RlJywgbmV4dDogJ0BzdHJpbmdsaXQnIH1dLFxyXG4gICAgICAgICAgICBbLzBbYl0oWzAxXV8/KSsvLCAnbnVtYmVyLmJpbmFyeSddLFxyXG4gICAgICAgICAgICBbLzBbb10oWzAtN11fPykrLywgJ251bWJlci5vY3RhbCddLFxyXG4gICAgICAgICAgICBbLzBbeF0oWzAtOWEtZkEtRl1fPykrKFtwUF1bXFwtK10oXFxkXz8pKyk/LywgJ251bWJlci5oZXgnXSxcclxuICAgICAgICAgICAgWy8oXFxkXz8pKlxcLihcXGRfPykrKFtlRV1bXFwtK10/KFxcZF8/KSspPy8sICdudW1iZXIuZmxvYXQnXSxcclxuICAgICAgICAgICAgWy8oXFxkXz8pKy8sICdudW1iZXInXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgc3RyaW5nbGl0OiBbXHJcbiAgICAgICAgICAgIFsvXFxcXFxcKC8sIHsgdG9rZW46ICdvcGVyYXRvcicsIG5leHQ6ICdAaW50ZXJwb2xhdGVkZXhwcmVzc2lvbicgfV0sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXC4vLCAnc3RyaW5nLmVzY2FwZS5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvXCIvLCB7IHRva2VuOiAnc3RyaW5nLnF1b3RlJywgbmV4dDogJ0Bwb3AnIH1dLFxyXG4gICAgICAgICAgICBbLy4vLCAnc3RyaW5nJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGludGVycG9sYXRlZGV4cHJlc3Npb246IFtcclxuICAgICAgICAgICAgWy9cXCgvLCB7IHRva2VuOiAnb3BlcmF0b3InLCBuZXh0OiAnQGludGVycG9sYXRlZGV4cHJlc3Npb24nIH1dLFxyXG4gICAgICAgICAgICBbL1xcKS8sIHsgdG9rZW46ICdvcGVyYXRvcicsIG5leHQ6ICdAcG9wJyB9XSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQGxpdGVyYWwnIH0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0BrZXl3b3JkJyB9LFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAc3ltYm9sJyB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICBrZXl3b3JkOiBbXHJcbiAgICAgICAgICAgIFsvYC8sIHsgdG9rZW46ICdvcGVyYXRvcicsIG5leHQ6ICdAZXNjYXBlZGtleXdvcmQnIH1dLFxyXG4gICAgICAgICAgICBbL0BpZGVudGlmaWVyLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsICdbQS1aXVtcXGEtekEtWjAtOSRdKic6ICd0eXBlLmlkZW50aWZpZXInLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZXNjYXBlZGtleXdvcmQ6IFtcclxuICAgICAgICAgICAgWy9gLywgeyB0b2tlbjogJ29wZXJhdG9yJywgbmV4dDogJ0Bwb3AnIH1dLFxyXG4gICAgICAgICAgICBbLy4vLCAnaWRlbnRpZmllciddXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvL1x0XHRzeW1ib2w6IFtcclxuICAgICAgICAvL1x0XHRcdFsgL0BzeW1ib2xzLywgJ29wZXJhdG9yJyBdLFxyXG4gICAgICAgIC8vXHRcdFx0WyAvQG9wZXJhdG9ycy8sICdvcGVyYXRvcicgXVxyXG4gICAgICAgIC8vXHRcdF0sXHJcbiAgICAgICAgaW52b2tlZG1ldGhvZDogW1xyXG4gICAgICAgICAgICBbLyhbLl0pKEBpZGVudGlmaWVyKS8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnJDInOiBbJ2RlbGltZXRlcicsICd0eXBlLmlkZW50aWZpZXInXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJydcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICBdXHJcbiAgICB9XHJcbn07XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=