(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[48],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/ruby/ruby.js":
/*!************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/ruby/ruby.js ***!
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
    comments: {
        lineComment: '#',
        blockComment: ['=begin', '=end'],
    },
    brackets: [
        ['(', ')'],
        ['{', '}'],
        ['[', ']']
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
    ]
};
/*
 * Ruby language definition
 *
 * Quite a complex language due to elaborate escape sequences
 * and quoting of literate strings/regular expressions, and
 * an 'end' keyword that does not always apply to modifiers like until and while,
 * and a 'do' keyword that sometimes starts a block, but sometimes is part of
 * another statement (like 'while').
 *
 * (1) end blocks:
 * 'end' may end declarations like if or until, but sometimes 'if' or 'until'
 * are modifiers where there is no 'end'. Also, 'do' sometimes starts a block
 * that is ended by 'end', but sometimes it is part of a 'while', 'for', or 'until'
 * To do proper brace matching we do some elaborate state manipulation.
 * some examples:
 *
 *   until bla do
 *     work until tired
 *     list.each do
 *       something if test
 *     end
 *   end
 *
 * or
 *
 * if test
 *  something (if test then x end)
 *  bar if bla
 * end
 *
 * or, how about using class as a property..
 *
 * class Test
 *   def endpoint
 *     self.class.endpoint || routes
 *   end
 * end
 *
 * (2) quoting:
 * there are many kinds of strings and escape sequences. But also, one can
 * start many string-like things as '%qx' where q specifies the kind of string
 * (like a command, escape expanded, regular expression, symbol etc.), and x is
 * some character and only another 'x' ends the sequence. Except for brackets
 * where the closing bracket ends the sequence.. and except for a nested bracket
 * inside the string like entity. Also, such strings can contain interpolated
 * ruby expressions again (and span multiple lines). Moreover, expanded
 * regular expression can also contain comments.
 */
var language = {
    tokenPostfix: '.ruby',
    keywords: [
        '__LINE__', '__ENCODING__', '__FILE__', 'BEGIN', 'END', 'alias', 'and', 'begin',
        'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end',
        'ensure', 'for', 'false', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo',
        'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless',
        'until', 'when', 'while', 'yield',
    ],
    keywordops: [
        '::', '..', '...', '?', ':', '=>'
    ],
    builtins: [
        'require', 'public', 'private', 'include', 'extend', 'attr_reader',
        'protected', 'private_class_method', 'protected_class_method', 'new'
    ],
    // these are closed by 'end' (if, while and until are handled separately)
    declarations: [
        'module', 'class', 'def', 'case', 'do', 'begin', 'for', 'if', 'while', 'until', 'unless'
    ],
    linedecls: [
        'def', 'case', 'do', 'begin', 'for', 'if', 'while', 'until', 'unless'
    ],
    operators: [
        '^', '&', '|', '<=>', '==', '===', '!~', '=~', '>', '>=', '<', '<=', '<<', '>>', '+',
        '-', '*', '/', '%', '**', '~', '+@', '-@', '[]', '[]=', '`',
        '+=', '-=', '*=', '**=', '/=', '^=', '%=', '<<=', '>>=', '&=', '&&=', '||=', '|='
    ],
    brackets: [
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' }
    ],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%\.]+/,
    // escape sequences
    escape: /(?:[abefnrstv\\"'\n\r]|[0-7]{1,3}|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{4})/,
    escapes: /\\(?:C\-(@escape|.)|c(@escape|.)|@escape)/,
    decpart: /\d(_?\d)*/,
    decimal: /0|@decpart/,
    delim: /[^a-zA-Z0-9\s\n\r]/,
    heredelim: /(?:\w+|'[^']*'|"[^"]*"|`[^`]*`)/,
    regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
    regexpesc: /\\(?:[AzZbBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})?/,
    // The main tokenizer for our languages
    tokenizer: {
        // Main entry.
        // root.<decl> where decl is the current opening declaration (like 'class')
        root: [
            // identifiers and keywords
            // most complexity here is due to matching 'end' correctly with declarations.
            // We distinguish a declaration that comes first on a line, versus declarations further on a line (which are most likey modifiers)
            [/^(\s*)([a-z_]\w*[!?=]?)/, ['white',
                    {
                        cases: {
                            'for|until|while': { token: 'keyword.$2', next: '@dodecl.$2' },
                            '@declarations': { token: 'keyword.$2', next: '@root.$2' },
                            'end': { token: 'keyword.$S2', next: '@pop' },
                            '@keywords': 'keyword',
                            '@builtins': 'predefined',
                            '@default': 'identifier'
                        }
                    }]],
            [/[a-z_]\w*[!?=]?/,
                {
                    cases: {
                        'if|unless|while|until': { token: 'keyword.$0x', next: '@modifier.$0x' },
                        'for': { token: 'keyword.$2', next: '@dodecl.$2' },
                        '@linedecls': { token: 'keyword.$0', next: '@root.$0' },
                        'end': { token: 'keyword.$S2', next: '@pop' },
                        '@keywords': 'keyword',
                        '@builtins': 'predefined',
                        '@default': 'identifier'
                    }
                }],
            [/[A-Z][\w]*[!?=]?/, 'constructor.identifier'],
            [/\$[\w]*/, 'global.constant'],
            [/@[\w]*/, 'namespace.instance.identifier'],
            [/@@[\w]*/, 'namespace.class.identifier'],
            // here document
            [/<<[-~](@heredelim).*/, { token: 'string.heredoc.delimiter', next: '@heredoc.$1' }],
            [/[ \t\r\n]+<<(@heredelim).*/, { token: 'string.heredoc.delimiter', next: '@heredoc.$1' }],
            [/^<<(@heredelim).*/, { token: 'string.heredoc.delimiter', next: '@heredoc.$1' }],
            // whitespace
            { include: '@whitespace' },
            // strings
            [/"/, { token: 'string.d.delim', next: '@dstring.d."' }],
            [/'/, { token: 'string.sq.delim', next: '@sstring.sq' }],
            // % literals. For efficiency, rematch in the 'pstring' state
            [/%([rsqxwW]|Q?)/, { token: '@rematch', next: 'pstring' }],
            // commands and symbols
            [/`/, { token: 'string.x.delim', next: '@dstring.x.`' }],
            [/:(\w|[$@])\w*[!?=]?/, 'string.s'],
            [/:"/, { token: 'string.s.delim', next: '@dstring.s."' }],
            [/:'/, { token: 'string.s.delim', next: '@sstring.s' }],
            // regular expressions. Lookahead for a (not escaped) closing forwardslash on the same line
            [/\/(?=(\\\/|[^\/\n])+\/)/, { token: 'regexp.delim', next: '@regexp' }],
            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/@symbols/, {
                    cases: {
                        '@keywordops': 'keyword',
                        '@operators': 'operator',
                        '@default': ''
                    }
                }],
            [/[;,]/, 'delimiter'],
            // numbers
            [/0[xX][0-9a-fA-F](_?[0-9a-fA-F])*/, 'number.hex'],
            [/0[_oO][0-7](_?[0-7])*/, 'number.octal'],
            [/0[bB][01](_?[01])*/, 'number.binary'],
            [/0[dD]@decpart/, 'number'],
            [/@decimal((\.@decpart)?([eE][\-+]?@decpart)?)/, {
                    cases: {
                        '$1': 'number.float',
                        '@default': 'number'
                    }
                }],
        ],
        // used to not treat a 'do' as a block opener if it occurs on the same
        // line as a 'do' statement: 'while|until|for'
        // dodecl.<decl> where decl is the declarations started, like 'while'
        dodecl: [
            [/^/, { token: '', switchTo: '@root.$S2' }],
            [/[a-z_]\w*[!?=]?/, {
                    cases: {
                        'end': { token: 'keyword.$S2', next: '@pop' },
                        'do': { token: 'keyword', switchTo: '@root.$S2' },
                        '@linedecls': { token: '@rematch', switchTo: '@root.$S2' },
                        '@keywords': 'keyword',
                        '@builtins': 'predefined',
                        '@default': 'identifier'
                    }
                }],
            { include: '@root' }
        ],
        // used to prevent potential modifiers ('if|until|while|unless') to match
        // with 'end' keywords.
        // modifier.<decl>x where decl is the declaration starter, like 'if'
        modifier: [
            [/^/, '', '@pop'],
            [/[a-z_]\w*[!?=]?/, {
                    cases: {
                        'end': { token: 'keyword.$S2', next: '@pop' },
                        'then|else|elsif|do': { token: 'keyword', switchTo: '@root.$S2' },
                        '@linedecls': { token: '@rematch', switchTo: '@root.$S2' },
                        '@keywords': 'keyword',
                        '@builtins': 'predefined',
                        '@default': 'identifier'
                    }
                }],
            { include: '@root' }
        ],
        // single quote strings (also used for symbols)
        // sstring.<kind>  where kind is 'sq' (single quote) or 's' (symbol)
        sstring: [
            [/[^\\']+/, 'string.$S2'],
            [/\\\\|\\'|\\$/, 'string.$S2.escape'],
            [/\\./, 'string.$S2.invalid'],
            [/'/, { token: 'string.$S2.delim', next: '@pop' }]
        ],
        // double quoted "string".
        // dstring.<kind>.<delim> where kind is 'd' (double quoted), 'x' (command), or 's' (symbol)
        // and delim is the ending delimiter (" or `)
        dstring: [
            [/[^\\`"#]+/, 'string.$S2'],
            [/#/, 'string.$S2.escape', '@interpolated'],
            [/\\$/, 'string.$S2.escape'],
            [/@escapes/, 'string.$S2.escape'],
            [/\\./, 'string.$S2.escape.invalid'],
            [/[`"]/, {
                    cases: {
                        '$#==$S3': { token: 'string.$S2.delim', next: '@pop' },
                        '@default': 'string.$S2'
                    }
                }]
        ],
        // literal documents
        // heredoc.<close> where close is the closing delimiter
        heredoc: [
            [/^(\s*)(@heredelim)$/, {
                    cases: {
                        '$2==$S2': ['string.heredoc', { token: 'string.heredoc.delimiter', next: '@pop' }],
                        '@default': ['string.heredoc', 'string.heredoc']
                    }
                }],
            [/.*/, 'string.heredoc'],
        ],
        // interpolated sequence
        interpolated: [
            [/\$\w*/, 'global.constant', '@pop'],
            [/@\w*/, 'namespace.class.identifier', '@pop'],
            [/@@\w*/, 'namespace.instance.identifier', '@pop'],
            [/[{]/, { token: 'string.escape.curly', switchTo: '@interpolated_compound' }],
            ['', '', '@pop'],
        ],
        // any code
        interpolated_compound: [
            [/[}]/, { token: 'string.escape.curly', next: '@pop' }],
            { include: '@root' },
        ],
        // %r quoted regexp
        // pregexp.<open>.<close> where open/close are the open/close delimiter
        pregexp: [
            { include: '@whitespace' },
            // turns out that you can quote using regex control characters, aargh!
            // for example; %r|kgjgaj| is ok (even though | is used for alternation)
            // so, we need to match those first
            [/[^\(\{\[\\]/, {
                    cases: {
                        '$#==$S3': { token: 'regexp.delim', next: '@pop' },
                        '$#==$S2': { token: 'regexp.delim', next: '@push' },
                        '~[)}\\]]': '@brackets.regexp.escape.control',
                        '~@regexpctl': 'regexp.escape.control',
                        '@default': 'regexp'
                    }
                }],
            { include: '@regexcontrol' },
        ],
        // We match regular expression quite precisely
        regexp: [
            { include: '@regexcontrol' },
            [/[^\\\/]/, 'regexp'],
            ['/[ixmp]*', { token: 'regexp.delim' }, '@pop'],
        ],
        regexcontrol: [
            [/(\{)(\d+(?:,\d*)?)(\})/, ['@brackets.regexp.escape.control', 'regexp.escape.control', '@brackets.regexp.escape.control']],
            [/(\[)(\^?)/, ['@brackets.regexp.escape.control', { token: 'regexp.escape.control', next: '@regexrange' }]],
            [/(\()(\?[:=!])/, ['@brackets.regexp.escape.control', 'regexp.escape.control']],
            [/\(\?#/, { token: 'regexp.escape.control', next: '@regexpcomment' }],
            [/[()]/, '@brackets.regexp.escape.control'],
            [/@regexpctl/, 'regexp.escape.control'],
            [/\\$/, 'regexp.escape'],
            [/@regexpesc/, 'regexp.escape'],
            [/\\\./, 'regexp.invalid'],
            [/#/, 'regexp.escape', '@interpolated'],
        ],
        regexrange: [
            [/-/, 'regexp.escape.control'],
            [/\^/, 'regexp.invalid'],
            [/\\$/, 'regexp.escape'],
            [/@regexpesc/, 'regexp.escape'],
            [/[^\]]/, 'regexp'],
            [/\]/, '@brackets.regexp.escape.control', '@pop'],
        ],
        regexpcomment: [
            [/[^)]+/, 'comment'],
            [/\)/, { token: 'regexp.escape.control', next: '@pop' }]
        ],
        // % quoted strings
        // A bit repetitive since we need to often special case the kind of ending delimiter
        pstring: [
            [/%([qws])\(/, { token: 'string.$1.delim', switchTo: '@qstring.$1.(.)' }],
            [/%([qws])\[/, { token: 'string.$1.delim', switchTo: '@qstring.$1.[.]' }],
            [/%([qws])\{/, { token: 'string.$1.delim', switchTo: '@qstring.$1.{.}' }],
            [/%([qws])</, { token: 'string.$1.delim', switchTo: '@qstring.$1.<.>' }],
            [/%([qws])(@delim)/, { token: 'string.$1.delim', switchTo: '@qstring.$1.$2.$2' }],
            [/%r\(/, { token: 'regexp.delim', switchTo: '@pregexp.(.)' }],
            [/%r\[/, { token: 'regexp.delim', switchTo: '@pregexp.[.]' }],
            [/%r\{/, { token: 'regexp.delim', switchTo: '@pregexp.{.}' }],
            [/%r</, { token: 'regexp.delim', switchTo: '@pregexp.<.>' }],
            [/%r(@delim)/, { token: 'regexp.delim', switchTo: '@pregexp.$1.$1' }],
            [/%(x|W|Q?)\(/, { token: 'string.$1.delim', switchTo: '@qqstring.$1.(.)' }],
            [/%(x|W|Q?)\[/, { token: 'string.$1.delim', switchTo: '@qqstring.$1.[.]' }],
            [/%(x|W|Q?)\{/, { token: 'string.$1.delim', switchTo: '@qqstring.$1.{.}' }],
            [/%(x|W|Q?)</, { token: 'string.$1.delim', switchTo: '@qqstring.$1.<.>' }],
            [/%(x|W|Q?)(@delim)/, { token: 'string.$1.delim', switchTo: '@qqstring.$1.$2.$2' }],
            [/%([rqwsxW]|Q?)./, { token: 'invalid', next: '@pop' }],
            [/./, { token: 'invalid', next: '@pop' }],
        ],
        // non-expanded quoted string.
        // qstring.<kind>.<open>.<close>
        //  kind = q|w|s  (single quote, array, symbol)
        //  open = open delimiter
        //  close = close delimiter
        qstring: [
            [/\\$/, 'string.$S2.escape'],
            [/\\./, 'string.$S2.escape'],
            [/./, {
                    cases: {
                        '$#==$S4': { token: 'string.$S2.delim', next: '@pop' },
                        '$#==$S3': { token: 'string.$S2.delim', next: '@push' },
                        '@default': 'string.$S2'
                    }
                }],
        ],
        // expanded quoted string.
        // qqstring.<kind>.<open>.<close>
        //  kind = Q|W|x  (double quote, array, command)
        //  open = open delimiter
        //  close = close delimiter
        qqstring: [
            [/#/, 'string.$S2.escape', '@interpolated'],
            { include: '@qstring' }
        ],
        // whitespace & comments
        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/^\s*=begin\b/, 'comment', '@comment'],
            [/#.*$/, 'comment'],
        ],
        comment: [
            [/[^=]+/, 'comment'],
            [/^\s*=begin\b/, 'comment.invalid'],
            [/^\s*=end\b.*/, 'comment', '@pop'],
            [/[=]/, 'comment']
        ],
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvcnVieS9ydWJ5LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNhO0FBQ047QUFDUDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBLFdBQVcsS0FBSztBQUNoQjtBQUNBO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DO0FBQ0E7QUFDQSxTQUFTLFNBQVMsWUFBWSxHQUFHO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyx3REFBd0Q7QUFDakUsU0FBUyxTQUFTLFlB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RjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLCtDQUErQztBQUNuRTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDRCQUE0Qix3REFBd0Q7QUFDcEYsNEJBQTRCLHdEQUF3RDtBQUNwRix3QkFBd0IsSUFBSSxtREFBbUQsRUFBRSxHQUFHO0FBQ3BGLDJCQUEyQix3REFBd0Q7QUFDbkYsa0NBQWtDLDBEQUEwRDtBQUM1RixzQkFBc0Isa0RBQWtEO0FBQ3hFLHNCQUFzQixrREFBa0Q7QUFDeEUsa0JBQWtCLElBQUksNkNBQTZDLEVBQUUsR0FBRztBQUN4RSxxQkFBcUIsa0RBQWtEO0FBQ3ZFLDRCQUE0QixvREFBb0Q7QUFDaEYsNkJBQTZCLHlEQUF5RDtBQUN0Riw2QkFBNkIseURBQXlEO0FBQ3RGLHlCQUF5QixJQUFJLG9EQUFvRCxFQUFFLEdBQUc7QUFDdEYsNEJBQTRCLHlEQUF5RDtBQUNyRixtQ0FBbUMsMkRBQTJEO0FBQzlGLGlDQUFpQyxpQ0FBaUM7QUFDbEUsbUJBQW1CLGlDQUFpQztBQUNwRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0NBQW9DLDBDQUEwQztBQUM5RSxvQ0FBb0MsMkNBQTJDO0FBQy9FO0FBQ0E7QUFDQSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiNDguYnVuZGxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbid1c2Ugc3RyaWN0JztcclxuZXhwb3J0IHZhciBjb25mID0ge1xyXG4gICAgY29tbWVudHM6IHtcclxuICAgICAgICBsaW5lQ29tbWVudDogJyMnLFxyXG4gICAgICAgIGJsb2NrQ29tbWVudDogWyc9YmVnaW4nLCAnPWVuZCddLFxyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgWycoJywgJyknXSxcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ11cclxuICAgIF0sXHJcbiAgICBhdXRvQ2xvc2luZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJyB9LFxyXG4gICAgXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtcclxuICAgICAgICB7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcclxuICAgICAgICB7IG9wZW46ICdcIicsIGNsb3NlOiAnXCInIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXHJcbiAgICBdXHJcbn07XHJcbi8qXHJcbiAqIFJ1YnkgbGFuZ3VhZ2UgZGVmaW5pdGlvblxyXG4gKlxyXG4gKiBRdWl0ZSBhIGNvbXBsZXggbGFuZ3VhZ2UgZHVlIHRvIGVsYWJvcmF0ZSBlc2NhcGUgc2VxdWVuY2VzXHJcbiAqIGFuZCBxdW90aW5nIG9mIGxpdGVyYXRlIHN0cmluZ3MvcmVndWxhciBleHByZXNzaW9ucywgYW5kXHJcbiAqIGFuICdlbmQnIGtleXdvcmQgdGhhdCBkb2VzIG5vdCBhbHdheXMgYXBwbHkgdG8gbW9kaWZpZXJzIGxpa2UgdW50aWwgYW5kIHdoaWxlLFxyXG4gKiBhbmQgYSAnZG8nIGtleXdvcmQgdGhhdCBzb21ldGltZXMgc3RhcnRzIGEgYmxvY2ssIGJ1dCBzb21ldGltZXMgaXMgcGFydCBvZlxyXG4gKiBhbm90aGVyIHN0YXRlbWVudCAobGlrZSAnd2hpbGUnKS5cclxuICpcclxuICogKDEpIGVuZCBibG9ja3M6XHJcbiAqICdlbmQnIG1heSBlbmQgZGVjbGFyYXRpb25zIGxpa2UgaWYgb3IgdW50aWwsIGJ1dCBzb21ldGltZXMgJ2lmJyBvciAndW50aWwnXHJcbiAqIGFyZSBtb2RpZmllcnMgd2hlcmUgdGhlcmUgaXMgbm8gJ2VuZCcuIEFsc28sICdkbycgc29tZXRpbWVzIHN0YXJ0cyBhIGJsb2NrXHJcbiAqIHRoYXQgaXMgZW5kZWQgYnkgJ2VuZCcsIGJ1dCBzb21ldGltZXMgaXQgaXMgcGFydCBvZiBhICd3aGlsZScsICdmb3InLCBvciAndW50aWwnXHJcbiAqIFRvIGRvIHByb3BlciBicmFjZSBtYXRjaGluZyB3ZSBkbyBzb21lIGVsYWJvcmF0ZSBzdGF0ZSBtYW5pcHVsYXRpb24uXHJcbiAqIHNvbWUgZXhhbXBsZXM6XHJcbiAqXHJcbiAqICAgdW50aWwgYmxhIGRvXHJcbiAqICAgICB3b3JrIHVudGlsIHRpcmVkXHJcbiAqICAgICBsaXN0LmVhY2ggZG9cclxuICogICAgICAgc29tZXRoaW5nIGlmIHRlc3RcclxuICogICAgIGVuZFxyXG4gKiAgIGVuZFxyXG4gKlxyXG4gKiBvclxyXG4gKlxyXG4gKiBpZiB0ZXN0XHJcbiAqICBzb21ldGhpbmcgKGlmIHRlc3QgdGhlbiB4IGVuZClcclxuICogIGJhciBpZiBibGFcclxuICogZW5kXHJcbiAqXHJcbiAqIG9yLCBob3cgYWJvdXQgdXNpbmcgY2xhc3MgYXMgYSBwcm9wZXJ0eS4uXHJcbiAqXHJcbiAqIGNsYXNzIFRlc3RcclxuICogICBkZWYgZW5kcG9pbnRcclxuICogICAgIHNlbGYuY2xhc3MuZW5kcG9pbnQgfHwgcm91dGVzXHJcbiAqICAgZW5kXHJcbiAqIGVuZFxyXG4gKlxyXG4gKiAoMikgcXVvdGluZzpcclxuICogdGhlcmUgYXJlIG1hbnkga2luZHMgb2Ygc3RyaW5ncyBhbmQgZXNjYXBlIHNlcXVlbmNlcy4gQnV0IGFsc28sIG9uZSBjYW5cclxuICogc3RhcnQgbWFueSBzdHJpbmctbGlrZSB0aGluZ3MgYXMgJyVxeCcgd2hlcmUgcSBzcGVjaWZpZXMgdGhlIGtpbmQgb2Ygc3RyaW5nXHJcbiAqIChsaWtlIGEgY29tbWFuZCwgZXNjYXBlIGV4cGFuZGVkLCByZWd1bGFyIGV4cHJlc3Npb24sIHN5bWJvbCBldGMuKSwgYW5kIHggaXNcclxuICogc29tZSBjaGFyYWN0ZXIgYW5kIG9ubHkgYW5vdGhlciAneCcgZW5kcyB0aGUgc2VxdWVuY2UuIEV4Y2VwdCBmb3IgYnJhY2tldHNcclxuICogd2hlcmUgdGhlIGNsb3NpbmcgYnJhY2tldCBlbmRzIHRoZSBzZXF1ZW5jZS4uIGFuZCBleGNlcHQgZm9yIGEgbmVzdGVkIGJyYWNrZXRcclxuICogaW5zaWRlIHRoZSBzdHJpbmcgbGlrZSBlbnRpdHkuIEFsc28sIHN1Y2ggc3RyaW5ncyBjYW4gY29udGFpbiBpbnRlcnBvbGF0ZWRcclxuICogcnVieSBleHByZXNzaW9ucyBhZ2FpbiAoYW5kIHNwYW4gbXVsdGlwbGUgbGluZXMpLiBNb3Jlb3ZlciwgZXhwYW5kZWRcclxuICogcmVndWxhciBleHByZXNzaW9uIGNhbiBhbHNvIGNvbnRhaW4gY29tbWVudHMuXHJcbiAqL1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgdG9rZW5Qb3N0Zml4OiAnLnJ1YnknLFxyXG4gICAga2V5d29yZHM6IFtcclxuICAgICAgICAnX19MSU5FX18nLCAnX19FTkNPRElOR19fJywgJ19fRklMRV9fJywgJ0JFR0lOJywgJ0VORCcsICdhbGlhcycsICdhbmQnLCAnYmVnaW4nLFxyXG4gICAgICAgICdicmVhaycsICdjYXNlJywgJ2NsYXNzJywgJ2RlZicsICdkZWZpbmVkPycsICdkbycsICdlbHNlJywgJ2Vsc2lmJywgJ2VuZCcsXHJcbiAgICAgICAgJ2Vuc3VyZScsICdmb3InLCAnZmFsc2UnLCAnaWYnLCAnaW4nLCAnbW9kdWxlJywgJ25leHQnLCAnbmlsJywgJ25vdCcsICdvcicsICdyZWRvJyxcclxuICAgICAgICAncmVzY3VlJywgJ3JldHJ5JywgJ3JldHVybicsICdzZWxmJywgJ3N1cGVyJywgJ3RoZW4nLCAndHJ1ZScsICd1bmRlZicsICd1bmxlc3MnLFxyXG4gICAgICAgICd1bnRpbCcsICd3aGVuJywgJ3doaWxlJywgJ3lpZWxkJyxcclxuICAgIF0sXHJcbiAgICBrZXl3b3Jkb3BzOiBbXHJcbiAgICAgICAgJzo6JywgJy4uJywgJy4uLicsICc/JywgJzonLCAnPT4nXHJcbiAgICBdLFxyXG4gICAgYnVpbHRpbnM6IFtcclxuICAgICAgICAncmVxdWlyZScsICdwdWJsaWMnLCAncHJpdmF0ZScsICdpbmNsdWRlJywgJ2V4dGVuZCcsICdhdHRyX3JlYWRlcicsXHJcbiAgICAgICAgJ3Byb3RlY3RlZCcsICdwcml2YXRlX2NsYXNzX21ldGhvZCcsICdwcm90ZWN0ZWRfY2xhc3NfbWV0aG9kJywgJ25ldydcclxuICAgIF0sXHJcbiAgICAvLyB0aGVzZSBhcmUgY2xvc2VkIGJ5ICdlbmQnIChpZiwgd2hpbGUgYW5kIHVudGlsIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHkpXHJcbiAgICBkZWNsYXJhdGlvbnM6IFtcclxuICAgICAgICAnbW9kdWxlJywgJ2NsYXNzJywgJ2RlZicsICdjYXNlJywgJ2RvJywgJ2JlZ2luJywgJ2ZvcicsICdpZicsICd3aGlsZScsICd1bnRpbCcsICd1bmxlc3MnXHJcbiAgICBdLFxyXG4gICAgbGluZWRlY2xzOiBbXHJcbiAgICAgICAgJ2RlZicsICdjYXNlJywgJ2RvJywgJ2JlZ2luJywgJ2ZvcicsICdpZicsICd3aGlsZScsICd1bnRpbCcsICd1bmxlc3MnXHJcbiAgICBdLFxyXG4gICAgb3BlcmF0b3JzOiBbXHJcbiAgICAgICAgJ14nLCAnJicsICd8JywgJzw9PicsICc9PScsICc9PT0nLCAnIX4nLCAnPX4nLCAnPicsICc+PScsICc8JywgJzw9JywgJzw8JywgJz4+JywgJysnLFxyXG4gICAgICAgICctJywgJyonLCAnLycsICclJywgJyoqJywgJ34nLCAnK0AnLCAnLUAnLCAnW10nLCAnW109JywgJ2AnLFxyXG4gICAgICAgICcrPScsICctPScsICcqPScsICcqKj0nLCAnLz0nLCAnXj0nLCAnJT0nLCAnPDw9JywgJz4+PScsICcmPScsICcmJj0nLCAnfHw9JywgJ3w9J1xyXG4gICAgXSxcclxuICAgIGJyYWNrZXRzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScsIHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nLCB0b2tlbjogJ2RlbGltaXRlci5jdXJseScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJywgdG9rZW46ICdkZWxpbWl0ZXIuc3F1YXJlJyB9XHJcbiAgICBdLFxyXG4gICAgLy8gd2UgaW5jbHVkZSB0aGVzZSBjb21tb24gcmVndWxhciBleHByZXNzaW9uc1xyXG4gICAgc3ltYm9sczogL1s9Pjwhfj86JnwrXFwtKlxcL1xcXiVcXC5dKy8sXHJcbiAgICAvLyBlc2NhcGUgc2VxdWVuY2VzXHJcbiAgICBlc2NhcGU6IC8oPzpbYWJlZm5yc3R2XFxcXFwiJ1xcblxccl18WzAtN117MSwzfXx4WzAtOUEtRmEtZl17MSwyfXx1WzAtOUEtRmEtZl17NH0pLyxcclxuICAgIGVzY2FwZXM6IC9cXFxcKD86Q1xcLShAZXNjYXBlfC4pfGMoQGVzY2FwZXwuKXxAZXNjYXBlKS8sXHJcbiAgICBkZWNwYXJ0OiAvXFxkKF8/XFxkKSovLFxyXG4gICAgZGVjaW1hbDogLzB8QGRlY3BhcnQvLFxyXG4gICAgZGVsaW06IC9bXmEtekEtWjAtOVxcc1xcblxccl0vLFxyXG4gICAgaGVyZWRlbGltOiAvKD86XFx3K3wnW14nXSonfFwiW15cIl0qXCJ8YFteYF0qYCkvLFxyXG4gICAgcmVnZXhwY3RsOiAvWygpe31cXFtcXF1cXCRcXF58XFwtKis/XFwuXS8sXHJcbiAgICByZWdleHBlc2M6IC9cXFxcKD86W0F6WmJCZERmbnJzdHZ3V24wXFxcXFxcL118QHJlZ2V4cGN0bHxjW0EtWl18eFswLTlhLWZBLUZdezJ9fHVbMC05YS1mQS1GXXs0fSk/LyxcclxuICAgIC8vIFRoZSBtYWluIHRva2VuaXplciBmb3Igb3VyIGxhbmd1YWdlc1xyXG4gICAgdG9rZW5pemVyOiB7XHJcbiAgICAgICAgLy8gTWFpbiBlbnRyeS5cclxuICAgICAgICAvLyByb290LjxkZWNsPiB3aGVyZSBkZWNsIGlzIHRoZSBjdXJyZW50IG9wZW5pbmcgZGVjbGFyYXRpb24gKGxpa2UgJ2NsYXNzJylcclxuICAgICAgICByb290OiBbXHJcbiAgICAgICAgICAgIC8vIGlkZW50aWZpZXJzIGFuZCBrZXl3b3Jkc1xyXG4gICAgICAgICAgICAvLyBtb3N0IGNvbXBsZXhpdHkgaGVyZSBpcyBkdWUgdG8gbWF0Y2hpbmcgJ2VuZCcgY29ycmVjdGx5IHdpdGggZGVjbGFyYXRpb25zLlxyXG4gICAgICAgICAgICAvLyBXZSBkaXN0aW5ndWlzaCBhIGRlY2xhcmF0aW9uIHRoYXQgY29tZXMgZmlyc3Qgb24gYSBsaW5lLCB2ZXJzdXMgZGVjbGFyYXRpb25zIGZ1cnRoZXIgb24gYSBsaW5lICh3aGljaCBhcmUgbW9zdCBsaWtleSBtb2RpZmllcnMpXHJcbiAgICAgICAgICAgIFsvXihcXHMqKShbYS16X11cXHcqWyE/PV0/KS8sIFsnd2hpdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdmb3J8dW50aWx8d2hpbGUnOiB7IHRva2VuOiAna2V5d29yZC4kMicsIG5leHQ6ICdAZG9kZWNsLiQyJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWNsYXJhdGlvbnMnOiB7IHRva2VuOiAna2V5d29yZC4kMicsIG5leHQ6ICdAcm9vdC4kMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdlbmQnOiB7IHRva2VuOiAna2V5d29yZC4kUzInLCBuZXh0OiAnQHBvcCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHMnOiAna2V5d29yZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQGJ1aWx0aW5zJzogJ3ByZWRlZmluZWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XV0sXHJcbiAgICAgICAgICAgIFsvW2Etel9dXFx3KlshPz1dPy8sXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2lmfHVubGVzc3x3aGlsZXx1bnRpbCc6IHsgdG9rZW46ICdrZXl3b3JkLiQweCcsIG5leHQ6ICdAbW9kaWZpZXIuJDB4JyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnZm9yJzogeyB0b2tlbjogJ2tleXdvcmQuJDInLCBuZXh0OiAnQGRvZGVjbC4kMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BsaW5lZGVjbHMnOiB7IHRva2VuOiAna2V5d29yZC4kMCcsIG5leHQ6ICdAcm9vdC4kMCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2VuZCc6IHsgdG9rZW46ICdrZXl3b3JkLiRTMicsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGJ1aWx0aW5zJzogJ3ByZWRlZmluZWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnaWRlbnRpZmllcidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgWy9bQS1aXVtcXHddKlshPz1dPy8sICdjb25zdHJ1Y3Rvci5pZGVudGlmaWVyJ10sXHJcbiAgICAgICAgICAgIFsvXFwkW1xcd10qLywgJ2dsb2JhbC5jb25zdGFudCddLFxyXG4gICAgICAgICAgICBbL0BbXFx3XSovLCAnbmFtZXNwYWNlLmluc3RhbmNlLmlkZW50aWZpZXInXSxcclxuICAgICAgICAgICAgWy9AQFtcXHddKi8sICduYW1lc3BhY2UuY2xhc3MuaWRlbnRpZmllciddLFxyXG4gICAgICAgICAgICAvLyBoZXJlIGRvY3VtZW50XHJcbiAgICAgICAgICAgIFsvPDxbLX5dKEBoZXJlZGVsaW0pLiovLCB7IHRva2VuOiAnc3RyaW5nLmhlcmVkb2MuZGVsaW1pdGVyJywgbmV4dDogJ0BoZXJlZG9jLiQxJyB9XSxcclxuICAgICAgICAgICAgWy9bIFxcdFxcclxcbl0rPDwoQGhlcmVkZWxpbSkuKi8sIHsgdG9rZW46ICdzdHJpbmcuaGVyZWRvYy5kZWxpbWl0ZXInLCBuZXh0OiAnQGhlcmVkb2MuJDEnIH1dLFxyXG4gICAgICAgICAgICBbL148PChAaGVyZWRlbGltKS4qLywgeyB0b2tlbjogJ3N0cmluZy5oZXJlZG9jLmRlbGltaXRlcicsIG5leHQ6ICdAaGVyZWRvYy4kMScgfV0sXHJcbiAgICAgICAgICAgIC8vIHdoaXRlc3BhY2VcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHdoaXRlc3BhY2UnIH0sXHJcbiAgICAgICAgICAgIC8vIHN0cmluZ3NcclxuICAgICAgICAgICAgWy9cIi8sIHsgdG9rZW46ICdzdHJpbmcuZC5kZWxpbScsIG5leHQ6ICdAZHN0cmluZy5kLlwiJyB9XSxcclxuICAgICAgICAgICAgWy8nLywgeyB0b2tlbjogJ3N0cmluZy5zcS5kZWxpbScsIG5leHQ6ICdAc3N0cmluZy5zcScgfV0sXHJcbiAgICAgICAgICAgIC8vICUgbGl0ZXJhbHMuIEZvciBlZmZpY2llbmN5LCByZW1hdGNoIGluIHRoZSAncHN0cmluZycgc3RhdGVcclxuICAgICAgICAgICAgWy8lKFtyc3F4d1ddfFE/KS8sIHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdwc3RyaW5nJyB9XSxcclxuICAgICAgICAgICAgLy8gY29tbWFuZHMgYW5kIHN5bWJvbHNcclxuICAgICAgICAgICAgWy9gLywgeyB0b2tlbjogJ3N0cmluZy54LmRlbGltJywgbmV4dDogJ0Bkc3RyaW5nLnguYCcgfV0sXHJcbiAgICAgICAgICAgIFsvOihcXHd8WyRAXSlcXHcqWyE/PV0/LywgJ3N0cmluZy5zJ10sXHJcbiAgICAgICAgICAgIFsvOlwiLywgeyB0b2tlbjogJ3N0cmluZy5zLmRlbGltJywgbmV4dDogJ0Bkc3RyaW5nLnMuXCInIH1dLFxyXG4gICAgICAgICAgICBbLzonLywgeyB0b2tlbjogJ3N0cmluZy5zLmRlbGltJywgbmV4dDogJ0Bzc3RyaW5nLnMnIH1dLFxyXG4gICAgICAgICAgICAvLyByZWd1bGFyIGV4cHJlc3Npb25zLiBMb29rYWhlYWQgZm9yIGEgKG5vdCBlc2NhcGVkKSBjbG9zaW5nIGZvcndhcmRzbGFzaCBvbiB0aGUgc2FtZSBsaW5lXHJcbiAgICAgICAgICAgIFsvXFwvKD89KFxcXFxcXC98W15cXC9cXG5dKStcXC8pLywgeyB0b2tlbjogJ3JlZ2V4cC5kZWxpbScsIG5leHQ6ICdAcmVnZXhwJyB9XSxcclxuICAgICAgICAgICAgLy8gZGVsaW1pdGVycyBhbmQgb3BlcmF0b3JzXHJcbiAgICAgICAgICAgIFsvW3t9KClcXFtcXF1dLywgJ0BicmFja2V0cyddLFxyXG4gICAgICAgICAgICBbL0BzeW1ib2xzLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZG9wcyc6ICdrZXl3b3JkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BvcGVyYXRvcnMnOiAnb3BlcmF0b3InLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICBbL1s7LF0vLCAnZGVsaW1pdGVyJ10sXHJcbiAgICAgICAgICAgIC8vIG51bWJlcnNcclxuICAgICAgICAgICAgWy8wW3hYXVswLTlhLWZBLUZdKF8/WzAtOWEtZkEtRl0pKi8sICdudW1iZXIuaGV4J10sXHJcbiAgICAgICAgICAgIFsvMFtfb09dWzAtN10oXz9bMC03XSkqLywgJ251bWJlci5vY3RhbCddLFxyXG4gICAgICAgICAgICBbLzBbYkJdWzAxXShfP1swMV0pKi8sICdudW1iZXIuYmluYXJ5J10sXHJcbiAgICAgICAgICAgIFsvMFtkRF1AZGVjcGFydC8sICdudW1iZXInXSxcclxuICAgICAgICAgICAgWy9AZGVjaW1hbCgoXFwuQGRlY3BhcnQpPyhbZUVdW1xcLStdP0BkZWNwYXJ0KT8pLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICckMSc6ICdudW1iZXIuZmxvYXQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnbnVtYmVyJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gdXNlZCB0byBub3QgdHJlYXQgYSAnZG8nIGFzIGEgYmxvY2sgb3BlbmVyIGlmIGl0IG9jY3VycyBvbiB0aGUgc2FtZVxyXG4gICAgICAgIC8vIGxpbmUgYXMgYSAnZG8nIHN0YXRlbWVudDogJ3doaWxlfHVudGlsfGZvcidcclxuICAgICAgICAvLyBkb2RlY2wuPGRlY2w+IHdoZXJlIGRlY2wgaXMgdGhlIGRlY2xhcmF0aW9ucyBzdGFydGVkLCBsaWtlICd3aGlsZSdcclxuICAgICAgICBkb2RlY2w6IFtcclxuICAgICAgICAgICAgWy9eLywgeyB0b2tlbjogJycsIHN3aXRjaFRvOiAnQHJvb3QuJFMyJyB9XSxcclxuICAgICAgICAgICAgWy9bYS16X11cXHcqWyE/PV0/Lywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdlbmQnOiB7IHRva2VuOiAna2V5d29yZC4kUzInLCBuZXh0OiAnQHBvcCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2RvJzogeyB0b2tlbjogJ2tleXdvcmQnLCBzd2l0Y2hUbzogJ0Byb290LiRTMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BsaW5lZGVjbHMnOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBzd2l0Y2hUbzogJ0Byb290LiRTMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6ICdrZXl3b3JkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BidWlsdGlucyc6ICdwcmVkZWZpbmVkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0Byb290JyB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyB1c2VkIHRvIHByZXZlbnQgcG90ZW50aWFsIG1vZGlmaWVycyAoJ2lmfHVudGlsfHdoaWxlfHVubGVzcycpIHRvIG1hdGNoXHJcbiAgICAgICAgLy8gd2l0aCAnZW5kJyBrZXl3b3Jkcy5cclxuICAgICAgICAvLyBtb2RpZmllci48ZGVjbD54IHdoZXJlIGRlY2wgaXMgdGhlIGRlY2xhcmF0aW9uIHN0YXJ0ZXIsIGxpa2UgJ2lmJ1xyXG4gICAgICAgIG1vZGlmaWVyOiBbXHJcbiAgICAgICAgICAgIFsvXi8sICcnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1thLXpfXVxcdypbIT89XT8vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2VuZCc6IHsgdG9rZW46ICdrZXl3b3JkLiRTMicsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAndGhlbnxlbHNlfGVsc2lmfGRvJzogeyB0b2tlbjogJ2tleXdvcmQnLCBzd2l0Y2hUbzogJ0Byb290LiRTMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BsaW5lZGVjbHMnOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBzd2l0Y2hUbzogJ0Byb290LiRTMicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6ICdrZXl3b3JkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BidWlsdGlucyc6ICdwcmVkZWZpbmVkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogJ2lkZW50aWZpZXInXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfV0sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0Byb290JyB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBzaW5nbGUgcXVvdGUgc3RyaW5ncyAoYWxzbyB1c2VkIGZvciBzeW1ib2xzKVxyXG4gICAgICAgIC8vIHNzdHJpbmcuPGtpbmQ+ICB3aGVyZSBraW5kIGlzICdzcScgKHNpbmdsZSBxdW90ZSkgb3IgJ3MnIChzeW1ib2wpXHJcbiAgICAgICAgc3N0cmluZzogW1xyXG4gICAgICAgICAgICBbL1teXFxcXCddKy8sICdzdHJpbmcuJFMyJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXFxcXFx8XFxcXCd8XFxcXCQvLCAnc3RyaW5nLiRTMi5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuJFMyLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy8nLywgeyB0b2tlbjogJ3N0cmluZy4kUzIuZGVsaW0nLCBuZXh0OiAnQHBvcCcgfV1cclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIGRvdWJsZSBxdW90ZWQgXCJzdHJpbmdcIi5cclxuICAgICAgICAvLyBkc3RyaW5nLjxraW5kPi48ZGVsaW0+IHdoZXJlIGtpbmQgaXMgJ2QnIChkb3VibGUgcXVvdGVkKSwgJ3gnIChjb21tYW5kKSwgb3IgJ3MnIChzeW1ib2wpXHJcbiAgICAgICAgLy8gYW5kIGRlbGltIGlzIHRoZSBlbmRpbmcgZGVsaW1pdGVyIChcIiBvciBgKVxyXG4gICAgICAgIGRzdHJpbmc6IFtcclxuICAgICAgICAgICAgWy9bXlxcXFxgXCIjXSsvLCAnc3RyaW5nLiRTMiddLFxyXG4gICAgICAgICAgICBbLyMvLCAnc3RyaW5nLiRTMi5lc2NhcGUnLCAnQGludGVycG9sYXRlZCddLFxyXG4gICAgICAgICAgICBbL1xcXFwkLywgJ3N0cmluZy4kUzIuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvQGVzY2FwZXMvLCAnc3RyaW5nLiRTMi5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuJFMyLmVzY2FwZS5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvW2BcIl0vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQjPT0kUzMnOiB7IHRva2VuOiAnc3RyaW5nLiRTMi5kZWxpbScsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnc3RyaW5nLiRTMidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gbGl0ZXJhbCBkb2N1bWVudHNcclxuICAgICAgICAvLyBoZXJlZG9jLjxjbG9zZT4gd2hlcmUgY2xvc2UgaXMgdGhlIGNsb3NpbmcgZGVsaW1pdGVyXHJcbiAgICAgICAgaGVyZWRvYzogW1xyXG4gICAgICAgICAgICBbL14oXFxzKikoQGhlcmVkZWxpbSkkLywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICckMj09JFMyJzogWydzdHJpbmcuaGVyZWRvYycsIHsgdG9rZW46ICdzdHJpbmcuaGVyZWRvYy5kZWxpbWl0ZXInLCBuZXh0OiAnQHBvcCcgfV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IFsnc3RyaW5nLmhlcmVkb2MnLCAnc3RyaW5nLmhlcmVkb2MnXVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICBbLy4qLywgJ3N0cmluZy5oZXJlZG9jJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBpbnRlcnBvbGF0ZWQgc2VxdWVuY2VcclxuICAgICAgICBpbnRlcnBvbGF0ZWQ6IFtcclxuICAgICAgICAgICAgWy9cXCRcXHcqLywgJ2dsb2JhbC5jb25zdGFudCcsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvQFxcdyovLCAnbmFtZXNwYWNlLmNsYXNzLmlkZW50aWZpZXInLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL0BAXFx3Ki8sICduYW1lc3BhY2UuaW5zdGFuY2UuaWRlbnRpZmllcicsICdAcG9wJ10sXHJcbiAgICAgICAgICAgIFsvW3tdLywgeyB0b2tlbjogJ3N0cmluZy5lc2NhcGUuY3VybHknLCBzd2l0Y2hUbzogJ0BpbnRlcnBvbGF0ZWRfY29tcG91bmQnIH1dLFxyXG4gICAgICAgICAgICBbJycsICcnLCAnQHBvcCddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gYW55IGNvZGVcclxuICAgICAgICBpbnRlcnBvbGF0ZWRfY29tcG91bmQ6IFtcclxuICAgICAgICAgICAgWy9bfV0vLCB7IHRva2VuOiAnc3RyaW5nLmVzY2FwZS5jdXJseScsIG5leHQ6ICdAcG9wJyB9XSxcclxuICAgICAgICAgICAgeyBpbmNsdWRlOiAnQHJvb3QnIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyAlciBxdW90ZWQgcmVnZXhwXHJcbiAgICAgICAgLy8gcHJlZ2V4cC48b3Blbj4uPGNsb3NlPiB3aGVyZSBvcGVuL2Nsb3NlIGFyZSB0aGUgb3Blbi9jbG9zZSBkZWxpbWl0ZXJcclxuICAgICAgICBwcmVnZXhwOiBbXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0B3aGl0ZXNwYWNlJyB9LFxyXG4gICAgICAgICAgICAvLyB0dXJucyBvdXQgdGhhdCB5b3UgY2FuIHF1b3RlIHVzaW5nIHJlZ2V4IGNvbnRyb2wgY2hhcmFjdGVycywgYWFyZ2ghXHJcbiAgICAgICAgICAgIC8vIGZvciBleGFtcGxlOyAlcnxrZ2pnYWp8IGlzIG9rIChldmVuIHRob3VnaCB8IGlzIHVzZWQgZm9yIGFsdGVybmF0aW9uKVxyXG4gICAgICAgICAgICAvLyBzbywgd2UgbmVlZCB0byBtYXRjaCB0aG9zZSBmaXJzdFxyXG4gICAgICAgICAgICBbL1teXFwoXFx7XFxbXFxcXF0vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQjPT0kUzMnOiB7IHRva2VuOiAncmVnZXhwLmRlbGltJywgbmV4dDogJ0Bwb3AnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICckIz09JFMyJzogeyB0b2tlbjogJ3JlZ2V4cC5kZWxpbScsIG5leHQ6ICdAcHVzaCcgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ35bKX1cXFxcXV0nOiAnQGJyYWNrZXRzLnJlZ2V4cC5lc2NhcGUuY29udHJvbCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd+QHJlZ2V4cGN0bCc6ICdyZWdleHAuZXNjYXBlLmNvbnRyb2wnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAncmVnZXhwJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1dLFxyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAcmVnZXhjb250cm9sJyB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gV2UgbWF0Y2ggcmVndWxhciBleHByZXNzaW9uIHF1aXRlIHByZWNpc2VseVxyXG4gICAgICAgIHJlZ2V4cDogW1xyXG4gICAgICAgICAgICB7IGluY2x1ZGU6ICdAcmVnZXhjb250cm9sJyB9LFxyXG4gICAgICAgICAgICBbL1teXFxcXFxcL10vLCAncmVnZXhwJ10sXHJcbiAgICAgICAgICAgIFsnL1tpeG1wXSonLCB7IHRva2VuOiAncmVnZXhwLmRlbGltJyB9LCAnQHBvcCddLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVnZXhjb250cm9sOiBbXHJcbiAgICAgICAgICAgIFsvKFxceykoXFxkKyg/OixcXGQqKT8pKFxcfSkvLCBbJ0BicmFja2V0cy5yZWdleHAuZXNjYXBlLmNvbnRyb2wnLCAncmVnZXhwLmVzY2FwZS5jb250cm9sJywgJ0BicmFja2V0cy5yZWdleHAuZXNjYXBlLmNvbnRyb2wnXV0sXHJcbiAgICAgICAgICAgIFsvKFxcWykoXFxePykvLCBbJ0BicmFja2V0cy5yZWdleHAuZXNjYXBlLmNvbnRyb2wnLCB7IHRva2VuOiAncmVnZXhwLmVzY2FwZS5jb250cm9sJywgbmV4dDogJ0ByZWdleHJhbmdlJyB9XV0sXHJcbiAgICAgICAgICAgIFsvKFxcKCkoXFw/Wzo9IV0pLywgWydAYnJhY2tldHMucmVnZXhwLmVzY2FwZS5jb250cm9sJywgJ3JlZ2V4cC5lc2NhcGUuY29udHJvbCddXSxcclxuICAgICAgICAgICAgWy9cXChcXD8jLywgeyB0b2tlbjogJ3JlZ2V4cC5lc2NhcGUuY29udHJvbCcsIG5leHQ6ICdAcmVnZXhwY29tbWVudCcgfV0sXHJcbiAgICAgICAgICAgIFsvWygpXS8sICdAYnJhY2tldHMucmVnZXhwLmVzY2FwZS5jb250cm9sJ10sXHJcbiAgICAgICAgICAgIFsvQHJlZ2V4cGN0bC8sICdyZWdleHAuZXNjYXBlLmNvbnRyb2wnXSxcclxuICAgICAgICAgICAgWy9cXFxcJC8sICdyZWdleHAuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvQHJlZ2V4cGVzYy8sICdyZWdleHAuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvXFxcXFxcLi8sICdyZWdleHAuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbLyMvLCAncmVnZXhwLmVzY2FwZScsICdAaW50ZXJwb2xhdGVkJ10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZWdleHJhbmdlOiBbXHJcbiAgICAgICAgICAgIFsvLS8sICdyZWdleHAuZXNjYXBlLmNvbnRyb2wnXSxcclxuICAgICAgICAgICAgWy9cXF4vLCAncmVnZXhwLmludmFsaWQnXSxcclxuICAgICAgICAgICAgWy9cXFxcJC8sICdyZWdleHAuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvQHJlZ2V4cGVzYy8sICdyZWdleHAuZXNjYXBlJ10sXHJcbiAgICAgICAgICAgIFsvW15cXF1dLywgJ3JlZ2V4cCddLFxyXG4gICAgICAgICAgICBbL1xcXS8sICdAYnJhY2tldHMucmVnZXhwLmVzY2FwZS5jb250cm9sJywgJ0Bwb3AnXSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlZ2V4cGNvbW1lbnQ6IFtcclxuICAgICAgICAgICAgWy9bXildKy8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFwpLywgeyB0b2tlbjogJ3JlZ2V4cC5lc2NhcGUuY29udHJvbCcsIG5leHQ6ICdAcG9wJyB9XVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gJSBxdW90ZWQgc3RyaW5nc1xyXG4gICAgICAgIC8vIEEgYml0IHJlcGV0aXRpdmUgc2luY2Ugd2UgbmVlZCB0byBvZnRlbiBzcGVjaWFsIGNhc2UgdGhlIGtpbmQgb2YgZW5kaW5nIGRlbGltaXRlclxyXG4gICAgICAgIHBzdHJpbmc6IFtcclxuICAgICAgICAgICAgWy8lKFtxd3NdKVxcKC8sIHsgdG9rZW46ICdzdHJpbmcuJDEuZGVsaW0nLCBzd2l0Y2hUbzogJ0Bxc3RyaW5nLiQxLiguKScgfV0sXHJcbiAgICAgICAgICAgIFsvJShbcXdzXSlcXFsvLCB7IHRva2VuOiAnc3RyaW5nLiQxLmRlbGltJywgc3dpdGNoVG86ICdAcXN0cmluZy4kMS5bLl0nIH1dLFxyXG4gICAgICAgICAgICBbLyUoW3F3c10pXFx7LywgeyB0b2tlbjogJ3N0cmluZy4kMS5kZWxpbScsIHN3aXRjaFRvOiAnQHFzdHJpbmcuJDEuey59JyB9XSxcclxuICAgICAgICAgICAgWy8lKFtxd3NdKTwvLCB7IHRva2VuOiAnc3RyaW5nLiQxLmRlbGltJywgc3dpdGNoVG86ICdAcXN0cmluZy4kMS48Lj4nIH1dLFxyXG4gICAgICAgICAgICBbLyUoW3F3c10pKEBkZWxpbSkvLCB7IHRva2VuOiAnc3RyaW5nLiQxLmRlbGltJywgc3dpdGNoVG86ICdAcXN0cmluZy4kMS4kMi4kMicgfV0sXHJcbiAgICAgICAgICAgIFsvJXJcXCgvLCB7IHRva2VuOiAncmVnZXhwLmRlbGltJywgc3dpdGNoVG86ICdAcHJlZ2V4cC4oLiknIH1dLFxyXG4gICAgICAgICAgICBbLyVyXFxbLywgeyB0b2tlbjogJ3JlZ2V4cC5kZWxpbScsIHN3aXRjaFRvOiAnQHByZWdleHAuWy5dJyB9XSxcclxuICAgICAgICAgICAgWy8lclxcey8sIHsgdG9rZW46ICdyZWdleHAuZGVsaW0nLCBzd2l0Y2hUbzogJ0BwcmVnZXhwLnsufScgfV0sXHJcbiAgICAgICAgICAgIFsvJXI8LywgeyB0b2tlbjogJ3JlZ2V4cC5kZWxpbScsIHN3aXRjaFRvOiAnQHByZWdleHAuPC4+JyB9XSxcclxuICAgICAgICAgICAgWy8lcihAZGVsaW0pLywgeyB0b2tlbjogJ3JlZ2V4cC5kZWxpbScsIHN3aXRjaFRvOiAnQHByZWdleHAuJDEuJDEnIH1dLFxyXG4gICAgICAgICAgICBbLyUoeHxXfFE/KVxcKC8sIHsgdG9rZW46ICdzdHJpbmcuJDEuZGVsaW0nLCBzd2l0Y2hUbzogJ0BxcXN0cmluZy4kMS4oLiknIH1dLFxyXG4gICAgICAgICAgICBbLyUoeHxXfFE/KVxcWy8sIHsgdG9rZW46ICdzdHJpbmcuJDEuZGVsaW0nLCBzd2l0Y2hUbzogJ0BxcXN0cmluZy4kMS5bLl0nIH1dLFxyXG4gICAgICAgICAgICBbLyUoeHxXfFE/KVxcey8sIHsgdG9rZW46ICdzdHJpbmcuJDEuZGVsaW0nLCBzd2l0Y2hUbzogJ0BxcXN0cmluZy4kMS57Ln0nIH1dLFxyXG4gICAgICAgICAgICBbLyUoeHxXfFE/KTwvLCB7IHRva2VuOiAnc3RyaW5nLiQxLmRlbGltJywgc3dpdGNoVG86ICdAcXFzdHJpbmcuJDEuPC4+JyB9XSxcclxuICAgICAgICAgICAgWy8lKHh8V3xRPykoQGRlbGltKS8sIHsgdG9rZW46ICdzdHJpbmcuJDEuZGVsaW0nLCBzd2l0Y2hUbzogJ0BxcXN0cmluZy4kMS4kMi4kMicgfV0sXHJcbiAgICAgICAgICAgIFsvJShbcnF3c3hXXXxRPykuLywgeyB0b2tlbjogJ2ludmFsaWQnLCBuZXh0OiAnQHBvcCcgfV0sXHJcbiAgICAgICAgICAgIFsvLi8sIHsgdG9rZW46ICdpbnZhbGlkJywgbmV4dDogJ0Bwb3AnIH1dLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gbm9uLWV4cGFuZGVkIHF1b3RlZCBzdHJpbmcuXHJcbiAgICAgICAgLy8gcXN0cmluZy48a2luZD4uPG9wZW4+LjxjbG9zZT5cclxuICAgICAgICAvLyAga2luZCA9IHF8d3xzICAoc2luZ2xlIHF1b3RlLCBhcnJheSwgc3ltYm9sKVxyXG4gICAgICAgIC8vICBvcGVuID0gb3BlbiBkZWxpbWl0ZXJcclxuICAgICAgICAvLyAgY2xvc2UgPSBjbG9zZSBkZWxpbWl0ZXJcclxuICAgICAgICBxc3RyaW5nOiBbXHJcbiAgICAgICAgICAgIFsvXFxcXCQvLCAnc3RyaW5nLiRTMi5lc2NhcGUnXSxcclxuICAgICAgICAgICAgWy9cXFxcLi8sICdzdHJpbmcuJFMyLmVzY2FwZSddLFxyXG4gICAgICAgICAgICBbLy4vLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyQjPT0kUzQnOiB7IHRva2VuOiAnc3RyaW5nLiRTMi5kZWxpbScsIG5leHQ6ICdAcG9wJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnJCM9PSRTMyc6IHsgdG9rZW46ICdzdHJpbmcuJFMyLmRlbGltJywgbmV4dDogJ0BwdXNoJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnc3RyaW5nLiRTMidcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIC8vIGV4cGFuZGVkIHF1b3RlZCBzdHJpbmcuXHJcbiAgICAgICAgLy8gcXFzdHJpbmcuPGtpbmQ+LjxvcGVuPi48Y2xvc2U+XHJcbiAgICAgICAgLy8gIGtpbmQgPSBRfFd8eCAgKGRvdWJsZSBxdW90ZSwgYXJyYXksIGNvbW1hbmQpXHJcbiAgICAgICAgLy8gIG9wZW4gPSBvcGVuIGRlbGltaXRlclxyXG4gICAgICAgIC8vICBjbG9zZSA9IGNsb3NlIGRlbGltaXRlclxyXG4gICAgICAgIHFxc3RyaW5nOiBbXHJcbiAgICAgICAgICAgIFsvIy8sICdzdHJpbmcuJFMyLmVzY2FwZScsICdAaW50ZXJwb2xhdGVkJ10sXHJcbiAgICAgICAgICAgIHsgaW5jbHVkZTogJ0Bxc3RyaW5nJyB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyB3aGl0ZXNwYWNlICYgY29tbWVudHNcclxuICAgICAgICB3aGl0ZXNwYWNlOiBbXHJcbiAgICAgICAgICAgIFsvWyBcXHRcXHJcXG5dKy8sICcnXSxcclxuICAgICAgICAgICAgWy9eXFxzKj1iZWdpblxcYi8sICdjb21tZW50JywgJ0Bjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvIy4qJC8sICdjb21tZW50J10sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBjb21tZW50OiBbXHJcbiAgICAgICAgICAgIFsvW149XSsvLCAnY29tbWVudCddLFxyXG4gICAgICAgICAgICBbL15cXHMqPWJlZ2luXFxiLywgJ2NvbW1lbnQuaW52YWxpZCddLFxyXG4gICAgICAgICAgICBbL15cXHMqPWVuZFxcYi4qLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1s9XS8sICdjb21tZW50J11cclxuICAgICAgICBdLFxyXG4gICAgfVxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9