(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[27],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/vb/vb.js":
/*!********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/vb/vb.js ***!
  \********************************************************************/
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
        lineComment: '\'',
        blockComment: ['/*', '*/'],
    },
    brackets: [
        ['{', '}'], ['[', ']'], ['(', ')'], ['<', '>'],
        ['addhandler', 'end addhandler'],
        ['class', 'end class'],
        ['enum', 'end enum'],
        ['event', 'end event'],
        ['function', 'end function'],
        ['get', 'end get'],
        ['if', 'end if'],
        ['interface', 'end interface'],
        ['module', 'end module'],
        ['namespace', 'end namespace'],
        ['operator', 'end operator'],
        ['property', 'end property'],
        ['raiseevent', 'end raiseevent'],
        ['removehandler', 'end removehandler'],
        ['select', 'end select'],
        ['set', 'end set'],
        ['structure', 'end structure'],
        ['sub', 'end sub'],
        ['synclock', 'end synclock'],
        ['try', 'end try'],
        ['while', 'end while'],
        ['with', 'end with'],
        ['using', 'end using'],
        ['do', 'loop'],
        ['for', 'next']
    ],
    autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string', 'comment'] },
        { open: '[', close: ']', notIn: ['string', 'comment'] },
        { open: '(', close: ')', notIn: ['string', 'comment'] },
        { open: '"', close: '"', notIn: ['string', 'comment'] },
        { open: '<', close: '>', notIn: ['string', 'comment'] },
    ],
    folding: {
        markers: {
            start: new RegExp("^\\s*#Region\\b"),
            end: new RegExp("^\\s*#End Region\\b")
        }
    }
};
var language = {
    defaultToken: '',
    tokenPostfix: '.vb',
    ignoreCase: true,
    brackets: [
        { token: 'delimiter.bracket', open: '{', close: '}' },
        { token: 'delimiter.array', open: '[', close: ']' },
        { token: 'delimiter.parenthesis', open: '(', close: ')' },
        { token: 'delimiter.angle', open: '<', close: '>' },
        // Special bracket statement pairs
        // according to https://msdn.microsoft.com/en-us/library/tsw2a11z.aspx
        { token: 'keyword.tag-addhandler', open: 'addhandler', close: 'end addhandler' },
        { token: 'keyword.tag-class', open: 'class', close: 'end class' },
        { token: 'keyword.tag-enum', open: 'enum', close: 'end enum' },
        { token: 'keyword.tag-event', open: 'event', close: 'end event' },
        { token: 'keyword.tag-function', open: 'function', close: 'end function' },
        { token: 'keyword.tag-get', open: 'get', close: 'end get' },
        { token: 'keyword.tag-if', open: 'if', close: 'end if' },
        { token: 'keyword.tag-interface', open: 'interface', close: 'end interface' },
        { token: 'keyword.tag-module', open: 'module', close: 'end module' },
        { token: 'keyword.tag-namespace', open: 'namespace', close: 'end namespace' },
        { token: 'keyword.tag-operator', open: 'operator', close: 'end operator' },
        { token: 'keyword.tag-property', open: 'property', close: 'end property' },
        { token: 'keyword.tag-raiseevent', open: 'raiseevent', close: 'end raiseevent' },
        { token: 'keyword.tag-removehandler', open: 'removehandler', close: 'end removehandler' },
        { token: 'keyword.tag-select', open: 'select', close: 'end select' },
        { token: 'keyword.tag-set', open: 'set', close: 'end set' },
        { token: 'keyword.tag-structure', open: 'structure', close: 'end structure' },
        { token: 'keyword.tag-sub', open: 'sub', close: 'end sub' },
        { token: 'keyword.tag-synclock', open: 'synclock', close: 'end synclock' },
        { token: 'keyword.tag-try', open: 'try', close: 'end try' },
        { token: 'keyword.tag-while', open: 'while', close: 'end while' },
        { token: 'keyword.tag-with', open: 'with', close: 'end with' },
        // Other pairs
        { token: 'keyword.tag-using', open: 'using', close: 'end using' },
        { token: 'keyword.tag-do', open: 'do', close: 'loop' },
        { token: 'keyword.tag-for', open: 'for', close: 'next' }
    ],
    keywords: [
        'AddHandler', 'AddressOf', 'Alias', 'And', 'AndAlso', 'As', 'Async', 'Boolean', 'ByRef', 'Byte', 'ByVal', 'Call',
        'Case', 'Catch', 'CBool', 'CByte', 'CChar', 'CDate', 'CDbl', 'CDec', 'Char', 'CInt', 'Class', 'CLng',
        'CObj', 'Const', 'Continue', 'CSByte', 'CShort', 'CSng', 'CStr', 'CType', 'CUInt', 'CULng', 'CUShort',
        'Date', 'Decimal', 'Declare', 'Default', 'Delegate', 'Dim', 'DirectCast', 'Do', 'Double', 'Each', 'Else',
        'ElseIf', 'End', 'EndIf', 'Enum', 'Erase', 'Error', 'Event', 'Exit', 'False', 'Finally', 'For', 'Friend',
        'Function', 'Get', 'GetType', 'GetXMLNamespace', 'Global', 'GoSub', 'GoTo', 'Handles', 'If', 'Implements',
        'Imports', 'In', 'Inherits', 'Integer', 'Interface', 'Is', 'IsNot', 'Let', 'Lib', 'Like', 'Long', 'Loop',
        'Me', 'Mod', 'Module', 'MustInherit', 'MustOverride', 'MyBase', 'MyClass', 'NameOf', 'Namespace', 'Narrowing', 'New',
        'Next', 'Not', 'Nothing', 'NotInheritable', 'NotOverridable', 'Object', 'Of', 'On', 'Operator', 'Option',
        'Optional', 'Or', 'OrElse', 'Out', 'Overloads', 'Overridable', 'Overrides', 'ParamArray', 'Partial',
        'Private', 'Property', 'Protected', 'Public', 'RaiseEvent', 'ReadOnly', 'ReDim', 'RemoveHandler', 'Resume',
        'Return', 'SByte', 'Select', 'Set', 'Shadows', 'Shared', 'Short', 'Single', 'Static', 'Step', 'Stop',
        'String', 'Structure', 'Sub', 'SyncLock', 'Then', 'Throw', 'To', 'True', 'Try', 'TryCast', 'TypeOf',
        'UInteger', 'ULong', 'UShort', 'Using', 'Variant', 'Wend', 'When', 'While', 'Widening', 'With', 'WithEvents',
        'WriteOnly', 'Xor'
    ],
    tagwords: [
        'If', 'Sub', 'Select', 'Try', 'Class', 'Enum',
        'Function', 'Get', 'Interface', 'Module', 'Namespace', 'Operator', 'Set', 'Structure', 'Using', 'While', 'With',
        'Do', 'Loop', 'For', 'Next', 'Property', 'Continue', 'AddHandler', 'RemoveHandler', 'Event', 'RaiseEvent', 'SyncLock'
    ],
    // we include these common regular expressions
    symbols: /[=><!~?;\.,:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    integersuffix: /U?[DI%L&S@]?/,
    floatsuffix: /[R#F!]?/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // whitespace
            { include: '@whitespace' },
            // special ending tag-words
            [/next(?!\w)/, { token: 'keyword.tag-for' }],
            [/loop(?!\w)/, { token: 'keyword.tag-do' }],
            // usual ending tags
            [/end\s+(?!for|do)([a-zA-Z_]\w*)/, { token: 'keyword.tag-$1' }],
            // identifiers, tagwords, and keywords
            [/[a-zA-Z_]\w*/, {
                    cases: {
                        '@tagwords': { token: 'keyword.tag-$0' },
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'identifier'
                    }
                }],
            // Preprocessor directive
            [/^\s*#\w+/, 'keyword'],
            // numbers
            [/\d*\d+e([\-+]?\d+)?(@floatsuffix)/, 'number.float'],
            [/\d*\.\d+(e[\-+]?\d+)?(@floatsuffix)/, 'number.float'],
            [/&H[0-9a-f]+(@integersuffix)/, 'number.hex'],
            [/&0[0-7]+(@integersuffix)/, 'number.octal'],
            [/\d+(@integersuffix)/, 'number'],
            // date literal
            [/#.*#/, 'number'],
            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/@symbols/, 'delimiter'],
            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string'],
        ],
        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/(\'|REM(?!\w)).*$/, 'comment'],
        ],
        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"C?/, 'string', '@pop']
        ],
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvdmIvdmIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDTjtBQUNQO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLFdBQVcsS0FBSztBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxpQ0FBaUM7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLHFDQUFxQyxZQUFZLEdBQUc7QUFDN0QsU0FBUyxrREFBa0Q7QUFDM0QsU0FBUyx3REFBd0Q7QUFDakUsU0FBUyxrREFBa0Q7QUFDM0Q7QUFDQTtBQUNBLFNBQVMsK0VBQStFO0FBQ3hGLFNBQVMsZ0VBQWdFO0FBQ3pFLFNBQVMsNkRBQTZEO0FBQ3RFLFNBQVMsZ0VBQWdFO0FBQ3pFLFNBQVMseUVBQXlFO0FBQ2xGLFNBQVMsMERBQTBEO0FBQ25FLFNBQVMsdURBQXVEO0FBQ2hFLFNBQVMsNEVBQTRFO0FBQ3JGLFNBQVMsbUVBQW1FO0FBQzVFLFNBQVMsNEVBQTRFO0FBQ3JGLFNBQVMseUVBQXlFO0FBQ2xGLFNBQVMseUVBQXlFO0FBQ2xGLFNBQVMsK0VBQStFO0FBQ3hGLFNBQVMsd0ZBQXdGO0FBQ2pHLFNBQVMsbUVBQW1FO0FBQzVFLFNBQVMsMERBQTBEO0FBQ25FLFNBQVMsNEVBQTRFO0FBQ3JGLFNBQVMsMERBQTBEO0FBQ25FLFNBQVMseUVBQXlFO0FBQ2xGLFNBQVMsMERBQTBEO0FBQ25FLFNBQVMsZ0VBQWdFO0FBQ3pFLFNBQVMsNkRBQTZEO0FBQ3RFO0FBQ0EsU0FBUyxnRUFBZ0U7QUFDekUsU0FBUyxxREFBcUQ7QUFDOUQsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHNCQUFzQjtBQUN0Qiw4Q0FBOEMsSUFBSSxjQUFjLEVBQUUsY0FBYyxFQUFFO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWEseUJBQXlCO0FBQ3RDO0FBQ0EsNEJBQTRCLDJCQUEyQjtBQUN2RCw0QkFBNEIsMEJBQTBCO0FBQ3REO0FBQ0EsZ0RBQWdELDBCQUEwQjtBQUMxRTtBQUNBO0FBQ0E7QUFDQSxzQ0FBc0MsMEJBQTBCO0FBQ2hFLHNDQUFzQyxzQkFBc0I7QUFDNUQ7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTCIsImZpbGUiOiIyNy5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnXFwnJyxcclxuICAgICAgICBibG9ja0NvbW1lbnQ6IFsnLyonLCAnKi8nXSxcclxuICAgIH0sXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIFsneycsICd9J10sIFsnWycsICddJ10sIFsnKCcsICcpJ10sIFsnPCcsICc+J10sXHJcbiAgICAgICAgWydhZGRoYW5kbGVyJywgJ2VuZCBhZGRoYW5kbGVyJ10sXHJcbiAgICAgICAgWydjbGFzcycsICdlbmQgY2xhc3MnXSxcclxuICAgICAgICBbJ2VudW0nLCAnZW5kIGVudW0nXSxcclxuICAgICAgICBbJ2V2ZW50JywgJ2VuZCBldmVudCddLFxyXG4gICAgICAgIFsnZnVuY3Rpb24nLCAnZW5kIGZ1bmN0aW9uJ10sXHJcbiAgICAgICAgWydnZXQnLCAnZW5kIGdldCddLFxyXG4gICAgICAgIFsnaWYnLCAnZW5kIGlmJ10sXHJcbiAgICAgICAgWydpbnRlcmZhY2UnLCAnZW5kIGludGVyZmFjZSddLFxyXG4gICAgICAgIFsnbW9kdWxlJywgJ2VuZCBtb2R1bGUnXSxcclxuICAgICAgICBbJ25hbWVzcGFjZScsICdlbmQgbmFtZXNwYWNlJ10sXHJcbiAgICAgICAgWydvcGVyYXRvcicsICdlbmQgb3BlcmF0b3InXSxcclxuICAgICAgICBbJ3Byb3BlcnR5JywgJ2VuZCBwcm9wZXJ0eSddLFxyXG4gICAgICAgIFsncmFpc2VldmVudCcsICdlbmQgcmFpc2VldmVudCddLFxyXG4gICAgICAgIFsncmVtb3ZlaGFuZGxlcicsICdlbmQgcmVtb3ZlaGFuZGxlciddLFxyXG4gICAgICAgIFsnc2VsZWN0JywgJ2VuZCBzZWxlY3QnXSxcclxuICAgICAgICBbJ3NldCcsICdlbmQgc2V0J10sXHJcbiAgICAgICAgWydzdHJ1Y3R1cmUnLCAnZW5kIHN0cnVjdHVyZSddLFxyXG4gICAgICAgIFsnc3ViJywgJ2VuZCBzdWInXSxcclxuICAgICAgICBbJ3N5bmNsb2NrJywgJ2VuZCBzeW5jbG9jayddLFxyXG4gICAgICAgIFsndHJ5JywgJ2VuZCB0cnknXSxcclxuICAgICAgICBbJ3doaWxlJywgJ2VuZCB3aGlsZSddLFxyXG4gICAgICAgIFsnd2l0aCcsICdlbmQgd2l0aCddLFxyXG4gICAgICAgIFsndXNpbmcnLCAnZW5kIHVzaW5nJ10sXHJcbiAgICAgICAgWydkbycsICdsb29wJ10sXHJcbiAgICAgICAgWydmb3InLCAnbmV4dCddXHJcbiAgICBdLFxyXG4gICAgYXV0b0Nsb3NpbmdQYWlyczogW1xyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICc8JywgY2xvc2U6ICc+Jywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgXSxcclxuICAgIGZvbGRpbmc6IHtcclxuICAgICAgICBtYXJrZXJzOiB7XHJcbiAgICAgICAgICAgIHN0YXJ0OiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNSZWdpb25cXFxcYlwiKSxcclxuICAgICAgICAgICAgZW5kOiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNFbmQgUmVnaW9uXFxcXGJcIilcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07XHJcbmV4cG9ydCB2YXIgbGFuZ3VhZ2UgPSB7XHJcbiAgICBkZWZhdWx0VG9rZW46ICcnLFxyXG4gICAgdG9rZW5Qb3N0Zml4OiAnLnZiJyxcclxuICAgIGlnbm9yZUNhc2U6IHRydWUsXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2tldCcsIG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIuYXJyYXknLCBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcclxuICAgICAgICB7IHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJywgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5hbmdsZScsIG9wZW46ICc8JywgY2xvc2U6ICc+JyB9LFxyXG4gICAgICAgIC8vIFNwZWNpYWwgYnJhY2tldCBzdGF0ZW1lbnQgcGFpcnNcclxuICAgICAgICAvLyBhY2NvcmRpbmcgdG8gaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS90c3cyYTExei5hc3B4XHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWFkZGhhbmRsZXInLCBvcGVuOiAnYWRkaGFuZGxlcicsIGNsb3NlOiAnZW5kIGFkZGhhbmRsZXInIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWNsYXNzJywgb3BlbjogJ2NsYXNzJywgY2xvc2U6ICdlbmQgY2xhc3MnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWVudW0nLCBvcGVuOiAnZW51bScsIGNsb3NlOiAnZW5kIGVudW0nIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWV2ZW50Jywgb3BlbjogJ2V2ZW50JywgY2xvc2U6ICdlbmQgZXZlbnQnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWZ1bmN0aW9uJywgb3BlbjogJ2Z1bmN0aW9uJywgY2xvc2U6ICdlbmQgZnVuY3Rpb24nIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWdldCcsIG9wZW46ICdnZXQnLCBjbG9zZTogJ2VuZCBnZXQnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWlmJywgb3BlbjogJ2lmJywgY2xvc2U6ICdlbmQgaWYnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWludGVyZmFjZScsIG9wZW46ICdpbnRlcmZhY2UnLCBjbG9zZTogJ2VuZCBpbnRlcmZhY2UnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLW1vZHVsZScsIG9wZW46ICdtb2R1bGUnLCBjbG9zZTogJ2VuZCBtb2R1bGUnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLW5hbWVzcGFjZScsIG9wZW46ICduYW1lc3BhY2UnLCBjbG9zZTogJ2VuZCBuYW1lc3BhY2UnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLW9wZXJhdG9yJywgb3BlbjogJ29wZXJhdG9yJywgY2xvc2U6ICdlbmQgb3BlcmF0b3InIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXByb3BlcnR5Jywgb3BlbjogJ3Byb3BlcnR5JywgY2xvc2U6ICdlbmQgcHJvcGVydHknIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXJhaXNlZXZlbnQnLCBvcGVuOiAncmFpc2VldmVudCcsIGNsb3NlOiAnZW5kIHJhaXNlZXZlbnQnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXJlbW92ZWhhbmRsZXInLCBvcGVuOiAncmVtb3ZlaGFuZGxlcicsIGNsb3NlOiAnZW5kIHJlbW92ZWhhbmRsZXInIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXNlbGVjdCcsIG9wZW46ICdzZWxlY3QnLCBjbG9zZTogJ2VuZCBzZWxlY3QnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXNldCcsIG9wZW46ICdzZXQnLCBjbG9zZTogJ2VuZCBzZXQnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXN0cnVjdHVyZScsIG9wZW46ICdzdHJ1Y3R1cmUnLCBjbG9zZTogJ2VuZCBzdHJ1Y3R1cmUnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXN1YicsIG9wZW46ICdzdWInLCBjbG9zZTogJ2VuZCBzdWInIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXN5bmNsb2NrJywgb3BlbjogJ3N5bmNsb2NrJywgY2xvc2U6ICdlbmQgc3luY2xvY2snIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXRyeScsIG9wZW46ICd0cnknLCBjbG9zZTogJ2VuZCB0cnknIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXdoaWxlJywgb3BlbjogJ3doaWxlJywgY2xvc2U6ICdlbmQgd2hpbGUnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLXdpdGgnLCBvcGVuOiAnd2l0aCcsIGNsb3NlOiAnZW5kIHdpdGgnIH0sXHJcbiAgICAgICAgLy8gT3RoZXIgcGFpcnNcclxuICAgICAgICB7IHRva2VuOiAna2V5d29yZC50YWctdXNpbmcnLCBvcGVuOiAndXNpbmcnLCBjbG9zZTogJ2VuZCB1c2luZycgfSxcclxuICAgICAgICB7IHRva2VuOiAna2V5d29yZC50YWctZG8nLCBvcGVuOiAnZG8nLCBjbG9zZTogJ2xvb3AnIH0sXHJcbiAgICAgICAgeyB0b2tlbjogJ2tleXdvcmQudGFnLWZvcicsIG9wZW46ICdmb3InLCBjbG9zZTogJ25leHQnIH1cclxuICAgIF0sXHJcbiAgICBrZXl3b3JkczogW1xyXG4gICAgICAgICdBZGRIYW5kbGVyJywgJ0FkZHJlc3NPZicsICdBbGlhcycsICdBbmQnLCAnQW5kQWxzbycsICdBcycsICdBc3luYycsICdCb29sZWFuJywgJ0J5UmVmJywgJ0J5dGUnLCAnQnlWYWwnLCAnQ2FsbCcsXHJcbiAgICAgICAgJ0Nhc2UnLCAnQ2F0Y2gnLCAnQ0Jvb2wnLCAnQ0J5dGUnLCAnQ0NoYXInLCAnQ0RhdGUnLCAnQ0RibCcsICdDRGVjJywgJ0NoYXInLCAnQ0ludCcsICdDbGFzcycsICdDTG5nJyxcclxuICAgICAgICAnQ09iaicsICdDb25zdCcsICdDb250aW51ZScsICdDU0J5dGUnLCAnQ1Nob3J0JywgJ0NTbmcnLCAnQ1N0cicsICdDVHlwZScsICdDVUludCcsICdDVUxuZycsICdDVVNob3J0JyxcclxuICAgICAgICAnRGF0ZScsICdEZWNpbWFsJywgJ0RlY2xhcmUnLCAnRGVmYXVsdCcsICdEZWxlZ2F0ZScsICdEaW0nLCAnRGlyZWN0Q2FzdCcsICdEbycsICdEb3VibGUnLCAnRWFjaCcsICdFbHNlJyxcclxuICAgICAgICAnRWxzZUlmJywgJ0VuZCcsICdFbmRJZicsICdFbnVtJywgJ0VyYXNlJywgJ0Vycm9yJywgJ0V2ZW50JywgJ0V4aXQnLCAnRmFsc2UnLCAnRmluYWxseScsICdGb3InLCAnRnJpZW5kJyxcclxuICAgICAgICAnRnVuY3Rpb24nLCAnR2V0JywgJ0dldFR5cGUnLCAnR2V0WE1MTmFtZXNwYWNlJywgJ0dsb2JhbCcsICdHb1N1YicsICdHb1RvJywgJ0hhbmRsZXMnLCAnSWYnLCAnSW1wbGVtZW50cycsXHJcbiAgICAgICAgJ0ltcG9ydHMnLCAnSW4nLCAnSW5oZXJpdHMnLCAnSW50ZWdlcicsICdJbnRlcmZhY2UnLCAnSXMnLCAnSXNOb3QnLCAnTGV0JywgJ0xpYicsICdMaWtlJywgJ0xvbmcnLCAnTG9vcCcsXHJcbiAgICAgICAgJ01lJywgJ01vZCcsICdNb2R1bGUnLCAnTXVzdEluaGVyaXQnLCAnTXVzdE92ZXJyaWRlJywgJ015QmFzZScsICdNeUNsYXNzJywgJ05hbWVPZicsICdOYW1lc3BhY2UnLCAnTmFycm93aW5nJywgJ05ldycsXHJcbiAgICAgICAgJ05leHQnLCAnTm90JywgJ05vdGhpbmcnLCAnTm90SW5oZXJpdGFibGUnLCAnTm90T3ZlcnJpZGFibGUnLCAnT2JqZWN0JywgJ09mJywgJ09uJywgJ09wZXJhdG9yJywgJ09wdGlvbicsXHJcbiAgICAgICAgJ09wdGlvbmFsJywgJ09yJywgJ09yRWxzZScsICdPdXQnLCAnT3ZlcmxvYWRzJywgJ092ZXJyaWRhYmxlJywgJ092ZXJyaWRlcycsICdQYXJhbUFycmF5JywgJ1BhcnRpYWwnLFxyXG4gICAgICAgICdQcml2YXRlJywgJ1Byb3BlcnR5JywgJ1Byb3RlY3RlZCcsICdQdWJsaWMnLCAnUmFpc2VFdmVudCcsICdSZWFkT25seScsICdSZURpbScsICdSZW1vdmVIYW5kbGVyJywgJ1Jlc3VtZScsXHJcbiAgICAgICAgJ1JldHVybicsICdTQnl0ZScsICdTZWxlY3QnLCAnU2V0JywgJ1NoYWRvd3MnLCAnU2hhcmVkJywgJ1Nob3J0JywgJ1NpbmdsZScsICdTdGF0aWMnLCAnU3RlcCcsICdTdG9wJyxcclxuICAgICAgICAnU3RyaW5nJywgJ1N0cnVjdHVyZScsICdTdWInLCAnU3luY0xvY2snLCAnVGhlbicsICdUaHJvdycsICdUbycsICdUcnVlJywgJ1RyeScsICdUcnlDYXN0JywgJ1R5cGVPZicsXHJcbiAgICAgICAgJ1VJbnRlZ2VyJywgJ1VMb25nJywgJ1VTaG9ydCcsICdVc2luZycsICdWYXJpYW50JywgJ1dlbmQnLCAnV2hlbicsICdXaGlsZScsICdXaWRlbmluZycsICdXaXRoJywgJ1dpdGhFdmVudHMnLFxyXG4gICAgICAgICdXcml0ZU9ubHknLCAnWG9yJ1xyXG4gICAgXSxcclxuICAgIHRhZ3dvcmRzOiBbXHJcbiAgICAgICAgJ0lmJywgJ1N1YicsICdTZWxlY3QnLCAnVHJ5JywgJ0NsYXNzJywgJ0VudW0nLFxyXG4gICAgICAgICdGdW5jdGlvbicsICdHZXQnLCAnSW50ZXJmYWNlJywgJ01vZHVsZScsICdOYW1lc3BhY2UnLCAnT3BlcmF0b3InLCAnU2V0JywgJ1N0cnVjdHVyZScsICdVc2luZycsICdXaGlsZScsICdXaXRoJyxcclxuICAgICAgICAnRG8nLCAnTG9vcCcsICdGb3InLCAnTmV4dCcsICdQcm9wZXJ0eScsICdDb250aW51ZScsICdBZGRIYW5kbGVyJywgJ1JlbW92ZUhhbmRsZXInLCAnRXZlbnQnLCAnUmFpc2VFdmVudCcsICdTeW5jTG9jaydcclxuICAgIF0sXHJcbiAgICAvLyB3ZSBpbmNsdWRlIHRoZXNlIGNvbW1vbiByZWd1bGFyIGV4cHJlc3Npb25zXHJcbiAgICBzeW1ib2xzOiAvWz0+PCF+PztcXC4sOiZ8K1xcLSpcXC9cXF4lXSsvLFxyXG4gICAgZXNjYXBlczogL1xcXFwoPzpbYWJmbnJ0dlxcXFxcIiddfHhbMC05QS1GYS1mXXsxLDR9fHVbMC05QS1GYS1mXXs0fXxVWzAtOUEtRmEtZl17OH0pLyxcclxuICAgIGludGVnZXJzdWZmaXg6IC9VP1tESSVMJlNAXT8vLFxyXG4gICAgZmxvYXRzdWZmaXg6IC9bUiNGIV0/LyxcclxuICAgIC8vIFRoZSBtYWluIHRva2VuaXplciBmb3Igb3VyIGxhbmd1YWdlc1xyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICAvLyB3aGl0ZXNwYWNlXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0B3aGl0ZXNwYWNlJyB9LFxyXG4gICAgICAgICAgICAvLyBzcGVjaWFsIGVuZGluZyB0YWctd29yZHNcclxuICAgICAgICAgICAgWy9uZXh0KD8hXFx3KS8sIHsgdG9rZW46ICdrZXl3b3JkLnRhZy1mb3InIH1dLFxyXG4gICAgICAgICAgICBbL2xvb3AoPyFcXHcpLywgeyB0b2tlbjogJ2tleXdvcmQudGFnLWRvJyB9XSxcclxuICAgICAgICAgICAgLy8gdXN1YWwgZW5kaW5nIHRhZ3NcclxuICAgICAgICAgICAgWy9lbmRcXHMrKD8hZm9yfGRvKShbYS16QS1aX11cXHcqKS8sIHsgdG9rZW46ICdrZXl3b3JkLnRhZy0kMScgfV0sXHJcbiAgICAgICAgICAgIC8vIGlkZW50aWZpZXJzLCB0YWd3b3JkcywgYW5kIGtleXdvcmRzXHJcbiAgICAgICAgICAgIFsvW2EtekEtWl9dXFx3Ki8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQHRhZ3dvcmRzJzogeyB0b2tlbjogJ2tleXdvcmQudGFnLSQwJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogeyB0b2tlbjogJ2tleXdvcmQuJDAnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6ICdpZGVudGlmaWVyJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICAvLyBQcmVwcm9jZXNzb3IgZGlyZWN0aXZlXHJcbiAgICAgICAgICAgIFsvXlxccyojXFx3Ky8sICdrZXl3b3JkJ10sXHJcbiAgICAgICAgICAgIC8vIG51bWJlcnNcclxuICAgICAgICAgICAgWy9cXGQqXFxkK2UoW1xcLStdP1xcZCspPyhAZmxvYXRzdWZmaXgpLywgJ251bWJlci5mbG9hdCddLFxyXG4gICAgICAgICAgICBbL1xcZCpcXC5cXGQrKGVbXFwtK10/XFxkKyk/KEBmbG9hdHN1ZmZpeCkvLCAnbnVtYmVyLmZsb2F0J10sXHJcbiAgICAgICAgICAgIFsvJkhbMC05YS1mXSsoQGludGVnZXJzdWZmaXgpLywgJ251bWJlci5oZXgnXSxcclxuICAgICAgICAgICAgWy8mMFswLTddKyhAaW50ZWdlcnN1ZmZpeCkvLCAnbnVtYmVyLm9jdGFsJ10sXHJcbiAgICAgICAgICAgIFsvXFxkKyhAaW50ZWdlcnN1ZmZpeCkvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgICAgIC8vIGRhdGUgbGl0ZXJhbFxyXG4gICAgICAgICAgICBbLyMuKiMvLCAnbnVtYmVyJ10sXHJcbiAgICAgICAgICAgIC8vIGRlbGltaXRlcnMgYW5kIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBbL1t7fSgpXFxbXFxdXS8sICdAYnJhY2tldHMnXSxcclxuICAgICAgICAgICAgWy9Ac3ltYm9scy8sICdkZWxpbWl0ZXInXSxcclxuICAgICAgICAgICAgLy8gc3RyaW5nc1xyXG4gICAgICAgICAgICBbL1wiKFteXCJcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgJ3N0cmluZycsICdAc3RyaW5nJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICB3aGl0ZXNwYWNlOiBbXHJcbiAgICAgICAgICAgIFsvWyBcXHRcXHJcXG5dKy8sICcnXSxcclxuICAgICAgICAgICAgWy8oXFwnfFJFTSg/IVxcdykpLiokLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZzogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiXSsvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnc3RyaW5nLmVzY2FwZSddLFxyXG4gICAgICAgICAgICBbL1xcXFwuLywgJ3N0cmluZy5lc2NhcGUuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiQz8vLCAnc3RyaW5nJywgJ0Bwb3AnXVxyXG4gICAgICAgIF0sXHJcbiAgICB9LFxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9