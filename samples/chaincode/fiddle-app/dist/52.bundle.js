(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[52],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/st/st.js":
/*!********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/st/st.js ***!
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
        lineComment: '//',
        blockComment: ['(*', '*)'],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
        ['var', 'end_var'],
        ['var_input', 'end_var'],
        ['var_output', 'end_var'],
        ['var_in_out', 'end_var'],
        ['var_temp', 'end_var'],
        ['var_global', 'end_var'],
        ['var_access', 'end_var'],
        ['var_external', 'end_var'],
        ['type', 'end_type'],
        ['struct', 'end_struct'],
        ['program', 'end_program'],
        ['function', 'end_function'],
        ['function_block', 'end_function_block'],
        ['action', 'end_action'],
        ['step', 'end_step'],
        ['initial_step', 'end_step'],
        ['transaction', 'end_transaction'],
        ['configuration', 'end_configuration'],
        ['tcp', 'end_tcp'],
        ['recource', 'end_recource'],
        ['channel', 'end_channel'],
        ['library', 'end_library'],
        ['folder', 'end_folder'],
        ['binaries', 'end_binaries'],
        ['includes', 'end_includes'],
        ['sources', 'end_sources']
    ],
    autoClosingPairs: [
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '(', close: ')' },
        { open: '/*', close: '*/' },
        { open: '\'', close: '\'', notIn: ['string_sq'] },
        { open: '"', close: '"', notIn: ['string_dq'] },
        { open: 'var', close: 'end_var' },
        { open: 'var_input', close: 'end_var' },
        { open: 'var_output', close: 'end_var' },
        { open: 'var_in_out', close: 'end_var' },
        { open: 'var_temp', close: 'end_var' },
        { open: 'var_global', close: 'end_var' },
        { open: 'var_access', close: 'end_var' },
        { open: 'var_external', close: 'end_var' },
        { open: 'type', close: 'end_type' },
        { open: 'struct', close: 'end_struct' },
        { open: 'program', close: 'end_program' },
        { open: 'function', close: 'end_function' },
        { open: 'function_block', close: 'end_function_block' },
        { open: 'action', close: 'end_action' },
        { open: 'step', close: 'end_step' },
        { open: 'initial_step', close: 'end_step' },
        { open: 'transaction', close: 'end_transaction' },
        { open: 'configuration', close: 'end_configuration' },
        { open: 'tcp', close: 'end_tcp' },
        { open: 'recource', close: 'end_recource' },
        { open: 'channel', close: 'end_channel' },
        { open: 'library', close: 'end_library' },
        { open: 'folder', close: 'end_folder' },
        { open: 'binaries', close: 'end_binaries' },
        { open: 'includes', close: 'end_includes' },
        { open: 'sources', close: 'end_sources' }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' },
        { open: 'var', close: 'end_var' },
        { open: 'var_input', close: 'end_var' },
        { open: 'var_output', close: 'end_var' },
        { open: 'var_in_out', close: 'end_var' },
        { open: 'var_temp', close: 'end_var' },
        { open: 'var_global', close: 'end_var' },
        { open: 'var_access', close: 'end_var' },
        { open: 'var_external', close: 'end_var' },
        { open: 'type', close: 'end_type' },
        { open: 'struct', close: 'end_struct' },
        { open: 'program', close: 'end_program' },
        { open: 'function', close: 'end_function' },
        { open: 'function_block', close: 'end_function_block' },
        { open: 'action', close: 'end_action' },
        { open: 'step', close: 'end_step' },
        { open: 'initial_step', close: 'end_step' },
        { open: 'transaction', close: 'end_transaction' },
        { open: 'configuration', close: 'end_configuration' },
        { open: 'tcp', close: 'end_tcp' },
        { open: 'recource', close: 'end_recource' },
        { open: 'channel', close: 'end_channel' },
        { open: 'library', close: 'end_library' },
        { open: 'folder', close: 'end_folder' },
        { open: 'binaries', close: 'end_binaries' },
        { open: 'includes', close: 'end_includes' },
        { open: 'sources', close: 'end_sources' }
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
    tokenPostfix: '.st',
    ignoreCase: true,
    brackets: [
        { token: 'delimiter.curly', open: '{', close: '}' },
        { token: 'delimiter.parenthesis', open: '(', close: ')' },
        { token: 'delimiter.square', open: '[', close: ']' }
    ],
    keywords: ['if', 'end_if', 'elsif', 'else', 'case', 'of', 'to',
        'do', 'with', 'by', 'while', 'repeat', 'end_while', 'end_repeat', 'end_case',
        'for', 'end_for', 'task', 'retain', 'non_retain', 'constant', 'with', 'at',
        'exit', 'return', 'interval', 'priority', 'address', 'port', 'on_channel',
        'then', 'iec', 'file', 'uses', 'version', 'packagetype', 'displayname',
        'copyright', 'summary', 'vendor', 'common_source', 'from'],
    constant: ['false', 'true', 'null'],
    defineKeywords: [
        'var', 'var_input', 'var_output', 'var_in_out', 'var_temp', 'var_global',
        'var_access', 'var_external', 'end_var',
        'type', 'end_type', 'struct', 'end_struct', 'program', 'end_program',
        'function', 'end_function', 'function_block', 'end_function_block',
        'configuration', 'end_configuration', 'tcp', 'end_tcp', 'recource',
        'end_recource', 'channel', 'end_channel', 'library', 'end_library',
        'folder', 'end_folder', 'binaries', 'end_binaries', 'includes',
        'end_includes', 'sources', 'end_sources',
        'action', 'end_action', 'step', 'initial_step', 'end_step', 'transaction', 'end_transaction'
    ],
    typeKeywords: ['int', 'sint', 'dint', 'lint', 'usint', 'uint', 'udint', 'ulint',
        'real', 'lreal', 'time', 'date', 'time_of_day', 'date_and_time', 'string',
        'bool', 'byte', 'world', 'dworld', 'array', 'pointer', 'lworld'],
    operators: ['=', '>', '<', ':', ':=', '<=', '>=', '<>', '&', '+', '-', '*', '**',
        'MOD', '^', 'or', 'and', 'not', 'xor', 'abs', 'acos', 'asin', 'atan', 'cos',
        'exp', 'expt', 'ln', 'log', 'sin', 'sqrt', 'tan', 'sel', 'max', 'min', 'limit',
        'mux', 'shl', 'shr', 'rol', 'ror', 'indexof', 'sizeof', 'adr', 'adrinst',
        'bitadr', 'is_valid'],
    builtinVariables: [],
    builtinFunctions: ['sr', 'rs', 'tp', 'ton', 'tof', 'eq', 'ge', 'le', 'lt',
        'ne', 'round', 'trunc', 'ctd', 'сtu', 'ctud', 'r_trig', 'f_trig',
        'move', 'concat', 'delete', 'find', 'insert', 'left', 'len', 'replace',
        'right', 'rtc'],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    // C# style strings
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    // The main tokenizer for our languages
    tokenizer: {
        root: [
            [/(T|DT|TOD)#[0-9:-_shmyd]*/, 'tag'],
            [/[A-Za-z]{1,6}#[0-9]*/, 'tag'],
            [/\%(I|Q|M)(X|B|W|D|L)[0-9\.]*/, 'tag'],
            [/\%(I|Q|M)[0-9\.]*/, 'tag'],
            [/(TO_|CTU_|CTD_|CTUD_|MUX_|SEL_)[A_Za-z]*/, 'predefined'],
            [/[A_Za-z]*(_TO_)[A_Za-z]*/, 'predefined'],
            // identifiers and keywords
            [/[a-zA-Z_]\w*/, {
                    cases: {
                        '@operators': 'operators',
                        '@keywords': 'keyword',
                        '@typeKeywords': 'type',
                        '@defineKeywords': 'variable',
                        '@constant': 'constant',
                        '@builtinVariables': 'predefined',
                        '@builtinFunctions': 'predefined',
                        '@default': 'identifier'
                    }
                }],
            { include: '@whitespace' },
            [/[;.]/, 'delimiter'],
            [/[{}()\[\]]/, '@brackets'],
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/16#[0-9a-fA-F]+/, 'number.hex'],
            [/2#[0-9_]+/, 'number.binary'],
            [/\d+/, 'number'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string_dq' }],
            [/'/, { token: 'string.quote', bracket: '@open', next: '@string_sq' }],
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            ["\\*/", 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        comment2: [
            [/[^\(*]+/, 'comment'],
            [/\(\*/, 'comment', '@push'],
            ["\\*\\)", 'comment', '@pop'],
            [/[\(*]/, 'comment']
        ],
        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],
            [/\(\*/, 'comment', '@comment2'],
        ],
        string_dq: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],
        string_sq: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvc3Qvc3QuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDTjtBQUNQO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLFdBQVcsS0FBSztBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMsOENBQThDO0FBQ3ZELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsc0RBQXNEO0FBQy9ELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMsb0RBQW9EO0FBQzdELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsMENBQTBDO0FBQ25ELFNBQVM7QUFDVDtBQUNBO0FBQ0EsU0FBUyxTQUFTLFlBQVksR0FBRztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHNEQUFzRDtBQUMvRCxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLGdEQUFnRDtBQUN6RCxTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLG1DQUFtQyxZQUFZLEdBQUc7QUFDM0QsU0FBUyx3REFBd0Q7QUFDakUsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw4Q0FBOEMsSUFBSSxjQUFjLEVBQUUsY0FBYyxFQUFFO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsdUJBQXVCLElBQUk7QUFDM0I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakIsYUFBYSx5QkFBeUI7QUFDdEMsZ0JBQWdCO0FBQ2hCLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsbUJBQW1CLDhEQUE4RDtBQUNqRixtQkFBbUIsOERBQThEO0FBQ2pGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxtQkFBbUIseURBQXlEO0FBQzVFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxtQkFBbUIseURBQXlEO0FBQzVFO0FBQ0E7QUFDQSIsImZpbGUiOiI1Mi5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnLy8nLFxyXG4gICAgICAgIGJsb2NrQ29tbWVudDogWycoKicsICcqKSddLFxyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgWyd7JywgJ30nXSxcclxuICAgICAgICBbJ1snLCAnXSddLFxyXG4gICAgICAgIFsnKCcsICcpJ10sXHJcbiAgICAgICAgWyd2YXInLCAnZW5kX3ZhciddLFxyXG4gICAgICAgIFsndmFyX2lucHV0JywgJ2VuZF92YXInXSxcclxuICAgICAgICBbJ3Zhcl9vdXRwdXQnLCAnZW5kX3ZhciddLFxyXG4gICAgICAgIFsndmFyX2luX291dCcsICdlbmRfdmFyJ10sXHJcbiAgICAgICAgWyd2YXJfdGVtcCcsICdlbmRfdmFyJ10sXHJcbiAgICAgICAgWyd2YXJfZ2xvYmFsJywgJ2VuZF92YXInXSxcclxuICAgICAgICBbJ3Zhcl9hY2Nlc3MnLCAnZW5kX3ZhciddLFxyXG4gICAgICAgIFsndmFyX2V4dGVybmFsJywgJ2VuZF92YXInXSxcclxuICAgICAgICBbJ3R5cGUnLCAnZW5kX3R5cGUnXSxcclxuICAgICAgICBbJ3N0cnVjdCcsICdlbmRfc3RydWN0J10sXHJcbiAgICAgICAgWydwcm9ncmFtJywgJ2VuZF9wcm9ncmFtJ10sXHJcbiAgICAgICAgWydmdW5jdGlvbicsICdlbmRfZnVuY3Rpb24nXSxcclxuICAgICAgICBbJ2Z1bmN0aW9uX2Jsb2NrJywgJ2VuZF9mdW5jdGlvbl9ibG9jayddLFxyXG4gICAgICAgIFsnYWN0aW9uJywgJ2VuZF9hY3Rpb24nXSxcclxuICAgICAgICBbJ3N0ZXAnLCAnZW5kX3N0ZXAnXSxcclxuICAgICAgICBbJ2luaXRpYWxfc3RlcCcsICdlbmRfc3RlcCddLFxyXG4gICAgICAgIFsndHJhbnNhY3Rpb24nLCAnZW5kX3RyYW5zYWN0aW9uJ10sXHJcbiAgICAgICAgWydjb25maWd1cmF0aW9uJywgJ2VuZF9jb25maWd1cmF0aW9uJ10sXHJcbiAgICAgICAgWyd0Y3AnLCAnZW5kX3RjcCddLFxyXG4gICAgICAgIFsncmVjb3VyY2UnLCAnZW5kX3JlY291cmNlJ10sXHJcbiAgICAgICAgWydjaGFubmVsJywgJ2VuZF9jaGFubmVsJ10sXHJcbiAgICAgICAgWydsaWJyYXJ5JywgJ2VuZF9saWJyYXJ5J10sXHJcbiAgICAgICAgWydmb2xkZXInLCAnZW5kX2ZvbGRlciddLFxyXG4gICAgICAgIFsnYmluYXJpZXMnLCAnZW5kX2JpbmFyaWVzJ10sXHJcbiAgICAgICAgWydpbmNsdWRlcycsICdlbmRfaW5jbHVkZXMnXSxcclxuICAgICAgICBbJ3NvdXJjZXMnLCAnZW5kX3NvdXJjZXMnXVxyXG4gICAgXSxcclxuICAgIGF1dG9DbG9zaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICcvKicsIGNsb3NlOiAnKi8nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmdfc3EnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicsIG5vdEluOiBbJ3N0cmluZ19kcSddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyJywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9pbnB1dCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd2YXJfb3V0cHV0JywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9pbl9vdXQnLCBjbG9zZTogJ2VuZF92YXInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyX3RlbXAnLCBjbG9zZTogJ2VuZF92YXInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyX2dsb2JhbCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd2YXJfYWNjZXNzJywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9leHRlcm5hbCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd0eXBlJywgY2xvc2U6ICdlbmRfdHlwZScgfSxcclxuICAgICAgICB7IG9wZW46ICdzdHJ1Y3QnLCBjbG9zZTogJ2VuZF9zdHJ1Y3QnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAncHJvZ3JhbScsIGNsb3NlOiAnZW5kX3Byb2dyYW0nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnZnVuY3Rpb24nLCBjbG9zZTogJ2VuZF9mdW5jdGlvbicgfSxcclxuICAgICAgICB7IG9wZW46ICdmdW5jdGlvbl9ibG9jaycsIGNsb3NlOiAnZW5kX2Z1bmN0aW9uX2Jsb2NrJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2FjdGlvbicsIGNsb3NlOiAnZW5kX2FjdGlvbicgfSxcclxuICAgICAgICB7IG9wZW46ICdzdGVwJywgY2xvc2U6ICdlbmRfc3RlcCcgfSxcclxuICAgICAgICB7IG9wZW46ICdpbml0aWFsX3N0ZXAnLCBjbG9zZTogJ2VuZF9zdGVwJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3RyYW5zYWN0aW9uJywgY2xvc2U6ICdlbmRfdHJhbnNhY3Rpb24nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnY29uZmlndXJhdGlvbicsIGNsb3NlOiAnZW5kX2NvbmZpZ3VyYXRpb24nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndGNwJywgY2xvc2U6ICdlbmRfdGNwJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3JlY291cmNlJywgY2xvc2U6ICdlbmRfcmVjb3VyY2UnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnY2hhbm5lbCcsIGNsb3NlOiAnZW5kX2NoYW5uZWwnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnbGlicmFyeScsIGNsb3NlOiAnZW5kX2xpYnJhcnknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnZm9sZGVyJywgY2xvc2U6ICdlbmRfZm9sZGVyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2JpbmFyaWVzJywgY2xvc2U6ICdlbmRfYmluYXJpZXMnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnaW5jbHVkZXMnLCBjbG9zZTogJ2VuZF9pbmNsdWRlcycgfSxcclxuICAgICAgICB7IG9wZW46ICdzb3VyY2VzJywgY2xvc2U6ICdlbmRfc291cmNlcycgfVxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyJywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9pbnB1dCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd2YXJfb3V0cHV0JywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9pbl9vdXQnLCBjbG9zZTogJ2VuZF92YXInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyX3RlbXAnLCBjbG9zZTogJ2VuZF92YXInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndmFyX2dsb2JhbCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd2YXJfYWNjZXNzJywgY2xvc2U6ICdlbmRfdmFyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3Zhcl9leHRlcm5hbCcsIGNsb3NlOiAnZW5kX3ZhcicgfSxcclxuICAgICAgICB7IG9wZW46ICd0eXBlJywgY2xvc2U6ICdlbmRfdHlwZScgfSxcclxuICAgICAgICB7IG9wZW46ICdzdHJ1Y3QnLCBjbG9zZTogJ2VuZF9zdHJ1Y3QnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAncHJvZ3JhbScsIGNsb3NlOiAnZW5kX3Byb2dyYW0nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnZnVuY3Rpb24nLCBjbG9zZTogJ2VuZF9mdW5jdGlvbicgfSxcclxuICAgICAgICB7IG9wZW46ICdmdW5jdGlvbl9ibG9jaycsIGNsb3NlOiAnZW5kX2Z1bmN0aW9uX2Jsb2NrJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2FjdGlvbicsIGNsb3NlOiAnZW5kX2FjdGlvbicgfSxcclxuICAgICAgICB7IG9wZW46ICdzdGVwJywgY2xvc2U6ICdlbmRfc3RlcCcgfSxcclxuICAgICAgICB7IG9wZW46ICdpbml0aWFsX3N0ZXAnLCBjbG9zZTogJ2VuZF9zdGVwJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3RyYW5zYWN0aW9uJywgY2xvc2U6ICdlbmRfdHJhbnNhY3Rpb24nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnY29uZmlndXJhdGlvbicsIGNsb3NlOiAnZW5kX2NvbmZpZ3VyYXRpb24nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAndGNwJywgY2xvc2U6ICdlbmRfdGNwJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3JlY291cmNlJywgY2xvc2U6ICdlbmRfcmVjb3VyY2UnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnY2hhbm5lbCcsIGNsb3NlOiAnZW5kX2NoYW5uZWwnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnbGlicmFyeScsIGNsb3NlOiAnZW5kX2xpYnJhcnknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnZm9sZGVyJywgY2xvc2U6ICdlbmRfZm9sZGVyJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ2JpbmFyaWVzJywgY2xvc2U6ICdlbmRfYmluYXJpZXMnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnaW5jbHVkZXMnLCBjbG9zZTogJ2VuZF9pbmNsdWRlcycgfSxcclxuICAgICAgICB7IG9wZW46ICdzb3VyY2VzJywgY2xvc2U6ICdlbmRfc291cmNlcycgfVxyXG4gICAgXSxcclxuICAgIGZvbGRpbmc6IHtcclxuICAgICAgICBtYXJrZXJzOiB7XHJcbiAgICAgICAgICAgIHN0YXJ0OiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNwcmFnbWFcXFxccytyZWdpb25cXFxcYlwiKSxcclxuICAgICAgICAgICAgZW5kOiBuZXcgUmVnRXhwKFwiXlxcXFxzKiNwcmFnbWFcXFxccytlbmRyZWdpb25cXFxcYlwiKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuZXhwb3J0IHZhciBsYW5ndWFnZSA9IHtcclxuICAgIGRlZmF1bHRUb2tlbjogJycsXHJcbiAgICB0b2tlblBvc3RmaXg6ICcuc3QnLFxyXG4gICAgaWdub3JlQ2FzZTogdHJ1ZSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgeyB0b2tlbjogJ2RlbGltaXRlci5jdXJseScsIG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnLCBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IHRva2VuOiAnZGVsaW1pdGVyLnNxdWFyZScsIG9wZW46ICdbJywgY2xvc2U6ICddJyB9XHJcbiAgICBdLFxyXG4gICAga2V5d29yZHM6IFsnaWYnLCAnZW5kX2lmJywgJ2Vsc2lmJywgJ2Vsc2UnLCAnY2FzZScsICdvZicsICd0bycsXHJcbiAgICAgICAgJ2RvJywgJ3dpdGgnLCAnYnknLCAnd2hpbGUnLCAncmVwZWF0JywgJ2VuZF93aGlsZScsICdlbmRfcmVwZWF0JywgJ2VuZF9jYXNlJyxcclxuICAgICAgICAnZm9yJywgJ2VuZF9mb3InLCAndGFzaycsICdyZXRhaW4nLCAnbm9uX3JldGFpbicsICdjb25zdGFudCcsICd3aXRoJywgJ2F0JyxcclxuICAgICAgICAnZXhpdCcsICdyZXR1cm4nLCAnaW50ZXJ2YWwnLCAncHJpb3JpdHknLCAnYWRkcmVzcycsICdwb3J0JywgJ29uX2NoYW5uZWwnLFxyXG4gICAgICAgICd0aGVuJywgJ2llYycsICdmaWxlJywgJ3VzZXMnLCAndmVyc2lvbicsICdwYWNrYWdldHlwZScsICdkaXNwbGF5bmFtZScsXHJcbiAgICAgICAgJ2NvcHlyaWdodCcsICdzdW1tYXJ5JywgJ3ZlbmRvcicsICdjb21tb25fc291cmNlJywgJ2Zyb20nXSxcclxuICAgIGNvbnN0YW50OiBbJ2ZhbHNlJywgJ3RydWUnLCAnbnVsbCddLFxyXG4gICAgZGVmaW5lS2V5d29yZHM6IFtcclxuICAgICAgICAndmFyJywgJ3Zhcl9pbnB1dCcsICd2YXJfb3V0cHV0JywgJ3Zhcl9pbl9vdXQnLCAndmFyX3RlbXAnLCAndmFyX2dsb2JhbCcsXHJcbiAgICAgICAgJ3Zhcl9hY2Nlc3MnLCAndmFyX2V4dGVybmFsJywgJ2VuZF92YXInLFxyXG4gICAgICAgICd0eXBlJywgJ2VuZF90eXBlJywgJ3N0cnVjdCcsICdlbmRfc3RydWN0JywgJ3Byb2dyYW0nLCAnZW5kX3Byb2dyYW0nLFxyXG4gICAgICAgICdmdW5jdGlvbicsICdlbmRfZnVuY3Rpb24nLCAnZnVuY3Rpb25fYmxvY2snLCAnZW5kX2Z1bmN0aW9uX2Jsb2NrJyxcclxuICAgICAgICAnY29uZmlndXJhdGlvbicsICdlbmRfY29uZmlndXJhdGlvbicsICd0Y3AnLCAnZW5kX3RjcCcsICdyZWNvdXJjZScsXHJcbiAgICAgICAgJ2VuZF9yZWNvdXJjZScsICdjaGFubmVsJywgJ2VuZF9jaGFubmVsJywgJ2xpYnJhcnknLCAnZW5kX2xpYnJhcnknLFxyXG4gICAgICAgICdmb2xkZXInLCAnZW5kX2ZvbGRlcicsICdiaW5hcmllcycsICdlbmRfYmluYXJpZXMnLCAnaW5jbHVkZXMnLFxyXG4gICAgICAgICdlbmRfaW5jbHVkZXMnLCAnc291cmNlcycsICdlbmRfc291cmNlcycsXHJcbiAgICAgICAgJ2FjdGlvbicsICdlbmRfYWN0aW9uJywgJ3N0ZXAnLCAnaW5pdGlhbF9zdGVwJywgJ2VuZF9zdGVwJywgJ3RyYW5zYWN0aW9uJywgJ2VuZF90cmFuc2FjdGlvbidcclxuICAgIF0sXHJcbiAgICB0eXBlS2V5d29yZHM6IFsnaW50JywgJ3NpbnQnLCAnZGludCcsICdsaW50JywgJ3VzaW50JywgJ3VpbnQnLCAndWRpbnQnLCAndWxpbnQnLFxyXG4gICAgICAgICdyZWFsJywgJ2xyZWFsJywgJ3RpbWUnLCAnZGF0ZScsICd0aW1lX29mX2RheScsICdkYXRlX2FuZF90aW1lJywgJ3N0cmluZycsXHJcbiAgICAgICAgJ2Jvb2wnLCAnYnl0ZScsICd3b3JsZCcsICdkd29ybGQnLCAnYXJyYXknLCAncG9pbnRlcicsICdsd29ybGQnXSxcclxuICAgIG9wZXJhdG9yczogWyc9JywgJz4nLCAnPCcsICc6JywgJzo9JywgJzw9JywgJz49JywgJzw+JywgJyYnLCAnKycsICctJywgJyonLCAnKionLFxyXG4gICAgICAgICdNT0QnLCAnXicsICdvcicsICdhbmQnLCAnbm90JywgJ3hvcicsICdhYnMnLCAnYWNvcycsICdhc2luJywgJ2F0YW4nLCAnY29zJyxcclxuICAgICAgICAnZXhwJywgJ2V4cHQnLCAnbG4nLCAnbG9nJywgJ3NpbicsICdzcXJ0JywgJ3RhbicsICdzZWwnLCAnbWF4JywgJ21pbicsICdsaW1pdCcsXHJcbiAgICAgICAgJ211eCcsICdzaGwnLCAnc2hyJywgJ3JvbCcsICdyb3InLCAnaW5kZXhvZicsICdzaXplb2YnLCAnYWRyJywgJ2Fkcmluc3QnLFxyXG4gICAgICAgICdiaXRhZHInLCAnaXNfdmFsaWQnXSxcclxuICAgIGJ1aWx0aW5WYXJpYWJsZXM6IFtdLFxyXG4gICAgYnVpbHRpbkZ1bmN0aW9uczogWydzcicsICdycycsICd0cCcsICd0b24nLCAndG9mJywgJ2VxJywgJ2dlJywgJ2xlJywgJ2x0JyxcclxuICAgICAgICAnbmUnLCAncm91bmQnLCAndHJ1bmMnLCAnY3RkJywgJ9GBdHUnLCAnY3R1ZCcsICdyX3RyaWcnLCAnZl90cmlnJyxcclxuICAgICAgICAnbW92ZScsICdjb25jYXQnLCAnZGVsZXRlJywgJ2ZpbmQnLCAnaW5zZXJ0JywgJ2xlZnQnLCAnbGVuJywgJ3JlcGxhY2UnLFxyXG4gICAgICAgICdyaWdodCcsICdydGMnXSxcclxuICAgIC8vIHdlIGluY2x1ZGUgdGhlc2UgY29tbW9uIHJlZ3VsYXIgZXhwcmVzc2lvbnNcclxuICAgIHN5bWJvbHM6IC9bPT48IX4/OiZ8K1xcLSpcXC9cXF4lXSsvLFxyXG4gICAgLy8gQyMgc3R5bGUgc3RyaW5nc1xyXG4gICAgZXNjYXBlczogL1xcXFwoPzpbYWJmbnJ0dlxcXFxcIiddfHhbMC05QS1GYS1mXXsxLDR9fHVbMC05QS1GYS1mXXs0fXxVWzAtOUEtRmEtZl17OH0pLyxcclxuICAgIC8vIFRoZSBtYWluIHRva2VuaXplciBmb3Igb3VyIGxhbmd1YWdlc1xyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgcm9vdDogW1xyXG4gICAgICAgICAgICBbLyhUfERUfFRPRCkjWzAtOTotX3NobXlkXSovLCAndGFnJ10sXHJcbiAgICAgICAgICAgIFsvW0EtWmEtel17MSw2fSNbMC05XSovLCAndGFnJ10sXHJcbiAgICAgICAgICAgIFsvXFwlKEl8UXxNKShYfEJ8V3xEfEwpWzAtOVxcLl0qLywgJ3RhZyddLFxyXG4gICAgICAgICAgICBbL1xcJShJfFF8TSlbMC05XFwuXSovLCAndGFnJ10sXHJcbiAgICAgICAgICAgIFsvKFRPX3xDVFVffENURF98Q1RVRF98TVVYX3xTRUxfKVtBX1phLXpdKi8sICdwcmVkZWZpbmVkJ10sXHJcbiAgICAgICAgICAgIFsvW0FfWmEtel0qKF9UT18pW0FfWmEtel0qLywgJ3ByZWRlZmluZWQnXSxcclxuICAgICAgICAgICAgLy8gaWRlbnRpZmllcnMgYW5kIGtleXdvcmRzXHJcbiAgICAgICAgICAgIFsvW2EtekEtWl9dXFx3Ki8sIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQG9wZXJhdG9ycyc6ICdvcGVyYXRvcnMnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQHR5cGVLZXl3b3Jkcyc6ICd0eXBlJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZpbmVLZXl3b3Jkcyc6ICd2YXJpYWJsZScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAY29uc3RhbnQnOiAnY29uc3RhbnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGJ1aWx0aW5WYXJpYWJsZXMnOiAncHJlZGVmaW5lZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAYnVpbHRpbkZ1bmN0aW9ucyc6ICdwcmVkZWZpbmVkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0B3aGl0ZXNwYWNlJyB9LFxyXG4gICAgICAgICAgICBbL1s7Ll0vLCAnZGVsaW1pdGVyJ10sXHJcbiAgICAgICAgICAgIFsvW3t9KClcXFtcXF1dLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbL1xcZCpcXC5cXGQrKFtlRV1bXFwtK10/XFxkKyk/LywgJ251bWJlci5mbG9hdCddLFxyXG4gICAgICAgICAgICBbLzE2I1swLTlhLWZBLUZdKy8sICdudW1iZXIuaGV4J10sXHJcbiAgICAgICAgICAgIFsvMiNbMC05X10rLywgJ251bWJlci5iaW5hcnknXSxcclxuICAgICAgICAgICAgWy9cXGQrLywgJ251bWJlciddLFxyXG4gICAgICAgICAgICBbL1wiKFteXCJcXFxcXXxcXFxcLikqJC8sICdzdHJpbmcuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIGJyYWNrZXQ6ICdAb3BlbicsIG5leHQ6ICdAc3RyaW5nX2RxJyB9XSxcclxuICAgICAgICAgICAgWy8nLywgeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIGJyYWNrZXQ6ICdAb3BlbicsIG5leHQ6ICdAc3RyaW5nX3NxJyB9XSxcclxuICAgICAgICAgICAgWy8nW15cXFxcJ10nLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICBbLygnKShAZXNjYXBlcykoJykvLCBbJ3N0cmluZycsICdzdHJpbmcuZXNjYXBlJywgJ3N0cmluZyddXSxcclxuICAgICAgICAgICAgWy8nLywgJ3N0cmluZy5pbnZhbGlkJ11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGNvbW1lbnQ6IFtcclxuICAgICAgICAgICAgWy9bXlxcLypdKy8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwqLywgJ2NvbW1lbnQnLCAnQHB1c2gnXSxcclxuICAgICAgICAgICAgW1wiXFxcXCovXCIsICdjb21tZW50JywgJ0Bwb3AnXSxcclxuICAgICAgICAgICAgWy9bXFwvKl0vLCAnY29tbWVudCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICBjb21tZW50MjogW1xyXG4gICAgICAgICAgICBbL1teXFwoKl0rLywgJ2NvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXChcXCovLCAnY29tbWVudCcsICdAcHVzaCddLFxyXG4gICAgICAgICAgICBbXCJcXFxcKlxcXFwpXCIsICdjb21tZW50JywgJ0Bwb3AnXSxcclxuICAgICAgICAgICAgWy9bXFwoKl0vLCAnY29tbWVudCddXHJcbiAgICAgICAgXSxcclxuICAgICAgICB3aGl0ZXNwYWNlOiBbXHJcbiAgICAgICAgICAgIFsvWyBcXHRcXHJcXG5dKy8sICd3aGl0ZSddLFxyXG4gICAgICAgICAgICBbL1xcL1xcLy4qJC8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFwvXFwqLywgJ2NvbW1lbnQnLCAnQGNvbW1lbnQnXSxcclxuICAgICAgICAgICAgWy9cXChcXCovLCAnY29tbWVudCcsICdAY29tbWVudDInXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZ19kcTogW1xyXG4gICAgICAgICAgICBbL1teXFxcXFwiXSsvLCAnc3RyaW5nJ10sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnc3RyaW5nLmVzY2FwZSddLFxyXG4gICAgICAgICAgICBbL1xcXFwuLywgJ3N0cmluZy5lc2NhcGUuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL1wiLywgeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIGJyYWNrZXQ6ICdAY2xvc2UnLCBuZXh0OiAnQHBvcCcgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIHN0cmluZ19zcTogW1xyXG4gICAgICAgICAgICBbL1teXFxcXCddKy8sICdzdHJpbmcnXSxcclxuICAgICAgICAgICAgWy9AZXNjYXBlcy8sICdzdHJpbmcuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXC4vLCAnc3RyaW5nLmVzY2FwZS5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvJy8sIHsgdG9rZW46ICdzdHJpbmcucXVvdGUnLCBicmFja2V0OiAnQGNsb3NlJywgbmV4dDogJ0Bwb3AnIH1dXHJcbiAgICAgICAgXVxyXG4gICAgfVxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9