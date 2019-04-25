(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[44],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/postiats/postiats.js":
/*!********************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/postiats/postiats.js ***!
  \********************************************************************************/
/*! exports provided: conf, language */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "conf", function() { return conf; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "language", function() { return language; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Artyom Shalkhakov. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Based on the ATS/Postiats lexer by Hongwei Xi.
 *--------------------------------------------------------------------------------------------*/

var conf = {
    comments: {
        lineComment: '//',
        blockComment: ['(*', '*)'],
    },
    brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
    autoClosingPairs: [
        { open: '"', close: '"', notIn: ['string', 'comment'] },
        { open: '{', close: '}', notIn: ['string', 'comment'] },
        { open: '[', close: ']', notIn: ['string', 'comment'] },
        { open: '(', close: ')', notIn: ['string', 'comment'] },
    ]
};
var language = {
    tokenPostfix: '.pats',
    // TODO: staload and dynload are followed by a special kind of string literals
    // with {$IDENTIFER} variables, and it also may make sense to highlight
    // the punctuation (. and / and \) differently.
    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: 'invalid',
    // keyword reference: https://github.com/githwxi/ATS-Postiats/blob/master/src/pats_lexing_token.dats
    keywords: [
        //
        "abstype",
        "abst0ype",
        "absprop",
        "absview",
        "absvtype",
        "absviewtype",
        "absvt0ype",
        "absviewt0ype",
        //
        "as",
        //
        "and",
        //
        "assume",
        //
        "begin",
        //
        /*
                "case", // CASE
        */
        //
        "classdec",
        //
        "datasort",
        //
        "datatype",
        "dataprop",
        "dataview",
        "datavtype",
        "dataviewtype",
        //
        "do",
        //
        "end",
        //
        "extern",
        "extype",
        "extvar",
        //
        "exception",
        //
        "fn",
        "fnx",
        "fun",
        //
        "prfn",
        "prfun",
        //
        "praxi",
        "castfn",
        //
        "if",
        "then",
        "else",
        //
        "ifcase",
        //
        "in",
        //
        "infix",
        "infixl",
        "infixr",
        "prefix",
        "postfix",
        //
        "implmnt",
        "implement",
        //
        "primplmnt",
        "primplement",
        //
        "import",
        //
        /*
                "lam", // LAM
                "llam", // LLAM
                "fix", // FIX
        */
        //
        "let",
        //
        "local",
        //
        "macdef",
        "macrodef",
        //
        "nonfix",
        //
        "symelim",
        "symintr",
        "overload",
        //
        "of",
        "op",
        //
        "rec",
        //
        "sif",
        "scase",
        //
        "sortdef",
        /*
        // HX: [sta] is now deprecated
        */
        "sta",
        "stacst",
        "stadef",
        "static",
        /*
                "stavar", // T_STAVAR
        */
        //
        "staload",
        "dynload",
        //
        "try",
        //
        "tkindef",
        //
        /*
                "type", // TYPE
        */
        "typedef",
        "propdef",
        "viewdef",
        "vtypedef",
        "viewtypedef",
        //
        /*
                "val", // VAL
        */
        "prval",
        //
        "var",
        "prvar",
        //
        "when",
        "where",
        //
        /*
                "for", // T_FOR
                "while", // T_WHILE
        */
        //
        "with",
        //
        "withtype",
        "withprop",
        "withview",
        "withvtype",
        "withviewtype",
    ],
    keywords_dlr: [
        "$delay",
        "$ldelay",
        //
        "$arrpsz",
        "$arrptrsize",
        //
        "$d2ctype",
        //
        "$effmask",
        "$effmask_ntm",
        "$effmask_exn",
        "$effmask_ref",
        "$effmask_wrt",
        "$effmask_all",
        //
        "$extern",
        "$extkind",
        "$extype",
        "$extype_struct",
        //
        "$extval",
        "$extfcall",
        "$extmcall",
        //
        "$literal",
        //
        "$myfilename",
        "$mylocation",
        "$myfunction",
        //
        "$lst",
        "$lst_t",
        "$lst_vt",
        "$list",
        "$list_t",
        "$list_vt",
        //
        "$rec",
        "$rec_t",
        "$rec_vt",
        "$record",
        "$record_t",
        "$record_vt",
        //
        "$tup",
        "$tup_t",
        "$tup_vt",
        "$tuple",
        "$tuple_t",
        "$tuple_vt",
        //
        "$break",
        "$continue",
        //
        "$raise",
        //
        "$showtype",
        //
        "$vcopyenv_v",
        "$vcopyenv_vt",
        //
        "$tempenver",
        //
        "$solver_assert",
        "$solver_verify",
    ],
    keywords_srp: [
        //
        "#if",
        "#ifdef",
        "#ifndef",
        //
        "#then",
        //
        "#elif",
        "#elifdef",
        "#elifndef",
        //
        "#else",
        "#endif",
        //
        "#error",
        //
        "#prerr",
        "#print",
        //
        "#assert",
        //
        "#undef",
        "#define",
        //
        "#include",
        "#require",
        //
        "#pragma",
        "#codegen2",
        "#codegen3",
    ],
    irregular_keyword_list: [
        "val+",
        "val-",
        "val",
        "case+",
        "case-",
        "case",
        "addr@",
        "addr",
        "fold@",
        "free@",
        "fix@",
        "fix",
        "lam@",
        "lam",
        "llam@",
        "llam",
        "viewt@ype+",
        "viewt@ype-",
        "viewt@ype",
        "viewtype+",
        "viewtype-",
        "viewtype",
        "view+",
        "view-",
        "view@",
        "view",
        "type+",
        "type-",
        "type",
        "vtype+",
        "vtype-",
        "vtype",
        "vt@ype+",
        "vt@ype-",
        "vt@ype",
        "viewt@ype+",
        "viewt@ype-",
        "viewt@ype",
        "viewtype+",
        "viewtype-",
        "viewtype",
        "prop+",
        "prop-",
        "prop",
        "type+",
        "type-",
        "type",
        "t@ype",
        "t@ype+",
        "t@ype-",
        "abst@ype",
        "abstype",
        "absviewt@ype",
        "absvt@ype",
        "for*",
        "for",
        "while*",
        "while"
    ],
    keywords_types: [
        'bool',
        'double',
        'byte',
        'int',
        'short',
        'char',
        'void',
        'unit',
        'long',
        'float',
        'string',
        'strptr'
    ],
    // TODO: reference for this?
    keywords_effects: [
        "0",
        "fun",
        "clo",
        "prf",
        "funclo",
        "cloptr",
        "cloref",
        "ref",
        "ntm",
        "1" // all effects
    ],
    operators: [
        "@",
        "!",
        "|",
        "`",
        ":",
        "$",
        ".",
        "=",
        "#",
        "~",
        //
        "..",
        "...",
        //
        "=>",
        // "=<", // T_EQLT
        "=<>",
        "=/=>",
        "=>>",
        "=/=>>",
        //
        "<",
        ">",
        //
        "><",
        //
        ".<",
        ">.",
        //
        ".<>.",
        //
        "->",
        //"-<", // T_MINUSLT
        "-<>",
    ],
    brackets: [
        { open: ',(', close: ')', token: 'delimiter.parenthesis' },
        { open: '`(', close: ')', token: 'delimiter.parenthesis' },
        { open: '%(', close: ')', token: 'delimiter.parenthesis' },
        { open: '\'(', close: ')', token: 'delimiter.parenthesis' },
        { open: '\'{', close: '}', token: 'delimiter.parenthesis' },
        { open: '@(', close: ')', token: 'delimiter.parenthesis' },
        { open: '@{', close: '}', token: 'delimiter.brace' },
        { open: '@[', close: ']', token: 'delimiter.square' },
        { open: '#[', close: ']', token: 'delimiter.square' },
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '<', close: '>', token: 'delimiter.angle' }
    ],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    IDENTFST: /[a-zA-Z_]/,
    IDENTRST: /[a-zA-Z0-9_'$]/,
    symbolic: /[%&+-./:=@~`^|*!$#?<>]/,
    digit: /[0-9]/,
    digitseq0: /@digit*/,
    xdigit: /[0-9A-Za-z]/,
    xdigitseq0: /@xdigit*/,
    INTSP: /[lLuU]/,
    FLOATSP: /[fFlL]/,
    fexponent: /[eE][+-]?[0-9]+/,
    fexponent_bin: /[pP][+-]?[0-9]+/,
    deciexp: /\.[0-9]*@fexponent?/,
    hexiexp: /\.[0-9a-zA-Z]*@fexponent_bin?/,
    irregular_keywords: /val[+-]?|case[+-]?|addr\@?|fold\@|free\@|fix\@?|lam\@?|llam\@?|prop[+-]?|type[+-]?|view[+-@]?|viewt@?ype[+-]?|t@?ype[+-]?|v(iew)?t@?ype[+-]?|abst@?ype|absv(iew)?t@?ype|for\*?|while\*?/,
    ESCHAR: /[ntvbrfa\\\?'"\(\[\{]/,
    start: 'root',
    // The main tokenizer for ATS/Postiats
    // reference: https://github.com/githwxi/ATS-Postiats/blob/master/src/pats_lexing.dats
    tokenizer: {
        root: [
            // lexing_blankseq0
            { regex: /[ \t\r\n]+/, action: { token: '' } },
            // NOTE: (*) is an invalid ML-like comment!
            { regex: /\(\*\)/, action: { token: 'invalid' } },
            { regex: /\(\*/, action: { token: 'comment', next: 'lexing_COMMENT_block_ml' } },
            { regex: /\(/, action: '@brackets' /*{ token: 'delimiter.parenthesis' }*/ },
            { regex: /\)/, action: '@brackets' /*{ token: 'delimiter.parenthesis' }*/ },
            { regex: /\[/, action: '@brackets' /*{ token: 'delimiter.bracket' }*/ },
            { regex: /\]/, action: '@brackets' /*{ token: 'delimiter.bracket' }*/ },
            { regex: /\{/, action: '@brackets' /*{ token: 'delimiter.brace' }*/ },
            { regex: /\}/, action: '@brackets' /*{ token: 'delimiter.brace' }*/ },
            // lexing_COMMA
            { regex: /,\(/, action: '@brackets' /*{ token: 'delimiter.parenthesis' }*/ },
            { regex: /,/, action: { token: 'delimiter.comma' } },
            { regex: /;/, action: { token: 'delimiter.semicolon' } },
            // lexing_AT
            { regex: /@\(/, action: '@brackets' /* { token: 'delimiter.parenthesis' }*/ },
            { regex: /@\[/, action: '@brackets' /* { token: 'delimiter.bracket' }*/ },
            { regex: /@\{/, action: '@brackets' /*{ token: 'delimiter.brace' }*/ },
            // lexing_COLON
            { regex: /:</, action: { token: 'keyword', next: '@lexing_EFFECT_commaseq0' } },
            /*
            lexing_DOT:

            . // SYMBOLIC => lexing_IDENT_sym
            . FLOATDOT => lexing_FLOAT_deciexp
            . DIGIT => T_DOTINT
            */
            { regex: /\.@symbolic+/, action: { token: 'identifier.sym' } },
            // FLOATDOT case
            { regex: /\.@digit*@fexponent@FLOATSP*/, action: { token: 'number.float' } },
            { regex: /\.@digit+/, action: { token: 'number.float' } },
            // lexing_DOLLAR:
            // '$' IDENTFST IDENTRST* => lexing_IDENT_dlr, _ => lexing_IDENT_sym
            {
                regex: /\$@IDENTFST@IDENTRST*/,
                action: {
                    cases: {
                        '@keywords_dlr': { token: 'keyword.dlr' },
                        '@default': { token: 'namespace' },
                    }
                }
            },
            // lexing_SHARP:
            // '#' IDENTFST IDENTRST* => lexing_ident_srp, _ => lexing_IDENT_sym
            {
                regex: /\#@IDENTFST@IDENTRST*/,
                action: {
                    cases: {
                        '@keywords_srp': { token: 'keyword.srp' },
                        '@default': { token: 'identifier' },
                    }
                }
            },
            // lexing_PERCENT:
            { regex: /%\(/, action: { token: 'delimiter.parenthesis' } },
            { regex: /^%{(#|\^|\$)?/, action: { token: 'keyword', next: '@lexing_EXTCODE', nextEmbedded: 'text/javascript' } },
            { regex: /^%}/, action: { token: 'keyword' } },
            // lexing_QUOTE
            { regex: /'\(/, action: { token: 'delimiter.parenthesis' } },
            { regex: /'\[/, action: { token: 'delimiter.bracket' } },
            { regex: /'\{/, action: { token: 'delimiter.brace' } },
            [/(')(\\@ESCHAR|\\[xX]@xdigit+|\\@digit+)(')/, ['string', 'string.escape', 'string']],
            [/'[^\\']'/, 'string'],
            // lexing_DQUOTE
            [/"/, 'string.quote', '@lexing_DQUOTE'],
            // lexing_BQUOTE
            { regex: /`\(/, action: '@brackets' /* { token: 'delimiter.parenthesis' }*/ },
            // TODO: otherwise, try lexing_IDENT_sym
            { regex: /\\/, action: { token: 'punctuation' } },
            // lexing_IDENT_alp:
            // NOTE: (?!regex) is syntax for "not-followed-by" regex
            // to resolve ambiguity such as foreach$fwork being incorrectly lexed as [for] [each$fwork]!
            { regex: /@irregular_keywords(?!@IDENTRST)/, action: { token: 'keyword' } },
            {
                regex: /@IDENTFST@IDENTRST*[<!\[]?/,
                action: {
                    cases: {
                        // TODO: dynload and staload should be specially parsed
                        // dynload whitespace+ "special_string"
                        // this special string is really:
                        //  '/' '\\' '.' => punctuation
                        // ({\$)([a-zA-Z_][a-zA-Z_0-9]*)(}) => punctuation,keyword,punctuation
                        // [^"] => identifier/literal
                        '@keywords': { token: 'keyword' },
                        '@keywords_types': { token: 'type' },
                        '@default': { token: 'identifier' }
                    }
                }
            },
            // lexing_IDENT_sym:
            { regex: /\/\/\/\//, action: { token: 'comment', next: '@lexing_COMMENT_rest' } },
            { regex: /\/\/.*$/, action: { token: 'comment' } },
            { regex: /\/\*/, action: { token: 'comment', next: '@lexing_COMMENT_block_c' } },
            // AS-20160627: specifically for effect annotations
            { regex: /-<|=</, action: { token: 'keyword', next: '@lexing_EFFECT_commaseq0' } },
            {
                regex: /@symbolic+/,
                action: {
                    cases: {
                        '@operators': 'keyword',
                        '@default': 'operator'
                    }
                }
            },
            // lexing_ZERO:
            // FIXME: this one is quite messy/unfinished yet
            // TODO: lexing_INT_hex
            // - testing_hexiexp => lexing_FLOAT_hexiexp
            // - testing_fexponent_bin => lexing_FLOAT_hexiexp
            // - testing_intspseq0 => T_INT_hex
            // lexing_INT_hex:
            { regex: /0[xX]@xdigit+(@hexiexp|@fexponent_bin)@FLOATSP*/, action: { token: 'number.float' } },
            { regex: /0[xX]@xdigit+@INTSP*/, action: { token: 'number.hex' } },
            { regex: /0[0-7]+(?![0-9])@INTSP*/, action: { token: 'number.octal' } },
            //{regex: /0/, action: { token: 'number' } }, // INTZERO
            // lexing_INT_dec:
            // - testing_deciexp => lexing_FLOAT_deciexp
            // - testing_fexponent => lexing_FLOAT_deciexp
            // - otherwise => intspseq0 ([0-9]*[lLuU]?)
            { regex: /@digit+(@fexponent|@deciexp)@FLOATSP*/, action: { token: 'number.float' } },
            { regex: /@digit@digitseq0@INTSP*/, action: { token: 'number.decimal' } },
            // DIGIT, if followed by digitseq0, is lexing_INT_dec
            { regex: /@digit+@INTSP*/, action: { token: 'number' } },
        ],
        lexing_COMMENT_block_ml: [
            [/[^\(\*]+/, 'comment'],
            [/\(\*/, 'comment', '@push'],
            [/\(\*/, 'comment.invalid'],
            [/\*\)/, 'comment', '@pop'],
            [/\*/, 'comment']
        ],
        lexing_COMMENT_block_c: [
            [/[^\/*]+/, 'comment'],
            // [/\/\*/, 'comment', '@push' ],    // nested C-style block comments not allowed
            // [/\/\*/,    'comment.invalid' ],	// NOTE: this breaks block comments in the shape of /* //*/
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        lexing_COMMENT_rest: [
            [/$/, 'comment', '@pop'],
            [/.*/, 'comment']
        ],
        // NOTE: added by AS, specifically for highlighting
        lexing_EFFECT_commaseq0: [
            {
                regex: /@IDENTFST@IDENTRST+|@digit+/,
                action: {
                    cases: {
                        '@keywords_effects': { token: 'type.effect' },
                        '@default': { token: 'identifier' }
                    }
                }
            },
            { regex: /,/, action: { token: 'punctuation' } },
            { regex: />/, action: { token: '@rematch', next: '@pop' } },
        ],
        lexing_EXTCODE: [
            { regex: /^%}/, action: { token: '@rematch', next: '@pop', nextEmbedded: '@pop' } },
            { regex: /[^%]+/, action: '' },
        ],
        lexing_DQUOTE: [
            { regex: /"/, action: { token: 'string.quote', next: '@pop' } },
            // AS-20160628: additional hi-lighting for variables in staload/dynload strings
            { regex: /(\{\$)(@IDENTFST@IDENTRST*)(\})/, action: [{ token: 'string.escape' }, { token: 'identifier' }, { token: 'string.escape' }] },
            { regex: /\\$/, action: { token: 'string.escape' } },
            { regex: /\\(@ESCHAR|[xX]@xdigit+|@digit+)/, action: { token: 'string.escape' } },
            { regex: /[^\\"]+/, action: { token: 'string' } }
        ],
    },
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvcG9zdGlhdHMvcG9zdGlhdHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNhO0FBQ047QUFDUDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0wsa0JBQWtCLEtBQUs7QUFDdkI7QUFDQSxTQUFTLHNEQUFzRDtBQUMvRCxTQUFTLFNBQVMsWUFBWSxpQ0FBaUM7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0QsU0FBUyxzREFBc0Q7QUFDL0Q7QUFDQTtBQUNPO0FBQ1A7QUFDQTtBQUNBLGFBQWEsV0FBVztBQUN4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDhDQUE4Qyx1QkFBdUI7QUFDckUscUNBQXFDO0FBQ3JDO0FBQ0E7QUFDQSxhQUFhO0FBQ2IsYUFBYSxzQkFBc0IsdUJBQXVCLEVBQUU7QUFDNUQsYUFBYSxzQkFBc0Isa0NBQWtDLEVBQUU7QUFDdkU7QUFDQTtBQUNBLGFBQWEsWUFBWSxZQUFZLHdEQUF3RCxFQUFFO0FBQy9GLGFBQWEsNkJBQTZCO0FBQzFDO0FBQ0E7QUFDQSxhQUFhLHNCQUFzQixzQ0FBc0MsRUFBRTtBQUMzRTtBQUNBLGFBQWEsWUFBWSwyQkFBMkIsY0FBYyx5QkFBeUIsR0FBRyxzQkFBc0IsR0FBRyx5QkFBeUIsR0FBRztBQUNuSixhQUFhLHdCQUF3Qix5QkFBeUIsRUFBRTtBQUNoRSxhQUFhLHFEQUFxRCx5QkFBeUIsRUFBRTtBQUM3RixhQUFhLDRCQUE0QixrQkFBa0I7QUFDM0Q7QUFDQSxLQUFLO0FBQ0wiLCJmaWxlIjoiNDQuYnVuZGxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgQXJ0eW9tIFNoYWxraGFrb3YuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKlxyXG4gKiAgQmFzZWQgb24gdGhlIEFUUy9Qb3N0aWF0cyBsZXhlciBieSBIb25nd2VpIFhpLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnLy8nLFxyXG4gICAgICAgIGJsb2NrQ29tbWVudDogWycoKicsICcqKSddLFxyXG4gICAgfSxcclxuICAgIGJyYWNrZXRzOiBbWyd7JywgJ30nXSwgWydbJywgJ10nXSwgWycoJywgJyknXSwgWyc8JywgJz4nXV0sXHJcbiAgICBhdXRvQ2xvc2luZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcclxuICAgICAgICB7IG9wZW46ICcoJywgY2xvc2U6ICcpJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxyXG4gICAgXVxyXG59O1xyXG5leHBvcnQgdmFyIGxhbmd1YWdlID0ge1xyXG4gICAgdG9rZW5Qb3N0Zml4OiAnLnBhdHMnLFxyXG4gICAgLy8gVE9ETzogc3RhbG9hZCBhbmQgZHlubG9hZCBhcmUgZm9sbG93ZWQgYnkgYSBzcGVjaWFsIGtpbmQgb2Ygc3RyaW5nIGxpdGVyYWxzXHJcbiAgICAvLyB3aXRoIHskSURFTlRJRkVSfSB2YXJpYWJsZXMsIGFuZCBpdCBhbHNvIG1heSBtYWtlIHNlbnNlIHRvIGhpZ2hsaWdodFxyXG4gICAgLy8gdGhlIHB1bmN0dWF0aW9uICguIGFuZCAvIGFuZCBcXCkgZGlmZmVyZW50bHkuXHJcbiAgICAvLyBTZXQgZGVmYXVsdFRva2VuIHRvIGludmFsaWQgdG8gc2VlIHdoYXQgeW91IGRvIG5vdCB0b2tlbml6ZSB5ZXRcclxuICAgIGRlZmF1bHRUb2tlbjogJ2ludmFsaWQnLFxyXG4gICAgLy8ga2V5d29yZCByZWZlcmVuY2U6IGh0dHBzOi8vZ2l0aHViLmNvbS9naXRod3hpL0FUUy1Qb3N0aWF0cy9ibG9iL21hc3Rlci9zcmMvcGF0c19sZXhpbmdfdG9rZW4uZGF0c1xyXG4gICAga2V5d29yZHM6IFtcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiYWJzdHlwZVwiLFxyXG4gICAgICAgIFwiYWJzdDB5cGVcIixcclxuICAgICAgICBcImFic3Byb3BcIixcclxuICAgICAgICBcImFic3ZpZXdcIixcclxuICAgICAgICBcImFic3Z0eXBlXCIsXHJcbiAgICAgICAgXCJhYnN2aWV3dHlwZVwiLFxyXG4gICAgICAgIFwiYWJzdnQweXBlXCIsXHJcbiAgICAgICAgXCJhYnN2aWV3dDB5cGVcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiYXNcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiYW5kXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcImFzc3VtZVwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJiZWdpblwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgLypcclxuICAgICAgICAgICAgICAgIFwiY2FzZVwiLCAvLyBDQVNFXHJcbiAgICAgICAgKi9cclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiY2xhc3NkZWNcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiZGF0YXNvcnRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiZGF0YXR5cGVcIixcclxuICAgICAgICBcImRhdGFwcm9wXCIsXHJcbiAgICAgICAgXCJkYXRhdmlld1wiLFxyXG4gICAgICAgIFwiZGF0YXZ0eXBlXCIsXHJcbiAgICAgICAgXCJkYXRhdmlld3R5cGVcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiZG9cIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiZW5kXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcImV4dGVyblwiLFxyXG4gICAgICAgIFwiZXh0eXBlXCIsXHJcbiAgICAgICAgXCJleHR2YXJcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiZXhjZXB0aW9uXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcImZuXCIsXHJcbiAgICAgICAgXCJmbnhcIixcclxuICAgICAgICBcImZ1blwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJwcmZuXCIsXHJcbiAgICAgICAgXCJwcmZ1blwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJwcmF4aVwiLFxyXG4gICAgICAgIFwiY2FzdGZuXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcImlmXCIsXHJcbiAgICAgICAgXCJ0aGVuXCIsXHJcbiAgICAgICAgXCJlbHNlXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcImlmY2FzZVwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJpblwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJpbmZpeFwiLFxyXG4gICAgICAgIFwiaW5maXhsXCIsXHJcbiAgICAgICAgXCJpbmZpeHJcIixcclxuICAgICAgICBcInByZWZpeFwiLFxyXG4gICAgICAgIFwicG9zdGZpeFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJpbXBsbW50XCIsXHJcbiAgICAgICAgXCJpbXBsZW1lbnRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwicHJpbXBsbW50XCIsXHJcbiAgICAgICAgXCJwcmltcGxlbWVudFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJpbXBvcnRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgICAgICAgICBcImxhbVwiLCAvLyBMQU1cclxuICAgICAgICAgICAgICAgIFwibGxhbVwiLCAvLyBMTEFNXHJcbiAgICAgICAgICAgICAgICBcImZpeFwiLCAvLyBGSVhcclxuICAgICAgICAqL1xyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJsZXRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwibG9jYWxcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwibWFjZGVmXCIsXHJcbiAgICAgICAgXCJtYWNyb2RlZlwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJub25maXhcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwic3ltZWxpbVwiLFxyXG4gICAgICAgIFwic3ltaW50clwiLFxyXG4gICAgICAgIFwib3ZlcmxvYWRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwib2ZcIixcclxuICAgICAgICBcIm9wXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcInJlY1wiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJzaWZcIixcclxuICAgICAgICBcInNjYXNlXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcInNvcnRkZWZcIixcclxuICAgICAgICAvKlxyXG4gICAgICAgIC8vIEhYOiBbc3RhXSBpcyBub3cgZGVwcmVjYXRlZFxyXG4gICAgICAgICovXHJcbiAgICAgICAgXCJzdGFcIixcclxuICAgICAgICBcInN0YWNzdFwiLFxyXG4gICAgICAgIFwic3RhZGVmXCIsXHJcbiAgICAgICAgXCJzdGF0aWNcIixcclxuICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgXCJzdGF2YXJcIiwgLy8gVF9TVEFWQVJcclxuICAgICAgICAqL1xyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJzdGFsb2FkXCIsXHJcbiAgICAgICAgXCJkeW5sb2FkXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcInRyeVwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJ0a2luZGVmXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgXCJ0eXBlXCIsIC8vIFRZUEVcclxuICAgICAgICAqL1xyXG4gICAgICAgIFwidHlwZWRlZlwiLFxyXG4gICAgICAgIFwicHJvcGRlZlwiLFxyXG4gICAgICAgIFwidmlld2RlZlwiLFxyXG4gICAgICAgIFwidnR5cGVkZWZcIixcclxuICAgICAgICBcInZpZXd0eXBlZGVmXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgXCJ2YWxcIiwgLy8gVkFMXHJcbiAgICAgICAgKi9cclxuICAgICAgICBcInBydmFsXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcInZhclwiLFxyXG4gICAgICAgIFwicHJ2YXJcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwid2hlblwiLFxyXG4gICAgICAgIFwid2hlcmVcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgICAgICAgICBcImZvclwiLCAvLyBUX0ZPUlxyXG4gICAgICAgICAgICAgICAgXCJ3aGlsZVwiLCAvLyBUX1dISUxFXHJcbiAgICAgICAgKi9cclxuICAgICAgICAvL1xyXG4gICAgICAgIFwid2l0aFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCJ3aXRodHlwZVwiLFxyXG4gICAgICAgIFwid2l0aHByb3BcIixcclxuICAgICAgICBcIndpdGh2aWV3XCIsXHJcbiAgICAgICAgXCJ3aXRodnR5cGVcIixcclxuICAgICAgICBcIndpdGh2aWV3dHlwZVwiLFxyXG4gICAgXSxcclxuICAgIGtleXdvcmRzX2RscjogW1xyXG4gICAgICAgIFwiJGRlbGF5XCIsXHJcbiAgICAgICAgXCIkbGRlbGF5XCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIiRhcnJwc3pcIixcclxuICAgICAgICBcIiRhcnJwdHJzaXplXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIiRkMmN0eXBlXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIiRlZmZtYXNrXCIsXHJcbiAgICAgICAgXCIkZWZmbWFza19udG1cIixcclxuICAgICAgICBcIiRlZmZtYXNrX2V4blwiLFxyXG4gICAgICAgIFwiJGVmZm1hc2tfcmVmXCIsXHJcbiAgICAgICAgXCIkZWZmbWFza193cnRcIixcclxuICAgICAgICBcIiRlZmZtYXNrX2FsbFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkZXh0ZXJuXCIsXHJcbiAgICAgICAgXCIkZXh0a2luZFwiLFxyXG4gICAgICAgIFwiJGV4dHlwZVwiLFxyXG4gICAgICAgIFwiJGV4dHlwZV9zdHJ1Y3RcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiJGV4dHZhbFwiLFxyXG4gICAgICAgIFwiJGV4dGZjYWxsXCIsXHJcbiAgICAgICAgXCIkZXh0bWNhbGxcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiJGxpdGVyYWxcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiJG15ZmlsZW5hbWVcIixcclxuICAgICAgICBcIiRteWxvY2F0aW9uXCIsXHJcbiAgICAgICAgXCIkbXlmdW5jdGlvblwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkbHN0XCIsXHJcbiAgICAgICAgXCIkbHN0X3RcIixcclxuICAgICAgICBcIiRsc3RfdnRcIixcclxuICAgICAgICBcIiRsaXN0XCIsXHJcbiAgICAgICAgXCIkbGlzdF90XCIsXHJcbiAgICAgICAgXCIkbGlzdF92dFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkcmVjXCIsXHJcbiAgICAgICAgXCIkcmVjX3RcIixcclxuICAgICAgICBcIiRyZWNfdnRcIixcclxuICAgICAgICBcIiRyZWNvcmRcIixcclxuICAgICAgICBcIiRyZWNvcmRfdFwiLFxyXG4gICAgICAgIFwiJHJlY29yZF92dFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkdHVwXCIsXHJcbiAgICAgICAgXCIkdHVwX3RcIixcclxuICAgICAgICBcIiR0dXBfdnRcIixcclxuICAgICAgICBcIiR0dXBsZVwiLFxyXG4gICAgICAgIFwiJHR1cGxlX3RcIixcclxuICAgICAgICBcIiR0dXBsZV92dFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkYnJlYWtcIixcclxuICAgICAgICBcIiRjb250aW51ZVwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkcmFpc2VcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiJHNob3d0eXBlXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIiR2Y29weWVudl92XCIsXHJcbiAgICAgICAgXCIkdmNvcHllbnZfdnRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiJHRlbXBlbnZlclwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIkc29sdmVyX2Fzc2VydFwiLFxyXG4gICAgICAgIFwiJHNvbHZlcl92ZXJpZnlcIixcclxuICAgIF0sXHJcbiAgICBrZXl3b3Jkc19zcnA6IFtcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI2lmXCIsXHJcbiAgICAgICAgXCIjaWZkZWZcIixcclxuICAgICAgICBcIiNpZm5kZWZcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI3RoZW5cIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI2VsaWZcIixcclxuICAgICAgICBcIiNlbGlmZGVmXCIsXHJcbiAgICAgICAgXCIjZWxpZm5kZWZcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI2Vsc2VcIixcclxuICAgICAgICBcIiNlbmRpZlwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIjZXJyb3JcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI3ByZXJyXCIsXHJcbiAgICAgICAgXCIjcHJpbnRcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI2Fzc2VydFwiLFxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgXCIjdW5kZWZcIixcclxuICAgICAgICBcIiNkZWZpbmVcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiI2luY2x1ZGVcIixcclxuICAgICAgICBcIiNyZXF1aXJlXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIiNwcmFnbWFcIixcclxuICAgICAgICBcIiNjb2RlZ2VuMlwiLFxyXG4gICAgICAgIFwiI2NvZGVnZW4zXCIsXHJcbiAgICBdLFxyXG4gICAgaXJyZWd1bGFyX2tleXdvcmRfbGlzdDogW1xyXG4gICAgICAgIFwidmFsK1wiLFxyXG4gICAgICAgIFwidmFsLVwiLFxyXG4gICAgICAgIFwidmFsXCIsXHJcbiAgICAgICAgXCJjYXNlK1wiLFxyXG4gICAgICAgIFwiY2FzZS1cIixcclxuICAgICAgICBcImNhc2VcIixcclxuICAgICAgICBcImFkZHJAXCIsXHJcbiAgICAgICAgXCJhZGRyXCIsXHJcbiAgICAgICAgXCJmb2xkQFwiLFxyXG4gICAgICAgIFwiZnJlZUBcIixcclxuICAgICAgICBcImZpeEBcIixcclxuICAgICAgICBcImZpeFwiLFxyXG4gICAgICAgIFwibGFtQFwiLFxyXG4gICAgICAgIFwibGFtXCIsXHJcbiAgICAgICAgXCJsbGFtQFwiLFxyXG4gICAgICAgIFwibGxhbVwiLFxyXG4gICAgICAgIFwidmlld3RAeXBlK1wiLFxyXG4gICAgICAgIFwidmlld3RAeXBlLVwiLFxyXG4gICAgICAgIFwidmlld3RAeXBlXCIsXHJcbiAgICAgICAgXCJ2aWV3dHlwZStcIixcclxuICAgICAgICBcInZpZXd0eXBlLVwiLFxyXG4gICAgICAgIFwidmlld3R5cGVcIixcclxuICAgICAgICBcInZpZXcrXCIsXHJcbiAgICAgICAgXCJ2aWV3LVwiLFxyXG4gICAgICAgIFwidmlld0BcIixcclxuICAgICAgICBcInZpZXdcIixcclxuICAgICAgICBcInR5cGUrXCIsXHJcbiAgICAgICAgXCJ0eXBlLVwiLFxyXG4gICAgICAgIFwidHlwZVwiLFxyXG4gICAgICAgIFwidnR5cGUrXCIsXHJcbiAgICAgICAgXCJ2dHlwZS1cIixcclxuICAgICAgICBcInZ0eXBlXCIsXHJcbiAgICAgICAgXCJ2dEB5cGUrXCIsXHJcbiAgICAgICAgXCJ2dEB5cGUtXCIsXHJcbiAgICAgICAgXCJ2dEB5cGVcIixcclxuICAgICAgICBcInZpZXd0QHlwZStcIixcclxuICAgICAgICBcInZpZXd0QHlwZS1cIixcclxuICAgICAgICBcInZpZXd0QHlwZVwiLFxyXG4gICAgICAgIFwidmlld3R5cGUrXCIsXHJcbiAgICAgICAgXCJ2aWV3dHlwZS1cIixcclxuICAgICAgICBcInZpZXd0eXBlXCIsXHJcbiAgICAgICAgXCJwcm9wK1wiLFxyXG4gICAgICAgIFwicHJvcC1cIixcclxuICAgICAgICBcInByb3BcIixcclxuICAgICAgICBcInR5cGUrXCIsXHJcbiAgICAgICAgXCJ0eXBlLVwiLFxyXG4gICAgICAgIFwidHlwZVwiLFxyXG4gICAgICAgIFwidEB5cGVcIixcclxuICAgICAgICBcInRAeXBlK1wiLFxyXG4gICAgICAgIFwidEB5cGUtXCIsXHJcbiAgICAgICAgXCJhYnN0QHlwZVwiLFxyXG4gICAgICAgIFwiYWJzdHlwZVwiLFxyXG4gICAgICAgIFwiYWJzdmlld3RAeXBlXCIsXHJcbiAgICAgICAgXCJhYnN2dEB5cGVcIixcclxuICAgICAgICBcImZvcipcIixcclxuICAgICAgICBcImZvclwiLFxyXG4gICAgICAgIFwid2hpbGUqXCIsXHJcbiAgICAgICAgXCJ3aGlsZVwiXHJcbiAgICBdLFxyXG4gICAga2V5d29yZHNfdHlwZXM6IFtcclxuICAgICAgICAnYm9vbCcsXHJcbiAgICAgICAgJ2RvdWJsZScsXHJcbiAgICAgICAgJ2J5dGUnLFxyXG4gICAgICAgICdpbnQnLFxyXG4gICAgICAgICdzaG9ydCcsXHJcbiAgICAgICAgJ2NoYXInLFxyXG4gICAgICAgICd2b2lkJyxcclxuICAgICAgICAndW5pdCcsXHJcbiAgICAgICAgJ2xvbmcnLFxyXG4gICAgICAgICdmbG9hdCcsXHJcbiAgICAgICAgJ3N0cmluZycsXHJcbiAgICAgICAgJ3N0cnB0cidcclxuICAgIF0sXHJcbiAgICAvLyBUT0RPOiByZWZlcmVuY2UgZm9yIHRoaXM/XHJcbiAgICBrZXl3b3Jkc19lZmZlY3RzOiBbXHJcbiAgICAgICAgXCIwXCIsXHJcbiAgICAgICAgXCJmdW5cIixcclxuICAgICAgICBcImNsb1wiLFxyXG4gICAgICAgIFwicHJmXCIsXHJcbiAgICAgICAgXCJmdW5jbG9cIixcclxuICAgICAgICBcImNsb3B0clwiLFxyXG4gICAgICAgIFwiY2xvcmVmXCIsXHJcbiAgICAgICAgXCJyZWZcIixcclxuICAgICAgICBcIm50bVwiLFxyXG4gICAgICAgIFwiMVwiIC8vIGFsbCBlZmZlY3RzXHJcbiAgICBdLFxyXG4gICAgb3BlcmF0b3JzOiBbXHJcbiAgICAgICAgXCJAXCIsXHJcbiAgICAgICAgXCIhXCIsXHJcbiAgICAgICAgXCJ8XCIsXHJcbiAgICAgICAgXCJgXCIsXHJcbiAgICAgICAgXCI6XCIsXHJcbiAgICAgICAgXCIkXCIsXHJcbiAgICAgICAgXCIuXCIsXHJcbiAgICAgICAgXCI9XCIsXHJcbiAgICAgICAgXCIjXCIsXHJcbiAgICAgICAgXCJ+XCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIi4uXCIsXHJcbiAgICAgICAgXCIuLi5cIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiPT5cIixcclxuICAgICAgICAvLyBcIj08XCIsIC8vIFRfRVFMVFxyXG4gICAgICAgIFwiPTw+XCIsXHJcbiAgICAgICAgXCI9Lz0+XCIsXHJcbiAgICAgICAgXCI9Pj5cIixcclxuICAgICAgICBcIj0vPT4+XCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIjxcIixcclxuICAgICAgICBcIj5cIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiPjxcIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiLjxcIixcclxuICAgICAgICBcIj4uXCIsXHJcbiAgICAgICAgLy9cclxuICAgICAgICBcIi48Pi5cIixcclxuICAgICAgICAvL1xyXG4gICAgICAgIFwiLT5cIixcclxuICAgICAgICAvL1wiLTxcIiwgLy8gVF9NSU5VU0xUXHJcbiAgICAgICAgXCItPD5cIixcclxuICAgIF0sXHJcbiAgICBicmFja2V0czogW1xyXG4gICAgICAgIHsgb3BlbjogJywoJywgY2xvc2U6ICcpJywgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnYCgnLCBjbG9zZTogJyknLCB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSxcclxuICAgICAgICB7IG9wZW46ICclKCcsIGNsb3NlOiAnKScsIHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ1xcJygnLCBjbG9zZTogJyknLCB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSxcclxuICAgICAgICB7IG9wZW46ICdcXCd7JywgY2xvc2U6ICd9JywgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnQCgnLCBjbG9zZTogJyknLCB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSxcclxuICAgICAgICB7IG9wZW46ICdAeycsIGNsb3NlOiAnfScsIHRva2VuOiAnZGVsaW1pdGVyLmJyYWNlJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ0BbJywgY2xvc2U6ICddJywgdG9rZW46ICdkZWxpbWl0ZXIuc3F1YXJlJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJyNbJywgY2xvc2U6ICddJywgdG9rZW46ICdkZWxpbWl0ZXIuc3F1YXJlJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJ3snLCBjbG9zZTogJ30nLCB0b2tlbjogJ2RlbGltaXRlci5jdXJseScgfSxcclxuICAgICAgICB7IG9wZW46ICdbJywgY2xvc2U6ICddJywgdG9rZW46ICdkZWxpbWl0ZXIuc3F1YXJlJyB9LFxyXG4gICAgICAgIHsgb3BlbjogJygnLCBjbG9zZTogJyknLCB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSxcclxuICAgICAgICB7IG9wZW46ICc8JywgY2xvc2U6ICc+JywgdG9rZW46ICdkZWxpbWl0ZXIuYW5nbGUnIH1cclxuICAgIF0sXHJcbiAgICAvLyB3ZSBpbmNsdWRlIHRoZXNlIGNvbW1vbiByZWd1bGFyIGV4cHJlc3Npb25zXHJcbiAgICBzeW1ib2xzOiAvWz0+PCF+PzomfCtcXC0qXFwvXFxeJV0rLyxcclxuICAgIElERU5URlNUOiAvW2EtekEtWl9dLyxcclxuICAgIElERU5UUlNUOiAvW2EtekEtWjAtOV8nJF0vLFxyXG4gICAgc3ltYm9saWM6IC9bJSYrLS4vOj1AfmBefCohJCM/PD5dLyxcclxuICAgIGRpZ2l0OiAvWzAtOV0vLFxyXG4gICAgZGlnaXRzZXEwOiAvQGRpZ2l0Ki8sXHJcbiAgICB4ZGlnaXQ6IC9bMC05QS1aYS16XS8sXHJcbiAgICB4ZGlnaXRzZXEwOiAvQHhkaWdpdCovLFxyXG4gICAgSU5UU1A6IC9bbEx1VV0vLFxyXG4gICAgRkxPQVRTUDogL1tmRmxMXS8sXHJcbiAgICBmZXhwb25lbnQ6IC9bZUVdWystXT9bMC05XSsvLFxyXG4gICAgZmV4cG9uZW50X2JpbjogL1twUF1bKy1dP1swLTldKy8sXHJcbiAgICBkZWNpZXhwOiAvXFwuWzAtOV0qQGZleHBvbmVudD8vLFxyXG4gICAgaGV4aWV4cDogL1xcLlswLTlhLXpBLVpdKkBmZXhwb25lbnRfYmluPy8sXHJcbiAgICBpcnJlZ3VsYXJfa2V5d29yZHM6IC92YWxbKy1dP3xjYXNlWystXT98YWRkclxcQD98Zm9sZFxcQHxmcmVlXFxAfGZpeFxcQD98bGFtXFxAP3xsbGFtXFxAP3xwcm9wWystXT98dHlwZVsrLV0/fHZpZXdbKy1AXT98dmlld3RAP3lwZVsrLV0/fHRAP3lwZVsrLV0/fHYoaWV3KT90QD95cGVbKy1dP3xhYnN0QD95cGV8YWJzdihpZXcpP3RAP3lwZXxmb3JcXCo/fHdoaWxlXFwqPy8sXHJcbiAgICBFU0NIQVI6IC9bbnR2YnJmYVxcXFxcXD8nXCJcXChcXFtcXHtdLyxcclxuICAgIHN0YXJ0OiAncm9vdCcsXHJcbiAgICAvLyBUaGUgbWFpbiB0b2tlbml6ZXIgZm9yIEFUUy9Qb3N0aWF0c1xyXG4gICAgLy8gcmVmZXJlbmNlOiBodHRwczovL2dpdGh1Yi5jb20vZ2l0aHd4aS9BVFMtUG9zdGlhdHMvYmxvYi9tYXN0ZXIvc3JjL3BhdHNfbGV4aW5nLmRhdHNcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgLy8gbGV4aW5nX2JsYW5rc2VxMFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvWyBcXHRcXHJcXG5dKy8sIGFjdGlvbjogeyB0b2tlbjogJycgfSB9LFxyXG4gICAgICAgICAgICAvLyBOT1RFOiAoKikgaXMgYW4gaW52YWxpZCBNTC1saWtlIGNvbW1lbnQhXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXChcXCpcXCkvLCBhY3Rpb246IHsgdG9rZW46ICdpbnZhbGlkJyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXChcXCovLCBhY3Rpb246IHsgdG9rZW46ICdjb21tZW50JywgbmV4dDogJ2xleGluZ19DT01NRU5UX2Jsb2NrX21sJyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXCgvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSovIH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXCkvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSovIH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXFsvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qeyB0b2tlbjogJ2RlbGltaXRlci5icmFja2V0JyB9Ki8gfSxcclxuICAgICAgICAgICAgeyByZWdleDogL1xcXS8sIGFjdGlvbjogJ0BicmFja2V0cycgLyp7IHRva2VuOiAnZGVsaW1pdGVyLmJyYWNrZXQnIH0qLyB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFx7LywgYWN0aW9uOiAnQGJyYWNrZXRzJyAvKnsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2UnIH0qLyB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFx9LywgYWN0aW9uOiAnQGJyYWNrZXRzJyAvKnsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2UnIH0qLyB9LFxyXG4gICAgICAgICAgICAvLyBsZXhpbmdfQ09NTUFcclxuICAgICAgICAgICAgeyByZWdleDogLyxcXCgvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSovIH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC8sLywgYWN0aW9uOiB7IHRva2VuOiAnZGVsaW1pdGVyLmNvbW1hJyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC87LywgYWN0aW9uOiB7IHRva2VuOiAnZGVsaW1pdGVyLnNlbWljb2xvbicgfSB9LFxyXG4gICAgICAgICAgICAvLyBsZXhpbmdfQVRcclxuICAgICAgICAgICAgeyByZWdleDogL0BcXCgvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qIHsgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnIH0qLyB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvQFxcWy8sIGFjdGlvbjogJ0BicmFja2V0cycgLyogeyB0b2tlbjogJ2RlbGltaXRlci5icmFja2V0JyB9Ki8gfSxcclxuICAgICAgICAgICAgeyByZWdleDogL0BcXHsvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qeyB0b2tlbjogJ2RlbGltaXRlci5icmFjZScgfSovIH0sXHJcbiAgICAgICAgICAgIC8vIGxleGluZ19DT0xPTlxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvOjwvLCBhY3Rpb246IHsgdG9rZW46ICdrZXl3b3JkJywgbmV4dDogJ0BsZXhpbmdfRUZGRUNUX2NvbW1hc2VxMCcgfSB9LFxyXG4gICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICBsZXhpbmdfRE9UOlxyXG5cclxuICAgICAgICAgICAgLiAvLyBTWU1CT0xJQyA9PiBsZXhpbmdfSURFTlRfc3ltXHJcbiAgICAgICAgICAgIC4gRkxPQVRET1QgPT4gbGV4aW5nX0ZMT0FUX2RlY2lleHBcclxuICAgICAgICAgICAgLiBESUdJVCA9PiBUX0RPVElOVFxyXG4gICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFwuQHN5bWJvbGljKy8sIGFjdGlvbjogeyB0b2tlbjogJ2lkZW50aWZpZXIuc3ltJyB9IH0sXHJcbiAgICAgICAgICAgIC8vIEZMT0FURE9UIGNhc2VcclxuICAgICAgICAgICAgeyByZWdleDogL1xcLkBkaWdpdCpAZmV4cG9uZW50QEZMT0FUU1AqLywgYWN0aW9uOiB7IHRva2VuOiAnbnVtYmVyLmZsb2F0JyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXC5AZGlnaXQrLywgYWN0aW9uOiB7IHRva2VuOiAnbnVtYmVyLmZsb2F0JyB9IH0sXHJcbiAgICAgICAgICAgIC8vIGxleGluZ19ET0xMQVI6XHJcbiAgICAgICAgICAgIC8vICckJyBJREVOVEZTVCBJREVOVFJTVCogPT4gbGV4aW5nX0lERU5UX2RsciwgXyA9PiBsZXhpbmdfSURFTlRfc3ltXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwkQElERU5URlNUQElERU5UUlNUKi8sXHJcbiAgICAgICAgICAgICAgICBhY3Rpb246IHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzX2Rscic6IHsgdG9rZW46ICdrZXl3b3JkLmRscicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BkZWZhdWx0JzogeyB0b2tlbjogJ25hbWVzcGFjZScgfSxcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIC8vIGxleGluZ19TSEFSUDpcclxuICAgICAgICAgICAgLy8gJyMnIElERU5URlNUIElERU5UUlNUKiA9PiBsZXhpbmdfaWRlbnRfc3JwLCBfID0+IGxleGluZ19JREVOVF9zeW1cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCNASURFTlRGU1RASURFTlRSU1QqLyxcclxuICAgICAgICAgICAgICAgIGFjdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAa2V5d29yZHNfc3JwJzogeyB0b2tlbjogJ2tleXdvcmQuc3JwJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiB7IHRva2VuOiAnaWRlbnRpZmllcicgfSxcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIC8vIGxleGluZ19QRVJDRU5UOlxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvJVxcKC8sIGFjdGlvbjogeyB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXiV7KCN8XFxefFxcJCk/LywgYWN0aW9uOiB7IHRva2VuOiAna2V5d29yZCcsIG5leHQ6ICdAbGV4aW5nX0VYVENPREUnLCBuZXh0RW1iZWRkZWQ6ICd0ZXh0L2phdmFzY3JpcHQnIH0gfSxcclxuICAgICAgICAgICAgeyByZWdleDogL14lfS8sIGFjdGlvbjogeyB0b2tlbjogJ2tleXdvcmQnIH0gfSxcclxuICAgICAgICAgICAgLy8gbGV4aW5nX1FVT1RFXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC8nXFwoLywgYWN0aW9uOiB7IHRva2VuOiAnZGVsaW1pdGVyLnBhcmVudGhlc2lzJyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC8nXFxbLywgYWN0aW9uOiB7IHRva2VuOiAnZGVsaW1pdGVyLmJyYWNrZXQnIH0gfSxcclxuICAgICAgICAgICAgeyByZWdleDogLydcXHsvLCBhY3Rpb246IHsgdG9rZW46ICdkZWxpbWl0ZXIuYnJhY2UnIH0gfSxcclxuICAgICAgICAgICAgWy8oJykoXFxcXEBFU0NIQVJ8XFxcXFt4WF1AeGRpZ2l0K3xcXFxcQGRpZ2l0KykoJykvLCBbJ3N0cmluZycsICdzdHJpbmcuZXNjYXBlJywgJ3N0cmluZyddXSxcclxuICAgICAgICAgICAgWy8nW15cXFxcJ10nLywgJ3N0cmluZyddLFxyXG4gICAgICAgICAgICAvLyBsZXhpbmdfRFFVT1RFXHJcbiAgICAgICAgICAgIFsvXCIvLCAnc3RyaW5nLnF1b3RlJywgJ0BsZXhpbmdfRFFVT1RFJ10sXHJcbiAgICAgICAgICAgIC8vIGxleGluZ19CUVVPVEVcclxuICAgICAgICAgICAgeyByZWdleDogL2BcXCgvLCBhY3Rpb246ICdAYnJhY2tldHMnIC8qIHsgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnIH0qLyB9LFxyXG4gICAgICAgICAgICAvLyBUT0RPOiBvdGhlcndpc2UsIHRyeSBsZXhpbmdfSURFTlRfc3ltXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXFxcLywgYWN0aW9uOiB7IHRva2VuOiAncHVuY3R1YXRpb24nIH0gfSxcclxuICAgICAgICAgICAgLy8gbGV4aW5nX0lERU5UX2FscDpcclxuICAgICAgICAgICAgLy8gTk9URTogKD8hcmVnZXgpIGlzIHN5bnRheCBmb3IgXCJub3QtZm9sbG93ZWQtYnlcIiByZWdleFxyXG4gICAgICAgICAgICAvLyB0byByZXNvbHZlIGFtYmlndWl0eSBzdWNoIGFzIGZvcmVhY2gkZndvcmsgYmVpbmcgaW5jb3JyZWN0bHkgbGV4ZWQgYXMgW2Zvcl0gW2VhY2gkZndvcmtdIVxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvQGlycmVndWxhcl9rZXl3b3Jkcyg/IUBJREVOVFJTVCkvLCBhY3Rpb246IHsgdG9rZW46ICdrZXl3b3JkJyB9IH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvQElERU5URlNUQElERU5UUlNUKls8IVxcW10/LyxcclxuICAgICAgICAgICAgICAgIGFjdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IGR5bmxvYWQgYW5kIHN0YWxvYWQgc2hvdWxkIGJlIHNwZWNpYWxseSBwYXJzZWRcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZHlubG9hZCB3aGl0ZXNwYWNlKyBcInNwZWNpYWxfc3RyaW5nXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBzcGVjaWFsIHN0cmluZyBpcyByZWFsbHk6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAnLycgJ1xcXFwnICcuJyA9PiBwdW5jdHVhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAoe1xcJCkoW2EtekEtWl9dW2EtekEtWl8wLTldKikofSkgPT4gcHVuY3R1YXRpb24sa2V5d29yZCxwdW5jdHVhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBbXlwiXSA9PiBpZGVudGlmaWVyL2xpdGVyYWxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkcyc6IHsgdG9rZW46ICdrZXl3b3JkJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGtleXdvcmRzX3R5cGVzJzogeyB0b2tlbjogJ3R5cGUnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAZGVmYXVsdCc6IHsgdG9rZW46ICdpZGVudGlmaWVyJyB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAvLyBsZXhpbmdfSURFTlRfc3ltOlxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFwvXFwvXFwvXFwvLywgYWN0aW9uOiB7IHRva2VuOiAnY29tbWVudCcsIG5leHQ6ICdAbGV4aW5nX0NPTU1FTlRfcmVzdCcgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFwvXFwvLiokLywgYWN0aW9uOiB7IHRva2VuOiAnY29tbWVudCcgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFwvXFwqLywgYWN0aW9uOiB7IHRva2VuOiAnY29tbWVudCcsIG5leHQ6ICdAbGV4aW5nX0NPTU1FTlRfYmxvY2tfYycgfSB9LFxyXG4gICAgICAgICAgICAvLyBBUy0yMDE2MDYyNzogc3BlY2lmaWNhbGx5IGZvciBlZmZlY3QgYW5ub3RhdGlvbnNcclxuICAgICAgICAgICAgeyByZWdleDogLy08fD08LywgYWN0aW9uOiB7IHRva2VuOiAna2V5d29yZCcsIG5leHQ6ICdAbGV4aW5nX0VGRkVDVF9jb21tYXNlcTAnIH0gfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9Ac3ltYm9saWMrLyxcclxuICAgICAgICAgICAgICAgIGFjdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdAb3BlcmF0b3JzJzogJ2tleXdvcmQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiAnb3BlcmF0b3InXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAvLyBsZXhpbmdfWkVSTzpcclxuICAgICAgICAgICAgLy8gRklYTUU6IHRoaXMgb25lIGlzIHF1aXRlIG1lc3N5L3VuZmluaXNoZWQgeWV0XHJcbiAgICAgICAgICAgIC8vIFRPRE86IGxleGluZ19JTlRfaGV4XHJcbiAgICAgICAgICAgIC8vIC0gdGVzdGluZ19oZXhpZXhwID0+IGxleGluZ19GTE9BVF9oZXhpZXhwXHJcbiAgICAgICAgICAgIC8vIC0gdGVzdGluZ19mZXhwb25lbnRfYmluID0+IGxleGluZ19GTE9BVF9oZXhpZXhwXHJcbiAgICAgICAgICAgIC8vIC0gdGVzdGluZ19pbnRzcHNlcTAgPT4gVF9JTlRfaGV4XHJcbiAgICAgICAgICAgIC8vIGxleGluZ19JTlRfaGV4OlxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvMFt4WF1AeGRpZ2l0KyhAaGV4aWV4cHxAZmV4cG9uZW50X2JpbilARkxPQVRTUCovLCBhY3Rpb246IHsgdG9rZW46ICdudW1iZXIuZmxvYXQnIH0gfSxcclxuICAgICAgICAgICAgeyByZWdleDogLzBbeFhdQHhkaWdpdCtASU5UU1AqLywgYWN0aW9uOiB7IHRva2VuOiAnbnVtYmVyLmhleCcgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvMFswLTddKyg/IVswLTldKUBJTlRTUCovLCBhY3Rpb246IHsgdG9rZW46ICdudW1iZXIub2N0YWwnIH0gfSxcclxuICAgICAgICAgICAgLy97cmVnZXg6IC8wLywgYWN0aW9uOiB7IHRva2VuOiAnbnVtYmVyJyB9IH0sIC8vIElOVFpFUk9cclxuICAgICAgICAgICAgLy8gbGV4aW5nX0lOVF9kZWM6XHJcbiAgICAgICAgICAgIC8vIC0gdGVzdGluZ19kZWNpZXhwID0+IGxleGluZ19GTE9BVF9kZWNpZXhwXHJcbiAgICAgICAgICAgIC8vIC0gdGVzdGluZ19mZXhwb25lbnQgPT4gbGV4aW5nX0ZMT0FUX2RlY2lleHBcclxuICAgICAgICAgICAgLy8gLSBvdGhlcndpc2UgPT4gaW50c3BzZXEwIChbMC05XSpbbEx1VV0/KVxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvQGRpZ2l0KyhAZmV4cG9uZW50fEBkZWNpZXhwKUBGTE9BVFNQKi8sIGFjdGlvbjogeyB0b2tlbjogJ251bWJlci5mbG9hdCcgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvQGRpZ2l0QGRpZ2l0c2VxMEBJTlRTUCovLCBhY3Rpb246IHsgdG9rZW46ICdudW1iZXIuZGVjaW1hbCcgfSB9LFxyXG4gICAgICAgICAgICAvLyBESUdJVCwgaWYgZm9sbG93ZWQgYnkgZGlnaXRzZXEwLCBpcyBsZXhpbmdfSU5UX2RlY1xyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvQGRpZ2l0K0BJTlRTUCovLCBhY3Rpb246IHsgdG9rZW46ICdudW1iZXInIH0gfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGxleGluZ19DT01NRU5UX2Jsb2NrX21sOiBbXHJcbiAgICAgICAgICAgIFsvW15cXChcXCpdKy8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIFsvXFwoXFwqLywgJ2NvbW1lbnQnLCAnQHB1c2gnXSxcclxuICAgICAgICAgICAgWy9cXChcXCovLCAnY29tbWVudC5pbnZhbGlkJ10sXHJcbiAgICAgICAgICAgIFsvXFwqXFwpLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1xcKi8sICdjb21tZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGxleGluZ19DT01NRU5UX2Jsb2NrX2M6IFtcclxuICAgICAgICAgICAgWy9bXlxcLypdKy8sICdjb21tZW50J10sXHJcbiAgICAgICAgICAgIC8vIFsvXFwvXFwqLywgJ2NvbW1lbnQnLCAnQHB1c2gnIF0sICAgIC8vIG5lc3RlZCBDLXN0eWxlIGJsb2NrIGNvbW1lbnRzIG5vdCBhbGxvd2VkXHJcbiAgICAgICAgICAgIC8vIFsvXFwvXFwqLywgICAgJ2NvbW1lbnQuaW52YWxpZCcgXSxcdC8vIE5PVEU6IHRoaXMgYnJlYWtzIGJsb2NrIGNvbW1lbnRzIGluIHRoZSBzaGFwZSBvZiAvKiAvLyovXHJcbiAgICAgICAgICAgIFsvXFwqXFwvLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbL1tcXC8qXS8sICdjb21tZW50J11cclxuICAgICAgICBdLFxyXG4gICAgICAgIGxleGluZ19DT01NRU5UX3Jlc3Q6IFtcclxuICAgICAgICAgICAgWy8kLywgJ2NvbW1lbnQnLCAnQHBvcCddLFxyXG4gICAgICAgICAgICBbLy4qLywgJ2NvbW1lbnQnXVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gTk9URTogYWRkZWQgYnkgQVMsIHNwZWNpZmljYWxseSBmb3IgaGlnaGxpZ2h0aW5nXHJcbiAgICAgICAgbGV4aW5nX0VGRkVDVF9jb21tYXNlcTA6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9ASURFTlRGU1RASURFTlRSU1QrfEBkaWdpdCsvLFxyXG4gICAgICAgICAgICAgICAgYWN0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0BrZXl3b3Jkc19lZmZlY3RzJzogeyB0b2tlbjogJ3R5cGUuZWZmZWN0JyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQGRlZmF1bHQnOiB7IHRva2VuOiAnaWRlbnRpZmllcicgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyByZWdleDogLywvLCBhY3Rpb246IHsgdG9rZW46ICdwdW5jdHVhdGlvbicgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvPi8sIGFjdGlvbjogeyB0b2tlbjogJ0ByZW1hdGNoJywgbmV4dDogJ0Bwb3AnIH0gfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGxleGluZ19FWFRDT0RFOiBbXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9eJX0vLCBhY3Rpb246IHsgdG9rZW46ICdAcmVtYXRjaCcsIG5leHQ6ICdAcG9wJywgbmV4dEVtYmVkZGVkOiAnQHBvcCcgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvW14lXSsvLCBhY3Rpb246ICcnIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBsZXhpbmdfRFFVT1RFOiBbXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cIi8sIGFjdGlvbjogeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIG5leHQ6ICdAcG9wJyB9IH0sXHJcbiAgICAgICAgICAgIC8vIEFTLTIwMTYwNjI4OiBhZGRpdGlvbmFsIGhpLWxpZ2h0aW5nIGZvciB2YXJpYWJsZXMgaW4gc3RhbG9hZC9keW5sb2FkIHN0cmluZ3NcclxuICAgICAgICAgICAgeyByZWdleDogLyhcXHtcXCQpKEBJREVOVEZTVEBJREVOVFJTVCopKFxcfSkvLCBhY3Rpb246IFt7IHRva2VuOiAnc3RyaW5nLmVzY2FwZScgfSwgeyB0b2tlbjogJ2lkZW50aWZpZXInIH0sIHsgdG9rZW46ICdzdHJpbmcuZXNjYXBlJyB9XSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvXFxcXCQvLCBhY3Rpb246IHsgdG9rZW46ICdzdHJpbmcuZXNjYXBlJyB9IH0sXHJcbiAgICAgICAgICAgIHsgcmVnZXg6IC9cXFxcKEBFU0NIQVJ8W3hYXUB4ZGlnaXQrfEBkaWdpdCspLywgYWN0aW9uOiB7IHRva2VuOiAnc3RyaW5nLmVzY2FwZScgfSB9LFxyXG4gICAgICAgICAgICB7IHJlZ2V4OiAvW15cXFxcXCJdKy8sIGFjdGlvbjogeyB0b2tlbjogJ3N0cmluZycgfSB9XHJcbiAgICAgICAgXSxcclxuICAgIH0sXHJcbn07XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=