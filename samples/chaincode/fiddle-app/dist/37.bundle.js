(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[37],{

/***/ "./node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js":
/*!***********************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js ***!
  \***********************************************************************************/
/*! exports provided: Adapter, DiagnostcsAdapter, SuggestAdapter, SignatureHelpAdapter, QuickInfoAdapter, OccurrencesAdapter, DefinitionAdapter, ReferenceAdapter, OutlineAdapter, Kind, FormatHelper, FormatAdapter, FormatOnTypeAdapter */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Adapter", function() { return Adapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DiagnostcsAdapter", function() { return DiagnostcsAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SuggestAdapter", function() { return SuggestAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SignatureHelpAdapter", function() { return SignatureHelpAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "QuickInfoAdapter", function() { return QuickInfoAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "OccurrencesAdapter", function() { return OccurrencesAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DefinitionAdapter", function() { return DefinitionAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "ReferenceAdapter", function() { return ReferenceAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "OutlineAdapter", function() { return OutlineAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Kind", function() { return Kind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FormatHelper", function() { return FormatHelper; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FormatAdapter", function() { return FormatAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FormatOnTypeAdapter", function() { return FormatOnTypeAdapter; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var Uri = monaco.Uri;
var Promise = monaco.Promise;
//#region utils copied from typescript to prevent loading the entire typescriptServices ---
var IndentStyle;
(function (IndentStyle) {
    IndentStyle[IndentStyle["None"] = 0] = "None";
    IndentStyle[IndentStyle["Block"] = 1] = "Block";
    IndentStyle[IndentStyle["Smart"] = 2] = "Smart";
})(IndentStyle || (IndentStyle = {}));
function flattenDiagnosticMessageText(messageText, newLine) {
    if (typeof messageText === "string") {
        return messageText;
    }
    else {
        var diagnosticChain = messageText;
        var result = "";
        var indent = 0;
        while (diagnosticChain) {
            if (indent) {
                result += newLine;
                for (var i = 0; i < indent; i++) {
                    result += "  ";
                }
            }
            result += diagnosticChain.messageText;
            indent++;
            diagnosticChain = diagnosticChain.next;
        }
        return result;
    }
}
function displayPartsToString(displayParts) {
    if (displayParts) {
        return displayParts.map(function (displayPart) { return displayPart.text; }).join("");
    }
    return "";
}
//#endregion
var Adapter = /** @class */ (function () {
    function Adapter(_worker) {
        this._worker = _worker;
    }
    Adapter.prototype._positionToOffset = function (uri, position) {
        var model = monaco.editor.getModel(uri);
        return model.getOffsetAt(position);
    };
    Adapter.prototype._offsetToPosition = function (uri, offset) {
        var model = monaco.editor.getModel(uri);
        return model.getPositionAt(offset);
    };
    Adapter.prototype._textSpanToRange = function (uri, span) {
        var p1 = this._offsetToPosition(uri, span.start);
        var p2 = this._offsetToPosition(uri, span.start + span.length);
        var startLineNumber = p1.lineNumber, startColumn = p1.column;
        var endLineNumber = p2.lineNumber, endColumn = p2.column;
        return { startLineNumber: startLineNumber, startColumn: startColumn, endLineNumber: endLineNumber, endColumn: endColumn };
    };
    return Adapter;
}());

// --- diagnostics --- ---
var DiagnostcsAdapter = /** @class */ (function (_super) {
    __extends(DiagnostcsAdapter, _super);
    function DiagnostcsAdapter(_defaults, _selector, worker) {
        var _this = _super.call(this, worker) || this;
        _this._defaults = _defaults;
        _this._selector = _selector;
        _this._disposables = [];
        _this._listener = Object.create(null);
        var onModelAdd = function (model) {
            if (model.getModeId() !== _selector) {
                return;
            }
            var handle;
            var changeSubscription = model.onDidChangeContent(function () {
                clearTimeout(handle);
                handle = setTimeout(function () { return _this._doValidate(model.uri); }, 500);
            });
            _this._listener[model.uri.toString()] = {
                dispose: function () {
                    changeSubscription.dispose();
                    clearTimeout(handle);
                }
            };
            _this._doValidate(model.uri);
        };
        var onModelRemoved = function (model) {
            monaco.editor.setModelMarkers(model, _this._selector, []);
            var key = model.uri.toString();
            if (_this._listener[key]) {
                _this._listener[key].dispose();
                delete _this._listener[key];
            }
        };
        _this._disposables.push(monaco.editor.onDidCreateModel(onModelAdd));
        _this._disposables.push(monaco.editor.onWillDisposeModel(onModelRemoved));
        _this._disposables.push(monaco.editor.onDidChangeModelLanguage(function (event) {
            onModelRemoved(event.model);
            onModelAdd(event.model);
        }));
        _this._disposables.push({
            dispose: function () {
                for (var _i = 0, _a = monaco.editor.getModels(); _i < _a.length; _i++) {
                    var model = _a[_i];
                    onModelRemoved(model);
                }
            }
        });
        _this._disposables.push(_this._defaults.onDidChange(function () {
            // redo diagnostics when options change
            for (var _i = 0, _a = monaco.editor.getModels(); _i < _a.length; _i++) {
                var model = _a[_i];
                onModelRemoved(model);
                onModelAdd(model);
            }
        }));
        monaco.editor.getModels().forEach(onModelAdd);
        return _this;
    }
    DiagnostcsAdapter.prototype.dispose = function () {
        this._disposables.forEach(function (d) { return d && d.dispose(); });
        this._disposables = [];
    };
    DiagnostcsAdapter.prototype._doValidate = function (resource) {
        var _this = this;
        this._worker(resource).then(function (worker) {
            if (!monaco.editor.getModel(resource)) {
                // model was disposed in the meantime
                return null;
            }
            var promises = [];
            var _a = _this._defaults.getDiagnosticsOptions(), noSyntaxValidation = _a.noSyntaxValidation, noSemanticValidation = _a.noSemanticValidation;
            if (!noSyntaxValidation) {
                promises.push(worker.getSyntacticDiagnostics(resource.toString()));
            }
            if (!noSemanticValidation) {
                promises.push(worker.getSemanticDiagnostics(resource.toString()));
            }
            return Promise.join(promises);
        }).then(function (diagnostics) {
            if (!diagnostics || !monaco.editor.getModel(resource)) {
                // model was disposed in the meantime
                return null;
            }
            var markers = diagnostics
                .reduce(function (p, c) { return c.concat(p); }, [])
                .map(function (d) { return _this._convertDiagnostics(resource, d); });
            monaco.editor.setModelMarkers(monaco.editor.getModel(resource), _this._selector, markers);
        }).then(undefined, function (err) {
            console.error(err);
        });
    };
    DiagnostcsAdapter.prototype._convertDiagnostics = function (resource, diag) {
        var _a = this._offsetToPosition(resource, diag.start), startLineNumber = _a.lineNumber, startColumn = _a.column;
        var _b = this._offsetToPosition(resource, diag.start + diag.length), endLineNumber = _b.lineNumber, endColumn = _b.column;
        return {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: startLineNumber,
            startColumn: startColumn,
            endLineNumber: endLineNumber,
            endColumn: endColumn,
            message: flattenDiagnosticMessageText(diag.messageText, '\n')
        };
    };
    return DiagnostcsAdapter;
}(Adapter));

var SuggestAdapter = /** @class */ (function (_super) {
    __extends(SuggestAdapter, _super);
    function SuggestAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Object.defineProperty(SuggestAdapter.prototype, "triggerCharacters", {
        get: function () {
            return ['.'];
        },
        enumerable: true,
        configurable: true
    });
    SuggestAdapter.prototype.provideCompletionItems = function (model, position, _context, token) {
        var wordInfo = model.getWordUntilPosition(position);
        var resource = model.uri;
        var offset = this._positionToOffset(resource, position);
        return this._worker(resource).then(function (worker) {
            return worker.getCompletionsAtPosition(resource.toString(), offset);
        }).then(function (info) {
            if (!info) {
                return;
            }
            var suggestions = info.entries.map(function (entry) {
                return {
                    uri: resource,
                    position: position,
                    label: entry.name,
                    insertText: entry.name,
                    sortText: entry.sortText,
                    kind: SuggestAdapter.convertKind(entry.kind)
                };
            });
            return {
                suggestions: suggestions
            };
        });
    };
    SuggestAdapter.prototype.resolveCompletionItem = function (_model, _position, item, token) {
        var _this = this;
        var myItem = item;
        var resource = myItem.uri;
        var position = myItem.position;
        return this._worker(resource).then(function (worker) {
            return worker.getCompletionEntryDetails(resource.toString(), _this._positionToOffset(resource, position), myItem.label);
        }).then(function (details) {
            if (!details) {
                return myItem;
            }
            return {
                uri: resource,
                position: position,
                label: details.name,
                kind: SuggestAdapter.convertKind(details.kind),
                detail: displayPartsToString(details.displayParts),
                documentation: {
                    value: displayPartsToString(details.documentation)
                }
            };
        });
    };
    SuggestAdapter.convertKind = function (kind) {
        switch (kind) {
            case Kind.primitiveType:
            case Kind.keyword:
                return monaco.languages.CompletionItemKind.Keyword;
            case Kind.variable:
            case Kind.localVariable:
                return monaco.languages.CompletionItemKind.Variable;
            case Kind.memberVariable:
            case Kind.memberGetAccessor:
            case Kind.memberSetAccessor:
                return monaco.languages.CompletionItemKind.Field;
            case Kind.function:
            case Kind.memberFunction:
            case Kind.constructSignature:
            case Kind.callSignature:
            case Kind.indexSignature:
                return monaco.languages.CompletionItemKind.Function;
            case Kind.enum:
                return monaco.languages.CompletionItemKind.Enum;
            case Kind.module:
                return monaco.languages.CompletionItemKind.Module;
            case Kind.class:
                return monaco.languages.CompletionItemKind.Class;
            case Kind.interface:
                return monaco.languages.CompletionItemKind.Interface;
            case Kind.warning:
                return monaco.languages.CompletionItemKind.File;
        }
        return monaco.languages.CompletionItemKind.Property;
    };
    return SuggestAdapter;
}(Adapter));

var SignatureHelpAdapter = /** @class */ (function (_super) {
    __extends(SignatureHelpAdapter, _super);
    function SignatureHelpAdapter() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.signatureHelpTriggerCharacters = ['(', ','];
        return _this;
    }
    SignatureHelpAdapter.prototype.provideSignatureHelp = function (model, position, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.getSignatureHelpItems(resource.toString(), _this._positionToOffset(resource, position)); }).then(function (info) {
            if (!info) {
                return;
            }
            var ret = {
                activeSignature: info.selectedItemIndex,
                activeParameter: info.argumentIndex,
                signatures: []
            };
            info.items.forEach(function (item) {
                var signature = {
                    label: '',
                    documentation: null,
                    parameters: []
                };
                signature.label += displayPartsToString(item.prefixDisplayParts);
                item.parameters.forEach(function (p, i, a) {
                    var label = displayPartsToString(p.displayParts);
                    var parameter = {
                        label: label,
                        documentation: displayPartsToString(p.documentation)
                    };
                    signature.label += label;
                    signature.parameters.push(parameter);
                    if (i < a.length - 1) {
                        signature.label += displayPartsToString(item.separatorDisplayParts);
                    }
                });
                signature.label += displayPartsToString(item.suffixDisplayParts);
                ret.signatures.push(signature);
            });
            return ret;
        });
    };
    return SignatureHelpAdapter;
}(Adapter));

// --- hover ------
var QuickInfoAdapter = /** @class */ (function (_super) {
    __extends(QuickInfoAdapter, _super);
    function QuickInfoAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    QuickInfoAdapter.prototype.provideHover = function (model, position, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getQuickInfoAtPosition(resource.toString(), _this._positionToOffset(resource, position));
        }).then(function (info) {
            if (!info) {
                return;
            }
            var documentation = displayPartsToString(info.documentation);
            var tags = info.tags ? info.tags.map(function (tag) {
                var label = "*@" + tag.name + "*";
                if (!tag.text) {
                    return label;
                }
                return label + (tag.text.match(/\r\n|\n/g) ? ' \n' + tag.text : " - " + tag.text);
            })
                .join('  \n\n') : '';
            var contents = displayPartsToString(info.displayParts);
            return {
                range: _this._textSpanToRange(resource, info.textSpan),
                contents: [{
                        value: '```js\n' + contents + '\n```\n'
                    }, {
                        value: documentation + (tags ? '\n\n' + tags : '')
                    }]
            };
        });
    };
    return QuickInfoAdapter;
}(Adapter));

// --- occurrences ------
var OccurrencesAdapter = /** @class */ (function (_super) {
    __extends(OccurrencesAdapter, _super);
    function OccurrencesAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    OccurrencesAdapter.prototype.provideDocumentHighlights = function (model, position, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getOccurrencesAtPosition(resource.toString(), _this._positionToOffset(resource, position));
        }).then(function (entries) {
            if (!entries) {
                return;
            }
            return entries.map(function (entry) {
                return {
                    range: _this._textSpanToRange(resource, entry.textSpan),
                    kind: entry.isWriteAccess ? monaco.languages.DocumentHighlightKind.Write : monaco.languages.DocumentHighlightKind.Text
                };
            });
        });
    };
    return OccurrencesAdapter;
}(Adapter));

// --- definition ------
var DefinitionAdapter = /** @class */ (function (_super) {
    __extends(DefinitionAdapter, _super);
    function DefinitionAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DefinitionAdapter.prototype.provideDefinition = function (model, position, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getDefinitionAtPosition(resource.toString(), _this._positionToOffset(resource, position));
        }).then(function (entries) {
            if (!entries) {
                return;
            }
            var result = [];
            for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                var entry = entries_1[_i];
                var uri = Uri.parse(entry.fileName);
                if (monaco.editor.getModel(uri)) {
                    result.push({
                        uri: uri,
                        range: _this._textSpanToRange(uri, entry.textSpan)
                    });
                }
            }
            return result;
        });
    };
    return DefinitionAdapter;
}(Adapter));

// --- references ------
var ReferenceAdapter = /** @class */ (function (_super) {
    __extends(ReferenceAdapter, _super);
    function ReferenceAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ReferenceAdapter.prototype.provideReferences = function (model, position, context, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getReferencesAtPosition(resource.toString(), _this._positionToOffset(resource, position));
        }).then(function (entries) {
            if (!entries) {
                return;
            }
            var result = [];
            for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
                var entry = entries_2[_i];
                var uri = Uri.parse(entry.fileName);
                if (monaco.editor.getModel(uri)) {
                    result.push({
                        uri: uri,
                        range: _this._textSpanToRange(uri, entry.textSpan)
                    });
                }
            }
            return result;
        });
    };
    return ReferenceAdapter;
}(Adapter));

// --- outline ------
var OutlineAdapter = /** @class */ (function (_super) {
    __extends(OutlineAdapter, _super);
    function OutlineAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    OutlineAdapter.prototype.provideDocumentSymbols = function (model, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.getNavigationBarItems(resource.toString()); }).then(function (items) {
            if (!items) {
                return;
            }
            var convert = function (bucket, item, containerLabel) {
                var result = {
                    name: item.text,
                    detail: '',
                    kind: (outlineTypeTable[item.kind] || monaco.languages.SymbolKind.Variable),
                    range: _this._textSpanToRange(resource, item.spans[0]),
                    selectionRange: _this._textSpanToRange(resource, item.spans[0]),
                    containerName: containerLabel
                };
                if (item.childItems && item.childItems.length > 0) {
                    for (var _i = 0, _a = item.childItems; _i < _a.length; _i++) {
                        var child = _a[_i];
                        convert(bucket, child, result.name);
                    }
                }
                bucket.push(result);
            };
            var result = [];
            items.forEach(function (item) { return convert(result, item); });
            return result;
        });
    };
    return OutlineAdapter;
}(Adapter));

var Kind = /** @class */ (function () {
    function Kind() {
    }
    Kind.unknown = '';
    Kind.keyword = 'keyword';
    Kind.script = 'script';
    Kind.module = 'module';
    Kind.class = 'class';
    Kind.interface = 'interface';
    Kind.type = 'type';
    Kind.enum = 'enum';
    Kind.variable = 'var';
    Kind.localVariable = 'local var';
    Kind.function = 'function';
    Kind.localFunction = 'local function';
    Kind.memberFunction = 'method';
    Kind.memberGetAccessor = 'getter';
    Kind.memberSetAccessor = 'setter';
    Kind.memberVariable = 'property';
    Kind.constructorImplementation = 'constructor';
    Kind.callSignature = 'call';
    Kind.indexSignature = 'index';
    Kind.constructSignature = 'construct';
    Kind.parameter = 'parameter';
    Kind.typeParameter = 'type parameter';
    Kind.primitiveType = 'primitive type';
    Kind.label = 'label';
    Kind.alias = 'alias';
    Kind.const = 'const';
    Kind.let = 'let';
    Kind.warning = 'warning';
    return Kind;
}());

var outlineTypeTable = Object.create(null);
outlineTypeTable[Kind.module] = monaco.languages.SymbolKind.Module;
outlineTypeTable[Kind.class] = monaco.languages.SymbolKind.Class;
outlineTypeTable[Kind.enum] = monaco.languages.SymbolKind.Enum;
outlineTypeTable[Kind.interface] = monaco.languages.SymbolKind.Interface;
outlineTypeTable[Kind.memberFunction] = monaco.languages.SymbolKind.Method;
outlineTypeTable[Kind.memberVariable] = monaco.languages.SymbolKind.Property;
outlineTypeTable[Kind.memberGetAccessor] = monaco.languages.SymbolKind.Property;
outlineTypeTable[Kind.memberSetAccessor] = monaco.languages.SymbolKind.Property;
outlineTypeTable[Kind.variable] = monaco.languages.SymbolKind.Variable;
outlineTypeTable[Kind.const] = monaco.languages.SymbolKind.Variable;
outlineTypeTable[Kind.localVariable] = monaco.languages.SymbolKind.Variable;
outlineTypeTable[Kind.variable] = monaco.languages.SymbolKind.Variable;
outlineTypeTable[Kind.function] = monaco.languages.SymbolKind.Function;
outlineTypeTable[Kind.localFunction] = monaco.languages.SymbolKind.Function;
// --- formatting ----
var FormatHelper = /** @class */ (function (_super) {
    __extends(FormatHelper, _super);
    function FormatHelper() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    FormatHelper._convertOptions = function (options) {
        return {
            ConvertTabsToSpaces: options.insertSpaces,
            TabSize: options.tabSize,
            IndentSize: options.tabSize,
            IndentStyle: IndentStyle.Smart,
            NewLineCharacter: '\n',
            InsertSpaceAfterCommaDelimiter: true,
            InsertSpaceAfterSemicolonInForStatements: true,
            InsertSpaceBeforeAndAfterBinaryOperators: true,
            InsertSpaceAfterKeywordsInControlFlowStatements: true,
            InsertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
            InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
            PlaceOpenBraceOnNewLineForControlBlocks: false,
            PlaceOpenBraceOnNewLineForFunctions: false
        };
    };
    FormatHelper.prototype._convertTextChanges = function (uri, change) {
        return {
            text: change.newText,
            range: this._textSpanToRange(uri, change.span)
        };
    };
    return FormatHelper;
}(Adapter));

var FormatAdapter = /** @class */ (function (_super) {
    __extends(FormatAdapter, _super);
    function FormatAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    FormatAdapter.prototype.provideDocumentRangeFormattingEdits = function (model, range, options, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getFormattingEditsForRange(resource.toString(), _this._positionToOffset(resource, { lineNumber: range.startLineNumber, column: range.startColumn }), _this._positionToOffset(resource, { lineNumber: range.endLineNumber, column: range.endColumn }), FormatHelper._convertOptions(options));
        }).then(function (edits) {
            if (edits) {
                return edits.map(function (edit) { return _this._convertTextChanges(resource, edit); });
            }
        });
    };
    return FormatAdapter;
}(FormatHelper));

var FormatOnTypeAdapter = /** @class */ (function (_super) {
    __extends(FormatOnTypeAdapter, _super);
    function FormatOnTypeAdapter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Object.defineProperty(FormatOnTypeAdapter.prototype, "autoFormatTriggerCharacters", {
        get: function () {
            return [';', '}', '\n'];
        },
        enumerable: true,
        configurable: true
    });
    FormatOnTypeAdapter.prototype.provideOnTypeFormattingEdits = function (model, position, ch, options, token) {
        var _this = this;
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.getFormattingEditsAfterKeystroke(resource.toString(), _this._positionToOffset(resource, position), ch, FormatHelper._convertOptions(options));
        }).then(function (edits) {
            if (edits) {
                return edits.map(function (edit) { return _this._convertTextChanges(resource, edit); });
            }
        });
    };
    return FormatOnTypeAdapter;
}(FormatHelper));



/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/typescript/tsMode.js":
/*!*************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/typescript/tsMode.js ***!
  \*************************************************************************/
/*! exports provided: setupTypeScript, setupJavaScript, getJavaScriptWorker, getTypeScriptWorker */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "setupTypeScript", function() { return setupTypeScript; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "setupJavaScript", function() { return setupJavaScript; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getJavaScriptWorker", function() { return getJavaScriptWorker; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getTypeScriptWorker", function() { return getTypeScriptWorker; });
/* harmony import */ var _workerManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./workerManager.js */ "./node_modules/monaco-editor/esm/vs/language/typescript/workerManager.js");
/* harmony import */ var _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./languageFeatures.js */ "./node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



var javaScriptWorker;
var typeScriptWorker;
function setupTypeScript(defaults) {
    typeScriptWorker = setupMode(defaults, 'typescript');
}
function setupJavaScript(defaults) {
    javaScriptWorker = setupMode(defaults, 'javascript');
}
function getJavaScriptWorker() {
    return new monaco.Promise(function (resolve, reject) {
        if (!javaScriptWorker) {
            return reject("JavaScript not registered!");
        }
        resolve(javaScriptWorker);
    });
}
function getTypeScriptWorker() {
    return new monaco.Promise(function (resolve, reject) {
        if (!typeScriptWorker) {
            return reject("TypeScript not registered!");
        }
        resolve(typeScriptWorker);
    });
}
function setupMode(defaults, modeId) {
    var client = new _workerManager_js__WEBPACK_IMPORTED_MODULE_0__["WorkerManager"](modeId, defaults);
    var worker = function (first) {
        var more = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            more[_i - 1] = arguments[_i];
        }
        return client.getLanguageServiceWorker.apply(client, [first].concat(more));
    };
    monaco.languages.registerCompletionItemProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["SuggestAdapter"](worker));
    monaco.languages.registerSignatureHelpProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["SignatureHelpAdapter"](worker));
    monaco.languages.registerHoverProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["QuickInfoAdapter"](worker));
    monaco.languages.registerDocumentHighlightProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["OccurrencesAdapter"](worker));
    monaco.languages.registerDefinitionProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DefinitionAdapter"](worker));
    monaco.languages.registerReferenceProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["ReferenceAdapter"](worker));
    monaco.languages.registerDocumentSymbolProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["OutlineAdapter"](worker));
    monaco.languages.registerDocumentRangeFormattingEditProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["FormatAdapter"](worker));
    monaco.languages.registerOnTypeFormattingEditProvider(modeId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["FormatOnTypeAdapter"](worker));
    new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DiagnostcsAdapter"](defaults, modeId, worker);
    return worker;
}


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/typescript/workerManager.js":
/*!********************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/typescript/workerManager.js ***!
  \********************************************************************************/
/*! exports provided: WorkerManager */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "WorkerManager", function() { return WorkerManager; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var WorkerManager = /** @class */ (function () {
    function WorkerManager(modeId, defaults) {
        var _this = this;
        this._modeId = modeId;
        this._defaults = defaults;
        this._worker = null;
        this._idleCheckInterval = setInterval(function () { return _this._checkIfIdle(); }, 30 * 1000);
        this._lastUsedTime = 0;
        this._configChangeListener = this._defaults.onDidChange(function () { return _this._stopWorker(); });
    }
    WorkerManager.prototype._stopWorker = function () {
        if (this._worker) {
            this._worker.dispose();
            this._worker = null;
        }
        this._client = null;
    };
    WorkerManager.prototype.dispose = function () {
        clearInterval(this._idleCheckInterval);
        this._configChangeListener.dispose();
        this._stopWorker();
    };
    WorkerManager.prototype._checkIfIdle = function () {
        if (!this._worker) {
            return;
        }
        var maxIdleTime = this._defaults.getWorkerMaxIdleTime();
        var timePassedSinceLastUsed = Date.now() - this._lastUsedTime;
        if (maxIdleTime > 0 && timePassedSinceLastUsed > maxIdleTime) {
            this._stopWorker();
        }
    };
    WorkerManager.prototype._getClient = function () {
        var _this = this;
        this._lastUsedTime = Date.now();
        if (!this._client) {
            this._worker = monaco.editor.createWebWorker({
                // module that exports the create() method and returns a `TypeScriptWorker` instance
                moduleId: 'vs/language/typescript/tsWorker',
                label: this._modeId,
                // passed in to the create() method
                createData: {
                    compilerOptions: this._defaults.getCompilerOptions(),
                    extraLibs: this._defaults.getExtraLibs()
                }
            });
            var p = this._worker.getProxy();
            if (this._defaults.getEagerModelSync()) {
                p = p.then(function (worker) {
                    return _this._worker.withSyncedResources(monaco.editor.getModels()
                        .filter(function (model) { return model.getModeId() === _this._modeId; })
                        .map(function (model) { return model.uri; }));
                });
            }
            this._client = p;
        }
        return this._client;
    };
    WorkerManager.prototype.getLanguageServiceWorker = function () {
        var _this = this;
        var resources = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            resources[_i] = arguments[_i];
        }
        var _client;
        return this._getClient().then(function (client) {
            _client = client;
        }).then(function (_) {
            return _this._worker.withSyncedResources(resources);
        }).then(function (_) { return _client; });
    };
    return WorkerManager;
}());



/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9sYW5ndWFnZS90eXBlc2NyaXB0L2xhbmd1YWdlRmVhdHVyZXMuanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvdHlwZXNjcmlwdC90c01vZGUuanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvdHlwZXNjcmlwdC93b3JrZXJNYW5hZ2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNiLGlCQUFpQixTQUFJLElBQUksU0FBSTtBQUM3QjtBQUNBO0FBQ0EsY0FBYyxnQkFBZ0Isc0NBQXNDLGlCQUFpQixFQUFFO0FBQ3ZGLDZCQUE2Qix1REFBdUQ7QUFDcEY7QUFDQTtBQUNBO0FBQ0E7QUFDQSx1QkFBdUIsc0JBQXNCO0FBQzdDO0FBQ0E7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUMsa0NBQWtDO0FBQ25DO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrQkFBK0IsWUFBWTtBQUMzQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3REFBd0QseUJBQXlCLEVBQUU7QUFDbkY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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QiwrREFBYTtBQUNsQztBQUNBO0FBQ0Esd0JBQXdCLHVCQUF1QjtBQUMvQztBQUNBO0FBQ0E7QUFDQTtBQUNBLGdFQUFnRSxtRUFBK0I7QUFDL0YsK0RBQStELHlFQUFxQztBQUNwRyx1REFBdUQscUVBQWlDO0FBQ3hGLG1FQUFtRSx1RUFBbUM7QUFDdEcsNERBQTRELHNFQUFrQztBQUM5RiwyREFBMkQscUVBQWlDO0FBQzVGLGdFQUFnRSxtRUFBK0I7QUFDL0YsNkVBQTZFLGtFQUE4QjtBQUMzRyxzRUFBc0Usd0VBQW9DO0FBQzFHLFFBQVEsc0VBQWtDO0FBQzFDO0FBQ0E7Ozs7Ozs7Ozs7Ozs7QUNuREE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ2E7QUFDYjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwyREFBMkQsNkJBQTZCLEVBQUU7QUFDMUY7QUFDQSw2RUFBNkUsNEJBQTRCLEVBQUU7QUFDM0c7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0RBQWtELDRDQUE0QyxFQUFFO0FBQ2hHLCtDQUErQyxrQkFBa0IsRUFBRTtBQUNuRSxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHdCQUF3Qix1QkFBdUI7QUFDL0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBLFNBQVMscUJBQXFCLGdCQUFnQixFQUFFO0FBQ2hEO0FBQ0E7QUFDQSxDQUFDO0FBQ3dCIiwiZmlsZSI6IjM3LmJ1bmRsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbnZhciBfX2V4dGVuZHMgPSAodGhpcyAmJiB0aGlzLl9fZXh0ZW5kcykgfHwgKGZ1bmN0aW9uICgpIHtcclxuICAgIHZhciBleHRlbmRTdGF0aWNzID0gZnVuY3Rpb24gKGQsIGIpIHtcclxuICAgICAgICBleHRlbmRTdGF0aWNzID0gT2JqZWN0LnNldFByb3RvdHlwZU9mIHx8XHJcbiAgICAgICAgICAgICh7IF9fcHJvdG9fXzogW10gfSBpbnN0YW5jZW9mIEFycmF5ICYmIGZ1bmN0aW9uIChkLCBiKSB7IGQuX19wcm90b19fID0gYjsgfSkgfHxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGQsIGIpIHsgZm9yICh2YXIgcCBpbiBiKSBpZiAoYi5oYXNPd25Qcm9wZXJ0eShwKSkgZFtwXSA9IGJbcF07IH07XHJcbiAgICAgICAgcmV0dXJuIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKGQsIGIpIHtcclxuICAgICAgICBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG4gICAgICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxyXG4gICAgICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcclxuICAgIH07XHJcbn0pKCk7XHJcbnZhciBVcmkgPSBtb25hY28uVXJpO1xyXG52YXIgUHJvbWlzZSA9IG1vbmFjby5Qcm9taXNlO1xyXG4vLyNyZWdpb24gdXRpbHMgY29waWVkIGZyb20gdHlwZXNjcmlwdCB0byBwcmV2ZW50IGxvYWRpbmcgdGhlIGVudGlyZSB0eXBlc2NyaXB0U2VydmljZXMgLS0tXHJcbnZhciBJbmRlbnRTdHlsZTtcclxuKGZ1bmN0aW9uIChJbmRlbnRTdHlsZSkge1xyXG4gICAgSW5kZW50U3R5bGVbSW5kZW50U3R5bGVbXCJOb25lXCJdID0gMF0gPSBcIk5vbmVcIjtcclxuICAgIEluZGVudFN0eWxlW0luZGVudFN0eWxlW1wiQmxvY2tcIl0gPSAxXSA9IFwiQmxvY2tcIjtcclxuICAgIEluZGVudFN0eWxlW0luZGVudFN0eWxlW1wiU21hcnRcIl0gPSAyXSA9IFwiU21hcnRcIjtcclxufSkoSW5kZW50U3R5bGUgfHwgKEluZGVudFN0eWxlID0ge30pKTtcclxuZnVuY3Rpb24gZmxhdHRlbkRpYWdub3N0aWNNZXNzYWdlVGV4dChtZXNzYWdlVGV4dCwgbmV3TGluZSkge1xyXG4gICAgaWYgKHR5cGVvZiBtZXNzYWdlVGV4dCA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgIHJldHVybiBtZXNzYWdlVGV4dDtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHZhciBkaWFnbm9zdGljQ2hhaW4gPSBtZXNzYWdlVGV4dDtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gXCJcIjtcclxuICAgICAgICB2YXIgaW5kZW50ID0gMDtcclxuICAgICAgICB3aGlsZSAoZGlhZ25vc3RpY0NoYWluKSB7XHJcbiAgICAgICAgICAgIGlmIChpbmRlbnQpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBuZXdMaW5lO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbmRlbnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBcIiAgXCI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmVzdWx0ICs9IGRpYWdub3N0aWNDaGFpbi5tZXNzYWdlVGV4dDtcclxuICAgICAgICAgICAgaW5kZW50Kys7XHJcbiAgICAgICAgICAgIGRpYWdub3N0aWNDaGFpbiA9IGRpYWdub3N0aWNDaGFpbi5uZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59XHJcbmZ1bmN0aW9uIGRpc3BsYXlQYXJ0c1RvU3RyaW5nKGRpc3BsYXlQYXJ0cykge1xyXG4gICAgaWYgKGRpc3BsYXlQYXJ0cykge1xyXG4gICAgICAgIHJldHVybiBkaXNwbGF5UGFydHMubWFwKGZ1bmN0aW9uIChkaXNwbGF5UGFydCkgeyByZXR1cm4gZGlzcGxheVBhcnQudGV4dDsgfSkuam9pbihcIlwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiBcIlwiO1xyXG59XHJcbi8vI2VuZHJlZ2lvblxyXG52YXIgQWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIEFkYXB0ZXIoX3dvcmtlcikge1xyXG4gICAgICAgIHRoaXMuX3dvcmtlciA9IF93b3JrZXI7XHJcbiAgICB9XHJcbiAgICBBZGFwdGVyLnByb3RvdHlwZS5fcG9zaXRpb25Ub09mZnNldCA9IGZ1bmN0aW9uICh1cmksIHBvc2l0aW9uKSB7XHJcbiAgICAgICAgdmFyIG1vZGVsID0gbW9uYWNvLmVkaXRvci5nZXRNb2RlbCh1cmkpO1xyXG4gICAgICAgIHJldHVybiBtb2RlbC5nZXRPZmZzZXRBdChwb3NpdGlvbik7XHJcbiAgICB9O1xyXG4gICAgQWRhcHRlci5wcm90b3R5cGUuX29mZnNldFRvUG9zaXRpb24gPSBmdW5jdGlvbiAodXJpLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgbW9kZWwgPSBtb25hY28uZWRpdG9yLmdldE1vZGVsKHVyaSk7XHJcbiAgICAgICAgcmV0dXJuIG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcclxuICAgIH07XHJcbiAgICBBZGFwdGVyLnByb3RvdHlwZS5fdGV4dFNwYW5Ub1JhbmdlID0gZnVuY3Rpb24gKHVyaSwgc3Bhbikge1xyXG4gICAgICAgIHZhciBwMSA9IHRoaXMuX29mZnNldFRvUG9zaXRpb24odXJpLCBzcGFuLnN0YXJ0KTtcclxuICAgICAgICB2YXIgcDIgPSB0aGlzLl9vZmZzZXRUb1Bvc2l0aW9uKHVyaSwgc3Bhbi5zdGFydCArIHNwYW4ubGVuZ3RoKTtcclxuICAgICAgICB2YXIgc3RhcnRMaW5lTnVtYmVyID0gcDEubGluZU51bWJlciwgc3RhcnRDb2x1bW4gPSBwMS5jb2x1bW47XHJcbiAgICAgICAgdmFyIGVuZExpbmVOdW1iZXIgPSBwMi5saW5lTnVtYmVyLCBlbmRDb2x1bW4gPSBwMi5jb2x1bW47XHJcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBlbmRDb2x1bW4gfTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gQWRhcHRlcjtcclxufSgpKTtcclxuZXhwb3J0IHsgQWRhcHRlciB9O1xyXG4vLyAtLS0gZGlhZ25vc3RpY3MgLS0tIC0tLVxyXG52YXIgRGlhZ25vc3Rjc0FkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoX3N1cGVyKSB7XHJcbiAgICBfX2V4dGVuZHMoRGlhZ25vc3Rjc0FkYXB0ZXIsIF9zdXBlcik7XHJcbiAgICBmdW5jdGlvbiBEaWFnbm9zdGNzQWRhcHRlcihfZGVmYXVsdHMsIF9zZWxlY3Rvciwgd29ya2VyKSB7XHJcbiAgICAgICAgdmFyIF90aGlzID0gX3N1cGVyLmNhbGwodGhpcywgd29ya2VyKSB8fCB0aGlzO1xyXG4gICAgICAgIF90aGlzLl9kZWZhdWx0cyA9IF9kZWZhdWx0cztcclxuICAgICAgICBfdGhpcy5fc2VsZWN0b3IgPSBfc2VsZWN0b3I7XHJcbiAgICAgICAgX3RoaXMuX2Rpc3Bvc2FibGVzID0gW107XHJcbiAgICAgICAgX3RoaXMuX2xpc3RlbmVyID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxuICAgICAgICB2YXIgb25Nb2RlbEFkZCA9IGZ1bmN0aW9uIChtb2RlbCkge1xyXG4gICAgICAgICAgICBpZiAobW9kZWwuZ2V0TW9kZUlkKCkgIT09IF9zZWxlY3Rvcikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhciBoYW5kbGU7XHJcbiAgICAgICAgICAgIHZhciBjaGFuZ2VTdWJzY3JpcHRpb24gPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGhhbmRsZSk7XHJcbiAgICAgICAgICAgICAgICBoYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIF90aGlzLl9kb1ZhbGlkYXRlKG1vZGVsLnVyaSk7IH0sIDUwMCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBfdGhpcy5fbGlzdGVuZXJbbW9kZWwudXJpLnRvU3RyaW5nKCldID0ge1xyXG4gICAgICAgICAgICAgICAgZGlzcG9zZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZVN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGhhbmRsZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIF90aGlzLl9kb1ZhbGlkYXRlKG1vZGVsLnVyaSk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICB2YXIgb25Nb2RlbFJlbW92ZWQgPSBmdW5jdGlvbiAobW9kZWwpIHtcclxuICAgICAgICAgICAgbW9uYWNvLmVkaXRvci5zZXRNb2RlbE1hcmtlcnMobW9kZWwsIF90aGlzLl9zZWxlY3RvciwgW10pO1xyXG4gICAgICAgICAgICB2YXIga2V5ID0gbW9kZWwudXJpLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIGlmIChfdGhpcy5fbGlzdGVuZXJba2V5XSkge1xyXG4gICAgICAgICAgICAgICAgX3RoaXMuX2xpc3RlbmVyW2tleV0uZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgZGVsZXRlIF90aGlzLl9saXN0ZW5lcltrZXldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBfdGhpcy5fZGlzcG9zYWJsZXMucHVzaChtb25hY28uZWRpdG9yLm9uRGlkQ3JlYXRlTW9kZWwob25Nb2RlbEFkZCkpO1xyXG4gICAgICAgIF90aGlzLl9kaXNwb3NhYmxlcy5wdXNoKG1vbmFjby5lZGl0b3Iub25XaWxsRGlzcG9zZU1vZGVsKG9uTW9kZWxSZW1vdmVkKSk7XHJcbiAgICAgICAgX3RoaXMuX2Rpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgIG9uTW9kZWxSZW1vdmVkKGV2ZW50Lm1vZGVsKTtcclxuICAgICAgICAgICAgb25Nb2RlbEFkZChldmVudC5tb2RlbCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIF90aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHtcclxuICAgICAgICAgICAgZGlzcG9zZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgX2kgPSAwLCBfYSA9IG1vbmFjby5lZGl0b3IuZ2V0TW9kZWxzKCk7IF9pIDwgX2EubGVuZ3RoOyBfaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1vZGVsID0gX2FbX2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG9uTW9kZWxSZW1vdmVkKG1vZGVsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIF90aGlzLl9kaXNwb3NhYmxlcy5wdXNoKF90aGlzLl9kZWZhdWx0cy5vbkRpZENoYW5nZShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIC8vIHJlZG8gZGlhZ25vc3RpY3Mgd2hlbiBvcHRpb25zIGNoYW5nZVxyXG4gICAgICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gbW9uYWNvLmVkaXRvci5nZXRNb2RlbHMoKTsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBtb2RlbCA9IF9hW19pXTtcclxuICAgICAgICAgICAgICAgIG9uTW9kZWxSZW1vdmVkKG1vZGVsKTtcclxuICAgICAgICAgICAgICAgIG9uTW9kZWxBZGQobW9kZWwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIG1vbmFjby5lZGl0b3IuZ2V0TW9kZWxzKCkuZm9yRWFjaChvbk1vZGVsQWRkKTtcclxuICAgICAgICByZXR1cm4gX3RoaXM7XHJcbiAgICB9XHJcbiAgICBEaWFnbm9zdGNzQWRhcHRlci5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcy5mb3JFYWNoKGZ1bmN0aW9uIChkKSB7IHJldHVybiBkICYmIGQuZGlzcG9zZSgpOyB9KTtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IFtdO1xyXG4gICAgfTtcclxuICAgIERpYWdub3N0Y3NBZGFwdGVyLnByb3RvdHlwZS5fZG9WYWxpZGF0ZSA9IGZ1bmN0aW9uIChyZXNvdXJjZSkge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyKHJlc291cmNlKS50aGVuKGZ1bmN0aW9uICh3b3JrZXIpIHtcclxuICAgICAgICAgICAgaWYgKCFtb25hY28uZWRpdG9yLmdldE1vZGVsKHJlc291cmNlKSkge1xyXG4gICAgICAgICAgICAgICAgLy8gbW9kZWwgd2FzIGRpc3Bvc2VkIGluIHRoZSBtZWFudGltZVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIHByb21pc2VzID0gW107XHJcbiAgICAgICAgICAgIHZhciBfYSA9IF90aGlzLl9kZWZhdWx0cy5nZXREaWFnbm9zdGljc09wdGlvbnMoKSwgbm9TeW50YXhWYWxpZGF0aW9uID0gX2Eubm9TeW50YXhWYWxpZGF0aW9uLCBub1NlbWFudGljVmFsaWRhdGlvbiA9IF9hLm5vU2VtYW50aWNWYWxpZGF0aW9uO1xyXG4gICAgICAgICAgICBpZiAoIW5vU3ludGF4VmFsaWRhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh3b3JrZXIuZ2V0U3ludGFjdGljRGlhZ25vc3RpY3MocmVzb3VyY2UudG9TdHJpbmcoKSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghbm9TZW1hbnRpY1ZhbGlkYXRpb24pIHtcclxuICAgICAgICAgICAgICAgIHByb21pc2VzLnB1c2god29ya2VyLmdldFNlbWFudGljRGlhZ25vc3RpY3MocmVzb3VyY2UudG9TdHJpbmcoKSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmpvaW4ocHJvbWlzZXMpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGRpYWdub3N0aWNzKSB7XHJcbiAgICAgICAgICAgIGlmICghZGlhZ25vc3RpY3MgfHwgIW1vbmFjby5lZGl0b3IuZ2V0TW9kZWwocmVzb3VyY2UpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBtb2RlbCB3YXMgZGlzcG9zZWQgaW4gdGhlIG1lYW50aW1lXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgbWFya2VycyA9IGRpYWdub3N0aWNzXHJcbiAgICAgICAgICAgICAgICAucmVkdWNlKGZ1bmN0aW9uIChwLCBjKSB7IHJldHVybiBjLmNvbmNhdChwKTsgfSwgW10pXHJcbiAgICAgICAgICAgICAgICAubWFwKGZ1bmN0aW9uIChkKSB7IHJldHVybiBfdGhpcy5fY29udmVydERpYWdub3N0aWNzKHJlc291cmNlLCBkKTsgfSk7XHJcbiAgICAgICAgICAgIG1vbmFjby5lZGl0b3Iuc2V0TW9kZWxNYXJrZXJzKG1vbmFjby5lZGl0b3IuZ2V0TW9kZWwocmVzb3VyY2UpLCBfdGhpcy5fc2VsZWN0b3IsIG1hcmtlcnMpO1xyXG4gICAgICAgIH0pLnRoZW4odW5kZWZpbmVkLCBmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBEaWFnbm9zdGNzQWRhcHRlci5wcm90b3R5cGUuX2NvbnZlcnREaWFnbm9zdGljcyA9IGZ1bmN0aW9uIChyZXNvdXJjZSwgZGlhZykge1xyXG4gICAgICAgIHZhciBfYSA9IHRoaXMuX29mZnNldFRvUG9zaXRpb24ocmVzb3VyY2UsIGRpYWcuc3RhcnQpLCBzdGFydExpbmVOdW1iZXIgPSBfYS5saW5lTnVtYmVyLCBzdGFydENvbHVtbiA9IF9hLmNvbHVtbjtcclxuICAgICAgICB2YXIgX2IgPSB0aGlzLl9vZmZzZXRUb1Bvc2l0aW9uKHJlc291cmNlLCBkaWFnLnN0YXJ0ICsgZGlhZy5sZW5ndGgpLCBlbmRMaW5lTnVtYmVyID0gX2IubGluZU51bWJlciwgZW5kQ29sdW1uID0gX2IuY29sdW1uO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHNldmVyaXR5OiBtb25hY28uTWFya2VyU2V2ZXJpdHkuRXJyb3IsXHJcbiAgICAgICAgICAgIHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBzdGFydENvbHVtbjogc3RhcnRDb2x1bW4sXHJcbiAgICAgICAgICAgIGVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsXHJcbiAgICAgICAgICAgIGVuZENvbHVtbjogZW5kQ29sdW1uLFxyXG4gICAgICAgICAgICBtZXNzYWdlOiBmbGF0dGVuRGlhZ25vc3RpY01lc3NhZ2VUZXh0KGRpYWcubWVzc2FnZVRleHQsICdcXG4nKVxyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIERpYWdub3N0Y3NBZGFwdGVyO1xyXG59KEFkYXB0ZXIpKTtcclxuZXhwb3J0IHsgRGlhZ25vc3Rjc0FkYXB0ZXIgfTtcclxudmFyIFN1Z2dlc3RBZGFwdGVyID0gLyoqIEBjbGFzcyAqLyAoZnVuY3Rpb24gKF9zdXBlcikge1xyXG4gICAgX19leHRlbmRzKFN1Z2dlc3RBZGFwdGVyLCBfc3VwZXIpO1xyXG4gICAgZnVuY3Rpb24gU3VnZ2VzdEFkYXB0ZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIF9zdXBlciAhPT0gbnVsbCAmJiBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSB8fCB0aGlzO1xyXG4gICAgfVxyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFN1Z2dlc3RBZGFwdGVyLnByb3RvdHlwZSwgXCJ0cmlnZ2VyQ2hhcmFjdGVyc1wiLCB7XHJcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbJy4nXTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXHJcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXHJcbiAgICB9KTtcclxuICAgIFN1Z2dlc3RBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlQ29tcGxldGlvbkl0ZW1zID0gZnVuY3Rpb24gKG1vZGVsLCBwb3NpdGlvbiwgX2NvbnRleHQsIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIHdvcmRJbmZvID0gbW9kZWwuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zaXRpb24pO1xyXG4gICAgICAgIHZhciByZXNvdXJjZSA9IG1vZGVsLnVyaTtcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gdGhpcy5fcG9zaXRpb25Ub09mZnNldChyZXNvdXJjZSwgcG9zaXRpb24pO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldENvbXBsZXRpb25zQXRQb3NpdGlvbihyZXNvdXJjZS50b1N0cmluZygpLCBvZmZzZXQpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGluZm8pIHtcclxuICAgICAgICAgICAgaWYgKCFpbmZvKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIHN1Z2dlc3Rpb25zID0gaW5mby5lbnRyaWVzLm1hcChmdW5jdGlvbiAoZW50cnkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdXJpOiByZXNvdXJjZSxcclxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogcG9zaXRpb24sXHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVudHJ5Lm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0VGV4dDogZW50cnkubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBzb3J0VGV4dDogZW50cnkuc29ydFRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogU3VnZ2VzdEFkYXB0ZXIuY29udmVydEtpbmQoZW50cnkua2luZClcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IHN1Z2dlc3Rpb25zXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgU3VnZ2VzdEFkYXB0ZXIucHJvdG90eXBlLnJlc29sdmVDb21wbGV0aW9uSXRlbSA9IGZ1bmN0aW9uIChfbW9kZWwsIF9wb3NpdGlvbiwgaXRlbSwgdG9rZW4pIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xyXG4gICAgICAgIHZhciBteUl0ZW0gPSBpdGVtO1xyXG4gICAgICAgIHZhciByZXNvdXJjZSA9IG15SXRlbS51cmk7XHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gbXlJdGVtLnBvc2l0aW9uO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldENvbXBsZXRpb25FbnRyeURldGFpbHMocmVzb3VyY2UudG9TdHJpbmcoKSwgX3RoaXMuX3Bvc2l0aW9uVG9PZmZzZXQocmVzb3VyY2UsIHBvc2l0aW9uKSwgbXlJdGVtLmxhYmVsKTtcclxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChkZXRhaWxzKSB7XHJcbiAgICAgICAgICAgIGlmICghZGV0YWlscykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG15SXRlbTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgdXJpOiByZXNvdXJjZSxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBwb3NpdGlvbixcclxuICAgICAgICAgICAgICAgIGxhYmVsOiBkZXRhaWxzLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBraW5kOiBTdWdnZXN0QWRhcHRlci5jb252ZXJ0S2luZChkZXRhaWxzLmtpbmQpLFxyXG4gICAgICAgICAgICAgICAgZGV0YWlsOiBkaXNwbGF5UGFydHNUb1N0cmluZyhkZXRhaWxzLmRpc3BsYXlQYXJ0cyksXHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudGF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGRpc3BsYXlQYXJ0c1RvU3RyaW5nKGRldGFpbHMuZG9jdW1lbnRhdGlvbilcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBTdWdnZXN0QWRhcHRlci5jb252ZXJ0S2luZCA9IGZ1bmN0aW9uIChraW5kKSB7XHJcbiAgICAgICAgc3dpdGNoIChraW5kKSB7XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5wcmltaXRpdmVUeXBlOlxyXG4gICAgICAgICAgICBjYXNlIEtpbmQua2V5d29yZDpcclxuICAgICAgICAgICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkO1xyXG4gICAgICAgICAgICBjYXNlIEtpbmQudmFyaWFibGU6XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5sb2NhbFZhcmlhYmxlOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vbmFjby5sYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlO1xyXG4gICAgICAgICAgICBjYXNlIEtpbmQubWVtYmVyVmFyaWFibGU6XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5tZW1iZXJHZXRBY2Nlc3NvcjpcclxuICAgICAgICAgICAgY2FzZSBLaW5kLm1lbWJlclNldEFjY2Vzc29yOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vbmFjby5sYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkO1xyXG4gICAgICAgICAgICBjYXNlIEtpbmQuZnVuY3Rpb246XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5tZW1iZXJGdW5jdGlvbjpcclxuICAgICAgICAgICAgY2FzZSBLaW5kLmNvbnN0cnVjdFNpZ25hdHVyZTpcclxuICAgICAgICAgICAgY2FzZSBLaW5kLmNhbGxTaWduYXR1cmU6XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5pbmRleFNpZ25hdHVyZTpcclxuICAgICAgICAgICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5GdW5jdGlvbjtcclxuICAgICAgICAgICAgY2FzZSBLaW5kLmVudW06XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9uYWNvLmxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bTtcclxuICAgICAgICAgICAgY2FzZSBLaW5kLm1vZHVsZTpcclxuICAgICAgICAgICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGU7XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC5jbGFzczpcclxuICAgICAgICAgICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5DbGFzcztcclxuICAgICAgICAgICAgY2FzZSBLaW5kLmludGVyZmFjZTpcclxuICAgICAgICAgICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5JbnRlcmZhY2U7XHJcbiAgICAgICAgICAgIGNhc2UgS2luZC53YXJuaW5nOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vbmFjby5sYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gU3VnZ2VzdEFkYXB0ZXI7XHJcbn0oQWRhcHRlcikpO1xyXG5leHBvcnQgeyBTdWdnZXN0QWRhcHRlciB9O1xyXG52YXIgU2lnbmF0dXJlSGVscEFkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoX3N1cGVyKSB7XHJcbiAgICBfX2V4dGVuZHMoU2lnbmF0dXJlSGVscEFkYXB0ZXIsIF9zdXBlcik7XHJcbiAgICBmdW5jdGlvbiBTaWduYXR1cmVIZWxwQWRhcHRlcigpIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSBfc3VwZXIgIT09IG51bGwgJiYgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfHwgdGhpcztcclxuICAgICAgICBfdGhpcy5zaWduYXR1cmVIZWxwVHJpZ2dlckNoYXJhY3RlcnMgPSBbJygnLCAnLCddO1xyXG4gICAgICAgIHJldHVybiBfdGhpcztcclxuICAgIH1cclxuICAgIFNpZ25hdHVyZUhlbHBBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlU2lnbmF0dXJlSGVscCA9IGZ1bmN0aW9uIChtb2RlbCwgcG9zaXRpb24sIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7IHJldHVybiB3b3JrZXIuZ2V0U2lnbmF0dXJlSGVscEl0ZW1zKHJlc291cmNlLnRvU3RyaW5nKCksIF90aGlzLl9wb3NpdGlvblRvT2Zmc2V0KHJlc291cmNlLCBwb3NpdGlvbikpOyB9KS50aGVuKGZ1bmN0aW9uIChpbmZvKSB7XHJcbiAgICAgICAgICAgIGlmICghaW5mbykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhciByZXQgPSB7XHJcbiAgICAgICAgICAgICAgICBhY3RpdmVTaWduYXR1cmU6IGluZm8uc2VsZWN0ZWRJdGVtSW5kZXgsXHJcbiAgICAgICAgICAgICAgICBhY3RpdmVQYXJhbWV0ZXI6IGluZm8uYXJndW1lbnRJbmRleCxcclxuICAgICAgICAgICAgICAgIHNpZ25hdHVyZXM6IFtdXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGluZm8uaXRlbXMuZm9yRWFjaChmdW5jdGlvbiAoaXRlbSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHNpZ25hdHVyZSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJycsXHJcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnRhdGlvbjogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiBbXVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIHNpZ25hdHVyZS5sYWJlbCArPSBkaXNwbGF5UGFydHNUb1N0cmluZyhpdGVtLnByZWZpeERpc3BsYXlQYXJ0cyk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLnBhcmFtZXRlcnMuZm9yRWFjaChmdW5jdGlvbiAocCwgaSwgYSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBsYWJlbCA9IGRpc3BsYXlQYXJ0c1RvU3RyaW5nKHAuZGlzcGxheVBhcnRzKTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyYW1ldGVyID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50YXRpb246IGRpc3BsYXlQYXJ0c1RvU3RyaW5nKHAuZG9jdW1lbnRhdGlvbilcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHNpZ25hdHVyZS5sYWJlbCArPSBsYWJlbDtcclxuICAgICAgICAgICAgICAgICAgICBzaWduYXR1cmUucGFyYW1ldGVycy5wdXNoKHBhcmFtZXRlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgPCBhLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2lnbmF0dXJlLmxhYmVsICs9IGRpc3BsYXlQYXJ0c1RvU3RyaW5nKGl0ZW0uc2VwYXJhdG9yRGlzcGxheVBhcnRzKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHNpZ25hdHVyZS5sYWJlbCArPSBkaXNwbGF5UGFydHNUb1N0cmluZyhpdGVtLnN1ZmZpeERpc3BsYXlQYXJ0cyk7XHJcbiAgICAgICAgICAgICAgICByZXQuc2lnbmF0dXJlcy5wdXNoKHNpZ25hdHVyZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gcmV0O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBTaWduYXR1cmVIZWxwQWRhcHRlcjtcclxufShBZGFwdGVyKSk7XHJcbmV4cG9ydCB7IFNpZ25hdHVyZUhlbHBBZGFwdGVyIH07XHJcbi8vIC0tLSBob3ZlciAtLS0tLS1cclxudmFyIFF1aWNrSW5mb0FkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoX3N1cGVyKSB7XHJcbiAgICBfX2V4dGVuZHMoUXVpY2tJbmZvQWRhcHRlciwgX3N1cGVyKTtcclxuICAgIGZ1bmN0aW9uIFF1aWNrSW5mb0FkYXB0ZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIF9zdXBlciAhPT0gbnVsbCAmJiBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSB8fCB0aGlzO1xyXG4gICAgfVxyXG4gICAgUXVpY2tJbmZvQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZUhvdmVyID0gZnVuY3Rpb24gKG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4pIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xyXG4gICAgICAgIHZhciByZXNvdXJjZSA9IG1vZGVsLnVyaTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fd29ya2VyKHJlc291cmNlKS50aGVuKGZ1bmN0aW9uICh3b3JrZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHdvcmtlci5nZXRRdWlja0luZm9BdFBvc2l0aW9uKHJlc291cmNlLnRvU3RyaW5nKCksIF90aGlzLl9wb3NpdGlvblRvT2Zmc2V0KHJlc291cmNlLCBwb3NpdGlvbikpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGluZm8pIHtcclxuICAgICAgICAgICAgaWYgKCFpbmZvKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGRvY3VtZW50YXRpb24gPSBkaXNwbGF5UGFydHNUb1N0cmluZyhpbmZvLmRvY3VtZW50YXRpb24pO1xyXG4gICAgICAgICAgICB2YXIgdGFncyA9IGluZm8udGFncyA/IGluZm8udGFncy5tYXAoZnVuY3Rpb24gKHRhZykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gXCIqQFwiICsgdGFnLm5hbWUgKyBcIipcIjtcclxuICAgICAgICAgICAgICAgIGlmICghdGFnLnRleHQpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbGFiZWw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbGFiZWwgKyAodGFnLnRleHQubWF0Y2goL1xcclxcbnxcXG4vZykgPyAnIFxcbicgKyB0YWcudGV4dCA6IFwiIC0gXCIgKyB0YWcudGV4dCk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuam9pbignICBcXG5cXG4nKSA6ICcnO1xyXG4gICAgICAgICAgICB2YXIgY29udGVudHMgPSBkaXNwbGF5UGFydHNUb1N0cmluZyhpbmZvLmRpc3BsYXlQYXJ0cyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICByYW5nZTogX3RoaXMuX3RleHRTcGFuVG9SYW5nZShyZXNvdXJjZSwgaW5mby50ZXh0U3BhbiksXHJcbiAgICAgICAgICAgICAgICBjb250ZW50czogW3tcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6ICdgYGBqc1xcbicgKyBjb250ZW50cyArICdcXG5gYGBcXG4nXHJcbiAgICAgICAgICAgICAgICAgICAgfSwge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogZG9jdW1lbnRhdGlvbiArICh0YWdzID8gJ1xcblxcbicgKyB0YWdzIDogJycpXHJcbiAgICAgICAgICAgICAgICAgICAgfV1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gUXVpY2tJbmZvQWRhcHRlcjtcclxufShBZGFwdGVyKSk7XHJcbmV4cG9ydCB7IFF1aWNrSW5mb0FkYXB0ZXIgfTtcclxuLy8gLS0tIG9jY3VycmVuY2VzIC0tLS0tLVxyXG52YXIgT2NjdXJyZW5jZXNBZGFwdGVyID0gLyoqIEBjbGFzcyAqLyAoZnVuY3Rpb24gKF9zdXBlcikge1xyXG4gICAgX19leHRlbmRzKE9jY3VycmVuY2VzQWRhcHRlciwgX3N1cGVyKTtcclxuICAgIGZ1bmN0aW9uIE9jY3VycmVuY2VzQWRhcHRlcigpIHtcclxuICAgICAgICByZXR1cm4gX3N1cGVyICE9PSBudWxsICYmIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIHx8IHRoaXM7XHJcbiAgICB9XHJcbiAgICBPY2N1cnJlbmNlc0FkYXB0ZXIucHJvdG90eXBlLnByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMgPSBmdW5jdGlvbiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbikge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldE9jY3VycmVuY2VzQXRQb3NpdGlvbihyZXNvdXJjZS50b1N0cmluZygpLCBfdGhpcy5fcG9zaXRpb25Ub09mZnNldChyZXNvdXJjZSwgcG9zaXRpb24pKTtcclxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChlbnRyaWVzKSB7XHJcbiAgICAgICAgICAgIGlmICghZW50cmllcykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBlbnRyaWVzLm1hcChmdW5jdGlvbiAoZW50cnkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2U6IF90aGlzLl90ZXh0U3BhblRvUmFuZ2UocmVzb3VyY2UsIGVudHJ5LnRleHRTcGFuKSxcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiBlbnRyeS5pc1dyaXRlQWNjZXNzID8gbW9uYWNvLmxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQuV3JpdGUgOiBtb25hY28ubGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0S2luZC5UZXh0XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gT2NjdXJyZW5jZXNBZGFwdGVyO1xyXG59KEFkYXB0ZXIpKTtcclxuZXhwb3J0IHsgT2NjdXJyZW5jZXNBZGFwdGVyIH07XHJcbi8vIC0tLSBkZWZpbml0aW9uIC0tLS0tLVxyXG52YXIgRGVmaW5pdGlvbkFkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoX3N1cGVyKSB7XHJcbiAgICBfX2V4dGVuZHMoRGVmaW5pdGlvbkFkYXB0ZXIsIF9zdXBlcik7XHJcbiAgICBmdW5jdGlvbiBEZWZpbml0aW9uQWRhcHRlcigpIHtcclxuICAgICAgICByZXR1cm4gX3N1cGVyICE9PSBudWxsICYmIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIHx8IHRoaXM7XHJcbiAgICB9XHJcbiAgICBEZWZpbml0aW9uQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZURlZmluaXRpb24gPSBmdW5jdGlvbiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbikge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldERlZmluaXRpb25BdFBvc2l0aW9uKHJlc291cmNlLnRvU3RyaW5nKCksIF90aGlzLl9wb3NpdGlvblRvT2Zmc2V0KHJlc291cmNlLCBwb3NpdGlvbikpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGVudHJpZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFlbnRyaWVzKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBfaSA9IDAsIGVudHJpZXNfMSA9IGVudHJpZXM7IF9pIDwgZW50cmllc18xLmxlbmd0aDsgX2krKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGVudHJ5ID0gZW50cmllc18xW19pXTtcclxuICAgICAgICAgICAgICAgIHZhciB1cmkgPSBVcmkucGFyc2UoZW50cnkuZmlsZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vbmFjby5lZGl0b3IuZ2V0TW9kZWwodXJpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXJpOiB1cmksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlOiBfdGhpcy5fdGV4dFNwYW5Ub1JhbmdlKHVyaSwgZW50cnkudGV4dFNwYW4pXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gRGVmaW5pdGlvbkFkYXB0ZXI7XHJcbn0oQWRhcHRlcikpO1xyXG5leHBvcnQgeyBEZWZpbml0aW9uQWRhcHRlciB9O1xyXG4vLyAtLS0gcmVmZXJlbmNlcyAtLS0tLS1cclxudmFyIFJlZmVyZW5jZUFkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoX3N1cGVyKSB7XHJcbiAgICBfX2V4dGVuZHMoUmVmZXJlbmNlQWRhcHRlciwgX3N1cGVyKTtcclxuICAgIGZ1bmN0aW9uIFJlZmVyZW5jZUFkYXB0ZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIF9zdXBlciAhPT0gbnVsbCAmJiBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSB8fCB0aGlzO1xyXG4gICAgfVxyXG4gICAgUmVmZXJlbmNlQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZVJlZmVyZW5jZXMgPSBmdW5jdGlvbiAobW9kZWwsIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbikge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKHJlc291cmNlLnRvU3RyaW5nKCksIF90aGlzLl9wb3NpdGlvblRvT2Zmc2V0KHJlc291cmNlLCBwb3NpdGlvbikpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGVudHJpZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFlbnRyaWVzKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBfaSA9IDAsIGVudHJpZXNfMiA9IGVudHJpZXM7IF9pIDwgZW50cmllc18yLmxlbmd0aDsgX2krKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGVudHJ5ID0gZW50cmllc18yW19pXTtcclxuICAgICAgICAgICAgICAgIHZhciB1cmkgPSBVcmkucGFyc2UoZW50cnkuZmlsZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vbmFjby5lZGl0b3IuZ2V0TW9kZWwodXJpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXJpOiB1cmksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlOiBfdGhpcy5fdGV4dFNwYW5Ub1JhbmdlKHVyaSwgZW50cnkudGV4dFNwYW4pXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gUmVmZXJlbmNlQWRhcHRlcjtcclxufShBZGFwdGVyKSk7XHJcbmV4cG9ydCB7IFJlZmVyZW5jZUFkYXB0ZXIgfTtcclxuLy8gLS0tIG91dGxpbmUgLS0tLS0tXHJcbnZhciBPdXRsaW5lQWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uIChfc3VwZXIpIHtcclxuICAgIF9fZXh0ZW5kcyhPdXRsaW5lQWRhcHRlciwgX3N1cGVyKTtcclxuICAgIGZ1bmN0aW9uIE91dGxpbmVBZGFwdGVyKCkge1xyXG4gICAgICAgIHJldHVybiBfc3VwZXIgIT09IG51bGwgJiYgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfHwgdGhpcztcclxuICAgIH1cclxuICAgIE91dGxpbmVBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlRG9jdW1lbnRTeW1ib2xzID0gZnVuY3Rpb24gKG1vZGVsLCB0b2tlbikge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikgeyByZXR1cm4gd29ya2VyLmdldE5hdmlnYXRpb25CYXJJdGVtcyhyZXNvdXJjZS50b1N0cmluZygpKTsgfSkudGhlbihmdW5jdGlvbiAoaXRlbXMpIHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtcykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24gKGJ1Y2tldCwgaXRlbSwgY29udGFpbmVyTGFiZWwpIHtcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogaXRlbS50ZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogJycsXHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogKG91dGxpbmVUeXBlVGFibGVbaXRlbS5raW5kXSB8fCBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQuVmFyaWFibGUpLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlOiBfdGhpcy5fdGV4dFNwYW5Ub1JhbmdlKHJlc291cmNlLCBpdGVtLnNwYW5zWzBdKSxcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25SYW5nZTogX3RoaXMuX3RleHRTcGFuVG9SYW5nZShyZXNvdXJjZSwgaXRlbS5zcGFuc1swXSksXHJcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyTmFtZTogY29udGFpbmVyTGFiZWxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5jaGlsZEl0ZW1zICYmIGl0ZW0uY2hpbGRJdGVtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgX2kgPSAwLCBfYSA9IGl0ZW0uY2hpbGRJdGVtczsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNoaWxkID0gX2FbX2ldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJ0KGJ1Y2tldCwgY2hpbGQsIHJlc3VsdC5uYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBidWNrZXQucHVzaChyZXN1bHQpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIGNvbnZlcnQocmVzdWx0LCBpdGVtKTsgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIE91dGxpbmVBZGFwdGVyO1xyXG59KEFkYXB0ZXIpKTtcclxuZXhwb3J0IHsgT3V0bGluZUFkYXB0ZXIgfTtcclxudmFyIEtpbmQgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XHJcbiAgICBmdW5jdGlvbiBLaW5kKCkge1xyXG4gICAgfVxyXG4gICAgS2luZC51bmtub3duID0gJyc7XHJcbiAgICBLaW5kLmtleXdvcmQgPSAna2V5d29yZCc7XHJcbiAgICBLaW5kLnNjcmlwdCA9ICdzY3JpcHQnO1xyXG4gICAgS2luZC5tb2R1bGUgPSAnbW9kdWxlJztcclxuICAgIEtpbmQuY2xhc3MgPSAnY2xhc3MnO1xyXG4gICAgS2luZC5pbnRlcmZhY2UgPSAnaW50ZXJmYWNlJztcclxuICAgIEtpbmQudHlwZSA9ICd0eXBlJztcclxuICAgIEtpbmQuZW51bSA9ICdlbnVtJztcclxuICAgIEtpbmQudmFyaWFibGUgPSAndmFyJztcclxuICAgIEtpbmQubG9jYWxWYXJpYWJsZSA9ICdsb2NhbCB2YXInO1xyXG4gICAgS2luZC5mdW5jdGlvbiA9ICdmdW5jdGlvbic7XHJcbiAgICBLaW5kLmxvY2FsRnVuY3Rpb24gPSAnbG9jYWwgZnVuY3Rpb24nO1xyXG4gICAgS2luZC5tZW1iZXJGdW5jdGlvbiA9ICdtZXRob2QnO1xyXG4gICAgS2luZC5tZW1iZXJHZXRBY2Nlc3NvciA9ICdnZXR0ZXInO1xyXG4gICAgS2luZC5tZW1iZXJTZXRBY2Nlc3NvciA9ICdzZXR0ZXInO1xyXG4gICAgS2luZC5tZW1iZXJWYXJpYWJsZSA9ICdwcm9wZXJ0eSc7XHJcbiAgICBLaW5kLmNvbnN0cnVjdG9ySW1wbGVtZW50YXRpb24gPSAnY29uc3RydWN0b3InO1xyXG4gICAgS2luZC5jYWxsU2lnbmF0dXJlID0gJ2NhbGwnO1xyXG4gICAgS2luZC5pbmRleFNpZ25hdHVyZSA9ICdpbmRleCc7XHJcbiAgICBLaW5kLmNvbnN0cnVjdFNpZ25hdHVyZSA9ICdjb25zdHJ1Y3QnO1xyXG4gICAgS2luZC5wYXJhbWV0ZXIgPSAncGFyYW1ldGVyJztcclxuICAgIEtpbmQudHlwZVBhcmFtZXRlciA9ICd0eXBlIHBhcmFtZXRlcic7XHJcbiAgICBLaW5kLnByaW1pdGl2ZVR5cGUgPSAncHJpbWl0aXZlIHR5cGUnO1xyXG4gICAgS2luZC5sYWJlbCA9ICdsYWJlbCc7XHJcbiAgICBLaW5kLmFsaWFzID0gJ2FsaWFzJztcclxuICAgIEtpbmQuY29uc3QgPSAnY29uc3QnO1xyXG4gICAgS2luZC5sZXQgPSAnbGV0JztcclxuICAgIEtpbmQud2FybmluZyA9ICd3YXJuaW5nJztcclxuICAgIHJldHVybiBLaW5kO1xyXG59KCkpO1xyXG5leHBvcnQgeyBLaW5kIH07XHJcbnZhciBvdXRsaW5lVHlwZVRhYmxlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLm1vZHVsZV0gPSBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQuTW9kdWxlO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQuY2xhc3NdID0gbW9uYWNvLmxhbmd1YWdlcy5TeW1ib2xLaW5kLkNsYXNzO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQuZW51bV0gPSBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRW51bTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLmludGVyZmFjZV0gPSBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQuSW50ZXJmYWNlO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQubWVtYmVyRnVuY3Rpb25dID0gbW9uYWNvLmxhbmd1YWdlcy5TeW1ib2xLaW5kLk1ldGhvZDtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLm1lbWJlclZhcmlhYmxlXSA9IG1vbmFjby5sYW5ndWFnZXMuU3ltYm9sS2luZC5Qcm9wZXJ0eTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLm1lbWJlckdldEFjY2Vzc29yXSA9IG1vbmFjby5sYW5ndWFnZXMuU3ltYm9sS2luZC5Qcm9wZXJ0eTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLm1lbWJlclNldEFjY2Vzc29yXSA9IG1vbmFjby5sYW5ndWFnZXMuU3ltYm9sS2luZC5Qcm9wZXJ0eTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLnZhcmlhYmxlXSA9IG1vbmFjby5sYW5ndWFnZXMuU3ltYm9sS2luZC5WYXJpYWJsZTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLmNvbnN0XSA9IG1vbmFjby5sYW5ndWFnZXMuU3ltYm9sS2luZC5WYXJpYWJsZTtcclxub3V0bGluZVR5cGVUYWJsZVtLaW5kLmxvY2FsVmFyaWFibGVdID0gbW9uYWNvLmxhbmd1YWdlcy5TeW1ib2xLaW5kLlZhcmlhYmxlO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQudmFyaWFibGVdID0gbW9uYWNvLmxhbmd1YWdlcy5TeW1ib2xLaW5kLlZhcmlhYmxlO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQuZnVuY3Rpb25dID0gbW9uYWNvLmxhbmd1YWdlcy5TeW1ib2xLaW5kLkZ1bmN0aW9uO1xyXG5vdXRsaW5lVHlwZVRhYmxlW0tpbmQubG9jYWxGdW5jdGlvbl0gPSBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRnVuY3Rpb247XHJcbi8vIC0tLSBmb3JtYXR0aW5nIC0tLS1cclxudmFyIEZvcm1hdEhlbHBlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uIChfc3VwZXIpIHtcclxuICAgIF9fZXh0ZW5kcyhGb3JtYXRIZWxwZXIsIF9zdXBlcik7XHJcbiAgICBmdW5jdGlvbiBGb3JtYXRIZWxwZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIF9zdXBlciAhPT0gbnVsbCAmJiBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSB8fCB0aGlzO1xyXG4gICAgfVxyXG4gICAgRm9ybWF0SGVscGVyLl9jb252ZXJ0T3B0aW9ucyA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgQ29udmVydFRhYnNUb1NwYWNlczogb3B0aW9ucy5pbnNlcnRTcGFjZXMsXHJcbiAgICAgICAgICAgIFRhYlNpemU6IG9wdGlvbnMudGFiU2l6ZSxcclxuICAgICAgICAgICAgSW5kZW50U2l6ZTogb3B0aW9ucy50YWJTaXplLFxyXG4gICAgICAgICAgICBJbmRlbnRTdHlsZTogSW5kZW50U3R5bGUuU21hcnQsXHJcbiAgICAgICAgICAgIE5ld0xpbmVDaGFyYWN0ZXI6ICdcXG4nLFxyXG4gICAgICAgICAgICBJbnNlcnRTcGFjZUFmdGVyQ29tbWFEZWxpbWl0ZXI6IHRydWUsXHJcbiAgICAgICAgICAgIEluc2VydFNwYWNlQWZ0ZXJTZW1pY29sb25JbkZvclN0YXRlbWVudHM6IHRydWUsXHJcbiAgICAgICAgICAgIEluc2VydFNwYWNlQmVmb3JlQW5kQWZ0ZXJCaW5hcnlPcGVyYXRvcnM6IHRydWUsXHJcbiAgICAgICAgICAgIEluc2VydFNwYWNlQWZ0ZXJLZXl3b3Jkc0luQ29udHJvbEZsb3dTdGF0ZW1lbnRzOiB0cnVlLFxyXG4gICAgICAgICAgICBJbnNlcnRTcGFjZUFmdGVyRnVuY3Rpb25LZXl3b3JkRm9yQW5vbnltb3VzRnVuY3Rpb25zOiB0cnVlLFxyXG4gICAgICAgICAgICBJbnNlcnRTcGFjZUFmdGVyT3BlbmluZ0FuZEJlZm9yZUNsb3NpbmdOb25lbXB0eVBhcmVudGhlc2lzOiBmYWxzZSxcclxuICAgICAgICAgICAgSW5zZXJ0U3BhY2VBZnRlck9wZW5pbmdBbmRCZWZvcmVDbG9zaW5nTm9uZW1wdHlCcmFja2V0czogZmFsc2UsXHJcbiAgICAgICAgICAgIEluc2VydFNwYWNlQWZ0ZXJPcGVuaW5nQW5kQmVmb3JlQ2xvc2luZ1RlbXBsYXRlU3RyaW5nQnJhY2VzOiBmYWxzZSxcclxuICAgICAgICAgICAgUGxhY2VPcGVuQnJhY2VPbk5ld0xpbmVGb3JDb250cm9sQmxvY2tzOiBmYWxzZSxcclxuICAgICAgICAgICAgUGxhY2VPcGVuQnJhY2VPbk5ld0xpbmVGb3JGdW5jdGlvbnM6IGZhbHNlXHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBGb3JtYXRIZWxwZXIucHJvdG90eXBlLl9jb252ZXJ0VGV4dENoYW5nZXMgPSBmdW5jdGlvbiAodXJpLCBjaGFuZ2UpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0ZXh0OiBjaGFuZ2UubmV3VGV4dCxcclxuICAgICAgICAgICAgcmFuZ2U6IHRoaXMuX3RleHRTcGFuVG9SYW5nZSh1cmksIGNoYW5nZS5zcGFuKVxyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIEZvcm1hdEhlbHBlcjtcclxufShBZGFwdGVyKSk7XHJcbmV4cG9ydCB7IEZvcm1hdEhlbHBlciB9O1xyXG52YXIgRm9ybWF0QWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uIChfc3VwZXIpIHtcclxuICAgIF9fZXh0ZW5kcyhGb3JtYXRBZGFwdGVyLCBfc3VwZXIpO1xyXG4gICAgZnVuY3Rpb24gRm9ybWF0QWRhcHRlcigpIHtcclxuICAgICAgICByZXR1cm4gX3N1cGVyICE9PSBudWxsICYmIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIHx8IHRoaXM7XHJcbiAgICB9XHJcbiAgICBGb3JtYXRBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyA9IGZ1bmN0aW9uIChtb2RlbCwgcmFuZ2UsIG9wdGlvbnMsIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB3b3JrZXIuZ2V0Rm9ybWF0dGluZ0VkaXRzRm9yUmFuZ2UocmVzb3VyY2UudG9TdHJpbmcoKSwgX3RoaXMuX3Bvc2l0aW9uVG9PZmZzZXQocmVzb3VyY2UsIHsgbGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uIH0pLCBfdGhpcy5fcG9zaXRpb25Ub09mZnNldChyZXNvdXJjZSwgeyBsaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLCBjb2x1bW46IHJhbmdlLmVuZENvbHVtbiB9KSwgRm9ybWF0SGVscGVyLl9jb252ZXJ0T3B0aW9ucyhvcHRpb25zKSk7XHJcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZWRpdHMpIHtcclxuICAgICAgICAgICAgaWYgKGVkaXRzKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdHMubWFwKGZ1bmN0aW9uIChlZGl0KSB7IHJldHVybiBfdGhpcy5fY29udmVydFRleHRDaGFuZ2VzKHJlc291cmNlLCBlZGl0KTsgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gRm9ybWF0QWRhcHRlcjtcclxufShGb3JtYXRIZWxwZXIpKTtcclxuZXhwb3J0IHsgRm9ybWF0QWRhcHRlciB9O1xyXG52YXIgRm9ybWF0T25UeXBlQWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uIChfc3VwZXIpIHtcclxuICAgIF9fZXh0ZW5kcyhGb3JtYXRPblR5cGVBZGFwdGVyLCBfc3VwZXIpO1xyXG4gICAgZnVuY3Rpb24gRm9ybWF0T25UeXBlQWRhcHRlcigpIHtcclxuICAgICAgICByZXR1cm4gX3N1cGVyICE9PSBudWxsICYmIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIHx8IHRoaXM7XHJcbiAgICB9XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRm9ybWF0T25UeXBlQWRhcHRlci5wcm90b3R5cGUsIFwiYXV0b0Zvcm1hdFRyaWdnZXJDaGFyYWN0ZXJzXCIsIHtcclxuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFsnOycsICd9JywgJ1xcbiddO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcclxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcclxuICAgIH0pO1xyXG4gICAgRm9ybWF0T25UeXBlQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cyA9IGZ1bmN0aW9uIChtb2RlbCwgcG9zaXRpb24sIGNoLCBvcHRpb25zLCB0b2tlbikge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gd29ya2VyLmdldEZvcm1hdHRpbmdFZGl0c0FmdGVyS2V5c3Ryb2tlKHJlc291cmNlLnRvU3RyaW5nKCksIF90aGlzLl9wb3NpdGlvblRvT2Zmc2V0KHJlc291cmNlLCBwb3NpdGlvbiksIGNoLCBGb3JtYXRIZWxwZXIuX2NvbnZlcnRPcHRpb25zKG9wdGlvbnMpKTtcclxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChlZGl0cykge1xyXG4gICAgICAgICAgICBpZiAoZWRpdHMpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBlZGl0cy5tYXAoZnVuY3Rpb24gKGVkaXQpIHsgcmV0dXJuIF90aGlzLl9jb252ZXJ0VGV4dENoYW5nZXMocmVzb3VyY2UsIGVkaXQpOyB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBGb3JtYXRPblR5cGVBZGFwdGVyO1xyXG59KEZvcm1hdEhlbHBlcikpO1xyXG5leHBvcnQgeyBGb3JtYXRPblR5cGVBZGFwdGVyIH07XHJcbiIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4ndXNlIHN0cmljdCc7XHJcbmltcG9ydCB7IFdvcmtlck1hbmFnZXIgfSBmcm9tICcuL3dvcmtlck1hbmFnZXIuanMnO1xyXG5pbXBvcnQgKiBhcyBsYW5ndWFnZUZlYXR1cmVzIGZyb20gJy4vbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XHJcbnZhciBqYXZhU2NyaXB0V29ya2VyO1xyXG52YXIgdHlwZVNjcmlwdFdvcmtlcjtcclxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwVHlwZVNjcmlwdChkZWZhdWx0cykge1xyXG4gICAgdHlwZVNjcmlwdFdvcmtlciA9IHNldHVwTW9kZShkZWZhdWx0cywgJ3R5cGVzY3JpcHQnKTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBKYXZhU2NyaXB0KGRlZmF1bHRzKSB7XHJcbiAgICBqYXZhU2NyaXB0V29ya2VyID0gc2V0dXBNb2RlKGRlZmF1bHRzLCAnamF2YXNjcmlwdCcpO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRKYXZhU2NyaXB0V29ya2VyKCkge1xyXG4gICAgcmV0dXJuIG5ldyBtb25hY28uUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgaWYgKCFqYXZhU2NyaXB0V29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoXCJKYXZhU2NyaXB0IG5vdCByZWdpc3RlcmVkIVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzb2x2ZShqYXZhU2NyaXB0V29ya2VyKTtcclxuICAgIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRUeXBlU2NyaXB0V29ya2VyKCkge1xyXG4gICAgcmV0dXJuIG5ldyBtb25hY28uUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgaWYgKCF0eXBlU2NyaXB0V29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoXCJUeXBlU2NyaXB0IG5vdCByZWdpc3RlcmVkIVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzb2x2ZSh0eXBlU2NyaXB0V29ya2VyKTtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHNldHVwTW9kZShkZWZhdWx0cywgbW9kZUlkKSB7XHJcbiAgICB2YXIgY2xpZW50ID0gbmV3IFdvcmtlck1hbmFnZXIobW9kZUlkLCBkZWZhdWx0cyk7XHJcbiAgICB2YXIgd29ya2VyID0gZnVuY3Rpb24gKGZpcnN0KSB7XHJcbiAgICAgICAgdmFyIG1vcmUgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBfaSA9IDE7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xyXG4gICAgICAgICAgICBtb3JlW19pIC0gMV0gPSBhcmd1bWVudHNbX2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY2xpZW50LmdldExhbmd1YWdlU2VydmljZVdvcmtlci5hcHBseShjbGllbnQsIFtmaXJzdF0uY29uY2F0KG1vcmUpKTtcclxuICAgIH07XHJcbiAgICBtb25hY28ubGFuZ3VhZ2VzLnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihtb2RlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLlN1Z2dlc3RBZGFwdGVyKHdvcmtlcikpO1xyXG4gICAgbW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihtb2RlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLlNpZ25hdHVyZUhlbHBBZGFwdGVyKHdvcmtlcikpO1xyXG4gICAgbW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckhvdmVyUHJvdmlkZXIobW9kZUlkLCBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5RdWlja0luZm9BZGFwdGVyKHdvcmtlcikpO1xyXG4gICAgbW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIobW9kZUlkLCBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5PY2N1cnJlbmNlc0FkYXB0ZXIod29ya2VyKSk7XHJcbiAgICBtb25hY28ubGFuZ3VhZ2VzLnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG1vZGVJZCwgbmV3IGxhbmd1YWdlRmVhdHVyZXMuRGVmaW5pdGlvbkFkYXB0ZXIod29ya2VyKSk7XHJcbiAgICBtb25hY28ubGFuZ3VhZ2VzLnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIobW9kZUlkLCBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5SZWZlcmVuY2VBZGFwdGVyKHdvcmtlcikpO1xyXG4gICAgbW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIobW9kZUlkLCBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5PdXRsaW5lQWRhcHRlcih3b3JrZXIpKTtcclxuICAgIG1vbmFjby5sYW5ndWFnZXMucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihtb2RlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLkZvcm1hdEFkYXB0ZXIod29ya2VyKSk7XHJcbiAgICBtb25hY28ubGFuZ3VhZ2VzLnJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihtb2RlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLkZvcm1hdE9uVHlwZUFkYXB0ZXIod29ya2VyKSk7XHJcbiAgICBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5EaWFnbm9zdGNzQWRhcHRlcihkZWZhdWx0cywgbW9kZUlkLCB3b3JrZXIpO1xyXG4gICAgcmV0dXJuIHdvcmtlcjtcclxufVxyXG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG52YXIgV29ya2VyTWFuYWdlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIFdvcmtlck1hbmFnZXIobW9kZUlkLCBkZWZhdWx0cykge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdGhpcy5fbW9kZUlkID0gbW9kZUlkO1xyXG4gICAgICAgIHRoaXMuX2RlZmF1bHRzID0gZGVmYXVsdHM7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyID0gbnVsbDtcclxuICAgICAgICB0aGlzLl9pZGxlQ2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgcmV0dXJuIF90aGlzLl9jaGVja0lmSWRsZSgpOyB9LCAzMCAqIDEwMDApO1xyXG4gICAgICAgIHRoaXMuX2xhc3RVc2VkVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5fY29uZmlnQ2hhbmdlTGlzdGVuZXIgPSB0aGlzLl9kZWZhdWx0cy5vbkRpZENoYW5nZShmdW5jdGlvbiAoKSB7IHJldHVybiBfdGhpcy5fc3RvcFdvcmtlcigpOyB9KTtcclxuICAgIH1cclxuICAgIFdvcmtlck1hbmFnZXIucHJvdG90eXBlLl9zdG9wV29ya2VyID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGlmICh0aGlzLl93b3JrZXIpIHtcclxuICAgICAgICAgICAgdGhpcy5fd29ya2VyLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgdGhpcy5fd29ya2VyID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5fY2xpZW50ID0gbnVsbDtcclxuICAgIH07XHJcbiAgICBXb3JrZXJNYW5hZ2VyLnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5faWRsZUNoZWNrSW50ZXJ2YWwpO1xyXG4gICAgICAgIHRoaXMuX2NvbmZpZ0NoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcclxuICAgICAgICB0aGlzLl9zdG9wV29ya2VyKCk7XHJcbiAgICB9O1xyXG4gICAgV29ya2VyTWFuYWdlci5wcm90b3R5cGUuX2NoZWNrSWZJZGxlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5fd29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIG1heElkbGVUaW1lID0gdGhpcy5fZGVmYXVsdHMuZ2V0V29ya2VyTWF4SWRsZVRpbWUoKTtcclxuICAgICAgICB2YXIgdGltZVBhc3NlZFNpbmNlTGFzdFVzZWQgPSBEYXRlLm5vdygpIC0gdGhpcy5fbGFzdFVzZWRUaW1lO1xyXG4gICAgICAgIGlmIChtYXhJZGxlVGltZSA+IDAgJiYgdGltZVBhc3NlZFNpbmNlTGFzdFVzZWQgPiBtYXhJZGxlVGltZSkge1xyXG4gICAgICAgICAgICB0aGlzLl9zdG9wV29ya2VyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFdvcmtlck1hbmFnZXIucHJvdG90eXBlLl9nZXRDbGllbnQgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcclxuICAgICAgICB0aGlzLl9sYXN0VXNlZFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgIGlmICghdGhpcy5fY2xpZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3dvcmtlciA9IG1vbmFjby5lZGl0b3IuY3JlYXRlV2ViV29ya2VyKHtcclxuICAgICAgICAgICAgICAgIC8vIG1vZHVsZSB0aGF0IGV4cG9ydHMgdGhlIGNyZWF0ZSgpIG1ldGhvZCBhbmQgcmV0dXJucyBhIGBUeXBlU2NyaXB0V29ya2VyYCBpbnN0YW5jZVxyXG4gICAgICAgICAgICAgICAgbW9kdWxlSWQ6ICd2cy9sYW5ndWFnZS90eXBlc2NyaXB0L3RzV29ya2VyJyxcclxuICAgICAgICAgICAgICAgIGxhYmVsOiB0aGlzLl9tb2RlSWQsXHJcbiAgICAgICAgICAgICAgICAvLyBwYXNzZWQgaW4gdG8gdGhlIGNyZWF0ZSgpIG1ldGhvZFxyXG4gICAgICAgICAgICAgICAgY3JlYXRlRGF0YToge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBpbGVyT3B0aW9uczogdGhpcy5fZGVmYXVsdHMuZ2V0Q29tcGlsZXJPcHRpb25zKCksXHJcbiAgICAgICAgICAgICAgICAgICAgZXh0cmFMaWJzOiB0aGlzLl9kZWZhdWx0cy5nZXRFeHRyYUxpYnMoKVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdmFyIHAgPSB0aGlzLl93b3JrZXIuZ2V0UHJveHkoKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX2RlZmF1bHRzLmdldEVhZ2VyTW9kZWxTeW5jKCkpIHtcclxuICAgICAgICAgICAgICAgIHAgPSBwLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBfdGhpcy5fd29ya2VyLndpdGhTeW5jZWRSZXNvdXJjZXMobW9uYWNvLmVkaXRvci5nZXRNb2RlbHMoKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uIChtb2RlbCkgeyByZXR1cm4gbW9kZWwuZ2V0TW9kZUlkKCkgPT09IF90aGlzLl9tb2RlSWQ7IH0pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24gKG1vZGVsKSB7IHJldHVybiBtb2RlbC51cmk7IH0pKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuX2NsaWVudCA9IHA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLl9jbGllbnQ7XHJcbiAgICB9O1xyXG4gICAgV29ya2VyTWFuYWdlci5wcm90b3R5cGUuZ2V0TGFuZ3VhZ2VTZXJ2aWNlV29ya2VyID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc291cmNlcyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XHJcbiAgICAgICAgICAgIHJlc291cmNlc1tfaV0gPSBhcmd1bWVudHNbX2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgX2NsaWVudDtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZ2V0Q2xpZW50KCkudGhlbihmdW5jdGlvbiAoY2xpZW50KSB7XHJcbiAgICAgICAgICAgIF9jbGllbnQgPSBjbGllbnQ7XHJcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoXykge1xyXG4gICAgICAgICAgICByZXR1cm4gX3RoaXMuX3dvcmtlci53aXRoU3luY2VkUmVzb3VyY2VzKHJlc291cmNlcyk7XHJcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoXykgeyByZXR1cm4gX2NsaWVudDsgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIFdvcmtlck1hbmFnZXI7XHJcbn0oKSk7XHJcbmV4cG9ydCB7IFdvcmtlck1hbmFnZXIgfTtcclxuIl0sInNvdXJjZVJvb3QiOiIifQ==