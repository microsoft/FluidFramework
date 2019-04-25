(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[34],{

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/edit.js":
/*!*****************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/edit.js ***!
  \*****************************************************************************************/
/*! exports provided: removeProperty, setProperty, applyEdit, isWS */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "removeProperty", function() { return removeProperty; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "setProperty", function() { return setProperty; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "applyEdit", function() { return applyEdit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isWS", function() { return isWS; });
/* harmony import */ var _format_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./format.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/format.js");
/* harmony import */ var _parser_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./parser.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/parser.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



function removeProperty(text, path, formattingOptions) {
    return setProperty(text, path, void 0, formattingOptions);
}
function setProperty(text, originalPath, value, formattingOptions, getInsertionIndex) {
    var path = originalPath.slice();
    var errors = [];
    var root = Object(_parser_js__WEBPACK_IMPORTED_MODULE_1__["parseTree"])(text, errors);
    var parent = void 0;
    var lastSegment = void 0;
    while (path.length > 0) {
        lastSegment = path.pop();
        parent = Object(_parser_js__WEBPACK_IMPORTED_MODULE_1__["findNodeAtLocation"])(root, path);
        if (parent === void 0 && value !== void 0) {
            if (typeof lastSegment === 'string') {
                value = (_a = {}, _a[lastSegment] = value, _a);
            }
            else {
                value = [value];
            }
        }
        else {
            break;
        }
    }
    if (!parent) {
        // empty document
        if (value === void 0) { // delete
            throw new Error('Can not delete in empty document');
        }
        return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, formattingOptions);
    }
    else if (parent.type === 'object' && typeof lastSegment === 'string' && Array.isArray(parent.children)) {
        var existing = Object(_parser_js__WEBPACK_IMPORTED_MODULE_1__["findNodeAtLocation"])(parent, [lastSegment]);
        if (existing !== void 0) {
            if (value === void 0) { // delete
                if (!existing.parent) {
                    throw new Error('Malformed AST');
                }
                var propertyIndex = parent.children.indexOf(existing.parent);
                var removeBegin = void 0;
                var removeEnd = existing.parent.offset + existing.parent.length;
                if (propertyIndex > 0) {
                    // remove the comma of the previous node
                    var previous = parent.children[propertyIndex - 1];
                    removeBegin = previous.offset + previous.length;
                }
                else {
                    removeBegin = parent.offset + 1;
                    if (parent.children.length > 1) {
                        // remove the comma of the next node
                        var next = parent.children[1];
                        removeEnd = next.offset;
                    }
                }
                return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: '' }, formattingOptions);
            }
            else {
                // set value of existing property
                return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, formattingOptions);
            }
        }
        else {
            if (value === void 0) { // delete
                return []; // property does not exist, nothing to do
            }
            var newProperty = JSON.stringify(lastSegment) + ": " + JSON.stringify(value);
            var index = getInsertionIndex ? getInsertionIndex(parent.children.map(function (p) { return p.children[0].value; })) : parent.children.length;
            var edit = void 0;
            if (index > 0) {
                var previous = parent.children[index - 1];
                edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty };
            }
            else if (parent.children.length === 0) {
                edit = { offset: parent.offset + 1, length: 0, content: newProperty };
            }
            else {
                edit = { offset: parent.offset + 1, length: 0, content: newProperty + ',' };
            }
            return withFormatting(text, edit, formattingOptions);
        }
    }
    else if (parent.type === 'array' && typeof lastSegment === 'number' && Array.isArray(parent.children)) {
        var insertIndex = lastSegment;
        if (insertIndex === -1) {
            // Insert
            var newProperty = "" + JSON.stringify(value);
            var edit = void 0;
            if (parent.children.length === 0) {
                edit = { offset: parent.offset + 1, length: 0, content: newProperty };
            }
            else {
                var previous = parent.children[parent.children.length - 1];
                edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty };
            }
            return withFormatting(text, edit, formattingOptions);
        }
        else {
            if (value === void 0 && parent.children.length >= 0) {
                //Removal
                var removalIndex = lastSegment;
                var toRemove = parent.children[removalIndex];
                var edit = void 0;
                if (parent.children.length === 1) {
                    // only item
                    edit = { offset: parent.offset + 1, length: parent.length - 2, content: '' };
                }
                else if (parent.children.length - 1 === removalIndex) {
                    // last item
                    var previous = parent.children[removalIndex - 1];
                    var offset = previous.offset + previous.length;
                    var parentEndOffset = parent.offset + parent.length;
                    edit = { offset: offset, length: parentEndOffset - 2 - offset, content: '' };
                }
                else {
                    edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: '' };
                }
                return withFormatting(text, edit, formattingOptions);
            }
            else {
                throw new Error('Array modification not supported yet');
            }
        }
    }
    else {
        throw new Error("Can not add " + (typeof lastSegment !== 'number' ? 'index' : 'property') + " to parent of type " + parent.type);
    }
    var _a;
}
function withFormatting(text, edit, formattingOptions) {
    // apply the edit
    var newText = applyEdit(text, edit);
    // format the new text
    var begin = edit.offset;
    var end = edit.offset + edit.content.length;
    if (edit.length === 0 || edit.content.length === 0) { // insert or remove
        while (begin > 0 && !Object(_format_js__WEBPACK_IMPORTED_MODULE_0__["isEOL"])(newText, begin - 1)) {
            begin--;
        }
        while (end < newText.length && !Object(_format_js__WEBPACK_IMPORTED_MODULE_0__["isEOL"])(newText, end)) {
            end++;
        }
    }
    var edits = Object(_format_js__WEBPACK_IMPORTED_MODULE_0__["format"])(newText, { offset: begin, length: end - begin }, formattingOptions);
    // apply the formatting edits and track the begin and end offsets of the changes
    for (var i = edits.length - 1; i >= 0; i--) {
        var edit_1 = edits[i];
        newText = applyEdit(newText, edit_1);
        begin = Math.min(begin, edit_1.offset);
        end = Math.max(end, edit_1.offset + edit_1.length);
        end += edit_1.content.length - edit_1.length;
    }
    // create a single edit with all changes
    var editLength = text.length - (newText.length - end) - begin;
    return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text, edit) {
    return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}
function isWS(text, offset) {
    return '\r\n \t'.indexOf(text.charAt(offset)) !== -1;
}
//# sourceMappingURL=edit.js.map

/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/format.js":
/*!*******************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/format.js ***!
  \*******************************************************************************************/
/*! exports provided: format, isEOL */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "format", function() { return format; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isEOL", function() { return isEOL; });
/* harmony import */ var _scanner_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./scanner.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/scanner.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


function format(documentText, range, options) {
    var initialIndentLevel;
    var formatText;
    var formatTextStart;
    var rangeStart;
    var rangeEnd;
    if (range) {
        rangeStart = range.offset;
        rangeEnd = rangeStart + range.length;
        formatTextStart = rangeStart;
        while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
            formatTextStart--;
        }
        var endOffset = rangeEnd;
        while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
            endOffset++;
        }
        formatText = documentText.substring(formatTextStart, endOffset);
        initialIndentLevel = computeIndentLevel(formatText, options);
    }
    else {
        formatText = documentText;
        initialIndentLevel = 0;
        formatTextStart = 0;
        rangeStart = 0;
        rangeEnd = documentText.length;
    }
    var eol = getEOL(options, documentText);
    var lineBreak = false;
    var indentLevel = 0;
    var indentValue;
    if (options.insertSpaces) {
        indentValue = repeat(' ', options.tabSize || 4);
    }
    else {
        indentValue = '\t';
    }
    var scanner = Object(_scanner_js__WEBPACK_IMPORTED_MODULE_0__["createScanner"])(formatText, false);
    var hasError = false;
    function newLineAndIndent() {
        return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    function scanNext() {
        var token = scanner.scan();
        lineBreak = false;
        while (token === 15 /* Trivia */ || token === 14 /* LineBreakTrivia */) {
            lineBreak = lineBreak || (token === 14 /* LineBreakTrivia */);
            token = scanner.scan();
        }
        hasError = token === 16 /* Unknown */ || scanner.getTokenError() !== 0 /* None */;
        return token;
    }
    var editOperations = [];
    function addEdit(text, startOffset, endOffset) {
        if (!hasError && startOffset < rangeEnd && endOffset > rangeStart && documentText.substring(startOffset, endOffset) !== text) {
            editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
        }
    }
    var firstToken = scanNext();
    if (firstToken !== 17 /* EOF */) {
        var firstTokenStart = scanner.getTokenOffset() + formatTextStart;
        var initialIndent = repeat(indentValue, initialIndentLevel);
        addEdit(initialIndent, formatTextStart, firstTokenStart);
    }
    while (firstToken !== 17 /* EOF */) {
        var firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
        var secondToken = scanNext();
        var replaceContent = '';
        while (!lineBreak && (secondToken === 12 /* LineCommentTrivia */ || secondToken === 13 /* BlockCommentTrivia */)) {
            // comments on the same line: keep them on the same line, but ignore them otherwise
            var commentTokenStart = scanner.getTokenOffset() + formatTextStart;
            addEdit(' ', firstTokenEnd, commentTokenStart);
            firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
            replaceContent = secondToken === 12 /* LineCommentTrivia */ ? newLineAndIndent() : '';
            secondToken = scanNext();
        }
        if (secondToken === 2 /* CloseBraceToken */) {
            if (firstToken !== 1 /* OpenBraceToken */) {
                indentLevel--;
                replaceContent = newLineAndIndent();
            }
        }
        else if (secondToken === 4 /* CloseBracketToken */) {
            if (firstToken !== 3 /* OpenBracketToken */) {
                indentLevel--;
                replaceContent = newLineAndIndent();
            }
        }
        else {
            switch (firstToken) {
                case 3 /* OpenBracketToken */:
                case 1 /* OpenBraceToken */:
                    indentLevel++;
                    replaceContent = newLineAndIndent();
                    break;
                case 5 /* CommaToken */:
                case 12 /* LineCommentTrivia */:
                    replaceContent = newLineAndIndent();
                    break;
                case 13 /* BlockCommentTrivia */:
                    if (lineBreak) {
                        replaceContent = newLineAndIndent();
                    }
                    else {
                        // symbol following comment on the same line: keep on same line, separate with ' '
                        replaceContent = ' ';
                    }
                    break;
                case 6 /* ColonToken */:
                    replaceContent = ' ';
                    break;
                case 10 /* StringLiteral */:
                    if (secondToken === 6 /* ColonToken */) {
                        replaceContent = '';
                        break;
                    }
                // fall through
                case 7 /* NullKeyword */:
                case 8 /* TrueKeyword */:
                case 9 /* FalseKeyword */:
                case 11 /* NumericLiteral */:
                case 2 /* CloseBraceToken */:
                case 4 /* CloseBracketToken */:
                    if (secondToken === 12 /* LineCommentTrivia */ || secondToken === 13 /* BlockCommentTrivia */) {
                        replaceContent = ' ';
                    }
                    else if (secondToken !== 5 /* CommaToken */ && secondToken !== 17 /* EOF */) {
                        hasError = true;
                    }
                    break;
                case 16 /* Unknown */:
                    hasError = true;
                    break;
            }
            if (lineBreak && (secondToken === 12 /* LineCommentTrivia */ || secondToken === 13 /* BlockCommentTrivia */)) {
                replaceContent = newLineAndIndent();
            }
        }
        var secondTokenStart = scanner.getTokenOffset() + formatTextStart;
        addEdit(replaceContent, firstTokenEnd, secondTokenStart);
        firstToken = secondToken;
    }
    return editOperations;
}
function repeat(s, count) {
    var result = '';
    for (var i = 0; i < count; i++) {
        result += s;
    }
    return result;
}
function computeIndentLevel(content, options) {
    var i = 0;
    var nChars = 0;
    var tabSize = options.tabSize || 4;
    while (i < content.length) {
        var ch = content.charAt(i);
        if (ch === ' ') {
            nChars++;
        }
        else if (ch === '\t') {
            nChars += tabSize;
        }
        else {
            break;
        }
        i++;
    }
    return Math.floor(nChars / tabSize);
}
function getEOL(options, text) {
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ch === '\r') {
            if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
                return '\r\n';
            }
            return '\r';
        }
        else if (ch === '\n') {
            return '\n';
        }
    }
    return (options && options.eol) || '\n';
}
function isEOL(text, offset) {
    return '\r\n'.indexOf(text.charAt(offset)) !== -1;
}
//# sourceMappingURL=format.js.map

/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/parser.js":
/*!*******************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/parser.js ***!
  \*******************************************************************************************/
/*! exports provided: getLocation, parse, parseTree, findNodeAtLocation, getNodePath, getNodeValue, contains, findNodeAtOffset, visit, stripComments */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getLocation", function() { return getLocation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "parse", function() { return parse; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "parseTree", function() { return parseTree; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "findNodeAtLocation", function() { return findNodeAtLocation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getNodePath", function() { return getNodePath; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getNodeValue", function() { return getNodeValue; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "contains", function() { return contains; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "findNodeAtOffset", function() { return findNodeAtOffset; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "visit", function() { return visit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "stripComments", function() { return stripComments; });
/* harmony import */ var _scanner_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./scanner.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/scanner.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
function getLocation(text, position) {
    var segments = []; // strings or numbers
    var earlyReturnException = new Object();
    var previousNode = void 0;
    var previousNodeInst = {
        value: {},
        offset: 0,
        length: 0,
        type: 'object',
        parent: void 0
    };
    var isAtPropertyKey = false;
    function setPreviousNode(value, offset, length, type) {
        previousNodeInst.value = value;
        previousNodeInst.offset = offset;
        previousNodeInst.length = length;
        previousNodeInst.type = type;
        previousNodeInst.colonOffset = void 0;
        previousNode = previousNodeInst;
    }
    try {
        visit(text, {
            onObjectBegin: function (offset, length) {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = void 0;
                isAtPropertyKey = position > offset;
                segments.push(''); // push a placeholder (will be replaced)
            },
            onObjectProperty: function (name, offset, length) {
                if (position < offset) {
                    throw earlyReturnException;
                }
                setPreviousNode(name, offset, length, 'property');
                segments[segments.length - 1] = name;
                if (position <= offset + length) {
                    throw earlyReturnException;
                }
            },
            onObjectEnd: function (offset, length) {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = void 0;
                segments.pop();
            },
            onArrayBegin: function (offset, length) {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = void 0;
                segments.push(0);
            },
            onArrayEnd: function (offset, length) {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = void 0;
                segments.pop();
            },
            onLiteralValue: function (value, offset, length) {
                if (position < offset) {
                    throw earlyReturnException;
                }
                setPreviousNode(value, offset, length, getLiteralNodeType(value));
                if (position <= offset + length) {
                    throw earlyReturnException;
                }
            },
            onSeparator: function (sep, offset, length) {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                if (sep === ':' && previousNode && previousNode.type === 'property') {
                    previousNode.colonOffset = offset;
                    isAtPropertyKey = false;
                    previousNode = void 0;
                }
                else if (sep === ',') {
                    var last = segments[segments.length - 1];
                    if (typeof last === 'number') {
                        segments[segments.length - 1] = last + 1;
                    }
                    else {
                        isAtPropertyKey = true;
                        segments[segments.length - 1] = '';
                    }
                    previousNode = void 0;
                }
            }
        });
    }
    catch (e) {
        if (e !== earlyReturnException) {
            throw e;
        }
    }
    return {
        path: segments,
        previousNode: previousNode,
        isAtPropertyKey: isAtPropertyKey,
        matches: function (pattern) {
            var k = 0;
            for (var i = 0; k < pattern.length && i < segments.length; i++) {
                if (pattern[k] === segments[i] || pattern[k] === '*') {
                    k++;
                }
                else if (pattern[k] !== '**') {
                    return false;
                }
            }
            return k === pattern.length;
        }
    };
}
/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
function parse(text, errors, options) {
    if (errors === void 0) { errors = []; }
    var currentProperty = null;
    var currentParent = [];
    var previousParents = [];
    function onValue(value) {
        if (Array.isArray(currentParent)) {
            currentParent.push(value);
        }
        else if (currentProperty) {
            currentParent[currentProperty] = value;
        }
    }
    var visitor = {
        onObjectBegin: function () {
            var object = {};
            onValue(object);
            previousParents.push(currentParent);
            currentParent = object;
            currentProperty = null;
        },
        onObjectProperty: function (name) {
            currentProperty = name;
        },
        onObjectEnd: function () {
            currentParent = previousParents.pop();
        },
        onArrayBegin: function () {
            var array = [];
            onValue(array);
            previousParents.push(currentParent);
            currentParent = array;
            currentProperty = null;
        },
        onArrayEnd: function () {
            currentParent = previousParents.pop();
        },
        onLiteralValue: onValue,
        onError: function (error, offset, length) {
            errors.push({ error: error, offset: offset, length: length });
        }
    };
    visit(text, visitor, options);
    return currentParent[0];
}
/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
function parseTree(text, errors, options) {
    if (errors === void 0) { errors = []; }
    var currentParent = { type: 'array', offset: -1, length: -1, children: [], parent: void 0 }; // artificial root
    function ensurePropertyComplete(endOffset) {
        if (currentParent.type === 'property') {
            currentParent.length = endOffset - currentParent.offset;
            currentParent = currentParent.parent;
        }
    }
    function onValue(valueNode) {
        currentParent.children.push(valueNode);
        return valueNode;
    }
    var visitor = {
        onObjectBegin: function (offset) {
            currentParent = onValue({ type: 'object', offset: offset, length: -1, parent: currentParent, children: [] });
        },
        onObjectProperty: function (name, offset, length) {
            currentParent = onValue({ type: 'property', offset: offset, length: -1, parent: currentParent, children: [] });
            currentParent.children.push({ type: 'string', value: name, offset: offset, length: length, parent: currentParent });
        },
        onObjectEnd: function (offset, length) {
            currentParent.length = offset + length - currentParent.offset;
            currentParent = currentParent.parent;
            ensurePropertyComplete(offset + length);
        },
        onArrayBegin: function (offset, length) {
            currentParent = onValue({ type: 'array', offset: offset, length: -1, parent: currentParent, children: [] });
        },
        onArrayEnd: function (offset, length) {
            currentParent.length = offset + length - currentParent.offset;
            currentParent = currentParent.parent;
            ensurePropertyComplete(offset + length);
        },
        onLiteralValue: function (value, offset, length) {
            onValue({ type: getLiteralNodeType(value), offset: offset, length: length, parent: currentParent, value: value });
            ensurePropertyComplete(offset + length);
        },
        onSeparator: function (sep, offset, length) {
            if (currentParent.type === 'property') {
                if (sep === ':') {
                    currentParent.colonOffset = offset;
                }
                else if (sep === ',') {
                    ensurePropertyComplete(offset);
                }
            }
        },
        onError: function (error, offset, length) {
            errors.push({ error: error, offset: offset, length: length });
        }
    };
    visit(text, visitor, options);
    var result = currentParent.children[0];
    if (result) {
        delete result.parent;
    }
    return result;
}
/**
 * Finds the node at the given path in a JSON DOM.
 */
function findNodeAtLocation(root, path) {
    if (!root) {
        return void 0;
    }
    var node = root;
    for (var _i = 0, path_1 = path; _i < path_1.length; _i++) {
        var segment = path_1[_i];
        if (typeof segment === 'string') {
            if (node.type !== 'object' || !Array.isArray(node.children)) {
                return void 0;
            }
            var found = false;
            for (var _a = 0, _b = node.children; _a < _b.length; _a++) {
                var propertyNode = _b[_a];
                if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment) {
                    node = propertyNode.children[1];
                    found = true;
                    break;
                }
            }
            if (!found) {
                return void 0;
            }
        }
        else {
            var index = segment;
            if (node.type !== 'array' || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
                return void 0;
            }
            node = node.children[index];
        }
    }
    return node;
}
/**
 * Gets the JSON path of the given JSON DOM node
 */
function getNodePath(node) {
    if (!node.parent || !node.parent.children) {
        return [];
    }
    var path = getNodePath(node.parent);
    if (node.parent.type === 'property') {
        var key = node.parent.children[0].value;
        path.push(key);
    }
    else if (node.parent.type === 'array') {
        var index = node.parent.children.indexOf(node);
        if (index !== -1) {
            path.push(index);
        }
    }
    return path;
}
/**
 * Evaluates the JavaScript object of the given JSON DOM node
 */
function getNodeValue(node) {
    switch (node.type) {
        case 'array':
            return node.children.map(getNodeValue);
        case 'object':
            var obj = Object.create(null);
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var prop = _a[_i];
                var valueNode = prop.children[1];
                if (valueNode) {
                    obj[prop.children[0].value] = getNodeValue(valueNode);
                }
            }
            return obj;
        case 'null':
        case 'string':
        case 'number':
        case 'boolean':
            return node.value;
        default:
            return void 0;
    }
}
function contains(node, offset, includeRightBound) {
    if (includeRightBound === void 0) { includeRightBound = false; }
    return (offset >= node.offset && offset < (node.offset + node.length)) || includeRightBound && (offset === (node.offset + node.length));
}
/**
 * Finds the most inner node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
function findNodeAtOffset(node, offset, includeRightBound) {
    if (includeRightBound === void 0) { includeRightBound = false; }
    if (contains(node, offset, includeRightBound)) {
        var children = node.children;
        if (Array.isArray(children)) {
            for (var i = 0; i < children.length && children[i].offset <= offset; i++) {
                var item = findNodeAtOffset(children[i], offset, includeRightBound);
                if (item) {
                    return item;
                }
            }
        }
        return node;
    }
    return void 0;
}
/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
function visit(text, visitor, options) {
    var _scanner = Object(_scanner_js__WEBPACK_IMPORTED_MODULE_0__["createScanner"])(text, false);
    function toNoArgVisit(visitFunction) {
        return visitFunction ? function () { return visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength()); } : function () { return true; };
    }
    function toOneArgVisit(visitFunction) {
        return visitFunction ? function (arg) { return visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength()); } : function () { return true; };
    }
    var onObjectBegin = toNoArgVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisit(visitor.onObjectProperty), onObjectEnd = toNoArgVisit(visitor.onObjectEnd), onArrayBegin = toNoArgVisit(visitor.onArrayBegin), onArrayEnd = toNoArgVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisit(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
    var disallowComments = options && options.disallowComments;
    var allowTrailingComma = options && options.allowTrailingComma;
    function scanNext() {
        while (true) {
            var token = _scanner.scan();
            switch (_scanner.getTokenError()) {
                case 4 /* InvalidUnicode */:
                    handleError(14 /* InvalidUnicode */);
                    break;
                case 5 /* InvalidEscapeCharacter */:
                    handleError(15 /* InvalidEscapeCharacter */);
                    break;
                case 3 /* UnexpectedEndOfNumber */:
                    handleError(13 /* UnexpectedEndOfNumber */);
                    break;
                case 1 /* UnexpectedEndOfComment */:
                    if (!disallowComments) {
                        handleError(11 /* UnexpectedEndOfComment */);
                    }
                    break;
                case 2 /* UnexpectedEndOfString */:
                    handleError(12 /* UnexpectedEndOfString */);
                    break;
                case 6 /* InvalidCharacter */:
                    handleError(16 /* InvalidCharacter */);
                    break;
            }
            switch (token) {
                case 12 /* LineCommentTrivia */:
                case 13 /* BlockCommentTrivia */:
                    if (disallowComments) {
                        handleError(10 /* InvalidCommentToken */);
                    }
                    else {
                        onComment();
                    }
                    break;
                case 16 /* Unknown */:
                    handleError(1 /* InvalidSymbol */);
                    break;
                case 15 /* Trivia */:
                case 14 /* LineBreakTrivia */:
                    break;
                default:
                    return token;
            }
        }
    }
    function handleError(error, skipUntilAfter, skipUntil) {
        if (skipUntilAfter === void 0) { skipUntilAfter = []; }
        if (skipUntil === void 0) { skipUntil = []; }
        onError(error);
        if (skipUntilAfter.length + skipUntil.length > 0) {
            var token = _scanner.getToken();
            while (token !== 17 /* EOF */) {
                if (skipUntilAfter.indexOf(token) !== -1) {
                    scanNext();
                    break;
                }
                else if (skipUntil.indexOf(token) !== -1) {
                    break;
                }
                token = scanNext();
            }
        }
    }
    function parseString(isValue) {
        var value = _scanner.getTokenValue();
        if (isValue) {
            onLiteralValue(value);
        }
        else {
            onObjectProperty(value);
        }
        scanNext();
        return true;
    }
    function parseLiteral() {
        switch (_scanner.getToken()) {
            case 11 /* NumericLiteral */:
                var value = 0;
                try {
                    value = JSON.parse(_scanner.getTokenValue());
                    if (typeof value !== 'number') {
                        handleError(2 /* InvalidNumberFormat */);
                        value = 0;
                    }
                }
                catch (e) {
                    handleError(2 /* InvalidNumberFormat */);
                }
                onLiteralValue(value);
                break;
            case 7 /* NullKeyword */:
                onLiteralValue(null);
                break;
            case 8 /* TrueKeyword */:
                onLiteralValue(true);
                break;
            case 9 /* FalseKeyword */:
                onLiteralValue(false);
                break;
            default:
                return false;
        }
        scanNext();
        return true;
    }
    function parseProperty() {
        if (_scanner.getToken() !== 10 /* StringLiteral */) {
            handleError(3 /* PropertyNameExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
            return false;
        }
        parseString(false);
        if (_scanner.getToken() === 6 /* ColonToken */) {
            onSeparator(':');
            scanNext(); // consume colon
            if (!parseValue()) {
                handleError(4 /* ValueExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
            }
        }
        else {
            handleError(5 /* ColonExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
        }
        return true;
    }
    function parseObject() {
        onObjectBegin();
        scanNext(); // consume open brace
        var needsComma = false;
        while (_scanner.getToken() !== 2 /* CloseBraceToken */ && _scanner.getToken() !== 17 /* EOF */) {
            if (_scanner.getToken() === 5 /* CommaToken */) {
                if (!needsComma) {
                    handleError(4 /* ValueExpected */, [], []);
                }
                onSeparator(',');
                scanNext(); // consume comma
                if (_scanner.getToken() === 2 /* CloseBraceToken */ && allowTrailingComma) {
                    break;
                }
            }
            else if (needsComma) {
                handleError(6 /* CommaExpected */, [], []);
            }
            if (!parseProperty()) {
                handleError(4 /* ValueExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
            }
            needsComma = true;
        }
        onObjectEnd();
        if (_scanner.getToken() !== 2 /* CloseBraceToken */) {
            handleError(7 /* CloseBraceExpected */, [2 /* CloseBraceToken */], []);
        }
        else {
            scanNext(); // consume close brace
        }
        return true;
    }
    function parseArray() {
        onArrayBegin();
        scanNext(); // consume open bracket
        var needsComma = false;
        while (_scanner.getToken() !== 4 /* CloseBracketToken */ && _scanner.getToken() !== 17 /* EOF */) {
            if (_scanner.getToken() === 5 /* CommaToken */) {
                if (!needsComma) {
                    handleError(4 /* ValueExpected */, [], []);
                }
                onSeparator(',');
                scanNext(); // consume comma
                if (_scanner.getToken() === 4 /* CloseBracketToken */ && allowTrailingComma) {
                    break;
                }
            }
            else if (needsComma) {
                handleError(6 /* CommaExpected */, [], []);
            }
            if (!parseValue()) {
                handleError(4 /* ValueExpected */, [], [4 /* CloseBracketToken */, 5 /* CommaToken */]);
            }
            needsComma = true;
        }
        onArrayEnd();
        if (_scanner.getToken() !== 4 /* CloseBracketToken */) {
            handleError(8 /* CloseBracketExpected */, [4 /* CloseBracketToken */], []);
        }
        else {
            scanNext(); // consume close bracket
        }
        return true;
    }
    function parseValue() {
        switch (_scanner.getToken()) {
            case 3 /* OpenBracketToken */:
                return parseArray();
            case 1 /* OpenBraceToken */:
                return parseObject();
            case 10 /* StringLiteral */:
                return parseString(true);
            default:
                return parseLiteral();
        }
    }
    scanNext();
    if (_scanner.getToken() === 17 /* EOF */) {
        return true;
    }
    if (!parseValue()) {
        handleError(4 /* ValueExpected */, [], []);
        return false;
    }
    if (_scanner.getToken() !== 17 /* EOF */) {
        handleError(9 /* EndOfFileExpected */, [], []);
    }
    return true;
}
/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
function stripComments(text, replaceCh) {
    var _scanner = Object(_scanner_js__WEBPACK_IMPORTED_MODULE_0__["createScanner"])(text), parts = [], kind, offset = 0, pos;
    do {
        pos = _scanner.getPosition();
        kind = _scanner.scan();
        switch (kind) {
            case 12 /* LineCommentTrivia */:
            case 13 /* BlockCommentTrivia */:
            case 17 /* EOF */:
                if (offset !== pos) {
                    parts.push(text.substring(offset, pos));
                }
                if (replaceCh !== void 0) {
                    parts.push(_scanner.getTokenValue().replace(/[^\r\n]/g, replaceCh));
                }
                offset = _scanner.getPosition();
                break;
        }
    } while (kind !== 17 /* EOF */);
    return parts.join('');
}
function getLiteralNodeType(value) {
    switch (typeof value) {
        case 'boolean': return 'boolean';
        case 'number': return 'number';
        case 'string': return 'string';
        default: return 'null';
    }
}
//# sourceMappingURL=parser.js.map

/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/scanner.js":
/*!********************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/scanner.js ***!
  \********************************************************************************************/
/*! exports provided: createScanner */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createScanner", function() { return createScanner; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
function createScanner(text, ignoreTrivia) {
    if (ignoreTrivia === void 0) { ignoreTrivia = false; }
    var pos = 0, len = text.length, value = '', tokenOffset = 0, token = 16 /* Unknown */, scanError = 0 /* None */;
    function scanHexDigits(count, exact) {
        var digits = 0;
        var value = 0;
        while (digits < count || !exact) {
            var ch = text.charCodeAt(pos);
            if (ch >= 48 /* _0 */ && ch <= 57 /* _9 */) {
                value = value * 16 + ch - 48 /* _0 */;
            }
            else if (ch >= 65 /* A */ && ch <= 70 /* F */) {
                value = value * 16 + ch - 65 /* A */ + 10;
            }
            else if (ch >= 97 /* a */ && ch <= 102 /* f */) {
                value = value * 16 + ch - 97 /* a */ + 10;
            }
            else {
                break;
            }
            pos++;
            digits++;
        }
        if (digits < count) {
            value = -1;
        }
        return value;
    }
    function setPosition(newPosition) {
        pos = newPosition;
        value = '';
        tokenOffset = 0;
        token = 16 /* Unknown */;
        scanError = 0 /* None */;
    }
    function scanNumber() {
        var start = pos;
        if (text.charCodeAt(pos) === 48 /* _0 */) {
            pos++;
        }
        else {
            pos++;
            while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
            }
        }
        if (pos < text.length && text.charCodeAt(pos) === 46 /* dot */) {
            pos++;
            if (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
                while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                    pos++;
                }
            }
            else {
                scanError = 3 /* UnexpectedEndOfNumber */;
                return text.substring(start, pos);
            }
        }
        var end = pos;
        if (pos < text.length && (text.charCodeAt(pos) === 69 /* E */ || text.charCodeAt(pos) === 101 /* e */)) {
            pos++;
            if (pos < text.length && text.charCodeAt(pos) === 43 /* plus */ || text.charCodeAt(pos) === 45 /* minus */) {
                pos++;
            }
            if (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
                while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                    pos++;
                }
                end = pos;
            }
            else {
                scanError = 3 /* UnexpectedEndOfNumber */;
            }
        }
        return text.substring(start, end);
    }
    function scanString() {
        var result = '', start = pos;
        while (true) {
            if (pos >= len) {
                result += text.substring(start, pos);
                scanError = 2 /* UnexpectedEndOfString */;
                break;
            }
            var ch = text.charCodeAt(pos);
            if (ch === 34 /* doubleQuote */) {
                result += text.substring(start, pos);
                pos++;
                break;
            }
            if (ch === 92 /* backslash */) {
                result += text.substring(start, pos);
                pos++;
                if (pos >= len) {
                    scanError = 2 /* UnexpectedEndOfString */;
                    break;
                }
                ch = text.charCodeAt(pos++);
                switch (ch) {
                    case 34 /* doubleQuote */:
                        result += '\"';
                        break;
                    case 92 /* backslash */:
                        result += '\\';
                        break;
                    case 47 /* slash */:
                        result += '/';
                        break;
                    case 98 /* b */:
                        result += '\b';
                        break;
                    case 102 /* f */:
                        result += '\f';
                        break;
                    case 110 /* n */:
                        result += '\n';
                        break;
                    case 114 /* r */:
                        result += '\r';
                        break;
                    case 116 /* t */:
                        result += '\t';
                        break;
                    case 117 /* u */:
                        var ch_1 = scanHexDigits(4, true);
                        if (ch_1 >= 0) {
                            result += String.fromCharCode(ch_1);
                        }
                        else {
                            scanError = 4 /* InvalidUnicode */;
                        }
                        break;
                    default:
                        scanError = 5 /* InvalidEscapeCharacter */;
                }
                start = pos;
                continue;
            }
            if (ch >= 0 && ch <= 0x1f) {
                if (isLineBreak(ch)) {
                    result += text.substring(start, pos);
                    scanError = 2 /* UnexpectedEndOfString */;
                    break;
                }
                else {
                    scanError = 6 /* InvalidCharacter */;
                    // mark as error but continue with string
                }
            }
            pos++;
        }
        return result;
    }
    function scanNext() {
        value = '';
        scanError = 0 /* None */;
        tokenOffset = pos;
        if (pos >= len) {
            // at the end
            tokenOffset = len;
            return token = 17 /* EOF */;
        }
        var code = text.charCodeAt(pos);
        // trivia: whitespace
        if (isWhiteSpace(code)) {
            do {
                pos++;
                value += String.fromCharCode(code);
                code = text.charCodeAt(pos);
            } while (isWhiteSpace(code));
            return token = 15 /* Trivia */;
        }
        // trivia: newlines
        if (isLineBreak(code)) {
            pos++;
            value += String.fromCharCode(code);
            if (code === 13 /* carriageReturn */ && text.charCodeAt(pos) === 10 /* lineFeed */) {
                pos++;
                value += '\n';
            }
            return token = 14 /* LineBreakTrivia */;
        }
        switch (code) {
            // tokens: []{}:,
            case 123 /* openBrace */:
                pos++;
                return token = 1 /* OpenBraceToken */;
            case 125 /* closeBrace */:
                pos++;
                return token = 2 /* CloseBraceToken */;
            case 91 /* openBracket */:
                pos++;
                return token = 3 /* OpenBracketToken */;
            case 93 /* closeBracket */:
                pos++;
                return token = 4 /* CloseBracketToken */;
            case 58 /* colon */:
                pos++;
                return token = 6 /* ColonToken */;
            case 44 /* comma */:
                pos++;
                return token = 5 /* CommaToken */;
            // strings
            case 34 /* doubleQuote */:
                pos++;
                value = scanString();
                return token = 10 /* StringLiteral */;
            // comments
            case 47 /* slash */:
                var start = pos - 1;
                // Single-line comment
                if (text.charCodeAt(pos + 1) === 47 /* slash */) {
                    pos += 2;
                    while (pos < len) {
                        if (isLineBreak(text.charCodeAt(pos))) {
                            break;
                        }
                        pos++;
                    }
                    value = text.substring(start, pos);
                    return token = 12 /* LineCommentTrivia */;
                }
                // Multi-line comment
                if (text.charCodeAt(pos + 1) === 42 /* asterisk */) {
                    pos += 2;
                    var commentClosed = false;
                    while (pos < len) {
                        var ch = text.charCodeAt(pos);
                        if (ch === 42 /* asterisk */ && (pos + 1 < len) && text.charCodeAt(pos + 1) === 47 /* slash */) {
                            pos += 2;
                            commentClosed = true;
                            break;
                        }
                        pos++;
                    }
                    if (!commentClosed) {
                        pos++;
                        scanError = 1 /* UnexpectedEndOfComment */;
                    }
                    value = text.substring(start, pos);
                    return token = 13 /* BlockCommentTrivia */;
                }
                // just a single slash
                value += String.fromCharCode(code);
                pos++;
                return token = 16 /* Unknown */;
            // numbers
            case 45 /* minus */:
                value += String.fromCharCode(code);
                pos++;
                if (pos === len || !isDigit(text.charCodeAt(pos))) {
                    return token = 16 /* Unknown */;
                }
            // found a minus, followed by a number so
            // we fall through to proceed with scanning
            // numbers
            case 48 /* _0 */:
            case 49 /* _1 */:
            case 50 /* _2 */:
            case 51 /* _3 */:
            case 52 /* _4 */:
            case 53 /* _5 */:
            case 54 /* _6 */:
            case 55 /* _7 */:
            case 56 /* _8 */:
            case 57 /* _9 */:
                value += scanNumber();
                return token = 11 /* NumericLiteral */;
            // literals and unknown symbols
            default:
                // is a literal? Read the full word.
                while (pos < len && isUnknownContentCharacter(code)) {
                    pos++;
                    code = text.charCodeAt(pos);
                }
                if (tokenOffset !== pos) {
                    value = text.substring(tokenOffset, pos);
                    // keywords: true, false, null
                    switch (value) {
                        case 'true': return token = 8 /* TrueKeyword */;
                        case 'false': return token = 9 /* FalseKeyword */;
                        case 'null': return token = 7 /* NullKeyword */;
                    }
                    return token = 16 /* Unknown */;
                }
                // some
                value += String.fromCharCode(code);
                pos++;
                return token = 16 /* Unknown */;
        }
    }
    function isUnknownContentCharacter(code) {
        if (isWhiteSpace(code) || isLineBreak(code)) {
            return false;
        }
        switch (code) {
            case 125 /* closeBrace */:
            case 93 /* closeBracket */:
            case 123 /* openBrace */:
            case 91 /* openBracket */:
            case 34 /* doubleQuote */:
            case 58 /* colon */:
            case 44 /* comma */:
            case 47 /* slash */:
                return false;
        }
        return true;
    }
    function scanNextNonTrivia() {
        var result;
        do {
            result = scanNext();
        } while (result >= 12 /* LineCommentTrivia */ && result <= 15 /* Trivia */);
        return result;
    }
    return {
        setPosition: setPosition,
        getPosition: function () { return pos; },
        scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
        getToken: function () { return token; },
        getTokenValue: function () { return value; },
        getTokenOffset: function () { return tokenOffset; },
        getTokenLength: function () { return pos - tokenOffset; },
        getTokenError: function () { return scanError; }
    };
}
function isWhiteSpace(ch) {
    return ch === 32 /* space */ || ch === 9 /* tab */ || ch === 11 /* verticalTab */ || ch === 12 /* formFeed */ ||
        ch === 160 /* nonBreakingSpace */ || ch === 5760 /* ogham */ || ch >= 8192 /* enQuad */ && ch <= 8203 /* zeroWidthSpace */ ||
        ch === 8239 /* narrowNoBreakSpace */ || ch === 8287 /* mathematicalSpace */ || ch === 12288 /* ideographicSpace */ || ch === 65279 /* byteOrderMark */;
}
function isLineBreak(ch) {
    return ch === 10 /* lineFeed */ || ch === 13 /* carriageReturn */ || ch === 8232 /* lineSeparator */ || ch === 8233 /* paragraphSeparator */;
}
function isDigit(ch) {
    return ch >= 48 /* _0 */ && ch <= 57 /* _9 */;
}
//# sourceMappingURL=scanner.js.map

/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/main.js":
/*!************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/main.js ***!
  \************************************************************************************/
/*! exports provided: createScanner, getLocation, parse, parseTree, findNodeAtLocation, findNodeAtOffset, getNodePath, getNodeValue, visit, stripComments, format, modify, applyEdits */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createScanner", function() { return createScanner; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getLocation", function() { return getLocation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "parse", function() { return parse; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "parseTree", function() { return parseTree; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "findNodeAtLocation", function() { return findNodeAtLocation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "findNodeAtOffset", function() { return findNodeAtOffset; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getNodePath", function() { return getNodePath; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "getNodeValue", function() { return getNodeValue; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "visit", function() { return visit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "stripComments", function() { return stripComments; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "format", function() { return format; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "modify", function() { return modify; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "applyEdits", function() { return applyEdits; });
/* harmony import */ var _impl_format_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./impl/format.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/format.js");
/* harmony import */ var _impl_edit_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./impl/edit.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/edit.js");
/* harmony import */ var _impl_scanner_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./impl/scanner.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/scanner.js");
/* harmony import */ var _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./impl/parser.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/impl/parser.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/





/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
var createScanner = _impl_scanner_js__WEBPACK_IMPORTED_MODULE_2__["createScanner"];
/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
var getLocation = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["getLocation"];
/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
var parse = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["parse"];
/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
var parseTree = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["parseTree"];
/**
 * Finds the node at the given path in a JSON DOM.
 */
var findNodeAtLocation = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["findNodeAtLocation"];
/**
 * Finds the most inner node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
var findNodeAtOffset = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["findNodeAtOffset"];
/**
 * Gets the JSON path of the given JSON DOM node
 */
var getNodePath = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["getNodePath"];
/**
 * Evaluates the JavaScript object of the given JSON DOM node
 */
var getNodeValue = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["getNodeValue"];
/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
var visit = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["visit"];
/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
var stripComments = _impl_parser_js__WEBPACK_IMPORTED_MODULE_3__["stripComments"];
/**
 * Computes the edits needed to format a JSON document.
 *
 * @param documentText The input text
 * @param range The range to format or `undefined` to format the full content
 * @param options The formatting options
 * @returns A list of edit operations describing the formatting changes to the original document. Edits can be either inserts, replacements or
 * removals of text segments. All offsets refer to the original state of the document. No two edits must change or remove the same range of
 * text in the original document. However, multiple edits can have
 * the same offset, for example multiple inserts, or an insert followed by a remove or replace. The order in the array defines which edit is applied first.
 * To apply edits to an input, you can use `applyEdits`
 */
function format(documentText, range, options) {
    return _impl_format_js__WEBPACK_IMPORTED_MODULE_0__["format"](documentText, range, options);
}
/**
 * Computes the edits needed to modify a value in the JSON document.
 *
 * @param documentText The input text
 * @param path The path of the value to change. The path represents either to the document root, a property or an array item.
 * If the path points to an non-existing property or item, it will be created.
 * @param value The new value for the specified property or item. If the value is undefined,
 * the property or item will be removed.
 * @param options Options
 * @returns A list of edit operations describing the formatting changes to the original document. Edits can be either inserts, replacements or
 * removals of text segments. All offsets refer to the original state of the document. No two edits must change or remove the same range of
 * text in the original document. However, multiple edits can have
 * the same offset, for example multiple inserts, or an insert followed by a remove or replace. The order in the array defines which edit is applied first.
 * To apply edits to an input, you can use `applyEdits`
 */
function modify(text, path, value, options) {
    return _impl_edit_js__WEBPACK_IMPORTED_MODULE_1__["setProperty"](text, path, value, options.formattingOptions, options.getInsertionIndex);
}
/**
 * Applies edits to a input string.
 */
function applyEdits(text, edits) {
    for (var i = edits.length - 1; i >= 0; i--) {
        text = _impl_edit_js__WEBPACK_IMPORTED_MODULE_1__["applyEdit"](text, edits[i]);
    }
    return text;
}
//# sourceMappingURL=main.js.map

/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/_deps/vscode-languageserver-types/main.js":
/*!***************************************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/_deps/vscode-languageserver-types/main.js ***!
  \***************************************************************************************************/
/*! exports provided: Position, Range, Location, Color, ColorInformation, ColorPresentation, FoldingRangeKind, FoldingRange, DiagnosticRelatedInformation, DiagnosticSeverity, Diagnostic, Command, TextEdit, TextDocumentEdit, WorkspaceEdit, WorkspaceChange, TextDocumentIdentifier, VersionedTextDocumentIdentifier, TextDocumentItem, MarkupKind, MarkupContent, CompletionItemKind, InsertTextFormat, CompletionItem, CompletionList, MarkedString, Hover, ParameterInformation, SignatureInformation, DocumentHighlightKind, DocumentHighlight, SymbolKind, SymbolInformation, DocumentSymbol, CodeActionKind, CodeActionContext, CodeAction, CodeLens, FormattingOptions, DocumentLink, EOL, TextDocument, TextDocumentSaveReason */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Position", function() { return Position; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Range", function() { return Range; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Location", function() { return Location; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Color", function() { return Color; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "ColorInformation", function() { return ColorInformation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "ColorPresentation", function() { return ColorPresentation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FoldingRangeKind", function() { return FoldingRangeKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FoldingRange", function() { return FoldingRange; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DiagnosticRelatedInformation", function() { return DiagnosticRelatedInformation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DiagnosticSeverity", function() { return DiagnosticSeverity; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Diagnostic", function() { return Diagnostic; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Command", function() { return Command; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextEdit", function() { return TextEdit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextDocumentEdit", function() { return TextDocumentEdit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "WorkspaceEdit", function() { return WorkspaceEdit; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "WorkspaceChange", function() { return WorkspaceChange; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextDocumentIdentifier", function() { return TextDocumentIdentifier; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "VersionedTextDocumentIdentifier", function() { return VersionedTextDocumentIdentifier; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextDocumentItem", function() { return TextDocumentItem; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MarkupKind", function() { return MarkupKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MarkupContent", function() { return MarkupContent; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CompletionItemKind", function() { return CompletionItemKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "InsertTextFormat", function() { return InsertTextFormat; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CompletionItem", function() { return CompletionItem; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CompletionList", function() { return CompletionList; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MarkedString", function() { return MarkedString; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "Hover", function() { return Hover; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "ParameterInformation", function() { return ParameterInformation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SignatureInformation", function() { return SignatureInformation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentHighlightKind", function() { return DocumentHighlightKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentHighlight", function() { return DocumentHighlight; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SymbolKind", function() { return SymbolKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SymbolInformation", function() { return SymbolInformation; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentSymbol", function() { return DocumentSymbol; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CodeActionKind", function() { return CodeActionKind; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CodeActionContext", function() { return CodeActionContext; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CodeAction", function() { return CodeAction; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CodeLens", function() { return CodeLens; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FormattingOptions", function() { return FormattingOptions; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentLink", function() { return DocumentLink; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "EOL", function() { return EOL; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextDocument", function() { return TextDocument; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TextDocumentSaveReason", function() { return TextDocumentSaveReason; });
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/**
 * The Position namespace provides helper functions to work with
 * [Position](#Position) literals.
 */
var Position;
(function (Position) {
    /**
     * Creates a new Position literal from the given line and character.
     * @param line The position's line.
     * @param character The position's character.
     */
    function create(line, character) {
        return { line: line, character: character };
    }
    Position.create = create;
    /**
     * Checks whether the given liternal conforms to the [Position](#Position) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.objectLiteral(candidate) && Is.number(candidate.line) && Is.number(candidate.character);
    }
    Position.is = is;
})(Position || (Position = {}));
/**
 * The Range namespace provides helper functions to work with
 * [Range](#Range) literals.
 */
var Range;
(function (Range) {
    function create(one, two, three, four) {
        if (Is.number(one) && Is.number(two) && Is.number(three) && Is.number(four)) {
            return { start: Position.create(one, two), end: Position.create(three, four) };
        }
        else if (Position.is(one) && Position.is(two)) {
            return { start: one, end: two };
        }
        else {
            throw new Error("Range#create called with invalid arguments[" + one + ", " + two + ", " + three + ", " + four + "]");
        }
    }
    Range.create = create;
    /**
     * Checks whether the given literal conforms to the [Range](#Range) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.objectLiteral(candidate) && Position.is(candidate.start) && Position.is(candidate.end);
    }
    Range.is = is;
})(Range || (Range = {}));
/**
 * The Location namespace provides helper functions to work with
 * [Location](#Location) literals.
 */
var Location;
(function (Location) {
    /**
     * Creates a Location literal.
     * @param uri The location's uri.
     * @param range The location's range.
     */
    function create(uri, range) {
        return { uri: uri, range: range };
    }
    Location.create = create;
    /**
     * Checks whether the given literal conforms to the [Location](#Location) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Range.is(candidate.range) && (Is.string(candidate.uri) || Is.undefined(candidate.uri));
    }
    Location.is = is;
})(Location || (Location = {}));
/**
 * The Color namespace provides helper functions to work with
 * [Color](#Color) literals.
 */
var Color;
(function (Color) {
    /**
     * Creates a new Color literal.
     */
    function create(red, green, blue, alpha) {
        return {
            red: red,
            green: green,
            blue: blue,
            alpha: alpha,
        };
    }
    Color.create = create;
    /**
     * Checks whether the given literal conforms to the [Color](#Color) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.number(candidate.red)
            && Is.number(candidate.green)
            && Is.number(candidate.blue)
            && Is.number(candidate.alpha);
    }
    Color.is = is;
})(Color || (Color = {}));
/**
 * The ColorInformation namespace provides helper functions to work with
 * [ColorInformation](#ColorInformation) literals.
 */
var ColorInformation;
(function (ColorInformation) {
    /**
     * Creates a new ColorInformation literal.
     */
    function create(range, color) {
        return {
            range: range,
            color: color,
        };
    }
    ColorInformation.create = create;
    /**
     * Checks whether the given literal conforms to the [ColorInformation](#ColorInformation) interface.
     */
    function is(value) {
        var candidate = value;
        return Range.is(candidate.range) && Color.is(candidate.color);
    }
    ColorInformation.is = is;
})(ColorInformation || (ColorInformation = {}));
/**
 * The Color namespace provides helper functions to work with
 * [ColorPresentation](#ColorPresentation) literals.
 */
var ColorPresentation;
(function (ColorPresentation) {
    /**
     * Creates a new ColorInformation literal.
     */
    function create(label, textEdit, additionalTextEdits) {
        return {
            label: label,
            textEdit: textEdit,
            additionalTextEdits: additionalTextEdits,
        };
    }
    ColorPresentation.create = create;
    /**
     * Checks whether the given literal conforms to the [ColorInformation](#ColorInformation) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.string(candidate.label)
            && (Is.undefined(candidate.textEdit) || TextEdit.is(candidate))
            && (Is.undefined(candidate.additionalTextEdits) || Is.typedArray(candidate.additionalTextEdits, TextEdit.is));
    }
    ColorPresentation.is = is;
})(ColorPresentation || (ColorPresentation = {}));
/**
 * Enum of known range kinds
 */
var FoldingRangeKind;
(function (FoldingRangeKind) {
    /**
     * Folding range for a comment
     */
    FoldingRangeKind["Comment"] = "comment";
    /**
     * Folding range for a imports or includes
     */
    FoldingRangeKind["Imports"] = "imports";
    /**
     * Folding range for a region (e.g. `#region`)
     */
    FoldingRangeKind["Region"] = "region";
})(FoldingRangeKind || (FoldingRangeKind = {}));
/**
 * The folding range namespace provides helper functions to work with
 * [FoldingRange](#FoldingRange) literals.
 */
var FoldingRange;
(function (FoldingRange) {
    /**
     * Creates a new FoldingRange literal.
     */
    function create(startLine, endLine, startCharacter, endCharacter, kind) {
        var result = {
            startLine: startLine,
            endLine: endLine
        };
        if (Is.defined(startCharacter)) {
            result.startCharacter = startCharacter;
        }
        if (Is.defined(endCharacter)) {
            result.endCharacter = endCharacter;
        }
        if (Is.defined(kind)) {
            result.kind = kind;
        }
        return result;
    }
    FoldingRange.create = create;
    /**
     * Checks whether the given literal conforms to the [FoldingRange](#FoldingRange) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.number(candidate.startLine) && Is.number(candidate.startLine)
            && (Is.undefined(candidate.startCharacter) || Is.number(candidate.startCharacter))
            && (Is.undefined(candidate.endCharacter) || Is.number(candidate.endCharacter))
            && (Is.undefined(candidate.kind) || Is.string(candidate.kind));
    }
    FoldingRange.is = is;
})(FoldingRange || (FoldingRange = {}));
/**
 * The DiagnosticRelatedInformation namespace provides helper functions to work with
 * [DiagnosticRelatedInformation](#DiagnosticRelatedInformation) literals.
 */
var DiagnosticRelatedInformation;
(function (DiagnosticRelatedInformation) {
    /**
     * Creates a new DiagnosticRelatedInformation literal.
     */
    function create(location, message) {
        return {
            location: location,
            message: message
        };
    }
    DiagnosticRelatedInformation.create = create;
    /**
     * Checks whether the given literal conforms to the [DiagnosticRelatedInformation](#DiagnosticRelatedInformation) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Location.is(candidate.location) && Is.string(candidate.message);
    }
    DiagnosticRelatedInformation.is = is;
})(DiagnosticRelatedInformation || (DiagnosticRelatedInformation = {}));
/**
 * The diagnostic's severity.
 */
var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    /**
     * Reports an error.
     */
    DiagnosticSeverity.Error = 1;
    /**
     * Reports a warning.
     */
    DiagnosticSeverity.Warning = 2;
    /**
     * Reports an information.
     */
    DiagnosticSeverity.Information = 3;
    /**
     * Reports a hint.
     */
    DiagnosticSeverity.Hint = 4;
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
/**
 * The Diagnostic namespace provides helper functions to work with
 * [Diagnostic](#Diagnostic) literals.
 */
var Diagnostic;
(function (Diagnostic) {
    /**
     * Creates a new Diagnostic literal.
     */
    function create(range, message, severity, code, source, relatedInformation) {
        var result = { range: range, message: message };
        if (Is.defined(severity)) {
            result.severity = severity;
        }
        if (Is.defined(code)) {
            result.code = code;
        }
        if (Is.defined(source)) {
            result.source = source;
        }
        if (Is.defined(relatedInformation)) {
            result.relatedInformation = relatedInformation;
        }
        return result;
    }
    Diagnostic.create = create;
    /**
     * Checks whether the given literal conforms to the [Diagnostic](#Diagnostic) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate)
            && Range.is(candidate.range)
            && Is.string(candidate.message)
            && (Is.number(candidate.severity) || Is.undefined(candidate.severity))
            && (Is.number(candidate.code) || Is.string(candidate.code) || Is.undefined(candidate.code))
            && (Is.string(candidate.source) || Is.undefined(candidate.source))
            && (Is.undefined(candidate.relatedInformation) || Is.typedArray(candidate.relatedInformation, DiagnosticRelatedInformation.is));
    }
    Diagnostic.is = is;
})(Diagnostic || (Diagnostic = {}));
/**
 * The Command namespace provides helper functions to work with
 * [Command](#Command) literals.
 */
var Command;
(function (Command) {
    /**
     * Creates a new Command literal.
     */
    function create(title, command) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        var result = { title: title, command: command };
        if (Is.defined(args) && args.length > 0) {
            result.arguments = args;
        }
        return result;
    }
    Command.create = create;
    /**
     * Checks whether the given literal conforms to the [Command](#Command) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.title) && Is.string(candidate.command);
    }
    Command.is = is;
})(Command || (Command = {}));
/**
 * The TextEdit namespace provides helper function to create replace,
 * insert and delete edits more easily.
 */
var TextEdit;
(function (TextEdit) {
    /**
     * Creates a replace text edit.
     * @param range The range of text to be replaced.
     * @param newText The new text.
     */
    function replace(range, newText) {
        return { range: range, newText: newText };
    }
    TextEdit.replace = replace;
    /**
     * Creates a insert text edit.
     * @param position The position to insert the text at.
     * @param newText The text to be inserted.
     */
    function insert(position, newText) {
        return { range: { start: position, end: position }, newText: newText };
    }
    TextEdit.insert = insert;
    /**
     * Creates a delete text edit.
     * @param range The range of text to be deleted.
     */
    function del(range) {
        return { range: range, newText: '' };
    }
    TextEdit.del = del;
    function is(value) {
        var candidate = value;
        return Is.objectLiteral(candidate)
            && Is.string(candidate.newText)
            && Range.is(candidate.range);
    }
    TextEdit.is = is;
})(TextEdit || (TextEdit = {}));
/**
 * The TextDocumentEdit namespace provides helper function to create
 * an edit that manipulates a text document.
 */
var TextDocumentEdit;
(function (TextDocumentEdit) {
    /**
     * Creates a new `TextDocumentEdit`
     */
    function create(textDocument, edits) {
        return { textDocument: textDocument, edits: edits };
    }
    TextDocumentEdit.create = create;
    function is(value) {
        var candidate = value;
        return Is.defined(candidate)
            && VersionedTextDocumentIdentifier.is(candidate.textDocument)
            && Array.isArray(candidate.edits);
    }
    TextDocumentEdit.is = is;
})(TextDocumentEdit || (TextDocumentEdit = {}));
var WorkspaceEdit;
(function (WorkspaceEdit) {
    function is(value) {
        var candidate = value;
        return candidate &&
            (candidate.changes !== void 0 || candidate.documentChanges !== void 0) &&
            (candidate.documentChanges === void 0 || Is.typedArray(candidate.documentChanges, TextDocumentEdit.is));
    }
    WorkspaceEdit.is = is;
})(WorkspaceEdit || (WorkspaceEdit = {}));
var TextEditChangeImpl = /** @class */ (function () {
    function TextEditChangeImpl(edits) {
        this.edits = edits;
    }
    TextEditChangeImpl.prototype.insert = function (position, newText) {
        this.edits.push(TextEdit.insert(position, newText));
    };
    TextEditChangeImpl.prototype.replace = function (range, newText) {
        this.edits.push(TextEdit.replace(range, newText));
    };
    TextEditChangeImpl.prototype.delete = function (range) {
        this.edits.push(TextEdit.del(range));
    };
    TextEditChangeImpl.prototype.add = function (edit) {
        this.edits.push(edit);
    };
    TextEditChangeImpl.prototype.all = function () {
        return this.edits;
    };
    TextEditChangeImpl.prototype.clear = function () {
        this.edits.splice(0, this.edits.length);
    };
    return TextEditChangeImpl;
}());
/**
 * A workspace change helps constructing changes to a workspace.
 */
var WorkspaceChange = /** @class */ (function () {
    function WorkspaceChange(workspaceEdit) {
        var _this = this;
        this._textEditChanges = Object.create(null);
        if (workspaceEdit) {
            this._workspaceEdit = workspaceEdit;
            if (workspaceEdit.documentChanges) {
                workspaceEdit.documentChanges.forEach(function (textDocumentEdit) {
                    var textEditChange = new TextEditChangeImpl(textDocumentEdit.edits);
                    _this._textEditChanges[textDocumentEdit.textDocument.uri] = textEditChange;
                });
            }
            else if (workspaceEdit.changes) {
                Object.keys(workspaceEdit.changes).forEach(function (key) {
                    var textEditChange = new TextEditChangeImpl(workspaceEdit.changes[key]);
                    _this._textEditChanges[key] = textEditChange;
                });
            }
        }
    }
    Object.defineProperty(WorkspaceChange.prototype, "edit", {
        /**
         * Returns the underlying [WorkspaceEdit](#WorkspaceEdit) literal
         * use to be returned from a workspace edit operation like rename.
         */
        get: function () {
            return this._workspaceEdit;
        },
        enumerable: true,
        configurable: true
    });
    WorkspaceChange.prototype.getTextEditChange = function (key) {
        if (VersionedTextDocumentIdentifier.is(key)) {
            if (!this._workspaceEdit) {
                this._workspaceEdit = {
                    documentChanges: []
                };
            }
            if (!this._workspaceEdit.documentChanges) {
                throw new Error('Workspace edit is not configured for versioned document changes.');
            }
            var textDocument = key;
            var result = this._textEditChanges[textDocument.uri];
            if (!result) {
                var edits = [];
                var textDocumentEdit = {
                    textDocument: textDocument,
                    edits: edits
                };
                this._workspaceEdit.documentChanges.push(textDocumentEdit);
                result = new TextEditChangeImpl(edits);
                this._textEditChanges[textDocument.uri] = result;
            }
            return result;
        }
        else {
            if (!this._workspaceEdit) {
                this._workspaceEdit = {
                    changes: Object.create(null)
                };
            }
            if (!this._workspaceEdit.changes) {
                throw new Error('Workspace edit is not configured for normal text edit changes.');
            }
            var result = this._textEditChanges[key];
            if (!result) {
                var edits = [];
                this._workspaceEdit.changes[key] = edits;
                result = new TextEditChangeImpl(edits);
                this._textEditChanges[key] = result;
            }
            return result;
        }
    };
    return WorkspaceChange;
}());

/**
 * The TextDocumentIdentifier namespace provides helper functions to work with
 * [TextDocumentIdentifier](#TextDocumentIdentifier) literals.
 */
var TextDocumentIdentifier;
(function (TextDocumentIdentifier) {
    /**
     * Creates a new TextDocumentIdentifier literal.
     * @param uri The document's uri.
     */
    function create(uri) {
        return { uri: uri };
    }
    TextDocumentIdentifier.create = create;
    /**
     * Checks whether the given literal conforms to the [TextDocumentIdentifier](#TextDocumentIdentifier) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.uri);
    }
    TextDocumentIdentifier.is = is;
})(TextDocumentIdentifier || (TextDocumentIdentifier = {}));
/**
 * The VersionedTextDocumentIdentifier namespace provides helper functions to work with
 * [VersionedTextDocumentIdentifier](#VersionedTextDocumentIdentifier) literals.
 */
var VersionedTextDocumentIdentifier;
(function (VersionedTextDocumentIdentifier) {
    /**
     * Creates a new VersionedTextDocumentIdentifier literal.
     * @param uri The document's uri.
     * @param uri The document's text.
     */
    function create(uri, version) {
        return { uri: uri, version: version };
    }
    VersionedTextDocumentIdentifier.create = create;
    /**
     * Checks whether the given literal conforms to the [VersionedTextDocumentIdentifier](#VersionedTextDocumentIdentifier) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.uri) && Is.number(candidate.version);
    }
    VersionedTextDocumentIdentifier.is = is;
})(VersionedTextDocumentIdentifier || (VersionedTextDocumentIdentifier = {}));
/**
 * The TextDocumentItem namespace provides helper functions to work with
 * [TextDocumentItem](#TextDocumentItem) literals.
 */
var TextDocumentItem;
(function (TextDocumentItem) {
    /**
     * Creates a new TextDocumentItem literal.
     * @param uri The document's uri.
     * @param languageId The document's language identifier.
     * @param version The document's version number.
     * @param text The document's text.
     */
    function create(uri, languageId, version, text) {
        return { uri: uri, languageId: languageId, version: version, text: text };
    }
    TextDocumentItem.create = create;
    /**
     * Checks whether the given literal conforms to the [TextDocumentItem](#TextDocumentItem) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.uri) && Is.string(candidate.languageId) && Is.number(candidate.version) && Is.string(candidate.text);
    }
    TextDocumentItem.is = is;
})(TextDocumentItem || (TextDocumentItem = {}));
/**
 * Describes the content type that a client supports in various
 * result literals like `Hover`, `ParameterInfo` or `CompletionItem`.
 *
 * Please note that `MarkupKinds` must not start with a `$`. This kinds
 * are reserved for internal usage.
 */
var MarkupKind;
(function (MarkupKind) {
    /**
     * Plain text is supported as a content format
     */
    MarkupKind.PlainText = 'plaintext';
    /**
     * Markdown is supported as a content format
     */
    MarkupKind.Markdown = 'markdown';
})(MarkupKind || (MarkupKind = {}));
(function (MarkupKind) {
    /**
     * Checks whether the given value is a value of the [MarkupKind](#MarkupKind) type.
     */
    function is(value) {
        var candidate = value;
        return candidate === MarkupKind.PlainText || candidate === MarkupKind.Markdown;
    }
    MarkupKind.is = is;
})(MarkupKind || (MarkupKind = {}));
var MarkupContent;
(function (MarkupContent) {
    /**
     * Checks whether the given value conforms to the [MarkupContent](#MarkupContent) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.objectLiteral(value) && MarkupKind.is(candidate.kind) && Is.string(candidate.value);
    }
    MarkupContent.is = is;
})(MarkupContent || (MarkupContent = {}));
/**
 * The kind of a completion entry.
 */
var CompletionItemKind;
(function (CompletionItemKind) {
    CompletionItemKind.Text = 1;
    CompletionItemKind.Method = 2;
    CompletionItemKind.Function = 3;
    CompletionItemKind.Constructor = 4;
    CompletionItemKind.Field = 5;
    CompletionItemKind.Variable = 6;
    CompletionItemKind.Class = 7;
    CompletionItemKind.Interface = 8;
    CompletionItemKind.Module = 9;
    CompletionItemKind.Property = 10;
    CompletionItemKind.Unit = 11;
    CompletionItemKind.Value = 12;
    CompletionItemKind.Enum = 13;
    CompletionItemKind.Keyword = 14;
    CompletionItemKind.Snippet = 15;
    CompletionItemKind.Color = 16;
    CompletionItemKind.File = 17;
    CompletionItemKind.Reference = 18;
    CompletionItemKind.Folder = 19;
    CompletionItemKind.EnumMember = 20;
    CompletionItemKind.Constant = 21;
    CompletionItemKind.Struct = 22;
    CompletionItemKind.Event = 23;
    CompletionItemKind.Operator = 24;
    CompletionItemKind.TypeParameter = 25;
})(CompletionItemKind || (CompletionItemKind = {}));
/**
 * Defines whether the insert text in a completion item should be interpreted as
 * plain text or a snippet.
 */
var InsertTextFormat;
(function (InsertTextFormat) {
    /**
     * The primary text to be inserted is treated as a plain string.
     */
    InsertTextFormat.PlainText = 1;
    /**
     * The primary text to be inserted is treated as a snippet.
     *
     * A snippet can define tab stops and placeholders with `$1`, `$2`
     * and `${3:foo}`. `$0` defines the final tab stop, it defaults to
     * the end of the snippet. Placeholders with equal identifiers are linked,
     * that is typing in one will update others too.
     *
     * See also: https://github.com/Microsoft/vscode/blob/master/src/vs/editor/contrib/snippet/common/snippet.md
     */
    InsertTextFormat.Snippet = 2;
})(InsertTextFormat || (InsertTextFormat = {}));
/**
 * The CompletionItem namespace provides functions to deal with
 * completion items.
 */
var CompletionItem;
(function (CompletionItem) {
    /**
     * Create a completion item and seed it with a label.
     * @param label The completion item's label
     */
    function create(label) {
        return { label: label };
    }
    CompletionItem.create = create;
})(CompletionItem || (CompletionItem = {}));
/**
 * The CompletionList namespace provides functions to deal with
 * completion lists.
 */
var CompletionList;
(function (CompletionList) {
    /**
     * Creates a new completion list.
     *
     * @param items The completion items.
     * @param isIncomplete The list is not complete.
     */
    function create(items, isIncomplete) {
        return { items: items ? items : [], isIncomplete: !!isIncomplete };
    }
    CompletionList.create = create;
})(CompletionList || (CompletionList = {}));
var MarkedString;
(function (MarkedString) {
    /**
     * Creates a marked string from plain text.
     *
     * @param plainText The plain text.
     */
    function fromPlainText(plainText) {
        return plainText.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&"); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
    }
    MarkedString.fromPlainText = fromPlainText;
    /**
     * Checks whether the given value conforms to the [MarkedString](#MarkedString) type.
     */
    function is(value) {
        var candidate = value;
        return Is.string(candidate) || (Is.objectLiteral(candidate) && Is.string(candidate.language) && Is.string(candidate.value));
    }
    MarkedString.is = is;
})(MarkedString || (MarkedString = {}));
var Hover;
(function (Hover) {
    /**
     * Checks whether the given value conforms to the [Hover](#Hover) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.objectLiteral(candidate) && (MarkupContent.is(candidate.contents) ||
            MarkedString.is(candidate.contents) ||
            Is.typedArray(candidate.contents, MarkedString.is)) && (value.range === void 0 || Range.is(value.range));
    }
    Hover.is = is;
})(Hover || (Hover = {}));
/**
 * The ParameterInformation namespace provides helper functions to work with
 * [ParameterInformation](#ParameterInformation) literals.
 */
var ParameterInformation;
(function (ParameterInformation) {
    /**
     * Creates a new parameter information literal.
     *
     * @param label A label string.
     * @param documentation A doc string.
     */
    function create(label, documentation) {
        return documentation ? { label: label, documentation: documentation } : { label: label };
    }
    ParameterInformation.create = create;
    ;
})(ParameterInformation || (ParameterInformation = {}));
/**
 * The SignatureInformation namespace provides helper functions to work with
 * [SignatureInformation](#SignatureInformation) literals.
 */
var SignatureInformation;
(function (SignatureInformation) {
    function create(label, documentation) {
        var parameters = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            parameters[_i - 2] = arguments[_i];
        }
        var result = { label: label };
        if (Is.defined(documentation)) {
            result.documentation = documentation;
        }
        if (Is.defined(parameters)) {
            result.parameters = parameters;
        }
        else {
            result.parameters = [];
        }
        return result;
    }
    SignatureInformation.create = create;
})(SignatureInformation || (SignatureInformation = {}));
/**
 * A document highlight kind.
 */
var DocumentHighlightKind;
(function (DocumentHighlightKind) {
    /**
     * A textual occurrence.
     */
    DocumentHighlightKind.Text = 1;
    /**
     * Read-access of a symbol, like reading a variable.
     */
    DocumentHighlightKind.Read = 2;
    /**
     * Write-access of a symbol, like writing to a variable.
     */
    DocumentHighlightKind.Write = 3;
})(DocumentHighlightKind || (DocumentHighlightKind = {}));
/**
 * DocumentHighlight namespace to provide helper functions to work with
 * [DocumentHighlight](#DocumentHighlight) literals.
 */
var DocumentHighlight;
(function (DocumentHighlight) {
    /**
     * Create a DocumentHighlight object.
     * @param range The range the highlight applies to.
     */
    function create(range, kind) {
        var result = { range: range };
        if (Is.number(kind)) {
            result.kind = kind;
        }
        return result;
    }
    DocumentHighlight.create = create;
})(DocumentHighlight || (DocumentHighlight = {}));
/**
 * A symbol kind.
 */
var SymbolKind;
(function (SymbolKind) {
    SymbolKind.File = 1;
    SymbolKind.Module = 2;
    SymbolKind.Namespace = 3;
    SymbolKind.Package = 4;
    SymbolKind.Class = 5;
    SymbolKind.Method = 6;
    SymbolKind.Property = 7;
    SymbolKind.Field = 8;
    SymbolKind.Constructor = 9;
    SymbolKind.Enum = 10;
    SymbolKind.Interface = 11;
    SymbolKind.Function = 12;
    SymbolKind.Variable = 13;
    SymbolKind.Constant = 14;
    SymbolKind.String = 15;
    SymbolKind.Number = 16;
    SymbolKind.Boolean = 17;
    SymbolKind.Array = 18;
    SymbolKind.Object = 19;
    SymbolKind.Key = 20;
    SymbolKind.Null = 21;
    SymbolKind.EnumMember = 22;
    SymbolKind.Struct = 23;
    SymbolKind.Event = 24;
    SymbolKind.Operator = 25;
    SymbolKind.TypeParameter = 26;
})(SymbolKind || (SymbolKind = {}));
var SymbolInformation;
(function (SymbolInformation) {
    /**
     * Creates a new symbol information literal.
     *
     * @param name The name of the symbol.
     * @param kind The kind of the symbol.
     * @param range The range of the location of the symbol.
     * @param uri The resource of the location of symbol, defaults to the current document.
     * @param containerName The name of the symbol containing the symbol.
     */
    function create(name, kind, range, uri, containerName) {
        var result = {
            name: name,
            kind: kind,
            location: { uri: uri, range: range }
        };
        if (containerName) {
            result.containerName = containerName;
        }
        return result;
    }
    SymbolInformation.create = create;
})(SymbolInformation || (SymbolInformation = {}));
/**
 * Represents programming constructs like variables, classes, interfaces etc.
 * that appear in a document. Document symbols can be hierarchical and they
 * have two ranges: one that encloses its definition and one that points to
 * its most interesting range, e.g. the range of an identifier.
 */
var DocumentSymbol = /** @class */ (function () {
    function DocumentSymbol() {
    }
    return DocumentSymbol;
}());

(function (DocumentSymbol) {
    /**
     * Creates a new symbol information literal.
     *
     * @param name The name of the symbol.
     * @param detail The detail of the symbol.
     * @param kind The kind of the symbol.
     * @param range The range of the symbol.
     * @param selectionRange The selectionRange of the symbol.
     * @param children Children of the symbol.
     */
    function create(name, detail, kind, range, selectionRange, children) {
        var result = {
            name: name,
            detail: detail,
            kind: kind,
            range: range,
            selectionRange: selectionRange
        };
        if (children !== void 0) {
            result.children = children;
        }
        return result;
    }
    DocumentSymbol.create = create;
    /**
     * Checks whether the given literal conforms to the [DocumentSymbol](#DocumentSymbol) interface.
     */
    function is(value) {
        var candidate = value;
        return candidate &&
            Is.string(candidate.name) && Is.number(candidate.kind) &&
            Range.is(candidate.range) && Range.is(candidate.selectionRange) &&
            (candidate.detail === void 0 || Is.string(candidate.detail)) &&
            (candidate.deprecated === void 0 || Is.boolean(candidate.deprecated)) &&
            (candidate.children === void 0 || Array.isArray(candidate.children));
    }
    DocumentSymbol.is = is;
})(DocumentSymbol || (DocumentSymbol = {}));
/**
 * A set of predefined code action kinds
 */
var CodeActionKind;
(function (CodeActionKind) {
    /**
     * Base kind for quickfix actions: 'quickfix'
     */
    CodeActionKind.QuickFix = 'quickfix';
    /**
     * Base kind for refactoring actions: 'refactor'
     */
    CodeActionKind.Refactor = 'refactor';
    /**
     * Base kind for refactoring extraction actions: 'refactor.extract'
     *
     * Example extract actions:
     *
     * - Extract method
     * - Extract function
     * - Extract variable
     * - Extract interface from class
     * - ...
     */
    CodeActionKind.RefactorExtract = 'refactor.extract';
    /**
     * Base kind for refactoring inline actions: 'refactor.inline'
     *
     * Example inline actions:
     *
     * - Inline function
     * - Inline variable
     * - Inline constant
     * - ...
     */
    CodeActionKind.RefactorInline = 'refactor.inline';
    /**
     * Base kind for refactoring rewrite actions: 'refactor.rewrite'
     *
     * Example rewrite actions:
     *
     * - Convert JavaScript function to class
     * - Add or remove parameter
     * - Encapsulate field
     * - Make method static
     * - Move method to base class
     * - ...
     */
    CodeActionKind.RefactorRewrite = 'refactor.rewrite';
    /**
     * Base kind for source actions: `source`
     *
     * Source code actions apply to the entire file.
     */
    CodeActionKind.Source = 'source';
    /**
     * Base kind for an organize imports source action: `source.organizeImports`
     */
    CodeActionKind.SourceOrganizeImports = 'source.organizeImports';
})(CodeActionKind || (CodeActionKind = {}));
/**
 * The CodeActionContext namespace provides helper functions to work with
 * [CodeActionContext](#CodeActionContext) literals.
 */
var CodeActionContext;
(function (CodeActionContext) {
    /**
     * Creates a new CodeActionContext literal.
     */
    function create(diagnostics, only) {
        var result = { diagnostics: diagnostics };
        if (only !== void 0 && only !== null) {
            result.only = only;
        }
        return result;
    }
    CodeActionContext.create = create;
    /**
     * Checks whether the given literal conforms to the [CodeActionContext](#CodeActionContext) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.typedArray(candidate.diagnostics, Diagnostic.is) && (candidate.only === void 0 || Is.typedArray(candidate.only, Is.string));
    }
    CodeActionContext.is = is;
})(CodeActionContext || (CodeActionContext = {}));
var CodeAction;
(function (CodeAction) {
    function create(title, commandOrEdit, kind) {
        var result = { title: title };
        if (Command.is(commandOrEdit)) {
            result.command = commandOrEdit;
        }
        else {
            result.edit = commandOrEdit;
        }
        if (kind !== void null) {
            result.kind = kind;
        }
        return result;
    }
    CodeAction.create = create;
    function is(value) {
        var candidate = value;
        return candidate && Is.string(candidate.title) &&
            (candidate.diagnostics === void 0 || Is.typedArray(candidate.diagnostics, Diagnostic.is)) &&
            (candidate.kind === void 0 || Is.string(candidate.kind)) &&
            (candidate.edit !== void 0 || candidate.command !== void 0) &&
            (candidate.command === void 0 || Command.is(candidate.command)) &&
            (candidate.edit === void 0 || WorkspaceEdit.is(candidate.edit));
    }
    CodeAction.is = is;
})(CodeAction || (CodeAction = {}));
/**
 * The CodeLens namespace provides helper functions to work with
 * [CodeLens](#CodeLens) literals.
 */
var CodeLens;
(function (CodeLens) {
    /**
     * Creates a new CodeLens literal.
     */
    function create(range, data) {
        var result = { range: range };
        if (Is.defined(data))
            result.data = data;
        return result;
    }
    CodeLens.create = create;
    /**
     * Checks whether the given literal conforms to the [CodeLens](#CodeLens) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.command) || Command.is(candidate.command));
    }
    CodeLens.is = is;
})(CodeLens || (CodeLens = {}));
/**
 * The FormattingOptions namespace provides helper functions to work with
 * [FormattingOptions](#FormattingOptions) literals.
 */
var FormattingOptions;
(function (FormattingOptions) {
    /**
     * Creates a new FormattingOptions literal.
     */
    function create(tabSize, insertSpaces) {
        return { tabSize: tabSize, insertSpaces: insertSpaces };
    }
    FormattingOptions.create = create;
    /**
     * Checks whether the given literal conforms to the [FormattingOptions](#FormattingOptions) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.number(candidate.tabSize) && Is.boolean(candidate.insertSpaces);
    }
    FormattingOptions.is = is;
})(FormattingOptions || (FormattingOptions = {}));
/**
 * A document link is a range in a text document that links to an internal or external resource, like another
 * text document or a web site.
 */
var DocumentLink = /** @class */ (function () {
    function DocumentLink() {
    }
    return DocumentLink;
}());

/**
 * The DocumentLink namespace provides helper functions to work with
 * [DocumentLink](#DocumentLink) literals.
 */
(function (DocumentLink) {
    /**
     * Creates a new DocumentLink literal.
     */
    function create(range, target, data) {
        return { range: range, target: target, data: data };
    }
    DocumentLink.create = create;
    /**
     * Checks whether the given literal conforms to the [DocumentLink](#DocumentLink) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.target) || Is.string(candidate.target));
    }
    DocumentLink.is = is;
})(DocumentLink || (DocumentLink = {}));
var EOL = ['\n', '\r\n', '\r'];
var TextDocument;
(function (TextDocument) {
    /**
     * Creates a new ITextDocument literal from the given uri and content.
     * @param uri The document's uri.
     * @param languageId  The document's language Id.
     * @param content The document's content.
     */
    function create(uri, languageId, version, content) {
        return new FullTextDocument(uri, languageId, version, content);
    }
    TextDocument.create = create;
    /**
     * Checks whether the given literal conforms to the [ITextDocument](#ITextDocument) interface.
     */
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.uri) && (Is.undefined(candidate.languageId) || Is.string(candidate.languageId)) && Is.number(candidate.lineCount)
            && Is.func(candidate.getText) && Is.func(candidate.positionAt) && Is.func(candidate.offsetAt) ? true : false;
    }
    TextDocument.is = is;
    function applyEdits(document, edits) {
        var text = document.getText();
        var sortedEdits = mergeSort(edits, function (a, b) {
            var diff = a.range.start.line - b.range.start.line;
            if (diff === 0) {
                return a.range.start.character - b.range.start.character;
            }
            return diff;
        });
        var lastModifiedOffset = text.length;
        for (var i = sortedEdits.length - 1; i >= 0; i--) {
            var e = sortedEdits[i];
            var startOffset = document.offsetAt(e.range.start);
            var endOffset = document.offsetAt(e.range.end);
            if (endOffset <= lastModifiedOffset) {
                text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
            }
            else {
                throw new Error('Ovelapping edit');
            }
            lastModifiedOffset = startOffset;
        }
        return text;
    }
    TextDocument.applyEdits = applyEdits;
    function mergeSort(data, compare) {
        if (data.length <= 1) {
            // sorted
            return data;
        }
        var p = (data.length / 2) | 0;
        var left = data.slice(0, p);
        var right = data.slice(p);
        mergeSort(left, compare);
        mergeSort(right, compare);
        var leftIdx = 0;
        var rightIdx = 0;
        var i = 0;
        while (leftIdx < left.length && rightIdx < right.length) {
            var ret = compare(left[leftIdx], right[rightIdx]);
            if (ret <= 0) {
                // smaller_equal -> take left to preserve order
                data[i++] = left[leftIdx++];
            }
            else {
                // greater -> take right
                data[i++] = right[rightIdx++];
            }
        }
        while (leftIdx < left.length) {
            data[i++] = left[leftIdx++];
        }
        while (rightIdx < right.length) {
            data[i++] = right[rightIdx++];
        }
        return data;
    }
})(TextDocument || (TextDocument = {}));
/**
 * Represents reasons why a text document is saved.
 */
var TextDocumentSaveReason;
(function (TextDocumentSaveReason) {
    /**
     * Manually triggered, e.g. by the user pressing save, by starting debugging,
     * or by an API call.
     */
    TextDocumentSaveReason.Manual = 1;
    /**
     * Automatic after a delay.
     */
    TextDocumentSaveReason.AfterDelay = 2;
    /**
     * When the editor lost focus.
     */
    TextDocumentSaveReason.FocusOut = 3;
})(TextDocumentSaveReason || (TextDocumentSaveReason = {}));
var FullTextDocument = /** @class */ (function () {
    function FullTextDocument(uri, languageId, version, content) {
        this._uri = uri;
        this._languageId = languageId;
        this._version = version;
        this._content = content;
        this._lineOffsets = null;
    }
    Object.defineProperty(FullTextDocument.prototype, "uri", {
        get: function () {
            return this._uri;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(FullTextDocument.prototype, "languageId", {
        get: function () {
            return this._languageId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(FullTextDocument.prototype, "version", {
        get: function () {
            return this._version;
        },
        enumerable: true,
        configurable: true
    });
    FullTextDocument.prototype.getText = function (range) {
        if (range) {
            var start = this.offsetAt(range.start);
            var end = this.offsetAt(range.end);
            return this._content.substring(start, end);
        }
        return this._content;
    };
    FullTextDocument.prototype.update = function (event, version) {
        this._content = event.text;
        this._version = version;
        this._lineOffsets = null;
    };
    FullTextDocument.prototype.getLineOffsets = function () {
        if (this._lineOffsets === null) {
            var lineOffsets = [];
            var text = this._content;
            var isLineStart = true;
            for (var i = 0; i < text.length; i++) {
                if (isLineStart) {
                    lineOffsets.push(i);
                    isLineStart = false;
                }
                var ch = text.charAt(i);
                isLineStart = (ch === '\r' || ch === '\n');
                if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
                    i++;
                }
            }
            if (isLineStart && text.length > 0) {
                lineOffsets.push(text.length);
            }
            this._lineOffsets = lineOffsets;
        }
        return this._lineOffsets;
    };
    FullTextDocument.prototype.positionAt = function (offset) {
        offset = Math.max(Math.min(offset, this._content.length), 0);
        var lineOffsets = this.getLineOffsets();
        var low = 0, high = lineOffsets.length;
        if (high === 0) {
            return Position.create(0, offset);
        }
        while (low < high) {
            var mid = Math.floor((low + high) / 2);
            if (lineOffsets[mid] > offset) {
                high = mid;
            }
            else {
                low = mid + 1;
            }
        }
        // low is the least x for which the line offset is larger than the current offset
        // or array.length if no line offset is larger than the current offset
        var line = low - 1;
        return Position.create(line, offset - lineOffsets[line]);
    };
    FullTextDocument.prototype.offsetAt = function (position) {
        var lineOffsets = this.getLineOffsets();
        if (position.line >= lineOffsets.length) {
            return this._content.length;
        }
        else if (position.line < 0) {
            return 0;
        }
        var lineOffset = lineOffsets[position.line];
        var nextLineOffset = (position.line + 1 < lineOffsets.length) ? lineOffsets[position.line + 1] : this._content.length;
        return Math.max(Math.min(lineOffset + position.character, nextLineOffset), lineOffset);
    };
    Object.defineProperty(FullTextDocument.prototype, "lineCount", {
        get: function () {
            return this.getLineOffsets().length;
        },
        enumerable: true,
        configurable: true
    });
    return FullTextDocument;
}());
var Is;
(function (Is) {
    var toString = Object.prototype.toString;
    function defined(value) {
        return typeof value !== 'undefined';
    }
    Is.defined = defined;
    function undefined(value) {
        return typeof value === 'undefined';
    }
    Is.undefined = undefined;
    function boolean(value) {
        return value === true || value === false;
    }
    Is.boolean = boolean;
    function string(value) {
        return toString.call(value) === '[object String]';
    }
    Is.string = string;
    function number(value) {
        return toString.call(value) === '[object Number]';
    }
    Is.number = number;
    function func(value) {
        return toString.call(value) === '[object Function]';
    }
    Is.func = func;
    function objectLiteral(value) {
        // Strictly speaking class instances pass this check as well. Since the LSP
        // doesn't use classes we ignore this for now. If we do we need to add something
        // like this: `Object.getPrototypeOf(Object.getPrototypeOf(x)) === null`
        return value !== null && typeof value === 'object';
    }
    Is.objectLiteral = objectLiteral;
    function typedArray(value, check) {
        return Array.isArray(value) && value.every(check);
    }
    Is.typedArray = typedArray;
})(Is || (Is = {}));


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/jsonMode.js":
/*!*********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/jsonMode.js ***!
  \*********************************************************************/
/*! exports provided: setupMode */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "setupMode", function() { return setupMode; });
/* harmony import */ var _workerManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./workerManager.js */ "./node_modules/monaco-editor/esm/vs/language/json/workerManager.js");
/* harmony import */ var _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./languageFeatures.js */ "./node_modules/monaco-editor/esm/vs/language/json/languageFeatures.js");
/* harmony import */ var _tokenization_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./tokenization.js */ "./node_modules/monaco-editor/esm/vs/language/json/tokenization.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/




function setupMode(defaults) {
    var disposables = [];
    var client = new _workerManager_js__WEBPACK_IMPORTED_MODULE_0__["WorkerManager"](defaults);
    disposables.push(client);
    var worker = function () {
        var uris = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            uris[_i] = arguments[_i];
        }
        return client.getLanguageServiceWorker.apply(client, uris);
    };
    var languageId = defaults.languageId;
    disposables.push(monaco.languages.registerCompletionItemProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["CompletionAdapter"](worker)));
    disposables.push(monaco.languages.registerHoverProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["HoverAdapter"](worker)));
    disposables.push(monaco.languages.registerDocumentSymbolProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DocumentSymbolAdapter"](worker)));
    disposables.push(monaco.languages.registerDocumentFormattingEditProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DocumentFormattingEditProvider"](worker)));
    disposables.push(monaco.languages.registerDocumentRangeFormattingEditProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DocumentRangeFormattingEditProvider"](worker)));
    disposables.push(new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DiagnosticsAdapter"](languageId, worker, defaults));
    disposables.push(monaco.languages.setTokensProvider(languageId, Object(_tokenization_js__WEBPACK_IMPORTED_MODULE_2__["createTokenizationSupport"])(true)));
    disposables.push(monaco.languages.setLanguageConfiguration(languageId, richEditConfiguration));
    disposables.push(monaco.languages.registerColorProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["DocumentColorAdapter"](worker)));
    disposables.push(monaco.languages.registerFoldingRangeProvider(languageId, new _languageFeatures_js__WEBPACK_IMPORTED_MODULE_1__["FoldingRangeAdapter"](worker)));
}
var richEditConfiguration = {
    wordPattern: /(-?\d*\.\d\w*)|([^\[\{\]\}\:\"\,\s]+)/g,
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [
        ['{', '}'],
        ['[', ']']
    ],
    autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string'] },
        { open: '[', close: ']', notIn: ['string'] },
        { open: '"', close: '"', notIn: ['string'] }
    ]
};


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/languageFeatures.js":
/*!*****************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/languageFeatures.js ***!
  \*****************************************************************************/
/*! exports provided: DiagnosticsAdapter, CompletionAdapter, HoverAdapter, DocumentSymbolAdapter, DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider, DocumentColorAdapter, FoldingRangeAdapter */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DiagnosticsAdapter", function() { return DiagnosticsAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "CompletionAdapter", function() { return CompletionAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "HoverAdapter", function() { return HoverAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentSymbolAdapter", function() { return DocumentSymbolAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentFormattingEditProvider", function() { return DocumentFormattingEditProvider; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentRangeFormattingEditProvider", function() { return DocumentRangeFormattingEditProvider; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "DocumentColorAdapter", function() { return DocumentColorAdapter; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "FoldingRangeAdapter", function() { return FoldingRangeAdapter; });
/* harmony import */ var _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./_deps/vscode-languageserver-types/main.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/vscode-languageserver-types/main.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


var Uri = monaco.Uri;
var Range = monaco.Range;
// --- diagnostics --- ---
var DiagnosticsAdapter = /** @class */ (function () {
    function DiagnosticsAdapter(_languageId, _worker, defaults) {
        var _this = this;
        this._languageId = _languageId;
        this._worker = _worker;
        this._disposables = [];
        this._listener = Object.create(null);
        var onModelAdd = function (model) {
            var modeId = model.getModeId();
            if (modeId !== _this._languageId) {
                return;
            }
            var handle;
            _this._listener[model.uri.toString()] = model.onDidChangeContent(function () {
                clearTimeout(handle);
                handle = setTimeout(function () { return _this._doValidate(model.uri, modeId); }, 500);
            });
            _this._doValidate(model.uri, modeId);
        };
        var onModelRemoved = function (model) {
            monaco.editor.setModelMarkers(model, _this._languageId, []);
            var uriStr = model.uri.toString();
            var listener = _this._listener[uriStr];
            if (listener) {
                listener.dispose();
                delete _this._listener[uriStr];
            }
        };
        this._disposables.push(monaco.editor.onDidCreateModel(onModelAdd));
        this._disposables.push(monaco.editor.onWillDisposeModel(function (model) {
            onModelRemoved(model);
            _this._resetSchema(model.uri);
        }));
        this._disposables.push(monaco.editor.onDidChangeModelLanguage(function (event) {
            onModelRemoved(event.model);
            onModelAdd(event.model);
            _this._resetSchema(event.model.uri);
        }));
        this._disposables.push(defaults.onDidChange(function (_) {
            monaco.editor.getModels().forEach(function (model) {
                if (model.getModeId() === _this._languageId) {
                    onModelRemoved(model);
                    onModelAdd(model);
                }
            });
        }));
        this._disposables.push({
            dispose: function () {
                monaco.editor.getModels().forEach(onModelRemoved);
                for (var key in _this._listener) {
                    _this._listener[key].dispose();
                }
            }
        });
        monaco.editor.getModels().forEach(onModelAdd);
    }
    DiagnosticsAdapter.prototype.dispose = function () {
        this._disposables.forEach(function (d) { return d && d.dispose(); });
        this._disposables = [];
    };
    DiagnosticsAdapter.prototype._resetSchema = function (resource) {
        this._worker().then(function (worker) {
            worker.resetSchema(resource.toString());
        });
    };
    DiagnosticsAdapter.prototype._doValidate = function (resource, languageId) {
        this._worker(resource).then(function (worker) {
            return worker.doValidation(resource.toString()).then(function (diagnostics) {
                var markers = diagnostics.map(function (d) { return toDiagnostics(resource, d); });
                var model = monaco.editor.getModel(resource);
                if (model.getModeId() === languageId) {
                    monaco.editor.setModelMarkers(model, languageId, markers);
                }
            });
        }).then(undefined, function (err) {
            console.error(err);
        });
    };
    return DiagnosticsAdapter;
}());

function toSeverity(lsSeverity) {
    switch (lsSeverity) {
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["DiagnosticSeverity"].Error: return monaco.MarkerSeverity.Error;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["DiagnosticSeverity"].Warning: return monaco.MarkerSeverity.Warning;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["DiagnosticSeverity"].Information: return monaco.MarkerSeverity.Info;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["DiagnosticSeverity"].Hint: return monaco.MarkerSeverity.Hint;
        default:
            return monaco.MarkerSeverity.Info;
    }
}
function toDiagnostics(resource, diag) {
    var code = typeof diag.code === 'number' ? String(diag.code) : diag.code;
    return {
        severity: toSeverity(diag.severity),
        startLineNumber: diag.range.start.line + 1,
        startColumn: diag.range.start.character + 1,
        endLineNumber: diag.range.end.line + 1,
        endColumn: diag.range.end.character + 1,
        message: diag.message,
        code: code,
        source: diag.source
    };
}
// --- completion ------
function fromPosition(position) {
    if (!position) {
        return void 0;
    }
    return { character: position.column - 1, line: position.lineNumber - 1 };
}
function fromRange(range) {
    if (!range) {
        return void 0;
    }
    return { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } };
}
function toRange(range) {
    if (!range) {
        return void 0;
    }
    return new Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}
function toCompletionItemKind(kind) {
    var mItemKind = monaco.languages.CompletionItemKind;
    switch (kind) {
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Text: return mItemKind.Text;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Method: return mItemKind.Method;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Function: return mItemKind.Function;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Constructor: return mItemKind.Constructor;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Field: return mItemKind.Field;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Variable: return mItemKind.Variable;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Class: return mItemKind.Class;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Interface: return mItemKind.Interface;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Module: return mItemKind.Module;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Property: return mItemKind.Property;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Unit: return mItemKind.Unit;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Value: return mItemKind.Value;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Enum: return mItemKind.Enum;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Keyword: return mItemKind.Keyword;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Snippet: return mItemKind.Snippet;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Color: return mItemKind.Color;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].File: return mItemKind.File;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Reference: return mItemKind.Reference;
    }
    return mItemKind.Property;
}
function fromCompletionItemKind(kind) {
    var mItemKind = monaco.languages.CompletionItemKind;
    switch (kind) {
        case mItemKind.Text: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Text;
        case mItemKind.Method: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Method;
        case mItemKind.Function: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Function;
        case mItemKind.Constructor: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Constructor;
        case mItemKind.Field: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Field;
        case mItemKind.Variable: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Variable;
        case mItemKind.Class: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Class;
        case mItemKind.Interface: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Interface;
        case mItemKind.Module: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Module;
        case mItemKind.Property: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Property;
        case mItemKind.Unit: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Unit;
        case mItemKind.Value: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Value;
        case mItemKind.Enum: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Enum;
        case mItemKind.Keyword: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Keyword;
        case mItemKind.Snippet: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Snippet;
        case mItemKind.Color: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Color;
        case mItemKind.File: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].File;
        case mItemKind.Reference: return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Reference;
    }
    return _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["CompletionItemKind"].Property;
}
function toTextEdit(textEdit) {
    if (!textEdit) {
        return void 0;
    }
    return {
        range: toRange(textEdit.range),
        text: textEdit.newText
    };
}
var CompletionAdapter = /** @class */ (function () {
    function CompletionAdapter(_worker) {
        this._worker = _worker;
    }
    Object.defineProperty(CompletionAdapter.prototype, "triggerCharacters", {
        get: function () {
            return [' ', ':'];
        },
        enumerable: true,
        configurable: true
    });
    CompletionAdapter.prototype.provideCompletionItems = function (model, position, context, token) {
        var wordInfo = model.getWordUntilPosition(position);
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.doComplete(resource.toString(), fromPosition(position));
        }).then(function (info) {
            if (!info) {
                return;
            }
            var items = info.items.map(function (entry) {
                var item = {
                    label: entry.label,
                    insertText: entry.insertText || entry.label,
                    sortText: entry.sortText,
                    filterText: entry.filterText,
                    documentation: entry.documentation,
                    detail: entry.detail,
                    kind: toCompletionItemKind(entry.kind),
                };
                if (entry.textEdit) {
                    item.range = toRange(entry.textEdit.range);
                    item.insertText = entry.textEdit.newText;
                }
                if (entry.additionalTextEdits) {
                    item.additionalTextEdits = entry.additionalTextEdits.map(toTextEdit);
                }
                if (entry.insertTextFormat === _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["InsertTextFormat"].Snippet) {
                    item.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
                }
                return item;
            });
            return {
                isIncomplete: info.isIncomplete,
                suggestions: items
            };
        });
    };
    return CompletionAdapter;
}());

function isMarkupContent(thing) {
    return thing && typeof thing === 'object' && typeof thing.kind === 'string';
}
function toMarkdownString(entry) {
    if (typeof entry === 'string') {
        return {
            value: entry
        };
    }
    if (isMarkupContent(entry)) {
        if (entry.kind === 'plaintext') {
            return {
                value: entry.value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&')
            };
        }
        return {
            value: entry.value
        };
    }
    return { value: '```' + entry.language + '\n' + entry.value + '\n```\n' };
}
function toMarkedStringArray(contents) {
    if (!contents) {
        return void 0;
    }
    if (Array.isArray(contents)) {
        return contents.map(toMarkdownString);
    }
    return [toMarkdownString(contents)];
}
// --- hover ------
var HoverAdapter = /** @class */ (function () {
    function HoverAdapter(_worker) {
        this._worker = _worker;
    }
    HoverAdapter.prototype.provideHover = function (model, position, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.doHover(resource.toString(), fromPosition(position));
        }).then(function (info) {
            if (!info) {
                return;
            }
            return {
                range: toRange(info.range),
                contents: toMarkedStringArray(info.contents)
            };
        });
    };
    return HoverAdapter;
}());

// --- definition ------
function toLocation(location) {
    return {
        uri: Uri.parse(location.uri),
        range: toRange(location.range)
    };
}
// --- document symbols ------
function toSymbolKind(kind) {
    var mKind = monaco.languages.SymbolKind;
    switch (kind) {
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].File: return mKind.Array;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Module: return mKind.Module;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Namespace: return mKind.Namespace;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Package: return mKind.Package;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Class: return mKind.Class;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Method: return mKind.Method;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Property: return mKind.Property;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Field: return mKind.Field;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Constructor: return mKind.Constructor;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Enum: return mKind.Enum;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Interface: return mKind.Interface;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Function: return mKind.Function;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Variable: return mKind.Variable;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Constant: return mKind.Constant;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].String: return mKind.String;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Number: return mKind.Number;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Boolean: return mKind.Boolean;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["SymbolKind"].Array: return mKind.Array;
    }
    return mKind.Function;
}
var DocumentSymbolAdapter = /** @class */ (function () {
    function DocumentSymbolAdapter(_worker) {
        this._worker = _worker;
    }
    DocumentSymbolAdapter.prototype.provideDocumentSymbols = function (model, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.findDocumentSymbols(resource.toString()); }).then(function (items) {
            if (!items) {
                return;
            }
            return items.map(function (item) { return ({
                name: item.name,
                detail: '',
                containerName: item.containerName,
                kind: toSymbolKind(item.kind),
                range: toRange(item.location.range),
                selectionRange: toRange(item.location.range)
            }); });
        });
    };
    return DocumentSymbolAdapter;
}());

function fromFormattingOptions(options) {
    return {
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces
    };
}
var DocumentFormattingEditProvider = /** @class */ (function () {
    function DocumentFormattingEditProvider(_worker) {
        this._worker = _worker;
    }
    DocumentFormattingEditProvider.prototype.provideDocumentFormattingEdits = function (model, options, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.format(resource.toString(), null, fromFormattingOptions(options)).then(function (edits) {
                if (!edits || edits.length === 0) {
                    return;
                }
                return edits.map(toTextEdit);
            });
        });
    };
    return DocumentFormattingEditProvider;
}());

var DocumentRangeFormattingEditProvider = /** @class */ (function () {
    function DocumentRangeFormattingEditProvider(_worker) {
        this._worker = _worker;
    }
    DocumentRangeFormattingEditProvider.prototype.provideDocumentRangeFormattingEdits = function (model, range, options, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) {
            return worker.format(resource.toString(), fromRange(range), fromFormattingOptions(options)).then(function (edits) {
                if (!edits || edits.length === 0) {
                    return;
                }
                return edits.map(toTextEdit);
            });
        });
    };
    return DocumentRangeFormattingEditProvider;
}());

var DocumentColorAdapter = /** @class */ (function () {
    function DocumentColorAdapter(_worker) {
        this._worker = _worker;
    }
    DocumentColorAdapter.prototype.provideDocumentColors = function (model, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.findDocumentColors(resource.toString()); }).then(function (infos) {
            if (!infos) {
                return;
            }
            return infos.map(function (item) { return ({
                color: item.color,
                range: toRange(item.range)
            }); });
        });
    };
    DocumentColorAdapter.prototype.provideColorPresentations = function (model, info, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.getColorPresentations(resource.toString(), info.color, fromRange(info.range)); }).then(function (presentations) {
            if (!presentations) {
                return;
            }
            return presentations.map(function (presentation) {
                var item = {
                    label: presentation.label,
                };
                if (presentation.textEdit) {
                    item.textEdit = toTextEdit(presentation.textEdit);
                }
                if (presentation.additionalTextEdits) {
                    item.additionalTextEdits = presentation.additionalTextEdits.map(toTextEdit);
                }
                return item;
            });
        });
    };
    return DocumentColorAdapter;
}());

var FoldingRangeAdapter = /** @class */ (function () {
    function FoldingRangeAdapter(_worker) {
        this._worker = _worker;
    }
    FoldingRangeAdapter.prototype.provideFoldingRanges = function (model, context, token) {
        var resource = model.uri;
        return this._worker(resource).then(function (worker) { return worker.provideFoldingRanges(resource.toString(), context); }).then(function (ranges) {
            if (!ranges) {
                return;
            }
            return ranges.map(function (range) {
                var result = {
                    start: range.startLine + 1,
                    end: range.endLine + 1
                };
                if (typeof range.kind !== 'undefined') {
                    result.kind = toFoldingRangeKind(range.kind);
                }
                return result;
            });
        });
    };
    return FoldingRangeAdapter;
}());

function toFoldingRangeKind(kind) {
    switch (kind) {
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["FoldingRangeKind"].Comment: return monaco.languages.FoldingRangeKind.Comment;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["FoldingRangeKind"].Imports: return monaco.languages.FoldingRangeKind.Imports;
        case _deps_vscode_languageserver_types_main_js__WEBPACK_IMPORTED_MODULE_0__["FoldingRangeKind"].Region: return monaco.languages.FoldingRangeKind.Region;
    }
    return void 0;
}


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/tokenization.js":
/*!*************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/tokenization.js ***!
  \*************************************************************************/
/*! exports provided: createTokenizationSupport, TOKEN_DELIM_OBJECT, TOKEN_DELIM_ARRAY, TOKEN_DELIM_COLON, TOKEN_DELIM_COMMA, TOKEN_VALUE_BOOLEAN, TOKEN_VALUE_NULL, TOKEN_VALUE_STRING, TOKEN_VALUE_NUMBER, TOKEN_PROPERTY_NAME, TOKEN_COMMENT_BLOCK, TOKEN_COMMENT_LINE */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createTokenizationSupport", function() { return createTokenizationSupport; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_DELIM_OBJECT", function() { return TOKEN_DELIM_OBJECT; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_DELIM_ARRAY", function() { return TOKEN_DELIM_ARRAY; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_DELIM_COLON", function() { return TOKEN_DELIM_COLON; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_DELIM_COMMA", function() { return TOKEN_DELIM_COMMA; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_VALUE_BOOLEAN", function() { return TOKEN_VALUE_BOOLEAN; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_VALUE_NULL", function() { return TOKEN_VALUE_NULL; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_VALUE_STRING", function() { return TOKEN_VALUE_STRING; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_VALUE_NUMBER", function() { return TOKEN_VALUE_NUMBER; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_PROPERTY_NAME", function() { return TOKEN_PROPERTY_NAME; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_COMMENT_BLOCK", function() { return TOKEN_COMMENT_BLOCK; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TOKEN_COMMENT_LINE", function() { return TOKEN_COMMENT_LINE; });
/* harmony import */ var _deps_jsonc_parser_main_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./_deps/jsonc-parser/main.js */ "./node_modules/monaco-editor/esm/vs/language/json/_deps/jsonc-parser/main.js");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


function createTokenizationSupport(supportComments) {
    return {
        getInitialState: function () { return new JSONState(null, null, false); },
        tokenize: function (line, state, offsetDelta, stopAtOffset) { return tokenize(supportComments, line, state, offsetDelta, stopAtOffset); }
    };
}
var TOKEN_DELIM_OBJECT = 'delimiter.bracket.json';
var TOKEN_DELIM_ARRAY = 'delimiter.array.json';
var TOKEN_DELIM_COLON = 'delimiter.colon.json';
var TOKEN_DELIM_COMMA = 'delimiter.comma.json';
var TOKEN_VALUE_BOOLEAN = 'keyword.json';
var TOKEN_VALUE_NULL = 'keyword.json';
var TOKEN_VALUE_STRING = 'string.value.json';
var TOKEN_VALUE_NUMBER = 'number.json';
var TOKEN_PROPERTY_NAME = 'string.key.json';
var TOKEN_COMMENT_BLOCK = 'comment.block.json';
var TOKEN_COMMENT_LINE = 'comment.line.json';
var JSONState = /** @class */ (function () {
    function JSONState(state, scanError, lastWasColon) {
        this._state = state;
        this.scanError = scanError;
        this.lastWasColon = lastWasColon;
    }
    JSONState.prototype.clone = function () {
        return new JSONState(this._state, this.scanError, this.lastWasColon);
    };
    JSONState.prototype.equals = function (other) {
        if (other === this) {
            return true;
        }
        if (!other || !(other instanceof JSONState)) {
            return false;
        }
        return this.scanError === other.scanError &&
            this.lastWasColon === other.lastWasColon;
    };
    JSONState.prototype.getStateData = function () {
        return this._state;
    };
    JSONState.prototype.setStateData = function (state) {
        this._state = state;
    };
    return JSONState;
}());
function tokenize(comments, line, state, offsetDelta, stopAtOffset) {
    if (offsetDelta === void 0) { offsetDelta = 0; }
    // handle multiline strings and block comments
    var numberOfInsertedCharacters = 0, adjustOffset = false;
    switch (state.scanError) {
        case 2 /* UnexpectedEndOfString */:
            line = '"' + line;
            numberOfInsertedCharacters = 1;
            break;
        case 1 /* UnexpectedEndOfComment */:
            line = '/*' + line;
            numberOfInsertedCharacters = 2;
            break;
    }
    var scanner = _deps_jsonc_parser_main_js__WEBPACK_IMPORTED_MODULE_0__["createScanner"](line), kind, ret, lastWasColon = state.lastWasColon;
    ret = {
        tokens: [],
        endState: state.clone()
    };
    while (true) {
        var offset = offsetDelta + scanner.getPosition(), type = '';
        kind = scanner.scan();
        if (kind === 17 /* EOF */) {
            break;
        }
        // Check that the scanner has advanced
        if (offset === offsetDelta + scanner.getPosition()) {
            throw new Error('Scanner did not advance, next 3 characters are: ' + line.substr(scanner.getPosition(), 3));
        }
        // In case we inserted /* or " character, we need to
        // adjust the offset of all tokens (except the first)
        if (adjustOffset) {
            offset -= numberOfInsertedCharacters;
        }
        adjustOffset = numberOfInsertedCharacters > 0;
        // brackets and type
        switch (kind) {
            case 1 /* OpenBraceToken */:
                type = TOKEN_DELIM_OBJECT;
                lastWasColon = false;
                break;
            case 2 /* CloseBraceToken */:
                type = TOKEN_DELIM_OBJECT;
                lastWasColon = false;
                break;
            case 3 /* OpenBracketToken */:
                type = TOKEN_DELIM_ARRAY;
                lastWasColon = false;
                break;
            case 4 /* CloseBracketToken */:
                type = TOKEN_DELIM_ARRAY;
                lastWasColon = false;
                break;
            case 6 /* ColonToken */:
                type = TOKEN_DELIM_COLON;
                lastWasColon = true;
                break;
            case 5 /* CommaToken */:
                type = TOKEN_DELIM_COMMA;
                lastWasColon = false;
                break;
            case 8 /* TrueKeyword */:
            case 9 /* FalseKeyword */:
                type = TOKEN_VALUE_BOOLEAN;
                lastWasColon = false;
                break;
            case 7 /* NullKeyword */:
                type = TOKEN_VALUE_NULL;
                lastWasColon = false;
                break;
            case 10 /* StringLiteral */:
                type = lastWasColon ? TOKEN_VALUE_STRING : TOKEN_PROPERTY_NAME;
                lastWasColon = false;
                break;
            case 11 /* NumericLiteral */:
                type = TOKEN_VALUE_NUMBER;
                lastWasColon = false;
                break;
        }
        // comments, iff enabled
        if (comments) {
            switch (kind) {
                case 12 /* LineCommentTrivia */:
                    type = TOKEN_COMMENT_LINE;
                    break;
                case 13 /* BlockCommentTrivia */:
                    type = TOKEN_COMMENT_BLOCK;
                    break;
            }
        }
        ret.endState = new JSONState(state.getStateData(), scanner.getTokenError(), lastWasColon);
        ret.tokens.push({
            startIndex: offset,
            scopes: type
        });
    }
    return ret;
}


/***/ }),

/***/ "./node_modules/monaco-editor/esm/vs/language/json/workerManager.js":
/*!**************************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/language/json/workerManager.js ***!
  \**************************************************************************/
/*! exports provided: WorkerManager */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "WorkerManager", function() { return WorkerManager; });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var STOP_WHEN_IDLE_FOR = 2 * 60 * 1000; // 2min
var WorkerManager = /** @class */ (function () {
    function WorkerManager(defaults) {
        var _this = this;
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
        var timePassedSinceLastUsed = Date.now() - this._lastUsedTime;
        if (timePassedSinceLastUsed > STOP_WHEN_IDLE_FOR) {
            this._stopWorker();
        }
    };
    WorkerManager.prototype._getClient = function () {
        this._lastUsedTime = Date.now();
        if (!this._client) {
            this._worker = monaco.editor.createWebWorker({
                // module that exports the create() method and returns a `JSONWorker` instance
                moduleId: 'vs/language/json/jsonWorker',
                label: this._defaults.languageId,
                // passed in to the create() method
                createData: {
                    languageSettings: this._defaults.diagnosticsOptions,
                    languageId: this._defaults.languageId,
                    enableSchemaRequest: this._defaults.diagnosticsOptions.enableSchemaRequest
                }
            });
            this._client = this._worker.getProxy();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9sYW5ndWFnZS9qc29uL19kZXBzL2pzb25jLXBhcnNlci9pbXBsL2VkaXQuanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvanNvbi9fZGVwcy9qc29uYy1wYXJzZXIvaW1wbC9mb3JtYXQuanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvanNvbi9fZGVwcy9qc29uYy1wYXJzZXIvaW1wbC9wYXJzZXIuanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvanNvbi9fZGVwcy9qc29uYy1wYXJzZXIvaW1wbC9zY2FubmVyLmpzIiwid2VicGFjazovL2NoYWluY29kZS9jb3VudGVyLy4vbm9kZV9tb2R1bGVzL21vbmFjby1lZGl0b3IvZXNtL3ZzL2xhbmd1YWdlL2pzb24vX2RlcHMvanNvbmMtcGFyc2VyL21haW4uanMiLCJ3ZWJwYWNrOi8vY2hhaW5jb2RlL2NvdW50ZXIvLi9ub2RlX21vZHVsZXMvbW9uYWNvLWVkaXRvci9lc20vdnMvbGFuZ3VhZ2UvanNvbi9fZGVwcy92c2NvZGUtbGFuZ3VhZ2VzZXJ2ZXItdHlwZXMvbWFpbi5qcyIsIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9sYW5ndWFnZS9qc29uL2pzb25Nb2RlLmpzIiwid2VicGFjazovL2NoYWluY29kZS9jb3VudGVyLy4vbm9kZV9tb2R1bGVzL21vbmFjby1lZGl0b3IvZXNtL3ZzL2xhbmd1YWdlL2pzb24vbGFuZ3VhZ2VGZWF0dXJlcy5qcyIsIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9sYW5ndWFnZS9qc29uL3Rva2VuaXphdGlvbi5qcyIsIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9sYW5ndWFnZS9qc29uL3dvcmtlck1hbmFnZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUMrQjtBQUNnQjtBQUNyRDtBQUNQO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQSxlQUFlLDREQUFTO0FBQ3hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCLHFFQUFrQjtBQUNuQztBQUNBO0FBQ0EsZ0NBQWdDO0FBQ2hDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrQkFBK0I7QUFDL0I7QUFDQTtBQUNBLHFDQUFxQyxpR0FBaUc7QUFDdEk7QUFDQTtBQUNBLHVCQUF1QixxRUFBa0I7QUFDekM7QUFDQSxtQ0FBbUM7QUFDbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2Q0FBNkMsb0VBQW9FO0FBQ2pIO0FBQ0E7QUFDQTtBQUNBLDZDQUE2QyxtRkFBbUY7QUFDaEk7QUFDQTtBQUNBO0FBQ0EsbUNBQW1DO0FBQ25DLDBCQUEwQjtBQUMxQjtBQUNBO0FBQ0EsZ0dBQWdHLDRCQUE0QixFQUFFO0FBQzlIO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QjtBQUN4QjtBQUNBO0FBQ0Esd0JBQXdCO0FBQ3hCO0FBQ0E7QUFDQSx3QkFBd0I7QUFDeEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMkJBQTJCO0FBQzNCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUztBQUNUO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7OztBQ25KQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNiLHVDQUF1QztBQUN2QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMkRBQTJELDZCQUE2QixFQUFFO0FBQzFGO0FBQ0EsNkVBQTZFLDRCQUE0QixFQUFFO0FBQzNHO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsdUJBQXVCO0FBQy9DO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1Q7QUFDQSxTQUFTLHFCQUFxQixnQkFBZ0IsRUFBRTtBQUNoRDtBQUNBO0FBQ0EsQ0FBQztBQUN3QiIsImZpbGUiOiIzNC5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbid1c2Ugc3RyaWN0JztcbmltcG9ydCB7IGZvcm1hdCwgaXNFT0wgfSBmcm9tICcuL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBwYXJzZVRyZWUsIGZpbmROb2RlQXRMb2NhdGlvbiB9IGZyb20gJy4vcGFyc2VyLmpzJztcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVQcm9wZXJ0eSh0ZXh0LCBwYXRoLCBmb3JtYXR0aW5nT3B0aW9ucykge1xuICAgIHJldHVybiBzZXRQcm9wZXJ0eSh0ZXh0LCBwYXRoLCB2b2lkIDAsIGZvcm1hdHRpbmdPcHRpb25zKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzZXRQcm9wZXJ0eSh0ZXh0LCBvcmlnaW5hbFBhdGgsIHZhbHVlLCBmb3JtYXR0aW5nT3B0aW9ucywgZ2V0SW5zZXJ0aW9uSW5kZXgpIHtcbiAgICB2YXIgcGF0aCA9IG9yaWdpbmFsUGF0aC5zbGljZSgpO1xuICAgIHZhciBlcnJvcnMgPSBbXTtcbiAgICB2YXIgcm9vdCA9IHBhcnNlVHJlZSh0ZXh0LCBlcnJvcnMpO1xuICAgIHZhciBwYXJlbnQgPSB2b2lkIDA7XG4gICAgdmFyIGxhc3RTZWdtZW50ID0gdm9pZCAwO1xuICAgIHdoaWxlIChwYXRoLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGFzdFNlZ21lbnQgPSBwYXRoLnBvcCgpO1xuICAgICAgICBwYXJlbnQgPSBmaW5kTm9kZUF0TG9jYXRpb24ocm9vdCwgcGF0aCk7XG4gICAgICAgIGlmIChwYXJlbnQgPT09IHZvaWQgMCAmJiB2YWx1ZSAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGxhc3RTZWdtZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gKF9hID0ge30sIF9hW2xhc3RTZWdtZW50XSA9IHZhbHVlLCBfYSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IFt2YWx1ZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXBhcmVudCkge1xuICAgICAgICAvLyBlbXB0eSBkb2N1bWVudFxuICAgICAgICBpZiAodmFsdWUgPT09IHZvaWQgMCkgeyAvLyBkZWxldGVcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG5vdCBkZWxldGUgaW4gZW1wdHkgZG9jdW1lbnQnKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gd2l0aEZvcm1hdHRpbmcodGV4dCwgeyBvZmZzZXQ6IHJvb3QgPyByb290Lm9mZnNldCA6IDAsIGxlbmd0aDogcm9vdCA/IHJvb3QubGVuZ3RoIDogMCwgY29udGVudDogSlNPTi5zdHJpbmdpZnkodmFsdWUpIH0sIGZvcm1hdHRpbmdPcHRpb25zKTtcbiAgICB9XG4gICAgZWxzZSBpZiAocGFyZW50LnR5cGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBsYXN0U2VnbWVudCA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShwYXJlbnQuY2hpbGRyZW4pKSB7XG4gICAgICAgIHZhciBleGlzdGluZyA9IGZpbmROb2RlQXRMb2NhdGlvbihwYXJlbnQsIFtsYXN0U2VnbWVudF0pO1xuICAgICAgICBpZiAoZXhpc3RpbmcgIT09IHZvaWQgMCkge1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHsgLy8gZGVsZXRlXG4gICAgICAgICAgICAgICAgaWYgKCFleGlzdGluZy5wYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYWxmb3JtZWQgQVNUJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBwcm9wZXJ0eUluZGV4ID0gcGFyZW50LmNoaWxkcmVuLmluZGV4T2YoZXhpc3RpbmcucGFyZW50KTtcbiAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlQmVnaW4gPSB2b2lkIDA7XG4gICAgICAgICAgICAgICAgdmFyIHJlbW92ZUVuZCA9IGV4aXN0aW5nLnBhcmVudC5vZmZzZXQgKyBleGlzdGluZy5wYXJlbnQubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGNvbW1hIG9mIHRoZSBwcmV2aW91cyBub2RlXG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmV2aW91cyA9IHBhcmVudC5jaGlsZHJlbltwcm9wZXJ0eUluZGV4IC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZUJlZ2luID0gcHJldmlvdXMub2Zmc2V0ICsgcHJldmlvdXMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlQmVnaW4gPSBwYXJlbnQub2Zmc2V0ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGNvbW1hIG9mIHRoZSBuZXh0IG5vZGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gcGFyZW50LmNoaWxkcmVuWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlRW5kID0gbmV4dC5vZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIHsgb2Zmc2V0OiByZW1vdmVCZWdpbiwgbGVuZ3RoOiByZW1vdmVFbmQgLSByZW1vdmVCZWdpbiwgY29udGVudDogJycgfSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHZhbHVlIG9mIGV4aXN0aW5nIHByb3BlcnR5XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIHsgb2Zmc2V0OiBleGlzdGluZy5vZmZzZXQsIGxlbmd0aDogZXhpc3RpbmcubGVuZ3RoLCBjb250ZW50OiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgfSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHsgLy8gZGVsZXRlXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtdOyAvLyBwcm9wZXJ0eSBkb2VzIG5vdCBleGlzdCwgbm90aGluZyB0byBkb1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG5ld1Byb3BlcnR5ID0gSlNPTi5zdHJpbmdpZnkobGFzdFNlZ21lbnQpICsgXCI6IFwiICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gZ2V0SW5zZXJ0aW9uSW5kZXggPyBnZXRJbnNlcnRpb25JbmRleChwYXJlbnQuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uIChwKSB7IHJldHVybiBwLmNoaWxkcmVuWzBdLnZhbHVlOyB9KSkgOiBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoO1xuICAgICAgICAgICAgdmFyIGVkaXQgPSB2b2lkIDA7XG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzID0gcGFyZW50LmNoaWxkcmVuW2luZGV4IC0gMV07XG4gICAgICAgICAgICAgICAgZWRpdCA9IHsgb2Zmc2V0OiBwcmV2aW91cy5vZmZzZXQgKyBwcmV2aW91cy5sZW5ndGgsIGxlbmd0aDogMCwgY29udGVudDogJywnICsgbmV3UHJvcGVydHkgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBlZGl0ID0geyBvZmZzZXQ6IHBhcmVudC5vZmZzZXQgKyAxLCBsZW5ndGg6IDAsIGNvbnRlbnQ6IG5ld1Byb3BlcnR5IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBlZGl0ID0geyBvZmZzZXQ6IHBhcmVudC5vZmZzZXQgKyAxLCBsZW5ndGg6IDAsIGNvbnRlbnQ6IG5ld1Byb3BlcnR5ICsgJywnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gd2l0aEZvcm1hdHRpbmcodGV4dCwgZWRpdCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKHBhcmVudC50eXBlID09PSAnYXJyYXknICYmIHR5cGVvZiBsYXN0U2VnbWVudCA9PT0gJ251bWJlcicgJiYgQXJyYXkuaXNBcnJheShwYXJlbnQuY2hpbGRyZW4pKSB7XG4gICAgICAgIHZhciBpbnNlcnRJbmRleCA9IGxhc3RTZWdtZW50O1xuICAgICAgICBpZiAoaW5zZXJ0SW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAvLyBJbnNlcnRcbiAgICAgICAgICAgIHZhciBuZXdQcm9wZXJ0eSA9IFwiXCIgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB2YXIgZWRpdCA9IHZvaWQgMDtcbiAgICAgICAgICAgIGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZWRpdCA9IHsgb2Zmc2V0OiBwYXJlbnQub2Zmc2V0ICsgMSwgbGVuZ3RoOiAwLCBjb250ZW50OiBuZXdQcm9wZXJ0eSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzID0gcGFyZW50LmNoaWxkcmVuW3BhcmVudC5jaGlsZHJlbi5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBlZGl0ID0geyBvZmZzZXQ6IHByZXZpb3VzLm9mZnNldCArIHByZXZpb3VzLmxlbmd0aCwgbGVuZ3RoOiAwLCBjb250ZW50OiAnLCcgKyBuZXdQcm9wZXJ0eSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHdpdGhGb3JtYXR0aW5nKHRleHQsIGVkaXQsIGZvcm1hdHRpbmdPcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwICYmIHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPj0gMCkge1xuICAgICAgICAgICAgICAgIC8vUmVtb3ZhbFxuICAgICAgICAgICAgICAgIHZhciByZW1vdmFsSW5kZXggPSBsYXN0U2VnbWVudDtcbiAgICAgICAgICAgICAgICB2YXIgdG9SZW1vdmUgPSBwYXJlbnQuY2hpbGRyZW5bcmVtb3ZhbEluZGV4XTtcbiAgICAgICAgICAgICAgICB2YXIgZWRpdCA9IHZvaWQgMDtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IGl0ZW1cbiAgICAgICAgICAgICAgICAgICAgZWRpdCA9IHsgb2Zmc2V0OiBwYXJlbnQub2Zmc2V0ICsgMSwgbGVuZ3RoOiBwYXJlbnQubGVuZ3RoIC0gMiwgY29udGVudDogJycgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCAtIDEgPT09IHJlbW92YWxJbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBsYXN0IGl0ZW1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzID0gcGFyZW50LmNoaWxkcmVuW3JlbW92YWxJbmRleCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgb2Zmc2V0ID0gcHJldmlvdXMub2Zmc2V0ICsgcHJldmlvdXMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50RW5kT2Zmc2V0ID0gcGFyZW50Lm9mZnNldCArIHBhcmVudC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGVkaXQgPSB7IG9mZnNldDogb2Zmc2V0LCBsZW5ndGg6IHBhcmVudEVuZE9mZnNldCAtIDIgLSBvZmZzZXQsIGNvbnRlbnQ6ICcnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlZGl0ID0geyBvZmZzZXQ6IHRvUmVtb3ZlLm9mZnNldCwgbGVuZ3RoOiBwYXJlbnQuY2hpbGRyZW5bcmVtb3ZhbEluZGV4ICsgMV0ub2Zmc2V0IC0gdG9SZW1vdmUub2Zmc2V0LCBjb250ZW50OiAnJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gd2l0aEZvcm1hdHRpbmcodGV4dCwgZWRpdCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBcnJheSBtb2RpZmljYXRpb24gbm90IHN1cHBvcnRlZCB5ZXQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuIG5vdCBhZGQgXCIgKyAodHlwZW9mIGxhc3RTZWdtZW50ICE9PSAnbnVtYmVyJyA/ICdpbmRleCcgOiAncHJvcGVydHknKSArIFwiIHRvIHBhcmVudCBvZiB0eXBlIFwiICsgcGFyZW50LnR5cGUpO1xuICAgIH1cbiAgICB2YXIgX2E7XG59XG5mdW5jdGlvbiB3aXRoRm9ybWF0dGluZyh0ZXh0LCBlZGl0LCBmb3JtYXR0aW5nT3B0aW9ucykge1xuICAgIC8vIGFwcGx5IHRoZSBlZGl0XG4gICAgdmFyIG5ld1RleHQgPSBhcHBseUVkaXQodGV4dCwgZWRpdCk7XG4gICAgLy8gZm9ybWF0IHRoZSBuZXcgdGV4dFxuICAgIHZhciBiZWdpbiA9IGVkaXQub2Zmc2V0O1xuICAgIHZhciBlbmQgPSBlZGl0Lm9mZnNldCArIGVkaXQuY29udGVudC5sZW5ndGg7XG4gICAgaWYgKGVkaXQubGVuZ3RoID09PSAwIHx8IGVkaXQuY29udGVudC5sZW5ndGggPT09IDApIHsgLy8gaW5zZXJ0IG9yIHJlbW92ZVxuICAgICAgICB3aGlsZSAoYmVnaW4gPiAwICYmICFpc0VPTChuZXdUZXh0LCBiZWdpbiAtIDEpKSB7XG4gICAgICAgICAgICBiZWdpbi0tO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChlbmQgPCBuZXdUZXh0Lmxlbmd0aCAmJiAhaXNFT0wobmV3VGV4dCwgZW5kKSkge1xuICAgICAgICAgICAgZW5kKys7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdmFyIGVkaXRzID0gZm9ybWF0KG5ld1RleHQsIHsgb2Zmc2V0OiBiZWdpbiwgbGVuZ3RoOiBlbmQgLSBiZWdpbiB9LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG4gICAgLy8gYXBwbHkgdGhlIGZvcm1hdHRpbmcgZWRpdHMgYW5kIHRyYWNrIHRoZSBiZWdpbiBhbmQgZW5kIG9mZnNldHMgb2YgdGhlIGNoYW5nZXNcbiAgICBmb3IgKHZhciBpID0gZWRpdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdmFyIGVkaXRfMSA9IGVkaXRzW2ldO1xuICAgICAgICBuZXdUZXh0ID0gYXBwbHlFZGl0KG5ld1RleHQsIGVkaXRfMSk7XG4gICAgICAgIGJlZ2luID0gTWF0aC5taW4oYmVnaW4sIGVkaXRfMS5vZmZzZXQpO1xuICAgICAgICBlbmQgPSBNYXRoLm1heChlbmQsIGVkaXRfMS5vZmZzZXQgKyBlZGl0XzEubGVuZ3RoKTtcbiAgICAgICAgZW5kICs9IGVkaXRfMS5jb250ZW50Lmxlbmd0aCAtIGVkaXRfMS5sZW5ndGg7XG4gICAgfVxuICAgIC8vIGNyZWF0ZSBhIHNpbmdsZSBlZGl0IHdpdGggYWxsIGNoYW5nZXNcbiAgICB2YXIgZWRpdExlbmd0aCA9IHRleHQubGVuZ3RoIC0gKG5ld1RleHQubGVuZ3RoIC0gZW5kKSAtIGJlZ2luO1xuICAgIHJldHVybiBbeyBvZmZzZXQ6IGJlZ2luLCBsZW5ndGg6IGVkaXRMZW5ndGgsIGNvbnRlbnQ6IG5ld1RleHQuc3Vic3RyaW5nKGJlZ2luLCBlbmQpIH1dO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5RWRpdCh0ZXh0LCBlZGl0KSB7XG4gICAgcmV0dXJuIHRleHQuc3Vic3RyaW5nKDAsIGVkaXQub2Zmc2V0KSArIGVkaXQuY29udGVudCArIHRleHQuc3Vic3RyaW5nKGVkaXQub2Zmc2V0ICsgZWRpdC5sZW5ndGgpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzV1ModGV4dCwgb2Zmc2V0KSB7XG4gICAgcmV0dXJuICdcXHJcXG4gXFx0Jy5pbmRleE9mKHRleHQuY2hhckF0KG9mZnNldCkpICE9PSAtMTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWVkaXQuanMubWFwIiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4ndXNlIHN0cmljdCc7XG5pbXBvcnQgeyBjcmVhdGVTY2FubmVyIH0gZnJvbSAnLi9zY2FubmVyLmpzJztcbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXQoZG9jdW1lbnRUZXh0LCByYW5nZSwgb3B0aW9ucykge1xuICAgIHZhciBpbml0aWFsSW5kZW50TGV2ZWw7XG4gICAgdmFyIGZvcm1hdFRleHQ7XG4gICAgdmFyIGZvcm1hdFRleHRTdGFydDtcbiAgICB2YXIgcmFuZ2VTdGFydDtcbiAgICB2YXIgcmFuZ2VFbmQ7XG4gICAgaWYgKHJhbmdlKSB7XG4gICAgICAgIHJhbmdlU3RhcnQgPSByYW5nZS5vZmZzZXQ7XG4gICAgICAgIHJhbmdlRW5kID0gcmFuZ2VTdGFydCArIHJhbmdlLmxlbmd0aDtcbiAgICAgICAgZm9ybWF0VGV4dFN0YXJ0ID0gcmFuZ2VTdGFydDtcbiAgICAgICAgd2hpbGUgKGZvcm1hdFRleHRTdGFydCA+IDAgJiYgIWlzRU9MKGRvY3VtZW50VGV4dCwgZm9ybWF0VGV4dFN0YXJ0IC0gMSkpIHtcbiAgICAgICAgICAgIGZvcm1hdFRleHRTdGFydC0tO1xuICAgICAgICB9XG4gICAgICAgIHZhciBlbmRPZmZzZXQgPSByYW5nZUVuZDtcbiAgICAgICAgd2hpbGUgKGVuZE9mZnNldCA8IGRvY3VtZW50VGV4dC5sZW5ndGggJiYgIWlzRU9MKGRvY3VtZW50VGV4dCwgZW5kT2Zmc2V0KSkge1xuICAgICAgICAgICAgZW5kT2Zmc2V0Kys7XG4gICAgICAgIH1cbiAgICAgICAgZm9ybWF0VGV4dCA9IGRvY3VtZW50VGV4dC5zdWJzdHJpbmcoZm9ybWF0VGV4dFN0YXJ0LCBlbmRPZmZzZXQpO1xuICAgICAgICBpbml0aWFsSW5kZW50TGV2ZWwgPSBjb21wdXRlSW5kZW50TGV2ZWwoZm9ybWF0VGV4dCwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBmb3JtYXRUZXh0ID0gZG9jdW1lbnRUZXh0O1xuICAgICAgICBpbml0aWFsSW5kZW50TGV2ZWwgPSAwO1xuICAgICAgICBmb3JtYXRUZXh0U3RhcnQgPSAwO1xuICAgICAgICByYW5nZVN0YXJ0ID0gMDtcbiAgICAgICAgcmFuZ2VFbmQgPSBkb2N1bWVudFRleHQubGVuZ3RoO1xuICAgIH1cbiAgICB2YXIgZW9sID0gZ2V0RU9MKG9wdGlvbnMsIGRvY3VtZW50VGV4dCk7XG4gICAgdmFyIGxpbmVCcmVhayA9IGZhbHNlO1xuICAgIHZhciBpbmRlbnRMZXZlbCA9IDA7XG4gICAgdmFyIGluZGVudFZhbHVlO1xuICAgIGlmIChvcHRpb25zLmluc2VydFNwYWNlcykge1xuICAgICAgICBpbmRlbnRWYWx1ZSA9IHJlcGVhdCgnICcsIG9wdGlvbnMudGFiU2l6ZSB8fCA0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGluZGVudFZhbHVlID0gJ1xcdCc7XG4gICAgfVxuICAgIHZhciBzY2FubmVyID0gY3JlYXRlU2Nhbm5lcihmb3JtYXRUZXh0LCBmYWxzZSk7XG4gICAgdmFyIGhhc0Vycm9yID0gZmFsc2U7XG4gICAgZnVuY3Rpb24gbmV3TGluZUFuZEluZGVudCgpIHtcbiAgICAgICAgcmV0dXJuIGVvbCArIHJlcGVhdChpbmRlbnRWYWx1ZSwgaW5pdGlhbEluZGVudExldmVsICsgaW5kZW50TGV2ZWwpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBzY2FuTmV4dCgpIHtcbiAgICAgICAgdmFyIHRva2VuID0gc2Nhbm5lci5zY2FuKCk7XG4gICAgICAgIGxpbmVCcmVhayA9IGZhbHNlO1xuICAgICAgICB3aGlsZSAodG9rZW4gPT09IDE1IC8qIFRyaXZpYSAqLyB8fCB0b2tlbiA9PT0gMTQgLyogTGluZUJyZWFrVHJpdmlhICovKSB7XG4gICAgICAgICAgICBsaW5lQnJlYWsgPSBsaW5lQnJlYWsgfHwgKHRva2VuID09PSAxNCAvKiBMaW5lQnJlYWtUcml2aWEgKi8pO1xuICAgICAgICAgICAgdG9rZW4gPSBzY2FubmVyLnNjYW4oKTtcbiAgICAgICAgfVxuICAgICAgICBoYXNFcnJvciA9IHRva2VuID09PSAxNiAvKiBVbmtub3duICovIHx8IHNjYW5uZXIuZ2V0VG9rZW5FcnJvcigpICE9PSAwIC8qIE5vbmUgKi87XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9XG4gICAgdmFyIGVkaXRPcGVyYXRpb25zID0gW107XG4gICAgZnVuY3Rpb24gYWRkRWRpdCh0ZXh0LCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0KSB7XG4gICAgICAgIGlmICghaGFzRXJyb3IgJiYgc3RhcnRPZmZzZXQgPCByYW5nZUVuZCAmJiBlbmRPZmZzZXQgPiByYW5nZVN0YXJ0ICYmIGRvY3VtZW50VGV4dC5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZE9mZnNldCkgIT09IHRleHQpIHtcbiAgICAgICAgICAgIGVkaXRPcGVyYXRpb25zLnB1c2goeyBvZmZzZXQ6IHN0YXJ0T2Zmc2V0LCBsZW5ndGg6IGVuZE9mZnNldCAtIHN0YXJ0T2Zmc2V0LCBjb250ZW50OiB0ZXh0IH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHZhciBmaXJzdFRva2VuID0gc2Nhbk5leHQoKTtcbiAgICBpZiAoZmlyc3RUb2tlbiAhPT0gMTcgLyogRU9GICovKSB7XG4gICAgICAgIHZhciBmaXJzdFRva2VuU3RhcnQgPSBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkgKyBmb3JtYXRUZXh0U3RhcnQ7XG4gICAgICAgIHZhciBpbml0aWFsSW5kZW50ID0gcmVwZWF0KGluZGVudFZhbHVlLCBpbml0aWFsSW5kZW50TGV2ZWwpO1xuICAgICAgICBhZGRFZGl0KGluaXRpYWxJbmRlbnQsIGZvcm1hdFRleHRTdGFydCwgZmlyc3RUb2tlblN0YXJ0KTtcbiAgICB9XG4gICAgd2hpbGUgKGZpcnN0VG9rZW4gIT09IDE3IC8qIEVPRiAqLykge1xuICAgICAgICB2YXIgZmlyc3RUb2tlbkVuZCA9IHNjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKSArIHNjYW5uZXIuZ2V0VG9rZW5MZW5ndGgoKSArIGZvcm1hdFRleHRTdGFydDtcbiAgICAgICAgdmFyIHNlY29uZFRva2VuID0gc2Nhbk5leHQoKTtcbiAgICAgICAgdmFyIHJlcGxhY2VDb250ZW50ID0gJyc7XG4gICAgICAgIHdoaWxlICghbGluZUJyZWFrICYmIChzZWNvbmRUb2tlbiA9PT0gMTIgLyogTGluZUNvbW1lbnRUcml2aWEgKi8gfHwgc2Vjb25kVG9rZW4gPT09IDEzIC8qIEJsb2NrQ29tbWVudFRyaXZpYSAqLykpIHtcbiAgICAgICAgICAgIC8vIGNvbW1lbnRzIG9uIHRoZSBzYW1lIGxpbmU6IGtlZXAgdGhlbSBvbiB0aGUgc2FtZSBsaW5lLCBidXQgaWdub3JlIHRoZW0gb3RoZXJ3aXNlXG4gICAgICAgICAgICB2YXIgY29tbWVudFRva2VuU3RhcnQgPSBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkgKyBmb3JtYXRUZXh0U3RhcnQ7XG4gICAgICAgICAgICBhZGRFZGl0KCcgJywgZmlyc3RUb2tlbkVuZCwgY29tbWVudFRva2VuU3RhcnQpO1xuICAgICAgICAgICAgZmlyc3RUb2tlbkVuZCA9IHNjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKSArIHNjYW5uZXIuZ2V0VG9rZW5MZW5ndGgoKSArIGZvcm1hdFRleHRTdGFydDtcbiAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gc2Vjb25kVG9rZW4gPT09IDEyIC8qIExpbmVDb21tZW50VHJpdmlhICovID8gbmV3TGluZUFuZEluZGVudCgpIDogJyc7XG4gICAgICAgICAgICBzZWNvbmRUb2tlbiA9IHNjYW5OZXh0KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlY29uZFRva2VuID09PSAyIC8qIENsb3NlQnJhY2VUb2tlbiAqLykge1xuICAgICAgICAgICAgaWYgKGZpcnN0VG9rZW4gIT09IDEgLyogT3BlbkJyYWNlVG9rZW4gKi8pIHtcbiAgICAgICAgICAgICAgICBpbmRlbnRMZXZlbC0tO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlY29uZFRva2VuID09PSA0IC8qIENsb3NlQnJhY2tldFRva2VuICovKSB7XG4gICAgICAgICAgICBpZiAoZmlyc3RUb2tlbiAhPT0gMyAvKiBPcGVuQnJhY2tldFRva2VuICovKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50TGV2ZWwtLTtcbiAgICAgICAgICAgICAgICByZXBsYWNlQ29udGVudCA9IG5ld0xpbmVBbmRJbmRlbnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAoZmlyc3RUb2tlbikge1xuICAgICAgICAgICAgICAgIGNhc2UgMyAvKiBPcGVuQnJhY2tldFRva2VuICovOlxuICAgICAgICAgICAgICAgIGNhc2UgMSAvKiBPcGVuQnJhY2VUb2tlbiAqLzpcbiAgICAgICAgICAgICAgICAgICAgaW5kZW50TGV2ZWwrKztcbiAgICAgICAgICAgICAgICAgICAgcmVwbGFjZUNvbnRlbnQgPSBuZXdMaW5lQW5kSW5kZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgNSAvKiBDb21tYVRva2VuICovOlxuICAgICAgICAgICAgICAgIGNhc2UgMTIgLyogTGluZUNvbW1lbnRUcml2aWEgKi86XG4gICAgICAgICAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDEzIC8qIEJsb2NrQ29tbWVudFRyaXZpYSAqLzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmVCcmVhaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwbGFjZUNvbnRlbnQgPSBuZXdMaW5lQW5kSW5kZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzeW1ib2wgZm9sbG93aW5nIGNvbW1lbnQgb24gdGhlIHNhbWUgbGluZToga2VlcCBvbiBzYW1lIGxpbmUsIHNlcGFyYXRlIHdpdGggJyAnXG4gICAgICAgICAgICAgICAgICAgICAgICByZXBsYWNlQ29udGVudCA9ICcgJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDYgLyogQ29sb25Ub2tlbiAqLzpcbiAgICAgICAgICAgICAgICAgICAgcmVwbGFjZUNvbnRlbnQgPSAnICc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTAgLyogU3RyaW5nTGl0ZXJhbCAqLzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlY29uZFRva2VuID09PSA2IC8qIENvbG9uVG9rZW4gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGZhbGwgdGhyb3VnaFxuICAgICAgICAgICAgICAgIGNhc2UgNyAvKiBOdWxsS2V5d29yZCAqLzpcbiAgICAgICAgICAgICAgICBjYXNlIDggLyogVHJ1ZUtleXdvcmQgKi86XG4gICAgICAgICAgICAgICAgY2FzZSA5IC8qIEZhbHNlS2V5d29yZCAqLzpcbiAgICAgICAgICAgICAgICBjYXNlIDExIC8qIE51bWVyaWNMaXRlcmFsICovOlxuICAgICAgICAgICAgICAgIGNhc2UgMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi86XG4gICAgICAgICAgICAgICAgY2FzZSA0IC8qIENsb3NlQnJhY2tldFRva2VuICovOlxuICAgICAgICAgICAgICAgICAgICBpZiAoc2Vjb25kVG9rZW4gPT09IDEyIC8qIExpbmVDb21tZW50VHJpdmlhICovIHx8IHNlY29uZFRva2VuID09PSAxMyAvKiBCbG9ja0NvbW1lbnRUcml2aWEgKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gJyAnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHNlY29uZFRva2VuICE9PSA1IC8qIENvbW1hVG9rZW4gKi8gJiYgc2Vjb25kVG9rZW4gIT09IDE3IC8qIEVPRiAqLykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaGFzRXJyb3IgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTYgLyogVW5rbm93biAqLzpcbiAgICAgICAgICAgICAgICAgICAgaGFzRXJyb3IgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChsaW5lQnJlYWsgJiYgKHNlY29uZFRva2VuID09PSAxMiAvKiBMaW5lQ29tbWVudFRyaXZpYSAqLyB8fCBzZWNvbmRUb2tlbiA9PT0gMTMgLyogQmxvY2tDb21tZW50VHJpdmlhICovKSkge1xuICAgICAgICAgICAgICAgIHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZhciBzZWNvbmRUb2tlblN0YXJ0ID0gc2Nhbm5lci5nZXRUb2tlbk9mZnNldCgpICsgZm9ybWF0VGV4dFN0YXJ0O1xuICAgICAgICBhZGRFZGl0KHJlcGxhY2VDb250ZW50LCBmaXJzdFRva2VuRW5kLCBzZWNvbmRUb2tlblN0YXJ0KTtcbiAgICAgICAgZmlyc3RUb2tlbiA9IHNlY29uZFRva2VuO1xuICAgIH1cbiAgICByZXR1cm4gZWRpdE9wZXJhdGlvbnM7XG59XG5mdW5jdGlvbiByZXBlYXQocywgY291bnQpIHtcbiAgICB2YXIgcmVzdWx0ID0gJyc7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIHJlc3VsdCArPSBzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuZnVuY3Rpb24gY29tcHV0ZUluZGVudExldmVsKGNvbnRlbnQsIG9wdGlvbnMpIHtcbiAgICB2YXIgaSA9IDA7XG4gICAgdmFyIG5DaGFycyA9IDA7XG4gICAgdmFyIHRhYlNpemUgPSBvcHRpb25zLnRhYlNpemUgfHwgNDtcbiAgICB3aGlsZSAoaSA8IGNvbnRlbnQubGVuZ3RoKSB7XG4gICAgICAgIHZhciBjaCA9IGNvbnRlbnQuY2hhckF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09ICcgJykge1xuICAgICAgICAgICAgbkNoYXJzKys7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09ICdcXHQnKSB7XG4gICAgICAgICAgICBuQ2hhcnMgKz0gdGFiU2l6ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGkrKztcbiAgICB9XG4gICAgcmV0dXJuIE1hdGguZmxvb3IobkNoYXJzIC8gdGFiU2l6ZSk7XG59XG5mdW5jdGlvbiBnZXRFT0wob3B0aW9ucywgdGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2ggPSB0ZXh0LmNoYXJBdChpKTtcbiAgICAgICAgaWYgKGNoID09PSAnXFxyJykge1xuICAgICAgICAgICAgaWYgKGkgKyAxIDwgdGV4dC5sZW5ndGggJiYgdGV4dC5jaGFyQXQoaSArIDEpID09PSAnXFxuJykge1xuICAgICAgICAgICAgICAgIHJldHVybiAnXFxyXFxuJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnXFxyJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gJ1xcbicpIHtcbiAgICAgICAgICAgIHJldHVybiAnXFxuJztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gKG9wdGlvbnMgJiYgb3B0aW9ucy5lb2wpIHx8ICdcXG4nO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzRU9MKHRleHQsIG9mZnNldCkge1xuICAgIHJldHVybiAnXFxyXFxuJy5pbmRleE9mKHRleHQuY2hhckF0KG9mZnNldCkpICE9PSAtMTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWZvcm1hdC5qcy5tYXAiLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbid1c2Ugc3RyaWN0JztcbmltcG9ydCB7IGNyZWF0ZVNjYW5uZXIgfSBmcm9tICcuL3NjYW5uZXIuanMnO1xuLyoqXG4gKiBGb3IgYSBnaXZlbiBvZmZzZXQsIGV2YWx1YXRlIHRoZSBsb2NhdGlvbiBpbiB0aGUgSlNPTiBkb2N1bWVudC4gRWFjaCBzZWdtZW50IGluIHRoZSBsb2NhdGlvbiBwYXRoIGlzIGVpdGhlciBhIHByb3BlcnR5IG5hbWUgb3IgYW4gYXJyYXkgaW5kZXguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhdGlvbih0ZXh0LCBwb3NpdGlvbikge1xuICAgIHZhciBzZWdtZW50cyA9IFtdOyAvLyBzdHJpbmdzIG9yIG51bWJlcnNcbiAgICB2YXIgZWFybHlSZXR1cm5FeGNlcHRpb24gPSBuZXcgT2JqZWN0KCk7XG4gICAgdmFyIHByZXZpb3VzTm9kZSA9IHZvaWQgMDtcbiAgICB2YXIgcHJldmlvdXNOb2RlSW5zdCA9IHtcbiAgICAgICAgdmFsdWU6IHt9LFxuICAgICAgICBvZmZzZXQ6IDAsXG4gICAgICAgIGxlbmd0aDogMCxcbiAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgIHBhcmVudDogdm9pZCAwXG4gICAgfTtcbiAgICB2YXIgaXNBdFByb3BlcnR5S2V5ID0gZmFsc2U7XG4gICAgZnVuY3Rpb24gc2V0UHJldmlvdXNOb2RlKHZhbHVlLCBvZmZzZXQsIGxlbmd0aCwgdHlwZSkge1xuICAgICAgICBwcmV2aW91c05vZGVJbnN0LnZhbHVlID0gdmFsdWU7XG4gICAgICAgIHByZXZpb3VzTm9kZUluc3Qub2Zmc2V0ID0gb2Zmc2V0O1xuICAgICAgICBwcmV2aW91c05vZGVJbnN0Lmxlbmd0aCA9IGxlbmd0aDtcbiAgICAgICAgcHJldmlvdXNOb2RlSW5zdC50eXBlID0gdHlwZTtcbiAgICAgICAgcHJldmlvdXNOb2RlSW5zdC5jb2xvbk9mZnNldCA9IHZvaWQgMDtcbiAgICAgICAgcHJldmlvdXNOb2RlID0gcHJldmlvdXNOb2RlSW5zdDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgdmlzaXQodGV4dCwge1xuICAgICAgICAgICAgb25PYmplY3RCZWdpbjogZnVuY3Rpb24gKG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDw9IG9mZnNldCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIGlzQXRQcm9wZXJ0eUtleSA9IHBvc2l0aW9uID4gb2Zmc2V0O1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzLnB1c2goJycpOyAvLyBwdXNoIGEgcGxhY2Vob2xkZXIgKHdpbGwgYmUgcmVwbGFjZWQpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25PYmplY3RQcm9wZXJ0eTogZnVuY3Rpb24gKG5hbWUsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDwgb2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZXRQcmV2aW91c05vZGUobmFtZSwgb2Zmc2V0LCBsZW5ndGgsICdwcm9wZXJ0eScpO1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdID0gbmFtZTtcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gPD0gb2Zmc2V0ICsgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbk9iamVjdEVuZDogZnVuY3Rpb24gKG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDw9IG9mZnNldCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzLnBvcCgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uQXJyYXlCZWdpbjogZnVuY3Rpb24gKG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDw9IG9mZnNldCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzLnB1c2goMCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25BcnJheUVuZDogZnVuY3Rpb24gKG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDw9IG9mZnNldCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzLnBvcCgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTGl0ZXJhbFZhbHVlOiBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uIDwgb2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZXRQcmV2aW91c05vZGUodmFsdWUsIG9mZnNldCwgbGVuZ3RoLCBnZXRMaXRlcmFsTm9kZVR5cGUodmFsdWUpKTtcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gPD0gb2Zmc2V0ICsgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblNlcGFyYXRvcjogZnVuY3Rpb24gKHNlcCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gPD0gb2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2VwID09PSAnOicgJiYgcHJldmlvdXNOb2RlICYmIHByZXZpb3VzTm9kZS50eXBlID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZS5jb2xvbk9mZnNldCA9IG9mZnNldDtcbiAgICAgICAgICAgICAgICAgICAgaXNBdFByb3BlcnR5S2V5ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VwID09PSAnLCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxhc3QgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBsYXN0ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV0gPSBsYXN0ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzQXRQcm9wZXJ0eUtleSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXSA9ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZSAhPT0gZWFybHlSZXR1cm5FeGNlcHRpb24pIHtcbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcGF0aDogc2VnbWVudHMsXG4gICAgICAgIHByZXZpb3VzTm9kZTogcHJldmlvdXNOb2RlLFxuICAgICAgICBpc0F0UHJvcGVydHlLZXk6IGlzQXRQcm9wZXJ0eUtleSxcbiAgICAgICAgbWF0Y2hlczogZnVuY3Rpb24gKHBhdHRlcm4pIHtcbiAgICAgICAgICAgIHZhciBrID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBrIDwgcGF0dGVybi5sZW5ndGggJiYgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhdHRlcm5ba10gPT09IHNlZ21lbnRzW2ldIHx8IHBhdHRlcm5ba10gPT09ICcqJykge1xuICAgICAgICAgICAgICAgICAgICBrKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHBhdHRlcm5ba10gIT09ICcqKicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBrID09PSBwYXR0ZXJuLmxlbmd0aDtcbiAgICAgICAgfVxuICAgIH07XG59XG4vKipcbiAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBhbmQgcmV0dXJucyB0aGUgb2JqZWN0IHRoZSBKU09OIGNvbnRlbnQgcmVwcmVzZW50cy4gT24gaW52YWxpZCBpbnB1dCwgdGhlIHBhcnNlciB0cmllcyB0byBiZSBhcyBmYXVsdCB0b2xlcmFudCBhcyBwb3NzaWJsZSwgYnV0IHN0aWxsIHJldHVybiBhIHJlc3VsdC5cbiAqIFRoZXJlZm9yZSBhbHdheXMgY2hlY2sgdGhlIGVycm9ycyBsaXN0IHRvIGZpbmQgb3V0IGlmIHRoZSBpbnB1dCB3YXMgdmFsaWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSh0ZXh0LCBlcnJvcnMsIG9wdGlvbnMpIHtcbiAgICBpZiAoZXJyb3JzID09PSB2b2lkIDApIHsgZXJyb3JzID0gW107IH1cbiAgICB2YXIgY3VycmVudFByb3BlcnR5ID0gbnVsbDtcbiAgICB2YXIgY3VycmVudFBhcmVudCA9IFtdO1xuICAgIHZhciBwcmV2aW91c1BhcmVudHMgPSBbXTtcbiAgICBmdW5jdGlvbiBvblZhbHVlKHZhbHVlKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRQYXJlbnQpKSB7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50LnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnJlbnRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgY3VycmVudFBhcmVudFtjdXJyZW50UHJvcGVydHldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdmFyIHZpc2l0b3IgPSB7XG4gICAgICAgIG9uT2JqZWN0QmVnaW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvYmplY3QgPSB7fTtcbiAgICAgICAgICAgIG9uVmFsdWUob2JqZWN0KTtcbiAgICAgICAgICAgIHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuICAgICAgICAgICAgY3VycmVudFBhcmVudCA9IG9iamVjdDtcbiAgICAgICAgICAgIGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG4gICAgICAgIH0sXG4gICAgICAgIG9uT2JqZWN0UHJvcGVydHk6IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICBjdXJyZW50UHJvcGVydHkgPSBuYW1lO1xuICAgICAgICB9LFxuICAgICAgICBvbk9iamVjdEVuZDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKTtcbiAgICAgICAgfSxcbiAgICAgICAgb25BcnJheUJlZ2luOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJyYXkgPSBbXTtcbiAgICAgICAgICAgIG9uVmFsdWUoYXJyYXkpO1xuICAgICAgICAgICAgcHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50ID0gYXJyYXk7XG4gICAgICAgICAgICBjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuICAgICAgICB9LFxuICAgICAgICBvbkFycmF5RW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpO1xuICAgICAgICB9LFxuICAgICAgICBvbkxpdGVyYWxWYWx1ZTogb25WYWx1ZSxcbiAgICAgICAgb25FcnJvcjogZnVuY3Rpb24gKGVycm9yLCBvZmZzZXQsIGxlbmd0aCkge1xuICAgICAgICAgICAgZXJyb3JzLnB1c2goeyBlcnJvcjogZXJyb3IsIG9mZnNldDogb2Zmc2V0LCBsZW5ndGg6IGxlbmd0aCB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdmlzaXQodGV4dCwgdmlzaXRvciwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIGN1cnJlbnRQYXJlbnRbMF07XG59XG4vKipcbiAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBhbmQgcmV0dXJucyBhIHRyZWUgcmVwcmVzZW50YXRpb24gdGhlIEpTT04gY29udGVudC4gT24gaW52YWxpZCBpbnB1dCwgdGhlIHBhcnNlciB0cmllcyB0byBiZSBhcyBmYXVsdCB0b2xlcmFudCBhcyBwb3NzaWJsZSwgYnV0IHN0aWxsIHJldHVybiBhIHJlc3VsdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVHJlZSh0ZXh0LCBlcnJvcnMsIG9wdGlvbnMpIHtcbiAgICBpZiAoZXJyb3JzID09PSB2b2lkIDApIHsgZXJyb3JzID0gW107IH1cbiAgICB2YXIgY3VycmVudFBhcmVudCA9IHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAtMSwgbGVuZ3RoOiAtMSwgY2hpbGRyZW46IFtdLCBwYXJlbnQ6IHZvaWQgMCB9OyAvLyBhcnRpZmljaWFsIHJvb3RcbiAgICBmdW5jdGlvbiBlbnN1cmVQcm9wZXJ0eUNvbXBsZXRlKGVuZE9mZnNldCkge1xuICAgICAgICBpZiAoY3VycmVudFBhcmVudC50eXBlID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50Lmxlbmd0aCA9IGVuZE9mZnNldCAtIGN1cnJlbnRQYXJlbnQub2Zmc2V0O1xuICAgICAgICAgICAgY3VycmVudFBhcmVudCA9IGN1cnJlbnRQYXJlbnQucGFyZW50O1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIG9uVmFsdWUodmFsdWVOb2RlKSB7XG4gICAgICAgIGN1cnJlbnRQYXJlbnQuY2hpbGRyZW4ucHVzaCh2YWx1ZU5vZGUpO1xuICAgICAgICByZXR1cm4gdmFsdWVOb2RlO1xuICAgIH1cbiAgICB2YXIgdmlzaXRvciA9IHtcbiAgICAgICAgb25PYmplY3RCZWdpbjogZnVuY3Rpb24gKG9mZnNldCkge1xuICAgICAgICAgICAgY3VycmVudFBhcmVudCA9IG9uVmFsdWUoeyB0eXBlOiAnb2JqZWN0Jywgb2Zmc2V0OiBvZmZzZXQsIGxlbmd0aDogLTEsIHBhcmVudDogY3VycmVudFBhcmVudCwgY2hpbGRyZW46IFtdIH0pO1xuICAgICAgICB9LFxuICAgICAgICBvbk9iamVjdFByb3BlcnR5OiBmdW5jdGlvbiAobmFtZSwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQgPSBvblZhbHVlKHsgdHlwZTogJ3Byb3BlcnR5Jywgb2Zmc2V0OiBvZmZzZXQsIGxlbmd0aDogLTEsIHBhcmVudDogY3VycmVudFBhcmVudCwgY2hpbGRyZW46IFtdIH0pO1xuICAgICAgICAgICAgY3VycmVudFBhcmVudC5jaGlsZHJlbi5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBuYW1lLCBvZmZzZXQ6IG9mZnNldCwgbGVuZ3RoOiBsZW5ndGgsIHBhcmVudDogY3VycmVudFBhcmVudCB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgb25PYmplY3RFbmQ6IGZ1bmN0aW9uIChvZmZzZXQsIGxlbmd0aCkge1xuICAgICAgICAgICAgY3VycmVudFBhcmVudC5sZW5ndGggPSBvZmZzZXQgKyBsZW5ndGggLSBjdXJyZW50UGFyZW50Lm9mZnNldDtcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQgPSBjdXJyZW50UGFyZW50LnBhcmVudDtcbiAgICAgICAgICAgIGVuc3VyZVByb3BlcnR5Q29tcGxldGUob2Zmc2V0ICsgbGVuZ3RoKTtcbiAgICAgICAgfSxcbiAgICAgICAgb25BcnJheUJlZ2luOiBmdW5jdGlvbiAob2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQgPSBvblZhbHVlKHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0OiBvZmZzZXQsIGxlbmd0aDogLTEsIHBhcmVudDogY3VycmVudFBhcmVudCwgY2hpbGRyZW46IFtdIH0pO1xuICAgICAgICB9LFxuICAgICAgICBvbkFycmF5RW5kOiBmdW5jdGlvbiAob2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQubGVuZ3RoID0gb2Zmc2V0ICsgbGVuZ3RoIC0gY3VycmVudFBhcmVudC5vZmZzZXQ7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50ID0gY3VycmVudFBhcmVudC5wYXJlbnQ7XG4gICAgICAgICAgICBlbnN1cmVQcm9wZXJ0eUNvbXBsZXRlKG9mZnNldCArIGxlbmd0aCk7XG4gICAgICAgIH0sXG4gICAgICAgIG9uTGl0ZXJhbFZhbHVlOiBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBvblZhbHVlKHsgdHlwZTogZ2V0TGl0ZXJhbE5vZGVUeXBlKHZhbHVlKSwgb2Zmc2V0OiBvZmZzZXQsIGxlbmd0aDogbGVuZ3RoLCBwYXJlbnQ6IGN1cnJlbnRQYXJlbnQsIHZhbHVlOiB2YWx1ZSB9KTtcbiAgICAgICAgICAgIGVuc3VyZVByb3BlcnR5Q29tcGxldGUob2Zmc2V0ICsgbGVuZ3RoKTtcbiAgICAgICAgfSxcbiAgICAgICAgb25TZXBhcmF0b3I6IGZ1bmN0aW9uIChzZXAsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFBhcmVudC50eXBlID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNlcCA9PT0gJzonKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQuY29sb25PZmZzZXQgPSBvZmZzZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHNlcCA9PT0gJywnKSB7XG4gICAgICAgICAgICAgICAgICAgIGVuc3VyZVByb3BlcnR5Q29tcGxldGUob2Zmc2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG9uRXJyb3I6IGZ1bmN0aW9uIChlcnJvciwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGVycm9ycy5wdXNoKHsgZXJyb3I6IGVycm9yLCBvZmZzZXQ6IG9mZnNldCwgbGVuZ3RoOiBsZW5ndGggfSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHZpc2l0KHRleHQsIHZpc2l0b3IsIG9wdGlvbnMpO1xuICAgIHZhciByZXN1bHQgPSBjdXJyZW50UGFyZW50LmNoaWxkcmVuWzBdO1xuICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5wYXJlbnQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG4vKipcbiAqIEZpbmRzIHRoZSBub2RlIGF0IHRoZSBnaXZlbiBwYXRoIGluIGEgSlNPTiBET00uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZUF0TG9jYXRpb24ocm9vdCwgcGF0aCkge1xuICAgIGlmICghcm9vdCkge1xuICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgIH1cbiAgICB2YXIgbm9kZSA9IHJvb3Q7XG4gICAgZm9yICh2YXIgX2kgPSAwLCBwYXRoXzEgPSBwYXRoOyBfaSA8IHBhdGhfMS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgdmFyIHNlZ21lbnQgPSBwYXRoXzFbX2ldO1xuICAgICAgICBpZiAodHlwZW9mIHNlZ21lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBpZiAobm9kZS50eXBlICE9PSAnb2JqZWN0JyB8fCAhQXJyYXkuaXNBcnJheShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAodmFyIF9hID0gMCwgX2IgPSBub2RlLmNoaWxkcmVuOyBfYSA8IF9iLmxlbmd0aDsgX2ErKykge1xuICAgICAgICAgICAgICAgIHZhciBwcm9wZXJ0eU5vZGUgPSBfYltfYV07XG4gICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocHJvcGVydHlOb2RlLmNoaWxkcmVuKSAmJiBwcm9wZXJ0eU5vZGUuY2hpbGRyZW5bMF0udmFsdWUgPT09IHNlZ21lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZSA9IHByb3BlcnR5Tm9kZS5jaGlsZHJlblsxXTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHNlZ21lbnQ7XG4gICAgICAgICAgICBpZiAobm9kZS50eXBlICE9PSAnYXJyYXknIHx8IGluZGV4IDwgMCB8fCAhQXJyYXkuaXNBcnJheShub2RlLmNoaWxkcmVuKSB8fCBpbmRleCA+PSBub2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBub2RlID0gbm9kZS5jaGlsZHJlbltpbmRleF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5vZGU7XG59XG4vKipcbiAqIEdldHMgdGhlIEpTT04gcGF0aCBvZiB0aGUgZ2l2ZW4gSlNPTiBET00gbm9kZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Tm9kZVBhdGgobm9kZSkge1xuICAgIGlmICghbm9kZS5wYXJlbnQgfHwgIW5vZGUucGFyZW50LmNoaWxkcmVuKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgdmFyIHBhdGggPSBnZXROb2RlUGF0aChub2RlLnBhcmVudCk7XG4gICAgaWYgKG5vZGUucGFyZW50LnR5cGUgPT09ICdwcm9wZXJ0eScpIHtcbiAgICAgICAgdmFyIGtleSA9IG5vZGUucGFyZW50LmNoaWxkcmVuWzBdLnZhbHVlO1xuICAgICAgICBwYXRoLnB1c2goa2V5KTtcbiAgICB9XG4gICAgZWxzZSBpZiAobm9kZS5wYXJlbnQudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICB2YXIgaW5kZXggPSBub2RlLnBhcmVudC5jaGlsZHJlbi5pbmRleE9mKG5vZGUpO1xuICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBwYXRoLnB1c2goaW5kZXgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwYXRoO1xufVxuLyoqXG4gKiBFdmFsdWF0ZXMgdGhlIEphdmFTY3JpcHQgb2JqZWN0IG9mIHRoZSBnaXZlbiBKU09OIERPTSBub2RlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXROb2RlVmFsdWUobm9kZSkge1xuICAgIHN3aXRjaCAobm9kZS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgICAgICAgIHJldHVybiBub2RlLmNoaWxkcmVuLm1hcChnZXROb2RlVmFsdWUpO1xuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgdmFyIG9iaiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gbm9kZS5jaGlsZHJlbjsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvcCA9IF9hW19pXTtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWVOb2RlID0gcHJvcC5jaGlsZHJlblsxXTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWVOb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ialtwcm9wLmNoaWxkcmVuWzBdLnZhbHVlXSA9IGdldE5vZGVWYWx1ZSh2YWx1ZU5vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIGNhc2UgJ251bGwnOlxuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHJldHVybiBub2RlLnZhbHVlO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICB9XG59XG5leHBvcnQgZnVuY3Rpb24gY29udGFpbnMobm9kZSwgb2Zmc2V0LCBpbmNsdWRlUmlnaHRCb3VuZCkge1xuICAgIGlmIChpbmNsdWRlUmlnaHRCb3VuZCA9PT0gdm9pZCAwKSB7IGluY2x1ZGVSaWdodEJvdW5kID0gZmFsc2U7IH1cbiAgICByZXR1cm4gKG9mZnNldCA+PSBub2RlLm9mZnNldCAmJiBvZmZzZXQgPCAobm9kZS5vZmZzZXQgKyBub2RlLmxlbmd0aCkpIHx8IGluY2x1ZGVSaWdodEJvdW5kICYmIChvZmZzZXQgPT09IChub2RlLm9mZnNldCArIG5vZGUubGVuZ3RoKSk7XG59XG4vKipcbiAqIEZpbmRzIHRoZSBtb3N0IGlubmVyIG5vZGUgYXQgdGhlIGdpdmVuIG9mZnNldC4gSWYgaW5jbHVkZVJpZ2h0Qm91bmQgaXMgc2V0LCBhbHNvIGZpbmRzIG5vZGVzIHRoYXQgZW5kIGF0IHRoZSBnaXZlbiBvZmZzZXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZUF0T2Zmc2V0KG5vZGUsIG9mZnNldCwgaW5jbHVkZVJpZ2h0Qm91bmQpIHtcbiAgICBpZiAoaW5jbHVkZVJpZ2h0Qm91bmQgPT09IHZvaWQgMCkgeyBpbmNsdWRlUmlnaHRCb3VuZCA9IGZhbHNlOyB9XG4gICAgaWYgKGNvbnRhaW5zKG5vZGUsIG9mZnNldCwgaW5jbHVkZVJpZ2h0Qm91bmQpKSB7XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW47XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNoaWxkcmVuKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGggJiYgY2hpbGRyZW5baV0ub2Zmc2V0IDw9IG9mZnNldDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGl0ZW0gPSBmaW5kTm9kZUF0T2Zmc2V0KGNoaWxkcmVuW2ldLCBvZmZzZXQsIGluY2x1ZGVSaWdodEJvdW5kKTtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuICAgIHJldHVybiB2b2lkIDA7XG59XG4vKipcbiAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBhbmQgaW52b2tlcyB0aGUgdmlzaXRvciBmdW5jdGlvbnMgZm9yIGVhY2ggb2JqZWN0LCBhcnJheSBhbmQgbGl0ZXJhbCByZWFjaGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmlzaXQodGV4dCwgdmlzaXRvciwgb3B0aW9ucykge1xuICAgIHZhciBfc2Nhbm5lciA9IGNyZWF0ZVNjYW5uZXIodGV4dCwgZmFsc2UpO1xuICAgIGZ1bmN0aW9uIHRvTm9BcmdWaXNpdCh2aXNpdEZ1bmN0aW9uKSB7XG4gICAgICAgIHJldHVybiB2aXNpdEZ1bmN0aW9uID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gdmlzaXRGdW5jdGlvbihfc2Nhbm5lci5nZXRUb2tlbk9mZnNldCgpLCBfc2Nhbm5lci5nZXRUb2tlbkxlbmd0aCgpKTsgfSA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvT25lQXJnVmlzaXQodmlzaXRGdW5jdGlvbikge1xuICAgICAgICByZXR1cm4gdmlzaXRGdW5jdGlvbiA/IGZ1bmN0aW9uIChhcmcpIHsgcmV0dXJuIHZpc2l0RnVuY3Rpb24oYXJnLCBfc2Nhbm5lci5nZXRUb2tlbk9mZnNldCgpLCBfc2Nhbm5lci5nZXRUb2tlbkxlbmd0aCgpKTsgfSA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH07XG4gICAgfVxuICAgIHZhciBvbk9iamVjdEJlZ2luID0gdG9Ob0FyZ1Zpc2l0KHZpc2l0b3Iub25PYmplY3RCZWdpbiksIG9uT2JqZWN0UHJvcGVydHkgPSB0b09uZUFyZ1Zpc2l0KHZpc2l0b3Iub25PYmplY3RQcm9wZXJ0eSksIG9uT2JqZWN0RW5kID0gdG9Ob0FyZ1Zpc2l0KHZpc2l0b3Iub25PYmplY3RFbmQpLCBvbkFycmF5QmVnaW4gPSB0b05vQXJnVmlzaXQodmlzaXRvci5vbkFycmF5QmVnaW4pLCBvbkFycmF5RW5kID0gdG9Ob0FyZ1Zpc2l0KHZpc2l0b3Iub25BcnJheUVuZCksIG9uTGl0ZXJhbFZhbHVlID0gdG9PbmVBcmdWaXNpdCh2aXNpdG9yLm9uTGl0ZXJhbFZhbHVlKSwgb25TZXBhcmF0b3IgPSB0b09uZUFyZ1Zpc2l0KHZpc2l0b3Iub25TZXBhcmF0b3IpLCBvbkNvbW1lbnQgPSB0b05vQXJnVmlzaXQodmlzaXRvci5vbkNvbW1lbnQpLCBvbkVycm9yID0gdG9PbmVBcmdWaXNpdCh2aXNpdG9yLm9uRXJyb3IpO1xuICAgIHZhciBkaXNhbGxvd0NvbW1lbnRzID0gb3B0aW9ucyAmJiBvcHRpb25zLmRpc2FsbG93Q29tbWVudHM7XG4gICAgdmFyIGFsbG93VHJhaWxpbmdDb21tYSA9IG9wdGlvbnMgJiYgb3B0aW9ucy5hbGxvd1RyYWlsaW5nQ29tbWE7XG4gICAgZnVuY3Rpb24gc2Nhbk5leHQoKSB7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBfc2Nhbm5lci5zY2FuKCk7XG4gICAgICAgICAgICBzd2l0Y2ggKF9zY2FubmVyLmdldFRva2VuRXJyb3IoKSkge1xuICAgICAgICAgICAgICAgIGNhc2UgNCAvKiBJbnZhbGlkVW5pY29kZSAqLzpcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoMTQgLyogSW52YWxpZFVuaWNvZGUgKi8pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDUgLyogSW52YWxpZEVzY2FwZUNoYXJhY3RlciAqLzpcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoMTUgLyogSW52YWxpZEVzY2FwZUNoYXJhY3RlciAqLyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMyAvKiBVbmV4cGVjdGVkRW5kT2ZOdW1iZXIgKi86XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDEzIC8qIFVuZXhwZWN0ZWRFbmRPZk51bWJlciAqLyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMSAvKiBVbmV4cGVjdGVkRW5kT2ZDb21tZW50ICovOlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRpc2FsbG93Q29tbWVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDExIC8qIFVuZXhwZWN0ZWRFbmRPZkNvbW1lbnQgKi8pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMiAvKiBVbmV4cGVjdGVkRW5kT2ZTdHJpbmcgKi86XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDEyIC8qIFVuZXhwZWN0ZWRFbmRPZlN0cmluZyAqLyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgNiAvKiBJbnZhbGlkQ2hhcmFjdGVyICovOlxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcigxNiAvKiBJbnZhbGlkQ2hhcmFjdGVyICovKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzd2l0Y2ggKHRva2VuKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAxMiAvKiBMaW5lQ29tbWVudFRyaXZpYSAqLzpcbiAgICAgICAgICAgICAgICBjYXNlIDEzIC8qIEJsb2NrQ29tbWVudFRyaXZpYSAqLzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRpc2FsbG93Q29tbWVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDEwIC8qIEludmFsaWRDb21tZW50VG9rZW4gKi8pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25Db21tZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxNiAvKiBVbmtub3duICovOlxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcigxIC8qIEludmFsaWRTeW1ib2wgKi8pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDE1IC8qIFRyaXZpYSAqLzpcbiAgICAgICAgICAgICAgICBjYXNlIDE0IC8qIExpbmVCcmVha1RyaXZpYSAqLzpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGhhbmRsZUVycm9yKGVycm9yLCBza2lwVW50aWxBZnRlciwgc2tpcFVudGlsKSB7XG4gICAgICAgIGlmIChza2lwVW50aWxBZnRlciA9PT0gdm9pZCAwKSB7IHNraXBVbnRpbEFmdGVyID0gW107IH1cbiAgICAgICAgaWYgKHNraXBVbnRpbCA9PT0gdm9pZCAwKSB7IHNraXBVbnRpbCA9IFtdOyB9XG4gICAgICAgIG9uRXJyb3IoZXJyb3IpO1xuICAgICAgICBpZiAoc2tpcFVudGlsQWZ0ZXIubGVuZ3RoICsgc2tpcFVudGlsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IF9zY2FubmVyLmdldFRva2VuKCk7XG4gICAgICAgICAgICB3aGlsZSAodG9rZW4gIT09IDE3IC8qIEVPRiAqLykge1xuICAgICAgICAgICAgICAgIGlmIChza2lwVW50aWxBZnRlci5pbmRleE9mKHRva2VuKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nhbk5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHNraXBVbnRpbC5pbmRleE9mKHRva2VuKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRva2VuID0gc2Nhbk5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBwYXJzZVN0cmluZyhpc1ZhbHVlKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IF9zY2FubmVyLmdldFRva2VuVmFsdWUoKTtcbiAgICAgICAgaWYgKGlzVmFsdWUpIHtcbiAgICAgICAgICAgIG9uTGl0ZXJhbFZhbHVlKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG9uT2JqZWN0UHJvcGVydHkodmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHNjYW5OZXh0KCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwYXJzZUxpdGVyYWwoKSB7XG4gICAgICAgIHN3aXRjaCAoX3NjYW5uZXIuZ2V0VG9rZW4oKSkge1xuICAgICAgICAgICAgY2FzZSAxMSAvKiBOdW1lcmljTGl0ZXJhbCAqLzpcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSAwO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5wYXJzZShfc2Nhbm5lci5nZXRUb2tlblZhbHVlKCkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoMiAvKiBJbnZhbGlkTnVtYmVyRm9ybWF0ICovKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcigyIC8qIEludmFsaWROdW1iZXJGb3JtYXQgKi8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvbkxpdGVyYWxWYWx1ZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDcgLyogTnVsbEtleXdvcmQgKi86XG4gICAgICAgICAgICAgICAgb25MaXRlcmFsVmFsdWUobnVsbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDggLyogVHJ1ZUtleXdvcmQgKi86XG4gICAgICAgICAgICAgICAgb25MaXRlcmFsVmFsdWUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDkgLyogRmFsc2VLZXl3b3JkICovOlxuICAgICAgICAgICAgICAgIG9uTGl0ZXJhbFZhbHVlKGZhbHNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHNjYW5OZXh0KCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwYXJzZVByb3BlcnR5KCkge1xuICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gMTAgLyogU3RyaW5nTGl0ZXJhbCAqLykge1xuICAgICAgICAgICAgaGFuZGxlRXJyb3IoMyAvKiBQcm9wZXJ0eU5hbWVFeHBlY3RlZCAqLywgW10sIFsyIC8qIENsb3NlQnJhY2VUb2tlbiAqLywgNSAvKiBDb21tYVRva2VuICovXSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VTdHJpbmcoZmFsc2UpO1xuICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSA9PT0gNiAvKiBDb2xvblRva2VuICovKSB7XG4gICAgICAgICAgICBvblNlcGFyYXRvcignOicpO1xuICAgICAgICAgICAgc2Nhbk5leHQoKTsgLy8gY29uc3VtZSBjb2xvblxuICAgICAgICAgICAgaWYgKCFwYXJzZVZhbHVlKCkpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcig0IC8qIFZhbHVlRXhwZWN0ZWQgKi8sIFtdLCBbMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi8sIDUgLyogQ29tbWFUb2tlbiAqL10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaGFuZGxlRXJyb3IoNSAvKiBDb2xvbkV4cGVjdGVkICovLCBbXSwgWzIgLyogQ2xvc2VCcmFjZVRva2VuICovLCA1IC8qIENvbW1hVG9rZW4gKi9dKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcGFyc2VPYmplY3QoKSB7XG4gICAgICAgIG9uT2JqZWN0QmVnaW4oKTtcbiAgICAgICAgc2Nhbk5leHQoKTsgLy8gY29uc3VtZSBvcGVuIGJyYWNlXG4gICAgICAgIHZhciBuZWVkc0NvbW1hID0gZmFsc2U7XG4gICAgICAgIHdoaWxlIChfc2Nhbm5lci5nZXRUb2tlbigpICE9PSAyIC8qIENsb3NlQnJhY2VUb2tlbiAqLyAmJiBfc2Nhbm5lci5nZXRUb2tlbigpICE9PSAxNyAvKiBFT0YgKi8pIHtcbiAgICAgICAgICAgIGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSA1IC8qIENvbW1hVG9rZW4gKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoIW5lZWRzQ29tbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoNCAvKiBWYWx1ZUV4cGVjdGVkICovLCBbXSwgW10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvblNlcGFyYXRvcignLCcpO1xuICAgICAgICAgICAgICAgIHNjYW5OZXh0KCk7IC8vIGNvbnN1bWUgY29tbWFcbiAgICAgICAgICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSA9PT0gMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi8gJiYgYWxsb3dUcmFpbGluZ0NvbW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKG5lZWRzQ29tbWEpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcig2IC8qIENvbW1hRXhwZWN0ZWQgKi8sIFtdLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXBhcnNlUHJvcGVydHkoKSkge1xuICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDQgLyogVmFsdWVFeHBlY3RlZCAqLywgW10sIFsyIC8qIENsb3NlQnJhY2VUb2tlbiAqLywgNSAvKiBDb21tYVRva2VuICovXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZWVkc0NvbW1hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBvbk9iamVjdEVuZCgpO1xuICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi8pIHtcbiAgICAgICAgICAgIGhhbmRsZUVycm9yKDcgLyogQ2xvc2VCcmFjZUV4cGVjdGVkICovLCBbMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi9dLCBbXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzY2FuTmV4dCgpOyAvLyBjb25zdW1lIGNsb3NlIGJyYWNlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHBhcnNlQXJyYXkoKSB7XG4gICAgICAgIG9uQXJyYXlCZWdpbigpO1xuICAgICAgICBzY2FuTmV4dCgpOyAvLyBjb25zdW1lIG9wZW4gYnJhY2tldFxuICAgICAgICB2YXIgbmVlZHNDb21tYSA9IGZhbHNlO1xuICAgICAgICB3aGlsZSAoX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gNCAvKiBDbG9zZUJyYWNrZXRUb2tlbiAqLyAmJiBfc2Nhbm5lci5nZXRUb2tlbigpICE9PSAxNyAvKiBFT0YgKi8pIHtcbiAgICAgICAgICAgIGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSA1IC8qIENvbW1hVG9rZW4gKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoIW5lZWRzQ29tbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoNCAvKiBWYWx1ZUV4cGVjdGVkICovLCBbXSwgW10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvblNlcGFyYXRvcignLCcpO1xuICAgICAgICAgICAgICAgIHNjYW5OZXh0KCk7IC8vIGNvbnN1bWUgY29tbWFcbiAgICAgICAgICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSA9PT0gNCAvKiBDbG9zZUJyYWNrZXRUb2tlbiAqLyAmJiBhbGxvd1RyYWlsaW5nQ29tbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobmVlZHNDb21tYSkge1xuICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKDYgLyogQ29tbWFFeHBlY3RlZCAqLywgW10sIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcGFyc2VWYWx1ZSgpKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoNCAvKiBWYWx1ZUV4cGVjdGVkICovLCBbXSwgWzQgLyogQ2xvc2VCcmFja2V0VG9rZW4gKi8sIDUgLyogQ29tbWFUb2tlbiAqL10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbmVlZHNDb21tYSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgb25BcnJheUVuZCgpO1xuICAgICAgICBpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gNCAvKiBDbG9zZUJyYWNrZXRUb2tlbiAqLykge1xuICAgICAgICAgICAgaGFuZGxlRXJyb3IoOCAvKiBDbG9zZUJyYWNrZXRFeHBlY3RlZCAqLywgWzQgLyogQ2xvc2VCcmFja2V0VG9rZW4gKi9dLCBbXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzY2FuTmV4dCgpOyAvLyBjb25zdW1lIGNsb3NlIGJyYWNrZXRcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcGFyc2VWYWx1ZSgpIHtcbiAgICAgICAgc3dpdGNoIChfc2Nhbm5lci5nZXRUb2tlbigpKSB7XG4gICAgICAgICAgICBjYXNlIDMgLyogT3BlbkJyYWNrZXRUb2tlbiAqLzpcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VBcnJheSgpO1xuICAgICAgICAgICAgY2FzZSAxIC8qIE9wZW5CcmFjZVRva2VuICovOlxuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZU9iamVjdCgpO1xuICAgICAgICAgICAgY2FzZSAxMCAvKiBTdHJpbmdMaXRlcmFsICovOlxuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZVN0cmluZyh0cnVlKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlTGl0ZXJhbCgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHNjYW5OZXh0KCk7XG4gICAgaWYgKF9zY2FubmVyLmdldFRva2VuKCkgPT09IDE3IC8qIEVPRiAqLykge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCFwYXJzZVZhbHVlKCkpIHtcbiAgICAgICAgaGFuZGxlRXJyb3IoNCAvKiBWYWx1ZUV4cGVjdGVkICovLCBbXSwgW10pO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChfc2Nhbm5lci5nZXRUb2tlbigpICE9PSAxNyAvKiBFT0YgKi8pIHtcbiAgICAgICAgaGFuZGxlRXJyb3IoOSAvKiBFbmRPZkZpbGVFeHBlY3RlZCAqLywgW10sIFtdKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG4vKipcbiAqIFRha2VzIEpTT04gd2l0aCBKYXZhU2NyaXB0LXN0eWxlIGNvbW1lbnRzIGFuZCByZW1vdmVcbiAqIHRoZW0uIE9wdGlvbmFsbHkgcmVwbGFjZXMgZXZlcnkgbm9uZS1uZXdsaW5lIGNoYXJhY3RlclxuICogb2YgY29tbWVudHMgd2l0aCBhIHJlcGxhY2VDaGFyYWN0ZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwQ29tbWVudHModGV4dCwgcmVwbGFjZUNoKSB7XG4gICAgdmFyIF9zY2FubmVyID0gY3JlYXRlU2Nhbm5lcih0ZXh0KSwgcGFydHMgPSBbXSwga2luZCwgb2Zmc2V0ID0gMCwgcG9zO1xuICAgIGRvIHtcbiAgICAgICAgcG9zID0gX3NjYW5uZXIuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAga2luZCA9IF9zY2FubmVyLnNjYW4oKTtcbiAgICAgICAgc3dpdGNoIChraW5kKSB7XG4gICAgICAgICAgICBjYXNlIDEyIC8qIExpbmVDb21tZW50VHJpdmlhICovOlxuICAgICAgICAgICAgY2FzZSAxMyAvKiBCbG9ja0NvbW1lbnRUcml2aWEgKi86XG4gICAgICAgICAgICBjYXNlIDE3IC8qIEVPRiAqLzpcbiAgICAgICAgICAgICAgICBpZiAob2Zmc2V0ICE9PSBwb3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh0ZXh0LnN1YnN0cmluZyhvZmZzZXQsIHBvcykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVwbGFjZUNoICE9PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaChfc2Nhbm5lci5nZXRUb2tlblZhbHVlKCkucmVwbGFjZSgvW15cXHJcXG5dL2csIHJlcGxhY2VDaCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvZmZzZXQgPSBfc2Nhbm5lci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfSB3aGlsZSAoa2luZCAhPT0gMTcgLyogRU9GICovKTtcbiAgICByZXR1cm4gcGFydHMuam9pbignJyk7XG59XG5mdW5jdGlvbiBnZXRMaXRlcmFsTm9kZVR5cGUodmFsdWUpIHtcbiAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICBjYXNlICdib29sZWFuJzogcmV0dXJuICdib29sZWFuJztcbiAgICAgICAgY2FzZSAnbnVtYmVyJzogcmV0dXJuICdudW1iZXInO1xuICAgICAgICBjYXNlICdzdHJpbmcnOiByZXR1cm4gJ3N0cmluZyc7XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnbnVsbCc7XG4gICAgfVxufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cGFyc2VyLmpzLm1hcCIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuJ3VzZSBzdHJpY3QnO1xuLyoqXG4gKiBDcmVhdGVzIGEgSlNPTiBzY2FubmVyIG9uIHRoZSBnaXZlbiB0ZXh0LlxuICogSWYgaWdub3JlVHJpdmlhIGlzIHNldCwgd2hpdGVzcGFjZXMgb3IgY29tbWVudHMgYXJlIGlnbm9yZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2FubmVyKHRleHQsIGlnbm9yZVRyaXZpYSkge1xuICAgIGlmIChpZ25vcmVUcml2aWEgPT09IHZvaWQgMCkgeyBpZ25vcmVUcml2aWEgPSBmYWxzZTsgfVxuICAgIHZhciBwb3MgPSAwLCBsZW4gPSB0ZXh0Lmxlbmd0aCwgdmFsdWUgPSAnJywgdG9rZW5PZmZzZXQgPSAwLCB0b2tlbiA9IDE2IC8qIFVua25vd24gKi8sIHNjYW5FcnJvciA9IDAgLyogTm9uZSAqLztcbiAgICBmdW5jdGlvbiBzY2FuSGV4RGlnaXRzKGNvdW50LCBleGFjdCkge1xuICAgICAgICB2YXIgZGlnaXRzID0gMDtcbiAgICAgICAgdmFyIHZhbHVlID0gMDtcbiAgICAgICAgd2hpbGUgKGRpZ2l0cyA8IGNvdW50IHx8ICFleGFjdCkge1xuICAgICAgICAgICAgdmFyIGNoID0gdGV4dC5jaGFyQ29kZUF0KHBvcyk7XG4gICAgICAgICAgICBpZiAoY2ggPj0gNDggLyogXzAgKi8gJiYgY2ggPD0gNTcgLyogXzkgKi8pIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlICogMTYgKyBjaCAtIDQ4IC8qIF8wICovO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2ggPj0gNjUgLyogQSAqLyAmJiBjaCA8PSA3MCAvKiBGICovKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSAqIDE2ICsgY2ggLSA2NSAvKiBBICovICsgMTA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaCA+PSA5NyAvKiBhICovICYmIGNoIDw9IDEwMiAvKiBmICovKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSAqIDE2ICsgY2ggLSA5NyAvKiBhICovICsgMTA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgZGlnaXRzKys7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRpZ2l0cyA8IGNvdW50KSB7XG4gICAgICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0UG9zaXRpb24obmV3UG9zaXRpb24pIHtcbiAgICAgICAgcG9zID0gbmV3UG9zaXRpb247XG4gICAgICAgIHZhbHVlID0gJyc7XG4gICAgICAgIHRva2VuT2Zmc2V0ID0gMDtcbiAgICAgICAgdG9rZW4gPSAxNiAvKiBVbmtub3duICovO1xuICAgICAgICBzY2FuRXJyb3IgPSAwIC8qIE5vbmUgKi87XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNjYW5OdW1iZXIoKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHBvcztcbiAgICAgICAgaWYgKHRleHQuY2hhckNvZGVBdChwb3MpID09PSA0OCAvKiBfMCAqLykge1xuICAgICAgICAgICAgcG9zKys7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgIHdoaWxlIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gNDYgLyogZG90ICovKSB7XG4gICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgIGlmIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHdoaWxlIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuICAgICAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2FuRXJyb3IgPSAzIC8qIFVuZXhwZWN0ZWRFbmRPZk51bWJlciAqLztcbiAgICAgICAgICAgICAgICByZXR1cm4gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGVuZCA9IHBvcztcbiAgICAgICAgaWYgKHBvcyA8IHRleHQubGVuZ3RoICYmICh0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gNjkgLyogRSAqLyB8fCB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gMTAxIC8qIGUgKi8pKSB7XG4gICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgIGlmIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gNDMgLyogcGx1cyAqLyB8fCB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gNDUgLyogbWludXMgKi8pIHtcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHdoaWxlIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuICAgICAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZW5kID0gcG9zO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NhbkVycm9yID0gMyAvKiBVbmV4cGVjdGVkRW5kT2ZOdW1iZXIgKi87XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBzY2FuU3RyaW5nKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gJycsIHN0YXJ0ID0gcG9zO1xuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHBvcyA+PSBsZW4pIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG4gICAgICAgICAgICAgICAgc2NhbkVycm9yID0gMiAvKiBVbmV4cGVjdGVkRW5kT2ZTdHJpbmcgKi87XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgY2ggPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcbiAgICAgICAgICAgIGlmIChjaCA9PT0gMzQgLyogZG91YmxlUXVvdGUgKi8pIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG4gICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2ggPT09IDkyIC8qIGJhY2tzbGFzaCAqLykge1xuICAgICAgICAgICAgICAgIHJlc3VsdCArPSB0ZXh0LnN1YnN0cmluZyhzdGFydCwgcG9zKTtcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICBpZiAocG9zID49IGxlbikge1xuICAgICAgICAgICAgICAgICAgICBzY2FuRXJyb3IgPSAyIC8qIFVuZXhwZWN0ZWRFbmRPZlN0cmluZyAqLztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNoID0gdGV4dC5jaGFyQ29kZUF0KHBvcysrKTtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgMzQgLyogZG91YmxlUXVvdGUgKi86XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gJ1xcXCInO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgOTIgLyogYmFja3NsYXNoICovOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9ICdcXFxcJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDQ3IC8qIHNsYXNoICovOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9ICcvJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDk4IC8qIGIgKi86XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gJ1xcYic7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAxMDIgLyogZiAqLzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAnXFxmJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDExMCAvKiBuICovOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9ICdcXG4nO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgMTE0IC8qIHIgKi86XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gJ1xccic7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAxMTYgLyogdCAqLzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAnXFx0JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDExNyAvKiB1ICovOlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNoXzEgPSBzY2FuSGV4RGlnaXRzKDQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNoXzEgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoXzEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NhbkVycm9yID0gNCAvKiBJbnZhbGlkVW5pY29kZSAqLztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbkVycm9yID0gNSAvKiBJbnZhbGlkRXNjYXBlQ2hhcmFjdGVyICovO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdGFydCA9IHBvcztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjaCA+PSAwICYmIGNoIDw9IDB4MWYpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNMaW5lQnJlYWsoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSB0ZXh0LnN1YnN0cmluZyhzdGFydCwgcG9zKTtcbiAgICAgICAgICAgICAgICAgICAgc2NhbkVycm9yID0gMiAvKiBVbmV4cGVjdGVkRW5kT2ZTdHJpbmcgKi87XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NhbkVycm9yID0gNiAvKiBJbnZhbGlkQ2hhcmFjdGVyICovO1xuICAgICAgICAgICAgICAgICAgICAvLyBtYXJrIGFzIGVycm9yIGJ1dCBjb250aW51ZSB3aXRoIHN0cmluZ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvcysrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNjYW5OZXh0KCkge1xuICAgICAgICB2YWx1ZSA9ICcnO1xuICAgICAgICBzY2FuRXJyb3IgPSAwIC8qIE5vbmUgKi87XG4gICAgICAgIHRva2VuT2Zmc2V0ID0gcG9zO1xuICAgICAgICBpZiAocG9zID49IGxlbikge1xuICAgICAgICAgICAgLy8gYXQgdGhlIGVuZFxuICAgICAgICAgICAgdG9rZW5PZmZzZXQgPSBsZW47XG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gPSAxNyAvKiBFT0YgKi87XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvZGUgPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcbiAgICAgICAgLy8gdHJpdmlhOiB3aGl0ZXNwYWNlXG4gICAgICAgIGlmIChpc1doaXRlU3BhY2UoY29kZSkpIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuICAgICAgICAgICAgICAgIGNvZGUgPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcbiAgICAgICAgICAgIH0gd2hpbGUgKGlzV2hpdGVTcGFjZShjb2RlKSk7XG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gPSAxNSAvKiBUcml2aWEgKi87XG4gICAgICAgIH1cbiAgICAgICAgLy8gdHJpdmlhOiBuZXdsaW5lc1xuICAgICAgICBpZiAoaXNMaW5lQnJlYWsoY29kZSkpIHtcbiAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgdmFsdWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjb2RlKTtcbiAgICAgICAgICAgIGlmIChjb2RlID09PSAxMyAvKiBjYXJyaWFnZVJldHVybiAqLyAmJiB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gMTAgLyogbGluZUZlZWQgKi8pIHtcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSAnXFxuJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDE0IC8qIExpbmVCcmVha1RyaXZpYSAqLztcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgICAgIC8vIHRva2VuczogW117fTosXG4gICAgICAgICAgICBjYXNlIDEyMyAvKiBvcGVuQnJhY2UgKi86XG4gICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuID0gMSAvKiBPcGVuQnJhY2VUb2tlbiAqLztcbiAgICAgICAgICAgIGNhc2UgMTI1IC8qIGNsb3NlQnJhY2UgKi86XG4gICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuID0gMiAvKiBDbG9zZUJyYWNlVG9rZW4gKi87XG4gICAgICAgICAgICBjYXNlIDkxIC8qIG9wZW5CcmFja2V0ICovOlxuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDMgLyogT3BlbkJyYWNrZXRUb2tlbiAqLztcbiAgICAgICAgICAgIGNhc2UgOTMgLyogY2xvc2VCcmFja2V0ICovOlxuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDQgLyogQ2xvc2VCcmFja2V0VG9rZW4gKi87XG4gICAgICAgICAgICBjYXNlIDU4IC8qIGNvbG9uICovOlxuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDYgLyogQ29sb25Ub2tlbiAqLztcbiAgICAgICAgICAgIGNhc2UgNDQgLyogY29tbWEgKi86XG4gICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuID0gNSAvKiBDb21tYVRva2VuICovO1xuICAgICAgICAgICAgLy8gc3RyaW5nc1xuICAgICAgICAgICAgY2FzZSAzNCAvKiBkb3VibGVRdW90ZSAqLzpcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHNjYW5TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW4gPSAxMCAvKiBTdHJpbmdMaXRlcmFsICovO1xuICAgICAgICAgICAgLy8gY29tbWVudHNcbiAgICAgICAgICAgIGNhc2UgNDcgLyogc2xhc2ggKi86XG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0ID0gcG9zIC0gMTtcbiAgICAgICAgICAgICAgICAvLyBTaW5nbGUtbGluZSBjb21tZW50XG4gICAgICAgICAgICAgICAgaWYgKHRleHQuY2hhckNvZGVBdChwb3MgKyAxKSA9PT0gNDcgLyogc2xhc2ggKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zICs9IDI7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChwb3MgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0xpbmVCcmVhayh0ZXh0LmNoYXJDb2RlQXQocG9zKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDEyIC8qIExpbmVDb21tZW50VHJpdmlhICovO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBNdWx0aS1saW5lIGNvbW1lbnRcbiAgICAgICAgICAgICAgICBpZiAodGV4dC5jaGFyQ29kZUF0KHBvcyArIDEpID09PSA0MiAvKiBhc3RlcmlzayAqLykge1xuICAgICAgICAgICAgICAgICAgICBwb3MgKz0gMjtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbW1lbnRDbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKHBvcyA8IGxlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNoID0gdGV4dC5jaGFyQ29kZUF0KHBvcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT09IDQyIC8qIGFzdGVyaXNrICovICYmIChwb3MgKyAxIDwgbGVuKSAmJiB0ZXh0LmNoYXJDb2RlQXQocG9zICsgMSkgPT09IDQ3IC8qIHNsYXNoICovKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zICs9IDI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbWVudENsb3NlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbW1lbnRDbG9zZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbkVycm9yID0gMSAvKiBVbmV4cGVjdGVkRW5kT2ZDb21tZW50ICovO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDEzIC8qIEJsb2NrQ29tbWVudFRyaXZpYSAqLztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8ganVzdCBhIHNpbmdsZSBzbGFzaFxuICAgICAgICAgICAgICAgIHZhbHVlICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG4gICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuID0gMTYgLyogVW5rbm93biAqLztcbiAgICAgICAgICAgIC8vIG51bWJlcnNcbiAgICAgICAgICAgIGNhc2UgNDUgLyogbWludXMgKi86XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjb2RlKTtcbiAgICAgICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICAgICAgICBpZiAocG9zID09PSBsZW4gfHwgIWlzRGlnaXQodGV4dC5jaGFyQ29kZUF0KHBvcykpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDE2IC8qIFVua25vd24gKi87XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZm91bmQgYSBtaW51cywgZm9sbG93ZWQgYnkgYSBudW1iZXIgc29cbiAgICAgICAgICAgIC8vIHdlIGZhbGwgdGhyb3VnaCB0byBwcm9jZWVkIHdpdGggc2Nhbm5pbmdcbiAgICAgICAgICAgIC8vIG51bWJlcnNcbiAgICAgICAgICAgIGNhc2UgNDggLyogXzAgKi86XG4gICAgICAgICAgICBjYXNlIDQ5IC8qIF8xICovOlxuICAgICAgICAgICAgY2FzZSA1MCAvKiBfMiAqLzpcbiAgICAgICAgICAgIGNhc2UgNTEgLyogXzMgKi86XG4gICAgICAgICAgICBjYXNlIDUyIC8qIF80ICovOlxuICAgICAgICAgICAgY2FzZSA1MyAvKiBfNSAqLzpcbiAgICAgICAgICAgIGNhc2UgNTQgLyogXzYgKi86XG4gICAgICAgICAgICBjYXNlIDU1IC8qIF83ICovOlxuICAgICAgICAgICAgY2FzZSA1NiAvKiBfOCAqLzpcbiAgICAgICAgICAgIGNhc2UgNTcgLyogXzkgKi86XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gc2Nhbk51bWJlcigpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDExIC8qIE51bWVyaWNMaXRlcmFsICovO1xuICAgICAgICAgICAgLy8gbGl0ZXJhbHMgYW5kIHVua25vd24gc3ltYm9sc1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBpcyBhIGxpdGVyYWw/IFJlYWQgdGhlIGZ1bGwgd29yZC5cbiAgICAgICAgICAgICAgICB3aGlsZSAocG9zIDwgbGVuICYmIGlzVW5rbm93bkNvbnRlbnRDaGFyYWN0ZXIoY29kZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zKys7XG4gICAgICAgICAgICAgICAgICAgIGNvZGUgPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRva2VuT2Zmc2V0ICE9PSBwb3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB0ZXh0LnN1YnN0cmluZyh0b2tlbk9mZnNldCwgcG9zKTtcbiAgICAgICAgICAgICAgICAgICAgLy8ga2V5d29yZHM6IHRydWUsIGZhbHNlLCBudWxsXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3RydWUnOiByZXR1cm4gdG9rZW4gPSA4IC8qIFRydWVLZXl3b3JkICovO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmFsc2UnOiByZXR1cm4gdG9rZW4gPSA5IC8qIEZhbHNlS2V5d29yZCAqLztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ251bGwnOiByZXR1cm4gdG9rZW4gPSA3IC8qIE51bGxLZXl3b3JkICovO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDE2IC8qIFVua25vd24gKi87XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHNvbWVcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuICAgICAgICAgICAgICAgIHBvcysrO1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA9IDE2IC8qIFVua25vd24gKi87XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gaXNVbmtub3duQ29udGVudENoYXJhY3Rlcihjb2RlKSB7XG4gICAgICAgIGlmIChpc1doaXRlU3BhY2UoY29kZSkgfHwgaXNMaW5lQnJlYWsoY29kZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgMTI1IC8qIGNsb3NlQnJhY2UgKi86XG4gICAgICAgICAgICBjYXNlIDkzIC8qIGNsb3NlQnJhY2tldCAqLzpcbiAgICAgICAgICAgIGNhc2UgMTIzIC8qIG9wZW5CcmFjZSAqLzpcbiAgICAgICAgICAgIGNhc2UgOTEgLyogb3BlbkJyYWNrZXQgKi86XG4gICAgICAgICAgICBjYXNlIDM0IC8qIGRvdWJsZVF1b3RlICovOlxuICAgICAgICAgICAgY2FzZSA1OCAvKiBjb2xvbiAqLzpcbiAgICAgICAgICAgIGNhc2UgNDQgLyogY29tbWEgKi86XG4gICAgICAgICAgICBjYXNlIDQ3IC8qIHNsYXNoICovOlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc2Nhbk5leHROb25Ucml2aWEoKSB7XG4gICAgICAgIHZhciByZXN1bHQ7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHNjYW5OZXh0KCk7XG4gICAgICAgIH0gd2hpbGUgKHJlc3VsdCA+PSAxMiAvKiBMaW5lQ29tbWVudFRyaXZpYSAqLyAmJiByZXN1bHQgPD0gMTUgLyogVHJpdmlhICovKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2V0UG9zaXRpb246IHNldFBvc2l0aW9uLFxuICAgICAgICBnZXRQb3NpdGlvbjogZnVuY3Rpb24gKCkgeyByZXR1cm4gcG9zOyB9LFxuICAgICAgICBzY2FuOiBpZ25vcmVUcml2aWEgPyBzY2FuTmV4dE5vblRyaXZpYSA6IHNjYW5OZXh0LFxuICAgICAgICBnZXRUb2tlbjogZnVuY3Rpb24gKCkgeyByZXR1cm4gdG9rZW47IH0sXG4gICAgICAgIGdldFRva2VuVmFsdWU6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHZhbHVlOyB9LFxuICAgICAgICBnZXRUb2tlbk9mZnNldDogZnVuY3Rpb24gKCkgeyByZXR1cm4gdG9rZW5PZmZzZXQ7IH0sXG4gICAgICAgIGdldFRva2VuTGVuZ3RoOiBmdW5jdGlvbiAoKSB7IHJldHVybiBwb3MgLSB0b2tlbk9mZnNldDsgfSxcbiAgICAgICAgZ2V0VG9rZW5FcnJvcjogZnVuY3Rpb24gKCkgeyByZXR1cm4gc2NhbkVycm9yOyB9XG4gICAgfTtcbn1cbmZ1bmN0aW9uIGlzV2hpdGVTcGFjZShjaCkge1xuICAgIHJldHVybiBjaCA9PT0gMzIgLyogc3BhY2UgKi8gfHwgY2ggPT09IDkgLyogdGFiICovIHx8IGNoID09PSAxMSAvKiB2ZXJ0aWNhbFRhYiAqLyB8fCBjaCA9PT0gMTIgLyogZm9ybUZlZWQgKi8gfHxcbiAgICAgICAgY2ggPT09IDE2MCAvKiBub25CcmVha2luZ1NwYWNlICovIHx8IGNoID09PSA1NzYwIC8qIG9naGFtICovIHx8IGNoID49IDgxOTIgLyogZW5RdWFkICovICYmIGNoIDw9IDgyMDMgLyogemVyb1dpZHRoU3BhY2UgKi8gfHxcbiAgICAgICAgY2ggPT09IDgyMzkgLyogbmFycm93Tm9CcmVha1NwYWNlICovIHx8IGNoID09PSA4Mjg3IC8qIG1hdGhlbWF0aWNhbFNwYWNlICovIHx8IGNoID09PSAxMjI4OCAvKiBpZGVvZ3JhcGhpY1NwYWNlICovIHx8IGNoID09PSA2NTI3OSAvKiBieXRlT3JkZXJNYXJrICovO1xufVxuZnVuY3Rpb24gaXNMaW5lQnJlYWsoY2gpIHtcbiAgICByZXR1cm4gY2ggPT09IDEwIC8qIGxpbmVGZWVkICovIHx8IGNoID09PSAxMyAvKiBjYXJyaWFnZVJldHVybiAqLyB8fCBjaCA9PT0gODIzMiAvKiBsaW5lU2VwYXJhdG9yICovIHx8IGNoID09PSA4MjMzIC8qIHBhcmFncmFwaFNlcGFyYXRvciAqLztcbn1cbmZ1bmN0aW9uIGlzRGlnaXQoY2gpIHtcbiAgICByZXR1cm4gY2ggPj0gNDggLyogXzAgKi8gJiYgY2ggPD0gNTcgLyogXzkgKi87XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1zY2FubmVyLmpzLm1hcCIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuJ3VzZSBzdHJpY3QnO1xuaW1wb3J0ICogYXMgZm9ybWF0dGVyIGZyb20gJy4vaW1wbC9mb3JtYXQuanMnO1xuaW1wb3J0ICogYXMgZWRpdCBmcm9tICcuL2ltcGwvZWRpdC5qcyc7XG5pbXBvcnQgKiBhcyBzY2FubmVyIGZyb20gJy4vaW1wbC9zY2FubmVyLmpzJztcbmltcG9ydCAqIGFzIHBhcnNlciBmcm9tICcuL2ltcGwvcGFyc2VyLmpzJztcbi8qKlxuICogQ3JlYXRlcyBhIEpTT04gc2Nhbm5lciBvbiB0aGUgZ2l2ZW4gdGV4dC5cbiAqIElmIGlnbm9yZVRyaXZpYSBpcyBzZXQsIHdoaXRlc3BhY2VzIG9yIGNvbW1lbnRzIGFyZSBpZ25vcmVkLlxuICovXG5leHBvcnQgdmFyIGNyZWF0ZVNjYW5uZXIgPSBzY2FubmVyLmNyZWF0ZVNjYW5uZXI7XG4vKipcbiAqIEZvciBhIGdpdmVuIG9mZnNldCwgZXZhbHVhdGUgdGhlIGxvY2F0aW9uIGluIHRoZSBKU09OIGRvY3VtZW50LiBFYWNoIHNlZ21lbnQgaW4gdGhlIGxvY2F0aW9uIHBhdGggaXMgZWl0aGVyIGEgcHJvcGVydHkgbmFtZSBvciBhbiBhcnJheSBpbmRleC5cbiAqL1xuZXhwb3J0IHZhciBnZXRMb2NhdGlvbiA9IHBhcnNlci5nZXRMb2NhdGlvbjtcbi8qKlxuICogUGFyc2VzIHRoZSBnaXZlbiB0ZXh0IGFuZCByZXR1cm5zIHRoZSBvYmplY3QgdGhlIEpTT04gY29udGVudCByZXByZXNlbnRzLiBPbiBpbnZhbGlkIGlucHV0LCB0aGUgcGFyc2VyIHRyaWVzIHRvIGJlIGFzIGZhdWx0IHRvbGVyYW50IGFzIHBvc3NpYmxlLCBidXQgc3RpbGwgcmV0dXJuIGEgcmVzdWx0LlxuICogVGhlcmVmb3JlIGFsd2F5cyBjaGVjayB0aGUgZXJyb3JzIGxpc3QgdG8gZmluZCBvdXQgaWYgdGhlIGlucHV0IHdhcyB2YWxpZC5cbiAqL1xuZXhwb3J0IHZhciBwYXJzZSA9IHBhcnNlci5wYXJzZTtcbi8qKlxuICogUGFyc2VzIHRoZSBnaXZlbiB0ZXh0IGFuZCByZXR1cm5zIGEgdHJlZSByZXByZXNlbnRhdGlvbiB0aGUgSlNPTiBjb250ZW50LiBPbiBpbnZhbGlkIGlucHV0LCB0aGUgcGFyc2VyIHRyaWVzIHRvIGJlIGFzIGZhdWx0IHRvbGVyYW50IGFzIHBvc3NpYmxlLCBidXQgc3RpbGwgcmV0dXJuIGEgcmVzdWx0LlxuICovXG5leHBvcnQgdmFyIHBhcnNlVHJlZSA9IHBhcnNlci5wYXJzZVRyZWU7XG4vKipcbiAqIEZpbmRzIHRoZSBub2RlIGF0IHRoZSBnaXZlbiBwYXRoIGluIGEgSlNPTiBET00uXG4gKi9cbmV4cG9ydCB2YXIgZmluZE5vZGVBdExvY2F0aW9uID0gcGFyc2VyLmZpbmROb2RlQXRMb2NhdGlvbjtcbi8qKlxuICogRmluZHMgdGhlIG1vc3QgaW5uZXIgbm9kZSBhdCB0aGUgZ2l2ZW4gb2Zmc2V0LiBJZiBpbmNsdWRlUmlnaHRCb3VuZCBpcyBzZXQsIGFsc28gZmluZHMgbm9kZXMgdGhhdCBlbmQgYXQgdGhlIGdpdmVuIG9mZnNldC5cbiAqL1xuZXhwb3J0IHZhciBmaW5kTm9kZUF0T2Zmc2V0ID0gcGFyc2VyLmZpbmROb2RlQXRPZmZzZXQ7XG4vKipcbiAqIEdldHMgdGhlIEpTT04gcGF0aCBvZiB0aGUgZ2l2ZW4gSlNPTiBET00gbm9kZVxuICovXG5leHBvcnQgdmFyIGdldE5vZGVQYXRoID0gcGFyc2VyLmdldE5vZGVQYXRoO1xuLyoqXG4gKiBFdmFsdWF0ZXMgdGhlIEphdmFTY3JpcHQgb2JqZWN0IG9mIHRoZSBnaXZlbiBKU09OIERPTSBub2RlXG4gKi9cbmV4cG9ydCB2YXIgZ2V0Tm9kZVZhbHVlID0gcGFyc2VyLmdldE5vZGVWYWx1ZTtcbi8qKlxuICogUGFyc2VzIHRoZSBnaXZlbiB0ZXh0IGFuZCBpbnZva2VzIHRoZSB2aXNpdG9yIGZ1bmN0aW9ucyBmb3IgZWFjaCBvYmplY3QsIGFycmF5IGFuZCBsaXRlcmFsIHJlYWNoZWQuXG4gKi9cbmV4cG9ydCB2YXIgdmlzaXQgPSBwYXJzZXIudmlzaXQ7XG4vKipcbiAqIFRha2VzIEpTT04gd2l0aCBKYXZhU2NyaXB0LXN0eWxlIGNvbW1lbnRzIGFuZCByZW1vdmVcbiAqIHRoZW0uIE9wdGlvbmFsbHkgcmVwbGFjZXMgZXZlcnkgbm9uZS1uZXdsaW5lIGNoYXJhY3RlclxuICogb2YgY29tbWVudHMgd2l0aCBhIHJlcGxhY2VDaGFyYWN0ZXJcbiAqL1xuZXhwb3J0IHZhciBzdHJpcENvbW1lbnRzID0gcGFyc2VyLnN0cmlwQ29tbWVudHM7XG4vKipcbiAqIENvbXB1dGVzIHRoZSBlZGl0cyBuZWVkZWQgdG8gZm9ybWF0IGEgSlNPTiBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0gZG9jdW1lbnRUZXh0IFRoZSBpbnB1dCB0ZXh0XG4gKiBAcGFyYW0gcmFuZ2UgVGhlIHJhbmdlIHRvIGZvcm1hdCBvciBgdW5kZWZpbmVkYCB0byBmb3JtYXQgdGhlIGZ1bGwgY29udGVudFxuICogQHBhcmFtIG9wdGlvbnMgVGhlIGZvcm1hdHRpbmcgb3B0aW9uc1xuICogQHJldHVybnMgQSBsaXN0IG9mIGVkaXQgb3BlcmF0aW9ucyBkZXNjcmliaW5nIHRoZSBmb3JtYXR0aW5nIGNoYW5nZXMgdG8gdGhlIG9yaWdpbmFsIGRvY3VtZW50LiBFZGl0cyBjYW4gYmUgZWl0aGVyIGluc2VydHMsIHJlcGxhY2VtZW50cyBvclxuICogcmVtb3ZhbHMgb2YgdGV4dCBzZWdtZW50cy4gQWxsIG9mZnNldHMgcmVmZXIgdG8gdGhlIG9yaWdpbmFsIHN0YXRlIG9mIHRoZSBkb2N1bWVudC4gTm8gdHdvIGVkaXRzIG11c3QgY2hhbmdlIG9yIHJlbW92ZSB0aGUgc2FtZSByYW5nZSBvZlxuICogdGV4dCBpbiB0aGUgb3JpZ2luYWwgZG9jdW1lbnQuIEhvd2V2ZXIsIG11bHRpcGxlIGVkaXRzIGNhbiBoYXZlXG4gKiB0aGUgc2FtZSBvZmZzZXQsIGZvciBleGFtcGxlIG11bHRpcGxlIGluc2VydHMsIG9yIGFuIGluc2VydCBmb2xsb3dlZCBieSBhIHJlbW92ZSBvciByZXBsYWNlLiBUaGUgb3JkZXIgaW4gdGhlIGFycmF5IGRlZmluZXMgd2hpY2ggZWRpdCBpcyBhcHBsaWVkIGZpcnN0LlxuICogVG8gYXBwbHkgZWRpdHMgdG8gYW4gaW5wdXQsIHlvdSBjYW4gdXNlIGBhcHBseUVkaXRzYFxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0KGRvY3VtZW50VGV4dCwgcmFuZ2UsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gZm9ybWF0dGVyLmZvcm1hdChkb2N1bWVudFRleHQsIHJhbmdlLCBvcHRpb25zKTtcbn1cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGVkaXRzIG5lZWRlZCB0byBtb2RpZnkgYSB2YWx1ZSBpbiB0aGUgSlNPTiBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0gZG9jdW1lbnRUZXh0IFRoZSBpbnB1dCB0ZXh0XG4gKiBAcGFyYW0gcGF0aCBUaGUgcGF0aCBvZiB0aGUgdmFsdWUgdG8gY2hhbmdlLiBUaGUgcGF0aCByZXByZXNlbnRzIGVpdGhlciB0byB0aGUgZG9jdW1lbnQgcm9vdCwgYSBwcm9wZXJ0eSBvciBhbiBhcnJheSBpdGVtLlxuICogSWYgdGhlIHBhdGggcG9pbnRzIHRvIGFuIG5vbi1leGlzdGluZyBwcm9wZXJ0eSBvciBpdGVtLCBpdCB3aWxsIGJlIGNyZWF0ZWQuXG4gKiBAcGFyYW0gdmFsdWUgVGhlIG5ldyB2YWx1ZSBmb3IgdGhlIHNwZWNpZmllZCBwcm9wZXJ0eSBvciBpdGVtLiBJZiB0aGUgdmFsdWUgaXMgdW5kZWZpbmVkLFxuICogdGhlIHByb3BlcnR5IG9yIGl0ZW0gd2lsbCBiZSByZW1vdmVkLlxuICogQHBhcmFtIG9wdGlvbnMgT3B0aW9uc1xuICogQHJldHVybnMgQSBsaXN0IG9mIGVkaXQgb3BlcmF0aW9ucyBkZXNjcmliaW5nIHRoZSBmb3JtYXR0aW5nIGNoYW5nZXMgdG8gdGhlIG9yaWdpbmFsIGRvY3VtZW50LiBFZGl0cyBjYW4gYmUgZWl0aGVyIGluc2VydHMsIHJlcGxhY2VtZW50cyBvclxuICogcmVtb3ZhbHMgb2YgdGV4dCBzZWdtZW50cy4gQWxsIG9mZnNldHMgcmVmZXIgdG8gdGhlIG9yaWdpbmFsIHN0YXRlIG9mIHRoZSBkb2N1bWVudC4gTm8gdHdvIGVkaXRzIG11c3QgY2hhbmdlIG9yIHJlbW92ZSB0aGUgc2FtZSByYW5nZSBvZlxuICogdGV4dCBpbiB0aGUgb3JpZ2luYWwgZG9jdW1lbnQuIEhvd2V2ZXIsIG11bHRpcGxlIGVkaXRzIGNhbiBoYXZlXG4gKiB0aGUgc2FtZSBvZmZzZXQsIGZvciBleGFtcGxlIG11bHRpcGxlIGluc2VydHMsIG9yIGFuIGluc2VydCBmb2xsb3dlZCBieSBhIHJlbW92ZSBvciByZXBsYWNlLiBUaGUgb3JkZXIgaW4gdGhlIGFycmF5IGRlZmluZXMgd2hpY2ggZWRpdCBpcyBhcHBsaWVkIGZpcnN0LlxuICogVG8gYXBwbHkgZWRpdHMgdG8gYW4gaW5wdXQsIHlvdSBjYW4gdXNlIGBhcHBseUVkaXRzYFxuICovXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5KHRleHQsIHBhdGgsIHZhbHVlLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIGVkaXQuc2V0UHJvcGVydHkodGV4dCwgcGF0aCwgdmFsdWUsIG9wdGlvbnMuZm9ybWF0dGluZ09wdGlvbnMsIG9wdGlvbnMuZ2V0SW5zZXJ0aW9uSW5kZXgpO1xufVxuLyoqXG4gKiBBcHBsaWVzIGVkaXRzIHRvIGEgaW5wdXQgc3RyaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlFZGl0cyh0ZXh0LCBlZGl0cykge1xuICAgIGZvciAodmFyIGkgPSBlZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICB0ZXh0ID0gZWRpdC5hcHBseUVkaXQodGV4dCwgZWRpdHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gdGV4dDtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPW1haW4uanMubWFwIiwiLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuJ3VzZSBzdHJpY3QnO1xuLyoqXG4gKiBUaGUgUG9zaXRpb24gbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbUG9zaXRpb25dKCNQb3NpdGlvbikgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgUG9zaXRpb247XG4oZnVuY3Rpb24gKFBvc2l0aW9uKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBQb3NpdGlvbiBsaXRlcmFsIGZyb20gdGhlIGdpdmVuIGxpbmUgYW5kIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0gbGluZSBUaGUgcG9zaXRpb24ncyBsaW5lLlxuICAgICAqIEBwYXJhbSBjaGFyYWN0ZXIgVGhlIHBvc2l0aW9uJ3MgY2hhcmFjdGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShsaW5lLCBjaGFyYWN0ZXIpIHtcbiAgICAgICAgcmV0dXJuIHsgbGluZTogbGluZSwgY2hhcmFjdGVyOiBjaGFyYWN0ZXIgfTtcbiAgICB9XG4gICAgUG9zaXRpb24uY3JlYXRlID0gY3JlYXRlO1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBsaXRlcm5hbCBjb25mb3JtcyB0byB0aGUgW1Bvc2l0aW9uXSgjUG9zaXRpb24pIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5vYmplY3RMaXRlcmFsKGNhbmRpZGF0ZSkgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS5saW5lKSAmJiBJcy5udW1iZXIoY2FuZGlkYXRlLmNoYXJhY3Rlcik7XG4gICAgfVxuICAgIFBvc2l0aW9uLmlzID0gaXM7XG59KShQb3NpdGlvbiB8fCAoUG9zaXRpb24gPSB7fSkpO1xuLyoqXG4gKiBUaGUgUmFuZ2UgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbUmFuZ2VdKCNSYW5nZSkgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgUmFuZ2U7XG4oZnVuY3Rpb24gKFJhbmdlKSB7XG4gICAgZnVuY3Rpb24gY3JlYXRlKG9uZSwgdHdvLCB0aHJlZSwgZm91cikge1xuICAgICAgICBpZiAoSXMubnVtYmVyKG9uZSkgJiYgSXMubnVtYmVyKHR3bykgJiYgSXMubnVtYmVyKHRocmVlKSAmJiBJcy5udW1iZXIoZm91cikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0OiBQb3NpdGlvbi5jcmVhdGUob25lLCB0d28pLCBlbmQ6IFBvc2l0aW9uLmNyZWF0ZSh0aHJlZSwgZm91cikgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChQb3NpdGlvbi5pcyhvbmUpICYmIFBvc2l0aW9uLmlzKHR3bykpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0OiBvbmUsIGVuZDogdHdvIH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSYW5nZSNjcmVhdGUgY2FsbGVkIHdpdGggaW52YWxpZCBhcmd1bWVudHNbXCIgKyBvbmUgKyBcIiwgXCIgKyB0d28gKyBcIiwgXCIgKyB0aHJlZSArIFwiLCBcIiArIGZvdXIgKyBcIl1cIik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgUmFuZ2UuY3JlYXRlID0gY3JlYXRlO1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBsaXRlcmFsIGNvbmZvcm1zIHRvIHRoZSBbUmFuZ2VdKCNSYW5nZSkgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLm9iamVjdExpdGVyYWwoY2FuZGlkYXRlKSAmJiBQb3NpdGlvbi5pcyhjYW5kaWRhdGUuc3RhcnQpICYmIFBvc2l0aW9uLmlzKGNhbmRpZGF0ZS5lbmQpO1xuICAgIH1cbiAgICBSYW5nZS5pcyA9IGlzO1xufSkoUmFuZ2UgfHwgKFJhbmdlID0ge30pKTtcbi8qKlxuICogVGhlIExvY2F0aW9uIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW0xvY2F0aW9uXSgjTG9jYXRpb24pIGxpdGVyYWxzLlxuICovXG5leHBvcnQgdmFyIExvY2F0aW9uO1xuKGZ1bmN0aW9uIChMb2NhdGlvbikge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBMb2NhdGlvbiBsaXRlcmFsLlxuICAgICAqIEBwYXJhbSB1cmkgVGhlIGxvY2F0aW9uJ3MgdXJpLlxuICAgICAqIEBwYXJhbSByYW5nZSBUaGUgbG9jYXRpb24ncyByYW5nZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUodXJpLCByYW5nZSkge1xuICAgICAgICByZXR1cm4geyB1cmk6IHVyaSwgcmFuZ2U6IHJhbmdlIH07XG4gICAgfVxuICAgIExvY2F0aW9uLmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gbGl0ZXJhbCBjb25mb3JtcyB0byB0aGUgW0xvY2F0aW9uXSgjTG9jYXRpb24pIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSkgJiYgUmFuZ2UuaXMoY2FuZGlkYXRlLnJhbmdlKSAmJiAoSXMuc3RyaW5nKGNhbmRpZGF0ZS51cmkpIHx8IElzLnVuZGVmaW5lZChjYW5kaWRhdGUudXJpKSk7XG4gICAgfVxuICAgIExvY2F0aW9uLmlzID0gaXM7XG59KShMb2NhdGlvbiB8fCAoTG9jYXRpb24gPSB7fSkpO1xuLyoqXG4gKiBUaGUgQ29sb3IgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbQ29sb3JdKCNDb2xvcikgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgQ29sb3I7XG4oZnVuY3Rpb24gKENvbG9yKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBDb2xvciBsaXRlcmFsLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShyZWQsIGdyZWVuLCBibHVlLCBhbHBoYSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVkOiByZWQsXG4gICAgICAgICAgICBncmVlbjogZ3JlZW4sXG4gICAgICAgICAgICBibHVlOiBibHVlLFxuICAgICAgICAgICAgYWxwaGE6IGFscGhhLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBDb2xvci5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtDb2xvcl0oI0NvbG9yKSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMubnVtYmVyKGNhbmRpZGF0ZS5yZWQpXG4gICAgICAgICAgICAmJiBJcy5udW1iZXIoY2FuZGlkYXRlLmdyZWVuKVxuICAgICAgICAgICAgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS5ibHVlKVxuICAgICAgICAgICAgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS5hbHBoYSk7XG4gICAgfVxuICAgIENvbG9yLmlzID0gaXM7XG59KShDb2xvciB8fCAoQ29sb3IgPSB7fSkpO1xuLyoqXG4gKiBUaGUgQ29sb3JJbmZvcm1hdGlvbiBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtDb2xvckluZm9ybWF0aW9uXSgjQ29sb3JJbmZvcm1hdGlvbikgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgQ29sb3JJbmZvcm1hdGlvbjtcbihmdW5jdGlvbiAoQ29sb3JJbmZvcm1hdGlvbikge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgQ29sb3JJbmZvcm1hdGlvbiBsaXRlcmFsLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShyYW5nZSwgY29sb3IpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvcixcbiAgICAgICAgfTtcbiAgICB9XG4gICAgQ29sb3JJbmZvcm1hdGlvbi5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtDb2xvckluZm9ybWF0aW9uXSgjQ29sb3JJbmZvcm1hdGlvbikgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIFJhbmdlLmlzKGNhbmRpZGF0ZS5yYW5nZSkgJiYgQ29sb3IuaXMoY2FuZGlkYXRlLmNvbG9yKTtcbiAgICB9XG4gICAgQ29sb3JJbmZvcm1hdGlvbi5pcyA9IGlzO1xufSkoQ29sb3JJbmZvcm1hdGlvbiB8fCAoQ29sb3JJbmZvcm1hdGlvbiA9IHt9KSk7XG4vKipcbiAqIFRoZSBDb2xvciBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtDb2xvclByZXNlbnRhdGlvbl0oI0NvbG9yUHJlc2VudGF0aW9uKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBDb2xvclByZXNlbnRhdGlvbjtcbihmdW5jdGlvbiAoQ29sb3JQcmVzZW50YXRpb24pIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IENvbG9ySW5mb3JtYXRpb24gbGl0ZXJhbC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUobGFiZWwsIHRleHRFZGl0LCBhZGRpdGlvbmFsVGV4dEVkaXRzKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBsYWJlbDogbGFiZWwsXG4gICAgICAgICAgICB0ZXh0RWRpdDogdGV4dEVkaXQsXG4gICAgICAgICAgICBhZGRpdGlvbmFsVGV4dEVkaXRzOiBhZGRpdGlvbmFsVGV4dEVkaXRzLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBDb2xvclByZXNlbnRhdGlvbi5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtDb2xvckluZm9ybWF0aW9uXSgjQ29sb3JJbmZvcm1hdGlvbikgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLnN0cmluZyhjYW5kaWRhdGUubGFiZWwpXG4gICAgICAgICAgICAmJiAoSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS50ZXh0RWRpdCkgfHwgVGV4dEVkaXQuaXMoY2FuZGlkYXRlKSlcbiAgICAgICAgICAgICYmIChJcy51bmRlZmluZWQoY2FuZGlkYXRlLmFkZGl0aW9uYWxUZXh0RWRpdHMpIHx8IElzLnR5cGVkQXJyYXkoY2FuZGlkYXRlLmFkZGl0aW9uYWxUZXh0RWRpdHMsIFRleHRFZGl0LmlzKSk7XG4gICAgfVxuICAgIENvbG9yUHJlc2VudGF0aW9uLmlzID0gaXM7XG59KShDb2xvclByZXNlbnRhdGlvbiB8fCAoQ29sb3JQcmVzZW50YXRpb24gPSB7fSkpO1xuLyoqXG4gKiBFbnVtIG9mIGtub3duIHJhbmdlIGtpbmRzXG4gKi9cbmV4cG9ydCB2YXIgRm9sZGluZ1JhbmdlS2luZDtcbihmdW5jdGlvbiAoRm9sZGluZ1JhbmdlS2luZCkge1xuICAgIC8qKlxuICAgICAqIEZvbGRpbmcgcmFuZ2UgZm9yIGEgY29tbWVudFxuICAgICAqL1xuICAgIEZvbGRpbmdSYW5nZUtpbmRbXCJDb21tZW50XCJdID0gXCJjb21tZW50XCI7XG4gICAgLyoqXG4gICAgICogRm9sZGluZyByYW5nZSBmb3IgYSBpbXBvcnRzIG9yIGluY2x1ZGVzXG4gICAgICovXG4gICAgRm9sZGluZ1JhbmdlS2luZFtcIkltcG9ydHNcIl0gPSBcImltcG9ydHNcIjtcbiAgICAvKipcbiAgICAgKiBGb2xkaW5nIHJhbmdlIGZvciBhIHJlZ2lvbiAoZS5nLiBgI3JlZ2lvbmApXG4gICAgICovXG4gICAgRm9sZGluZ1JhbmdlS2luZFtcIlJlZ2lvblwiXSA9IFwicmVnaW9uXCI7XG59KShGb2xkaW5nUmFuZ2VLaW5kIHx8IChGb2xkaW5nUmFuZ2VLaW5kID0ge30pKTtcbi8qKlxuICogVGhlIGZvbGRpbmcgcmFuZ2UgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbRm9sZGluZ1JhbmdlXSgjRm9sZGluZ1JhbmdlKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBGb2xkaW5nUmFuZ2U7XG4oZnVuY3Rpb24gKEZvbGRpbmdSYW5nZSkge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgRm9sZGluZ1JhbmdlIGxpdGVyYWwuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKHN0YXJ0TGluZSwgZW5kTGluZSwgc3RhcnRDaGFyYWN0ZXIsIGVuZENoYXJhY3Rlciwga2luZCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgICAgc3RhcnRMaW5lOiBzdGFydExpbmUsXG4gICAgICAgICAgICBlbmRMaW5lOiBlbmRMaW5lXG4gICAgICAgIH07XG4gICAgICAgIGlmIChJcy5kZWZpbmVkKHN0YXJ0Q2hhcmFjdGVyKSkge1xuICAgICAgICAgICAgcmVzdWx0LnN0YXJ0Q2hhcmFjdGVyID0gc3RhcnRDaGFyYWN0ZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKElzLmRlZmluZWQoZW5kQ2hhcmFjdGVyKSkge1xuICAgICAgICAgICAgcmVzdWx0LmVuZENoYXJhY3RlciA9IGVuZENoYXJhY3RlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoSXMuZGVmaW5lZChraW5kKSkge1xuICAgICAgICAgICAgcmVzdWx0LmtpbmQgPSBraW5kO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIEZvbGRpbmdSYW5nZS5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtGb2xkaW5nUmFuZ2VdKCNGb2xkaW5nUmFuZ2UpIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5udW1iZXIoY2FuZGlkYXRlLnN0YXJ0TGluZSkgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS5zdGFydExpbmUpXG4gICAgICAgICAgICAmJiAoSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS5zdGFydENoYXJhY3RlcikgfHwgSXMubnVtYmVyKGNhbmRpZGF0ZS5zdGFydENoYXJhY3RlcikpXG4gICAgICAgICAgICAmJiAoSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS5lbmRDaGFyYWN0ZXIpIHx8IElzLm51bWJlcihjYW5kaWRhdGUuZW5kQ2hhcmFjdGVyKSlcbiAgICAgICAgICAgICYmIChJcy51bmRlZmluZWQoY2FuZGlkYXRlLmtpbmQpIHx8IElzLnN0cmluZyhjYW5kaWRhdGUua2luZCkpO1xuICAgIH1cbiAgICBGb2xkaW5nUmFuZ2UuaXMgPSBpcztcbn0pKEZvbGRpbmdSYW5nZSB8fCAoRm9sZGluZ1JhbmdlID0ge30pKTtcbi8qKlxuICogVGhlIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24gbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbl0oI0RpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24pIGxpdGVyYWxzLlxuICovXG5leHBvcnQgdmFyIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb247XG4oZnVuY3Rpb24gKERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24pIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24gbGl0ZXJhbC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUobG9jYXRpb24sIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGxvY2F0aW9uOiBsb2NhdGlvbixcbiAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VcbiAgICAgICAgfTtcbiAgICB9XG4gICAgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbi5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uXSgjRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbikgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLmRlZmluZWQoY2FuZGlkYXRlKSAmJiBMb2NhdGlvbi5pcyhjYW5kaWRhdGUubG9jYXRpb24pICYmIElzLnN0cmluZyhjYW5kaWRhdGUubWVzc2FnZSk7XG4gICAgfVxuICAgIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24uaXMgPSBpcztcbn0pKERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24gfHwgKERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24gPSB7fSkpO1xuLyoqXG4gKiBUaGUgZGlhZ25vc3RpYydzIHNldmVyaXR5LlxuICovXG5leHBvcnQgdmFyIERpYWdub3N0aWNTZXZlcml0eTtcbihmdW5jdGlvbiAoRGlhZ25vc3RpY1NldmVyaXR5KSB7XG4gICAgLyoqXG4gICAgICogUmVwb3J0cyBhbiBlcnJvci5cbiAgICAgKi9cbiAgICBEaWFnbm9zdGljU2V2ZXJpdHkuRXJyb3IgPSAxO1xuICAgIC8qKlxuICAgICAqIFJlcG9ydHMgYSB3YXJuaW5nLlxuICAgICAqL1xuICAgIERpYWdub3N0aWNTZXZlcml0eS5XYXJuaW5nID0gMjtcbiAgICAvKipcbiAgICAgKiBSZXBvcnRzIGFuIGluZm9ybWF0aW9uLlxuICAgICAqL1xuICAgIERpYWdub3N0aWNTZXZlcml0eS5JbmZvcm1hdGlvbiA9IDM7XG4gICAgLyoqXG4gICAgICogUmVwb3J0cyBhIGhpbnQuXG4gICAgICovXG4gICAgRGlhZ25vc3RpY1NldmVyaXR5LkhpbnQgPSA0O1xufSkoRGlhZ25vc3RpY1NldmVyaXR5IHx8IChEaWFnbm9zdGljU2V2ZXJpdHkgPSB7fSkpO1xuLyoqXG4gKiBUaGUgRGlhZ25vc3RpYyBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtEaWFnbm9zdGljXSgjRGlhZ25vc3RpYykgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgRGlhZ25vc3RpYztcbihmdW5jdGlvbiAoRGlhZ25vc3RpYykge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgRGlhZ25vc3RpYyBsaXRlcmFsLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShyYW5nZSwgbWVzc2FnZSwgc2V2ZXJpdHksIGNvZGUsIHNvdXJjZSwgcmVsYXRlZEluZm9ybWF0aW9uKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSB7IHJhbmdlOiByYW5nZSwgbWVzc2FnZTogbWVzc2FnZSB9O1xuICAgICAgICBpZiAoSXMuZGVmaW5lZChzZXZlcml0eSkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5zZXZlcml0eSA9IHNldmVyaXR5O1xuICAgICAgICB9XG4gICAgICAgIGlmIChJcy5kZWZpbmVkKGNvZGUpKSB7XG4gICAgICAgICAgICByZXN1bHQuY29kZSA9IGNvZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKElzLmRlZmluZWQoc291cmNlKSkge1xuICAgICAgICAgICAgcmVzdWx0LnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoSXMuZGVmaW5lZChyZWxhdGVkSW5mb3JtYXRpb24pKSB7XG4gICAgICAgICAgICByZXN1bHQucmVsYXRlZEluZm9ybWF0aW9uID0gcmVsYXRlZEluZm9ybWF0aW9uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIERpYWdub3N0aWMuY3JlYXRlID0gY3JlYXRlO1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBsaXRlcmFsIGNvbmZvcm1zIHRvIHRoZSBbRGlhZ25vc3RpY10oI0RpYWdub3N0aWMpIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSlcbiAgICAgICAgICAgICYmIFJhbmdlLmlzKGNhbmRpZGF0ZS5yYW5nZSlcbiAgICAgICAgICAgICYmIElzLnN0cmluZyhjYW5kaWRhdGUubWVzc2FnZSlcbiAgICAgICAgICAgICYmIChJcy5udW1iZXIoY2FuZGlkYXRlLnNldmVyaXR5KSB8fCBJcy51bmRlZmluZWQoY2FuZGlkYXRlLnNldmVyaXR5KSlcbiAgICAgICAgICAgICYmIChJcy5udW1iZXIoY2FuZGlkYXRlLmNvZGUpIHx8IElzLnN0cmluZyhjYW5kaWRhdGUuY29kZSkgfHwgSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS5jb2RlKSlcbiAgICAgICAgICAgICYmIChJcy5zdHJpbmcoY2FuZGlkYXRlLnNvdXJjZSkgfHwgSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS5zb3VyY2UpKVxuICAgICAgICAgICAgJiYgKElzLnVuZGVmaW5lZChjYW5kaWRhdGUucmVsYXRlZEluZm9ybWF0aW9uKSB8fCBJcy50eXBlZEFycmF5KGNhbmRpZGF0ZS5yZWxhdGVkSW5mb3JtYXRpb24sIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24uaXMpKTtcbiAgICB9XG4gICAgRGlhZ25vc3RpYy5pcyA9IGlzO1xufSkoRGlhZ25vc3RpYyB8fCAoRGlhZ25vc3RpYyA9IHt9KSk7XG4vKipcbiAqIFRoZSBDb21tYW5kIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW0NvbW1hbmRdKCNDb21tYW5kKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBDb21tYW5kO1xuKGZ1bmN0aW9uIChDb21tYW5kKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBDb21tYW5kIGxpdGVyYWwuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKHRpdGxlLCBjb21tYW5kKSB7XG4gICAgICAgIHZhciBhcmdzID0gW107XG4gICAgICAgIGZvciAodmFyIF9pID0gMjsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICBhcmdzW19pIC0gMl0gPSBhcmd1bWVudHNbX2ldO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7IHRpdGxlOiB0aXRsZSwgY29tbWFuZDogY29tbWFuZCB9O1xuICAgICAgICBpZiAoSXMuZGVmaW5lZChhcmdzKSAmJiBhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHJlc3VsdC5hcmd1bWVudHMgPSBhcmdzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIENvbW1hbmQuY3JlYXRlID0gY3JlYXRlO1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBsaXRlcmFsIGNvbmZvcm1zIHRvIHRoZSBbQ29tbWFuZF0oI0NvbW1hbmQpIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSkgJiYgSXMuc3RyaW5nKGNhbmRpZGF0ZS50aXRsZSkgJiYgSXMuc3RyaW5nKGNhbmRpZGF0ZS5jb21tYW5kKTtcbiAgICB9XG4gICAgQ29tbWFuZC5pcyA9IGlzO1xufSkoQ29tbWFuZCB8fCAoQ29tbWFuZCA9IHt9KSk7XG4vKipcbiAqIFRoZSBUZXh0RWRpdCBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9uIHRvIGNyZWF0ZSByZXBsYWNlLFxuICogaW5zZXJ0IGFuZCBkZWxldGUgZWRpdHMgbW9yZSBlYXNpbHkuXG4gKi9cbmV4cG9ydCB2YXIgVGV4dEVkaXQ7XG4oZnVuY3Rpb24gKFRleHRFZGl0KSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHJlcGxhY2UgdGV4dCBlZGl0LlxuICAgICAqIEBwYXJhbSByYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB0byBiZSByZXBsYWNlZC5cbiAgICAgKiBAcGFyYW0gbmV3VGV4dCBUaGUgbmV3IHRleHQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gcmVwbGFjZShyYW5nZSwgbmV3VGV4dCkge1xuICAgICAgICByZXR1cm4geyByYW5nZTogcmFuZ2UsIG5ld1RleHQ6IG5ld1RleHQgfTtcbiAgICB9XG4gICAgVGV4dEVkaXQucmVwbGFjZSA9IHJlcGxhY2U7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIGluc2VydCB0ZXh0IGVkaXQuXG4gICAgICogQHBhcmFtIHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBpbnNlcnQgdGhlIHRleHQgYXQuXG4gICAgICogQHBhcmFtIG5ld1RleHQgVGhlIHRleHQgdG8gYmUgaW5zZXJ0ZWQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaW5zZXJ0KHBvc2l0aW9uLCBuZXdUZXh0KSB7XG4gICAgICAgIHJldHVybiB7IHJhbmdlOiB7IHN0YXJ0OiBwb3NpdGlvbiwgZW5kOiBwb3NpdGlvbiB9LCBuZXdUZXh0OiBuZXdUZXh0IH07XG4gICAgfVxuICAgIFRleHRFZGl0Lmluc2VydCA9IGluc2VydDtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgZGVsZXRlIHRleHQgZWRpdC5cbiAgICAgKiBAcGFyYW0gcmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgdG8gYmUgZGVsZXRlZC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBkZWwocmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHsgcmFuZ2U6IHJhbmdlLCBuZXdUZXh0OiAnJyB9O1xuICAgIH1cbiAgICBUZXh0RWRpdC5kZWwgPSBkZWw7XG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMub2JqZWN0TGl0ZXJhbChjYW5kaWRhdGUpXG4gICAgICAgICAgICAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLm5ld1RleHQpXG4gICAgICAgICAgICAmJiBSYW5nZS5pcyhjYW5kaWRhdGUucmFuZ2UpO1xuICAgIH1cbiAgICBUZXh0RWRpdC5pcyA9IGlzO1xufSkoVGV4dEVkaXQgfHwgKFRleHRFZGl0ID0ge30pKTtcbi8qKlxuICogVGhlIFRleHREb2N1bWVudEVkaXQgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbiB0byBjcmVhdGVcbiAqIGFuIGVkaXQgdGhhdCBtYW5pcHVsYXRlcyBhIHRleHQgZG9jdW1lbnQuXG4gKi9cbmV4cG9ydCB2YXIgVGV4dERvY3VtZW50RWRpdDtcbihmdW5jdGlvbiAoVGV4dERvY3VtZW50RWRpdCkge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgYFRleHREb2N1bWVudEVkaXRgXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKHRleHREb2N1bWVudCwgZWRpdHMpIHtcbiAgICAgICAgcmV0dXJuIHsgdGV4dERvY3VtZW50OiB0ZXh0RG9jdW1lbnQsIGVkaXRzOiBlZGl0cyB9O1xuICAgIH1cbiAgICBUZXh0RG9jdW1lbnRFZGl0LmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSlcbiAgICAgICAgICAgICYmIFZlcnNpb25lZFRleHREb2N1bWVudElkZW50aWZpZXIuaXMoY2FuZGlkYXRlLnRleHREb2N1bWVudClcbiAgICAgICAgICAgICYmIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLmVkaXRzKTtcbiAgICB9XG4gICAgVGV4dERvY3VtZW50RWRpdC5pcyA9IGlzO1xufSkoVGV4dERvY3VtZW50RWRpdCB8fCAoVGV4dERvY3VtZW50RWRpdCA9IHt9KSk7XG5leHBvcnQgdmFyIFdvcmtzcGFjZUVkaXQ7XG4oZnVuY3Rpb24gKFdvcmtzcGFjZUVkaXQpIHtcbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBjYW5kaWRhdGUgJiZcbiAgICAgICAgICAgIChjYW5kaWRhdGUuY2hhbmdlcyAhPT0gdm9pZCAwIHx8IGNhbmRpZGF0ZS5kb2N1bWVudENoYW5nZXMgIT09IHZvaWQgMCkgJiZcbiAgICAgICAgICAgIChjYW5kaWRhdGUuZG9jdW1lbnRDaGFuZ2VzID09PSB2b2lkIDAgfHwgSXMudHlwZWRBcnJheShjYW5kaWRhdGUuZG9jdW1lbnRDaGFuZ2VzLCBUZXh0RG9jdW1lbnRFZGl0LmlzKSk7XG4gICAgfVxuICAgIFdvcmtzcGFjZUVkaXQuaXMgPSBpcztcbn0pKFdvcmtzcGFjZUVkaXQgfHwgKFdvcmtzcGFjZUVkaXQgPSB7fSkpO1xudmFyIFRleHRFZGl0Q2hhbmdlSW1wbCA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBUZXh0RWRpdENoYW5nZUltcGwoZWRpdHMpIHtcbiAgICAgICAgdGhpcy5lZGl0cyA9IGVkaXRzO1xuICAgIH1cbiAgICBUZXh0RWRpdENoYW5nZUltcGwucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uIChwb3NpdGlvbiwgbmV3VGV4dCkge1xuICAgICAgICB0aGlzLmVkaXRzLnB1c2goVGV4dEVkaXQuaW5zZXJ0KHBvc2l0aW9uLCBuZXdUZXh0KSk7XG4gICAgfTtcbiAgICBUZXh0RWRpdENoYW5nZUltcGwucHJvdG90eXBlLnJlcGxhY2UgPSBmdW5jdGlvbiAocmFuZ2UsIG5ld1RleHQpIHtcbiAgICAgICAgdGhpcy5lZGl0cy5wdXNoKFRleHRFZGl0LnJlcGxhY2UocmFuZ2UsIG5ld1RleHQpKTtcbiAgICB9O1xuICAgIFRleHRFZGl0Q2hhbmdlSW1wbC5wcm90b3R5cGUuZGVsZXRlID0gZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgICAgIHRoaXMuZWRpdHMucHVzaChUZXh0RWRpdC5kZWwocmFuZ2UpKTtcbiAgICB9O1xuICAgIFRleHRFZGl0Q2hhbmdlSW1wbC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKGVkaXQpIHtcbiAgICAgICAgdGhpcy5lZGl0cy5wdXNoKGVkaXQpO1xuICAgIH07XG4gICAgVGV4dEVkaXRDaGFuZ2VJbXBsLnByb3RvdHlwZS5hbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmVkaXRzO1xuICAgIH07XG4gICAgVGV4dEVkaXRDaGFuZ2VJbXBsLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lZGl0cy5zcGxpY2UoMCwgdGhpcy5lZGl0cy5sZW5ndGgpO1xuICAgIH07XG4gICAgcmV0dXJuIFRleHRFZGl0Q2hhbmdlSW1wbDtcbn0oKSk7XG4vKipcbiAqIEEgd29ya3NwYWNlIGNoYW5nZSBoZWxwcyBjb25zdHJ1Y3RpbmcgY2hhbmdlcyB0byBhIHdvcmtzcGFjZS5cbiAqL1xudmFyIFdvcmtzcGFjZUNoYW5nZSA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBXb3Jrc3BhY2VDaGFuZ2Uod29ya3NwYWNlRWRpdCkge1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICB0aGlzLl90ZXh0RWRpdENoYW5nZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICBpZiAod29ya3NwYWNlRWRpdCkge1xuICAgICAgICAgICAgdGhpcy5fd29ya3NwYWNlRWRpdCA9IHdvcmtzcGFjZUVkaXQ7XG4gICAgICAgICAgICBpZiAod29ya3NwYWNlRWRpdC5kb2N1bWVudENoYW5nZXMpIHtcbiAgICAgICAgICAgICAgICB3b3Jrc3BhY2VFZGl0LmRvY3VtZW50Q2hhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uICh0ZXh0RG9jdW1lbnRFZGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ZXh0RWRpdENoYW5nZSA9IG5ldyBUZXh0RWRpdENoYW5nZUltcGwodGV4dERvY3VtZW50RWRpdC5lZGl0cyk7XG4gICAgICAgICAgICAgICAgICAgIF90aGlzLl90ZXh0RWRpdENoYW5nZXNbdGV4dERvY3VtZW50RWRpdC50ZXh0RG9jdW1lbnQudXJpXSA9IHRleHRFZGl0Q2hhbmdlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAod29ya3NwYWNlRWRpdC5jaGFuZ2VzKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXMod29ya3NwYWNlRWRpdC5jaGFuZ2VzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRleHRFZGl0Q2hhbmdlID0gbmV3IFRleHRFZGl0Q2hhbmdlSW1wbCh3b3Jrc3BhY2VFZGl0LmNoYW5nZXNba2V5XSk7XG4gICAgICAgICAgICAgICAgICAgIF90aGlzLl90ZXh0RWRpdENoYW5nZXNba2V5XSA9IHRleHRFZGl0Q2hhbmdlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShXb3Jrc3BhY2VDaGFuZ2UucHJvdG90eXBlLCBcImVkaXRcIiwge1xuICAgICAgICAvKipcbiAgICAgICAgICogUmV0dXJucyB0aGUgdW5kZXJseWluZyBbV29ya3NwYWNlRWRpdF0oI1dvcmtzcGFjZUVkaXQpIGxpdGVyYWxcbiAgICAgICAgICogdXNlIHRvIGJlIHJldHVybmVkIGZyb20gYSB3b3Jrc3BhY2UgZWRpdCBvcGVyYXRpb24gbGlrZSByZW5hbWUuXG4gICAgICAgICAqL1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl93b3Jrc3BhY2VFZGl0O1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBXb3Jrc3BhY2VDaGFuZ2UucHJvdG90eXBlLmdldFRleHRFZGl0Q2hhbmdlID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICBpZiAoVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllci5pcyhrZXkpKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3dvcmtzcGFjZUVkaXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl93b3Jrc3BhY2VFZGl0ID0ge1xuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudENoYW5nZXM6IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGhpcy5fd29ya3NwYWNlRWRpdC5kb2N1bWVudENoYW5nZXMpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZSBlZGl0IGlzIG5vdCBjb25maWd1cmVkIGZvciB2ZXJzaW9uZWQgZG9jdW1lbnQgY2hhbmdlcy4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciB0ZXh0RG9jdW1lbnQgPSBrZXk7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5fdGV4dEVkaXRDaGFuZ2VzW3RleHREb2N1bWVudC51cmldO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgZWRpdHMgPSBbXTtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dERvY3VtZW50RWRpdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dERvY3VtZW50OiB0ZXh0RG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgICAgIGVkaXRzOiBlZGl0c1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgdGhpcy5fd29ya3NwYWNlRWRpdC5kb2N1bWVudENoYW5nZXMucHVzaCh0ZXh0RG9jdW1lbnRFZGl0KTtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBuZXcgVGV4dEVkaXRDaGFuZ2VJbXBsKGVkaXRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0RWRpdENoYW5nZXNbdGV4dERvY3VtZW50LnVyaV0gPSByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKCF0aGlzLl93b3Jrc3BhY2VFZGl0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fd29ya3NwYWNlRWRpdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgY2hhbmdlczogT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3dvcmtzcGFjZUVkaXQuY2hhbmdlcykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignV29ya3NwYWNlIGVkaXQgaXMgbm90IGNvbmZpZ3VyZWQgZm9yIG5vcm1hbCB0ZXh0IGVkaXQgY2hhbmdlcy4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciByZXN1bHQgPSB0aGlzLl90ZXh0RWRpdENoYW5nZXNba2V5XTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVkaXRzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5fd29ya3NwYWNlRWRpdC5jaGFuZ2VzW2tleV0gPSBlZGl0cztcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBuZXcgVGV4dEVkaXRDaGFuZ2VJbXBsKGVkaXRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0RWRpdENoYW5nZXNba2V5XSA9IHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBXb3Jrc3BhY2VDaGFuZ2U7XG59KCkpO1xuZXhwb3J0IHsgV29ya3NwYWNlQ2hhbmdlIH07XG4vKipcbiAqIFRoZSBUZXh0RG9jdW1lbnRJZGVudGlmaWVyIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW1RleHREb2N1bWVudElkZW50aWZpZXJdKCNUZXh0RG9jdW1lbnRJZGVudGlmaWVyKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBUZXh0RG9jdW1lbnRJZGVudGlmaWVyO1xuKGZ1bmN0aW9uIChUZXh0RG9jdW1lbnRJZGVudGlmaWVyKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBUZXh0RG9jdW1lbnRJZGVudGlmaWVyIGxpdGVyYWwuXG4gICAgICogQHBhcmFtIHVyaSBUaGUgZG9jdW1lbnQncyB1cmkuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKHVyaSkge1xuICAgICAgICByZXR1cm4geyB1cmk6IHVyaSB9O1xuICAgIH1cbiAgICBUZXh0RG9jdW1lbnRJZGVudGlmaWVyLmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gbGl0ZXJhbCBjb25mb3JtcyB0byB0aGUgW1RleHREb2N1bWVudElkZW50aWZpZXJdKCNUZXh0RG9jdW1lbnRJZGVudGlmaWVyKSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMuZGVmaW5lZChjYW5kaWRhdGUpICYmIElzLnN0cmluZyhjYW5kaWRhdGUudXJpKTtcbiAgICB9XG4gICAgVGV4dERvY3VtZW50SWRlbnRpZmllci5pcyA9IGlzO1xufSkoVGV4dERvY3VtZW50SWRlbnRpZmllciB8fCAoVGV4dERvY3VtZW50SWRlbnRpZmllciA9IHt9KSk7XG4vKipcbiAqIFRoZSBWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW1ZlcnNpb25lZFRleHREb2N1bWVudElkZW50aWZpZXJdKCNWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyO1xuKGZ1bmN0aW9uIChWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyIGxpdGVyYWwuXG4gICAgICogQHBhcmFtIHVyaSBUaGUgZG9jdW1lbnQncyB1cmkuXG4gICAgICogQHBhcmFtIHVyaSBUaGUgZG9jdW1lbnQncyB0ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZSh1cmksIHZlcnNpb24pIHtcbiAgICAgICAgcmV0dXJuIHsgdXJpOiB1cmksIHZlcnNpb246IHZlcnNpb24gfTtcbiAgICB9XG4gICAgVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllci5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtWZXJzaW9uZWRUZXh0RG9jdW1lbnRJZGVudGlmaWVyXSgjVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllcikgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLmRlZmluZWQoY2FuZGlkYXRlKSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLnVyaSkgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS52ZXJzaW9uKTtcbiAgICB9XG4gICAgVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllci5pcyA9IGlzO1xufSkoVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllciB8fCAoVmVyc2lvbmVkVGV4dERvY3VtZW50SWRlbnRpZmllciA9IHt9KSk7XG4vKipcbiAqIFRoZSBUZXh0RG9jdW1lbnRJdGVtIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW1RleHREb2N1bWVudEl0ZW1dKCNUZXh0RG9jdW1lbnRJdGVtKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBUZXh0RG9jdW1lbnRJdGVtO1xuKGZ1bmN0aW9uIChUZXh0RG9jdW1lbnRJdGVtKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBUZXh0RG9jdW1lbnRJdGVtIGxpdGVyYWwuXG4gICAgICogQHBhcmFtIHVyaSBUaGUgZG9jdW1lbnQncyB1cmkuXG4gICAgICogQHBhcmFtIGxhbmd1YWdlSWQgVGhlIGRvY3VtZW50J3MgbGFuZ3VhZ2UgaWRlbnRpZmllci5cbiAgICAgKiBAcGFyYW0gdmVyc2lvbiBUaGUgZG9jdW1lbnQncyB2ZXJzaW9uIG51bWJlci5cbiAgICAgKiBAcGFyYW0gdGV4dCBUaGUgZG9jdW1lbnQncyB0ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZSh1cmksIGxhbmd1YWdlSWQsIHZlcnNpb24sIHRleHQpIHtcbiAgICAgICAgcmV0dXJuIHsgdXJpOiB1cmksIGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWQsIHZlcnNpb246IHZlcnNpb24sIHRleHQ6IHRleHQgfTtcbiAgICB9XG4gICAgVGV4dERvY3VtZW50SXRlbS5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtUZXh0RG9jdW1lbnRJdGVtXSgjVGV4dERvY3VtZW50SXRlbSkgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLmRlZmluZWQoY2FuZGlkYXRlKSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLnVyaSkgJiYgSXMuc3RyaW5nKGNhbmRpZGF0ZS5sYW5ndWFnZUlkKSAmJiBJcy5udW1iZXIoY2FuZGlkYXRlLnZlcnNpb24pICYmIElzLnN0cmluZyhjYW5kaWRhdGUudGV4dCk7XG4gICAgfVxuICAgIFRleHREb2N1bWVudEl0ZW0uaXMgPSBpcztcbn0pKFRleHREb2N1bWVudEl0ZW0gfHwgKFRleHREb2N1bWVudEl0ZW0gPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGNvbnRlbnQgdHlwZSB0aGF0IGEgY2xpZW50IHN1cHBvcnRzIGluIHZhcmlvdXNcbiAqIHJlc3VsdCBsaXRlcmFscyBsaWtlIGBIb3ZlcmAsIGBQYXJhbWV0ZXJJbmZvYCBvciBgQ29tcGxldGlvbkl0ZW1gLlxuICpcbiAqIFBsZWFzZSBub3RlIHRoYXQgYE1hcmt1cEtpbmRzYCBtdXN0IG5vdCBzdGFydCB3aXRoIGEgYCRgLiBUaGlzIGtpbmRzXG4gKiBhcmUgcmVzZXJ2ZWQgZm9yIGludGVybmFsIHVzYWdlLlxuICovXG5leHBvcnQgdmFyIE1hcmt1cEtpbmQ7XG4oZnVuY3Rpb24gKE1hcmt1cEtpbmQpIHtcbiAgICAvKipcbiAgICAgKiBQbGFpbiB0ZXh0IGlzIHN1cHBvcnRlZCBhcyBhIGNvbnRlbnQgZm9ybWF0XG4gICAgICovXG4gICAgTWFya3VwS2luZC5QbGFpblRleHQgPSAncGxhaW50ZXh0JztcbiAgICAvKipcbiAgICAgKiBNYXJrZG93biBpcyBzdXBwb3J0ZWQgYXMgYSBjb250ZW50IGZvcm1hdFxuICAgICAqL1xuICAgIE1hcmt1cEtpbmQuTWFya2Rvd24gPSAnbWFya2Rvd24nO1xufSkoTWFya3VwS2luZCB8fCAoTWFya3VwS2luZCA9IHt9KSk7XG4oZnVuY3Rpb24gKE1hcmt1cEtpbmQpIHtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gdmFsdWUgaXMgYSB2YWx1ZSBvZiB0aGUgW01hcmt1cEtpbmRdKCNNYXJrdXBLaW5kKSB0eXBlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZSA9PT0gTWFya3VwS2luZC5QbGFpblRleHQgfHwgY2FuZGlkYXRlID09PSBNYXJrdXBLaW5kLk1hcmtkb3duO1xuICAgIH1cbiAgICBNYXJrdXBLaW5kLmlzID0gaXM7XG59KShNYXJrdXBLaW5kIHx8IChNYXJrdXBLaW5kID0ge30pKTtcbmV4cG9ydCB2YXIgTWFya3VwQ29udGVudDtcbihmdW5jdGlvbiAoTWFya3VwQ29udGVudCkge1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiB2YWx1ZSBjb25mb3JtcyB0byB0aGUgW01hcmt1cENvbnRlbnRdKCNNYXJrdXBDb250ZW50KSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMub2JqZWN0TGl0ZXJhbCh2YWx1ZSkgJiYgTWFya3VwS2luZC5pcyhjYW5kaWRhdGUua2luZCkgJiYgSXMuc3RyaW5nKGNhbmRpZGF0ZS52YWx1ZSk7XG4gICAgfVxuICAgIE1hcmt1cENvbnRlbnQuaXMgPSBpcztcbn0pKE1hcmt1cENvbnRlbnQgfHwgKE1hcmt1cENvbnRlbnQgPSB7fSkpO1xuLyoqXG4gKiBUaGUga2luZCBvZiBhIGNvbXBsZXRpb24gZW50cnkuXG4gKi9cbmV4cG9ydCB2YXIgQ29tcGxldGlvbkl0ZW1LaW5kO1xuKGZ1bmN0aW9uIChDb21wbGV0aW9uSXRlbUtpbmQpIHtcbiAgICBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCA9IDE7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCA9IDI7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkZ1bmN0aW9uID0gMztcbiAgICBDb21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3IgPSA0O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5GaWVsZCA9IDU7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlID0gNjtcbiAgICBDb21wbGV0aW9uSXRlbUtpbmQuQ2xhc3MgPSA3O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5JbnRlcmZhY2UgPSA4O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGUgPSA5O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSA9IDEwO1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5Vbml0ID0gMTE7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlID0gMTI7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkVudW0gPSAxMztcbiAgICBDb21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZCA9IDE0O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0ID0gMTU7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yID0gMTY7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgPSAxNztcbiAgICBDb21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlID0gMTg7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciA9IDE5O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5FbnVtTWVtYmVyID0gMjA7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50ID0gMjE7XG4gICAgQ29tcGxldGlvbkl0ZW1LaW5kLlN0cnVjdCA9IDIyO1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5FdmVudCA9IDIzO1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5PcGVyYXRvciA9IDI0O1xuICAgIENvbXBsZXRpb25JdGVtS2luZC5UeXBlUGFyYW1ldGVyID0gMjU7XG59KShDb21wbGV0aW9uSXRlbUtpbmQgfHwgKENvbXBsZXRpb25JdGVtS2luZCA9IHt9KSk7XG4vKipcbiAqIERlZmluZXMgd2hldGhlciB0aGUgaW5zZXJ0IHRleHQgaW4gYSBjb21wbGV0aW9uIGl0ZW0gc2hvdWxkIGJlIGludGVycHJldGVkIGFzXG4gKiBwbGFpbiB0ZXh0IG9yIGEgc25pcHBldC5cbiAqL1xuZXhwb3J0IHZhciBJbnNlcnRUZXh0Rm9ybWF0O1xuKGZ1bmN0aW9uIChJbnNlcnRUZXh0Rm9ybWF0KSB7XG4gICAgLyoqXG4gICAgICogVGhlIHByaW1hcnkgdGV4dCB0byBiZSBpbnNlcnRlZCBpcyB0cmVhdGVkIGFzIGEgcGxhaW4gc3RyaW5nLlxuICAgICAqL1xuICAgIEluc2VydFRleHRGb3JtYXQuUGxhaW5UZXh0ID0gMTtcbiAgICAvKipcbiAgICAgKiBUaGUgcHJpbWFyeSB0ZXh0IHRvIGJlIGluc2VydGVkIGlzIHRyZWF0ZWQgYXMgYSBzbmlwcGV0LlxuICAgICAqXG4gICAgICogQSBzbmlwcGV0IGNhbiBkZWZpbmUgdGFiIHN0b3BzIGFuZCBwbGFjZWhvbGRlcnMgd2l0aCBgJDFgLCBgJDJgXG4gICAgICogYW5kIGAkezM6Zm9vfWAuIGAkMGAgZGVmaW5lcyB0aGUgZmluYWwgdGFiIHN0b3AsIGl0IGRlZmF1bHRzIHRvXG4gICAgICogdGhlIGVuZCBvZiB0aGUgc25pcHBldC4gUGxhY2Vob2xkZXJzIHdpdGggZXF1YWwgaWRlbnRpZmllcnMgYXJlIGxpbmtlZCxcbiAgICAgKiB0aGF0IGlzIHR5cGluZyBpbiBvbmUgd2lsbCB1cGRhdGUgb3RoZXJzIHRvby5cbiAgICAgKlxuICAgICAqIFNlZSBhbHNvOiBodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L3ZzY29kZS9ibG9iL21hc3Rlci9zcmMvdnMvZWRpdG9yL2NvbnRyaWIvc25pcHBldC9jb21tb24vc25pcHBldC5tZFxuICAgICAqL1xuICAgIEluc2VydFRleHRGb3JtYXQuU25pcHBldCA9IDI7XG59KShJbnNlcnRUZXh0Rm9ybWF0IHx8IChJbnNlcnRUZXh0Rm9ybWF0ID0ge30pKTtcbi8qKlxuICogVGhlIENvbXBsZXRpb25JdGVtIG5hbWVzcGFjZSBwcm92aWRlcyBmdW5jdGlvbnMgdG8gZGVhbCB3aXRoXG4gKiBjb21wbGV0aW9uIGl0ZW1zLlxuICovXG5leHBvcnQgdmFyIENvbXBsZXRpb25JdGVtO1xuKGZ1bmN0aW9uIChDb21wbGV0aW9uSXRlbSkge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIGNvbXBsZXRpb24gaXRlbSBhbmQgc2VlZCBpdCB3aXRoIGEgbGFiZWwuXG4gICAgICogQHBhcmFtIGxhYmVsIFRoZSBjb21wbGV0aW9uIGl0ZW0ncyBsYWJlbFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShsYWJlbCkge1xuICAgICAgICByZXR1cm4geyBsYWJlbDogbGFiZWwgfTtcbiAgICB9XG4gICAgQ29tcGxldGlvbkl0ZW0uY3JlYXRlID0gY3JlYXRlO1xufSkoQ29tcGxldGlvbkl0ZW0gfHwgKENvbXBsZXRpb25JdGVtID0ge30pKTtcbi8qKlxuICogVGhlIENvbXBsZXRpb25MaXN0IG5hbWVzcGFjZSBwcm92aWRlcyBmdW5jdGlvbnMgdG8gZGVhbCB3aXRoXG4gKiBjb21wbGV0aW9uIGxpc3RzLlxuICovXG5leHBvcnQgdmFyIENvbXBsZXRpb25MaXN0O1xuKGZ1bmN0aW9uIChDb21wbGV0aW9uTGlzdCkge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgY29tcGxldGlvbiBsaXN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIGl0ZW1zIFRoZSBjb21wbGV0aW9uIGl0ZW1zLlxuICAgICAqIEBwYXJhbSBpc0luY29tcGxldGUgVGhlIGxpc3QgaXMgbm90IGNvbXBsZXRlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShpdGVtcywgaXNJbmNvbXBsZXRlKSB7XG4gICAgICAgIHJldHVybiB7IGl0ZW1zOiBpdGVtcyA/IGl0ZW1zIDogW10sIGlzSW5jb21wbGV0ZTogISFpc0luY29tcGxldGUgfTtcbiAgICB9XG4gICAgQ29tcGxldGlvbkxpc3QuY3JlYXRlID0gY3JlYXRlO1xufSkoQ29tcGxldGlvbkxpc3QgfHwgKENvbXBsZXRpb25MaXN0ID0ge30pKTtcbmV4cG9ydCB2YXIgTWFya2VkU3RyaW5nO1xuKGZ1bmN0aW9uIChNYXJrZWRTdHJpbmcpIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWFya2VkIHN0cmluZyBmcm9tIHBsYWluIHRleHQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gcGxhaW5UZXh0IFRoZSBwbGFpbiB0ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZyb21QbGFpblRleHQocGxhaW5UZXh0KSB7XG4gICAgICAgIHJldHVybiBwbGFpblRleHQucmVwbGFjZSgvW1xcXFxgKl97fVtcXF0oKSMrXFwtLiFdL2csIFwiXFxcXCQmXCIpOyAvLyBlc2NhcGUgbWFya2Rvd24gc3ludGF4IHRva2VuczogaHR0cDovL2RhcmluZ2ZpcmViYWxsLm5ldC9wcm9qZWN0cy9tYXJrZG93bi9zeW50YXgjYmFja3NsYXNoXG4gICAgfVxuICAgIE1hcmtlZFN0cmluZy5mcm9tUGxhaW5UZXh0ID0gZnJvbVBsYWluVGV4dDtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gdmFsdWUgY29uZm9ybXMgdG8gdGhlIFtNYXJrZWRTdHJpbmddKCNNYXJrZWRTdHJpbmcpIHR5cGUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMuc3RyaW5nKGNhbmRpZGF0ZSkgfHwgKElzLm9iamVjdExpdGVyYWwoY2FuZGlkYXRlKSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLmxhbmd1YWdlKSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLnZhbHVlKSk7XG4gICAgfVxuICAgIE1hcmtlZFN0cmluZy5pcyA9IGlzO1xufSkoTWFya2VkU3RyaW5nIHx8IChNYXJrZWRTdHJpbmcgPSB7fSkpO1xuZXhwb3J0IHZhciBIb3ZlcjtcbihmdW5jdGlvbiAoSG92ZXIpIHtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gdmFsdWUgY29uZm9ybXMgdG8gdGhlIFtIb3Zlcl0oI0hvdmVyKSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMub2JqZWN0TGl0ZXJhbChjYW5kaWRhdGUpICYmIChNYXJrdXBDb250ZW50LmlzKGNhbmRpZGF0ZS5jb250ZW50cykgfHxcbiAgICAgICAgICAgIE1hcmtlZFN0cmluZy5pcyhjYW5kaWRhdGUuY29udGVudHMpIHx8XG4gICAgICAgICAgICBJcy50eXBlZEFycmF5KGNhbmRpZGF0ZS5jb250ZW50cywgTWFya2VkU3RyaW5nLmlzKSkgJiYgKHZhbHVlLnJhbmdlID09PSB2b2lkIDAgfHwgUmFuZ2UuaXModmFsdWUucmFuZ2UpKTtcbiAgICB9XG4gICAgSG92ZXIuaXMgPSBpcztcbn0pKEhvdmVyIHx8IChIb3ZlciA9IHt9KSk7XG4vKipcbiAqIFRoZSBQYXJhbWV0ZXJJbmZvcm1hdGlvbiBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtQYXJhbWV0ZXJJbmZvcm1hdGlvbl0oI1BhcmFtZXRlckluZm9ybWF0aW9uKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBQYXJhbWV0ZXJJbmZvcm1hdGlvbjtcbihmdW5jdGlvbiAoUGFyYW1ldGVySW5mb3JtYXRpb24pIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IHBhcmFtZXRlciBpbmZvcm1hdGlvbiBsaXRlcmFsLlxuICAgICAqXG4gICAgICogQHBhcmFtIGxhYmVsIEEgbGFiZWwgc3RyaW5nLlxuICAgICAqIEBwYXJhbSBkb2N1bWVudGF0aW9uIEEgZG9jIHN0cmluZy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUobGFiZWwsIGRvY3VtZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50YXRpb24gPyB7IGxhYmVsOiBsYWJlbCwgZG9jdW1lbnRhdGlvbjogZG9jdW1lbnRhdGlvbiB9IDogeyBsYWJlbDogbGFiZWwgfTtcbiAgICB9XG4gICAgUGFyYW1ldGVySW5mb3JtYXRpb24uY3JlYXRlID0gY3JlYXRlO1xuICAgIDtcbn0pKFBhcmFtZXRlckluZm9ybWF0aW9uIHx8IChQYXJhbWV0ZXJJbmZvcm1hdGlvbiA9IHt9KSk7XG4vKipcbiAqIFRoZSBTaWduYXR1cmVJbmZvcm1hdGlvbiBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtTaWduYXR1cmVJbmZvcm1hdGlvbl0oI1NpZ25hdHVyZUluZm9ybWF0aW9uKSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBTaWduYXR1cmVJbmZvcm1hdGlvbjtcbihmdW5jdGlvbiAoU2lnbmF0dXJlSW5mb3JtYXRpb24pIHtcbiAgICBmdW5jdGlvbiBjcmVhdGUobGFiZWwsIGRvY3VtZW50YXRpb24pIHtcbiAgICAgICAgdmFyIHBhcmFtZXRlcnMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgX2kgPSAyOyBfaSA8IGFyZ3VtZW50cy5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgIHBhcmFtZXRlcnNbX2kgLSAyXSA9IGFyZ3VtZW50c1tfaV07XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHsgbGFiZWw6IGxhYmVsIH07XG4gICAgICAgIGlmIChJcy5kZWZpbmVkKGRvY3VtZW50YXRpb24pKSB7XG4gICAgICAgICAgICByZXN1bHQuZG9jdW1lbnRhdGlvbiA9IGRvY3VtZW50YXRpb247XG4gICAgICAgIH1cbiAgICAgICAgaWYgKElzLmRlZmluZWQocGFyYW1ldGVycykpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXJhbWV0ZXJzID0gcGFyYW1ldGVycztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXJhbWV0ZXJzID0gW107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgU2lnbmF0dXJlSW5mb3JtYXRpb24uY3JlYXRlID0gY3JlYXRlO1xufSkoU2lnbmF0dXJlSW5mb3JtYXRpb24gfHwgKFNpZ25hdHVyZUluZm9ybWF0aW9uID0ge30pKTtcbi8qKlxuICogQSBkb2N1bWVudCBoaWdobGlnaHQga2luZC5cbiAqL1xuZXhwb3J0IHZhciBEb2N1bWVudEhpZ2hsaWdodEtpbmQ7XG4oZnVuY3Rpb24gKERvY3VtZW50SGlnaGxpZ2h0S2luZCkge1xuICAgIC8qKlxuICAgICAqIEEgdGV4dHVhbCBvY2N1cnJlbmNlLlxuICAgICAqL1xuICAgIERvY3VtZW50SGlnaGxpZ2h0S2luZC5UZXh0ID0gMTtcbiAgICAvKipcbiAgICAgKiBSZWFkLWFjY2VzcyBvZiBhIHN5bWJvbCwgbGlrZSByZWFkaW5nIGEgdmFyaWFibGUuXG4gICAgICovXG4gICAgRG9jdW1lbnRIaWdobGlnaHRLaW5kLlJlYWQgPSAyO1xuICAgIC8qKlxuICAgICAqIFdyaXRlLWFjY2VzcyBvZiBhIHN5bWJvbCwgbGlrZSB3cml0aW5nIHRvIGEgdmFyaWFibGUuXG4gICAgICovXG4gICAgRG9jdW1lbnRIaWdobGlnaHRLaW5kLldyaXRlID0gMztcbn0pKERvY3VtZW50SGlnaGxpZ2h0S2luZCB8fCAoRG9jdW1lbnRIaWdobGlnaHRLaW5kID0ge30pKTtcbi8qKlxuICogRG9jdW1lbnRIaWdobGlnaHQgbmFtZXNwYWNlIHRvIHByb3ZpZGUgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtEb2N1bWVudEhpZ2hsaWdodF0oI0RvY3VtZW50SGlnaGxpZ2h0KSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBEb2N1bWVudEhpZ2hsaWdodDtcbihmdW5jdGlvbiAoRG9jdW1lbnRIaWdobGlnaHQpIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBEb2N1bWVudEhpZ2hsaWdodCBvYmplY3QuXG4gICAgICogQHBhcmFtIHJhbmdlIFRoZSByYW5nZSB0aGUgaGlnaGxpZ2h0IGFwcGxpZXMgdG8uXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKHJhbmdlLCBraW5kKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSB7IHJhbmdlOiByYW5nZSB9O1xuICAgICAgICBpZiAoSXMubnVtYmVyKGtpbmQpKSB7XG4gICAgICAgICAgICByZXN1bHQua2luZCA9IGtpbmQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgRG9jdW1lbnRIaWdobGlnaHQuY3JlYXRlID0gY3JlYXRlO1xufSkoRG9jdW1lbnRIaWdobGlnaHQgfHwgKERvY3VtZW50SGlnaGxpZ2h0ID0ge30pKTtcbi8qKlxuICogQSBzeW1ib2wga2luZC5cbiAqL1xuZXhwb3J0IHZhciBTeW1ib2xLaW5kO1xuKGZ1bmN0aW9uIChTeW1ib2xLaW5kKSB7XG4gICAgU3ltYm9sS2luZC5GaWxlID0gMTtcbiAgICBTeW1ib2xLaW5kLk1vZHVsZSA9IDI7XG4gICAgU3ltYm9sS2luZC5OYW1lc3BhY2UgPSAzO1xuICAgIFN5bWJvbEtpbmQuUGFja2FnZSA9IDQ7XG4gICAgU3ltYm9sS2luZC5DbGFzcyA9IDU7XG4gICAgU3ltYm9sS2luZC5NZXRob2QgPSA2O1xuICAgIFN5bWJvbEtpbmQuUHJvcGVydHkgPSA3O1xuICAgIFN5bWJvbEtpbmQuRmllbGQgPSA4O1xuICAgIFN5bWJvbEtpbmQuQ29uc3RydWN0b3IgPSA5O1xuICAgIFN5bWJvbEtpbmQuRW51bSA9IDEwO1xuICAgIFN5bWJvbEtpbmQuSW50ZXJmYWNlID0gMTE7XG4gICAgU3ltYm9sS2luZC5GdW5jdGlvbiA9IDEyO1xuICAgIFN5bWJvbEtpbmQuVmFyaWFibGUgPSAxMztcbiAgICBTeW1ib2xLaW5kLkNvbnN0YW50ID0gMTQ7XG4gICAgU3ltYm9sS2luZC5TdHJpbmcgPSAxNTtcbiAgICBTeW1ib2xLaW5kLk51bWJlciA9IDE2O1xuICAgIFN5bWJvbEtpbmQuQm9vbGVhbiA9IDE3O1xuICAgIFN5bWJvbEtpbmQuQXJyYXkgPSAxODtcbiAgICBTeW1ib2xLaW5kLk9iamVjdCA9IDE5O1xuICAgIFN5bWJvbEtpbmQuS2V5ID0gMjA7XG4gICAgU3ltYm9sS2luZC5OdWxsID0gMjE7XG4gICAgU3ltYm9sS2luZC5FbnVtTWVtYmVyID0gMjI7XG4gICAgU3ltYm9sS2luZC5TdHJ1Y3QgPSAyMztcbiAgICBTeW1ib2xLaW5kLkV2ZW50ID0gMjQ7XG4gICAgU3ltYm9sS2luZC5PcGVyYXRvciA9IDI1O1xuICAgIFN5bWJvbEtpbmQuVHlwZVBhcmFtZXRlciA9IDI2O1xufSkoU3ltYm9sS2luZCB8fCAoU3ltYm9sS2luZCA9IHt9KSk7XG5leHBvcnQgdmFyIFN5bWJvbEluZm9ybWF0aW9uO1xuKGZ1bmN0aW9uIChTeW1ib2xJbmZvcm1hdGlvbikge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgc3ltYm9sIGluZm9ybWF0aW9uIGxpdGVyYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgc3ltYm9sLlxuICAgICAqIEBwYXJhbSBraW5kIFRoZSBraW5kIG9mIHRoZSBzeW1ib2wuXG4gICAgICogQHBhcmFtIHJhbmdlIFRoZSByYW5nZSBvZiB0aGUgbG9jYXRpb24gb2YgdGhlIHN5bWJvbC5cbiAgICAgKiBAcGFyYW0gdXJpIFRoZSByZXNvdXJjZSBvZiB0aGUgbG9jYXRpb24gb2Ygc3ltYm9sLCBkZWZhdWx0cyB0byB0aGUgY3VycmVudCBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0gY29udGFpbmVyTmFtZSBUaGUgbmFtZSBvZiB0aGUgc3ltYm9sIGNvbnRhaW5pbmcgdGhlIHN5bWJvbC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUobmFtZSwga2luZCwgcmFuZ2UsIHVyaSwgY29udGFpbmVyTmFtZSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgIGtpbmQ6IGtpbmQsXG4gICAgICAgICAgICBsb2NhdGlvbjogeyB1cmk6IHVyaSwgcmFuZ2U6IHJhbmdlIH1cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGNvbnRhaW5lck5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5jb250YWluZXJOYW1lID0gY29udGFpbmVyTmFtZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBTeW1ib2xJbmZvcm1hdGlvbi5jcmVhdGUgPSBjcmVhdGU7XG59KShTeW1ib2xJbmZvcm1hdGlvbiB8fCAoU3ltYm9sSW5mb3JtYXRpb24gPSB7fSkpO1xuLyoqXG4gKiBSZXByZXNlbnRzIHByb2dyYW1taW5nIGNvbnN0cnVjdHMgbGlrZSB2YXJpYWJsZXMsIGNsYXNzZXMsIGludGVyZmFjZXMgZXRjLlxuICogdGhhdCBhcHBlYXIgaW4gYSBkb2N1bWVudC4gRG9jdW1lbnQgc3ltYm9scyBjYW4gYmUgaGllcmFyY2hpY2FsIGFuZCB0aGV5XG4gKiBoYXZlIHR3byByYW5nZXM6IG9uZSB0aGF0IGVuY2xvc2VzIGl0cyBkZWZpbml0aW9uIGFuZCBvbmUgdGhhdCBwb2ludHMgdG9cbiAqIGl0cyBtb3N0IGludGVyZXN0aW5nIHJhbmdlLCBlLmcuIHRoZSByYW5nZSBvZiBhbiBpZGVudGlmaWVyLlxuICovXG52YXIgRG9jdW1lbnRTeW1ib2wgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRG9jdW1lbnRTeW1ib2woKSB7XG4gICAgfVxuICAgIHJldHVybiBEb2N1bWVudFN5bWJvbDtcbn0oKSk7XG5leHBvcnQgeyBEb2N1bWVudFN5bWJvbCB9O1xuKGZ1bmN0aW9uIChEb2N1bWVudFN5bWJvbCkge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgc3ltYm9sIGluZm9ybWF0aW9uIGxpdGVyYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgc3ltYm9sLlxuICAgICAqIEBwYXJhbSBkZXRhaWwgVGhlIGRldGFpbCBvZiB0aGUgc3ltYm9sLlxuICAgICAqIEBwYXJhbSBraW5kIFRoZSBraW5kIG9mIHRoZSBzeW1ib2wuXG4gICAgICogQHBhcmFtIHJhbmdlIFRoZSByYW5nZSBvZiB0aGUgc3ltYm9sLlxuICAgICAqIEBwYXJhbSBzZWxlY3Rpb25SYW5nZSBUaGUgc2VsZWN0aW9uUmFuZ2Ugb2YgdGhlIHN5bWJvbC5cbiAgICAgKiBAcGFyYW0gY2hpbGRyZW4gQ2hpbGRyZW4gb2YgdGhlIHN5bWJvbC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUobmFtZSwgZGV0YWlsLCBraW5kLCByYW5nZSwgc2VsZWN0aW9uUmFuZ2UsIGNoaWxkcmVuKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgZGV0YWlsOiBkZXRhaWwsXG4gICAgICAgICAgICBraW5kOiBraW5kLFxuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgc2VsZWN0aW9uUmFuZ2U6IHNlbGVjdGlvblJhbmdlXG4gICAgICAgIH07XG4gICAgICAgIGlmIChjaGlsZHJlbiAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICByZXN1bHQuY2hpbGRyZW4gPSBjaGlsZHJlbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBEb2N1bWVudFN5bWJvbC5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtEb2N1bWVudFN5bWJvbF0oI0RvY3VtZW50U3ltYm9sKSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlICYmXG4gICAgICAgICAgICBJcy5zdHJpbmcoY2FuZGlkYXRlLm5hbWUpICYmIElzLm51bWJlcihjYW5kaWRhdGUua2luZCkgJiZcbiAgICAgICAgICAgIFJhbmdlLmlzKGNhbmRpZGF0ZS5yYW5nZSkgJiYgUmFuZ2UuaXMoY2FuZGlkYXRlLnNlbGVjdGlvblJhbmdlKSAmJlxuICAgICAgICAgICAgKGNhbmRpZGF0ZS5kZXRhaWwgPT09IHZvaWQgMCB8fCBJcy5zdHJpbmcoY2FuZGlkYXRlLmRldGFpbCkpICYmXG4gICAgICAgICAgICAoY2FuZGlkYXRlLmRlcHJlY2F0ZWQgPT09IHZvaWQgMCB8fCBJcy5ib29sZWFuKGNhbmRpZGF0ZS5kZXByZWNhdGVkKSkgJiZcbiAgICAgICAgICAgIChjYW5kaWRhdGUuY2hpbGRyZW4gPT09IHZvaWQgMCB8fCBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5jaGlsZHJlbikpO1xuICAgIH1cbiAgICBEb2N1bWVudFN5bWJvbC5pcyA9IGlzO1xufSkoRG9jdW1lbnRTeW1ib2wgfHwgKERvY3VtZW50U3ltYm9sID0ge30pKTtcbi8qKlxuICogQSBzZXQgb2YgcHJlZGVmaW5lZCBjb2RlIGFjdGlvbiBraW5kc1xuICovXG5leHBvcnQgdmFyIENvZGVBY3Rpb25LaW5kO1xuKGZ1bmN0aW9uIChDb2RlQWN0aW9uS2luZCkge1xuICAgIC8qKlxuICAgICAqIEJhc2Uga2luZCBmb3IgcXVpY2tmaXggYWN0aW9uczogJ3F1aWNrZml4J1xuICAgICAqL1xuICAgIENvZGVBY3Rpb25LaW5kLlF1aWNrRml4ID0gJ3F1aWNrZml4JztcbiAgICAvKipcbiAgICAgKiBCYXNlIGtpbmQgZm9yIHJlZmFjdG9yaW5nIGFjdGlvbnM6ICdyZWZhY3RvcidcbiAgICAgKi9cbiAgICBDb2RlQWN0aW9uS2luZC5SZWZhY3RvciA9ICdyZWZhY3Rvcic7XG4gICAgLyoqXG4gICAgICogQmFzZSBraW5kIGZvciByZWZhY3RvcmluZyBleHRyYWN0aW9uIGFjdGlvbnM6ICdyZWZhY3Rvci5leHRyYWN0J1xuICAgICAqXG4gICAgICogRXhhbXBsZSBleHRyYWN0IGFjdGlvbnM6XG4gICAgICpcbiAgICAgKiAtIEV4dHJhY3QgbWV0aG9kXG4gICAgICogLSBFeHRyYWN0IGZ1bmN0aW9uXG4gICAgICogLSBFeHRyYWN0IHZhcmlhYmxlXG4gICAgICogLSBFeHRyYWN0IGludGVyZmFjZSBmcm9tIGNsYXNzXG4gICAgICogLSAuLi5cbiAgICAgKi9cbiAgICBDb2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QgPSAncmVmYWN0b3IuZXh0cmFjdCc7XG4gICAgLyoqXG4gICAgICogQmFzZSBraW5kIGZvciByZWZhY3RvcmluZyBpbmxpbmUgYWN0aW9uczogJ3JlZmFjdG9yLmlubGluZSdcbiAgICAgKlxuICAgICAqIEV4YW1wbGUgaW5saW5lIGFjdGlvbnM6XG4gICAgICpcbiAgICAgKiAtIElubGluZSBmdW5jdGlvblxuICAgICAqIC0gSW5saW5lIHZhcmlhYmxlXG4gICAgICogLSBJbmxpbmUgY29uc3RhbnRcbiAgICAgKiAtIC4uLlxuICAgICAqL1xuICAgIENvZGVBY3Rpb25LaW5kLlJlZmFjdG9ySW5saW5lID0gJ3JlZmFjdG9yLmlubGluZSc7XG4gICAgLyoqXG4gICAgICogQmFzZSBraW5kIGZvciByZWZhY3RvcmluZyByZXdyaXRlIGFjdGlvbnM6ICdyZWZhY3Rvci5yZXdyaXRlJ1xuICAgICAqXG4gICAgICogRXhhbXBsZSByZXdyaXRlIGFjdGlvbnM6XG4gICAgICpcbiAgICAgKiAtIENvbnZlcnQgSmF2YVNjcmlwdCBmdW5jdGlvbiB0byBjbGFzc1xuICAgICAqIC0gQWRkIG9yIHJlbW92ZSBwYXJhbWV0ZXJcbiAgICAgKiAtIEVuY2Fwc3VsYXRlIGZpZWxkXG4gICAgICogLSBNYWtlIG1ldGhvZCBzdGF0aWNcbiAgICAgKiAtIE1vdmUgbWV0aG9kIHRvIGJhc2UgY2xhc3NcbiAgICAgKiAtIC4uLlxuICAgICAqL1xuICAgIENvZGVBY3Rpb25LaW5kLlJlZmFjdG9yUmV3cml0ZSA9ICdyZWZhY3Rvci5yZXdyaXRlJztcbiAgICAvKipcbiAgICAgKiBCYXNlIGtpbmQgZm9yIHNvdXJjZSBhY3Rpb25zOiBgc291cmNlYFxuICAgICAqXG4gICAgICogU291cmNlIGNvZGUgYWN0aW9ucyBhcHBseSB0byB0aGUgZW50aXJlIGZpbGUuXG4gICAgICovXG4gICAgQ29kZUFjdGlvbktpbmQuU291cmNlID0gJ3NvdXJjZSc7XG4gICAgLyoqXG4gICAgICogQmFzZSBraW5kIGZvciBhbiBvcmdhbml6ZSBpbXBvcnRzIHNvdXJjZSBhY3Rpb246IGBzb3VyY2Uub3JnYW5pemVJbXBvcnRzYFxuICAgICAqL1xuICAgIENvZGVBY3Rpb25LaW5kLlNvdXJjZU9yZ2FuaXplSW1wb3J0cyA9ICdzb3VyY2Uub3JnYW5pemVJbXBvcnRzJztcbn0pKENvZGVBY3Rpb25LaW5kIHx8IChDb2RlQWN0aW9uS2luZCA9IHt9KSk7XG4vKipcbiAqIFRoZSBDb2RlQWN0aW9uQ29udGV4dCBuYW1lc3BhY2UgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byB3b3JrIHdpdGhcbiAqIFtDb2RlQWN0aW9uQ29udGV4dF0oI0NvZGVBY3Rpb25Db250ZXh0KSBsaXRlcmFscy5cbiAqL1xuZXhwb3J0IHZhciBDb2RlQWN0aW9uQ29udGV4dDtcbihmdW5jdGlvbiAoQ29kZUFjdGlvbkNvbnRleHQpIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IENvZGVBY3Rpb25Db250ZXh0IGxpdGVyYWwuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY3JlYXRlKGRpYWdub3N0aWNzLCBvbmx5KSB7XG4gICAgICAgIHZhciByZXN1bHQgPSB7IGRpYWdub3N0aWNzOiBkaWFnbm9zdGljcyB9O1xuICAgICAgICBpZiAob25seSAhPT0gdm9pZCAwICYmIG9ubHkgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vbmx5ID0gb25seTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBDb2RlQWN0aW9uQ29udGV4dC5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtDb2RlQWN0aW9uQ29udGV4dF0oI0NvZGVBY3Rpb25Db250ZXh0KSBpbnRlcmZhY2UuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXModmFsdWUpIHtcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gSXMuZGVmaW5lZChjYW5kaWRhdGUpICYmIElzLnR5cGVkQXJyYXkoY2FuZGlkYXRlLmRpYWdub3N0aWNzLCBEaWFnbm9zdGljLmlzKSAmJiAoY2FuZGlkYXRlLm9ubHkgPT09IHZvaWQgMCB8fCBJcy50eXBlZEFycmF5KGNhbmRpZGF0ZS5vbmx5LCBJcy5zdHJpbmcpKTtcbiAgICB9XG4gICAgQ29kZUFjdGlvbkNvbnRleHQuaXMgPSBpcztcbn0pKENvZGVBY3Rpb25Db250ZXh0IHx8IChDb2RlQWN0aW9uQ29udGV4dCA9IHt9KSk7XG5leHBvcnQgdmFyIENvZGVBY3Rpb247XG4oZnVuY3Rpb24gKENvZGVBY3Rpb24pIHtcbiAgICBmdW5jdGlvbiBjcmVhdGUodGl0bGUsIGNvbW1hbmRPckVkaXQsIGtpbmQpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHsgdGl0bGU6IHRpdGxlIH07XG4gICAgICAgIGlmIChDb21tYW5kLmlzKGNvbW1hbmRPckVkaXQpKSB7XG4gICAgICAgICAgICByZXN1bHQuY29tbWFuZCA9IGNvbW1hbmRPckVkaXQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQuZWRpdCA9IGNvbW1hbmRPckVkaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGtpbmQgIT09IHZvaWQgbnVsbCkge1xuICAgICAgICAgICAgcmVzdWx0LmtpbmQgPSBraW5kO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIENvZGVBY3Rpb24uY3JlYXRlID0gY3JlYXRlO1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLnRpdGxlKSAmJlxuICAgICAgICAgICAgKGNhbmRpZGF0ZS5kaWFnbm9zdGljcyA9PT0gdm9pZCAwIHx8IElzLnR5cGVkQXJyYXkoY2FuZGlkYXRlLmRpYWdub3N0aWNzLCBEaWFnbm9zdGljLmlzKSkgJiZcbiAgICAgICAgICAgIChjYW5kaWRhdGUua2luZCA9PT0gdm9pZCAwIHx8IElzLnN0cmluZyhjYW5kaWRhdGUua2luZCkpICYmXG4gICAgICAgICAgICAoY2FuZGlkYXRlLmVkaXQgIT09IHZvaWQgMCB8fCBjYW5kaWRhdGUuY29tbWFuZCAhPT0gdm9pZCAwKSAmJlxuICAgICAgICAgICAgKGNhbmRpZGF0ZS5jb21tYW5kID09PSB2b2lkIDAgfHwgQ29tbWFuZC5pcyhjYW5kaWRhdGUuY29tbWFuZCkpICYmXG4gICAgICAgICAgICAoY2FuZGlkYXRlLmVkaXQgPT09IHZvaWQgMCB8fCBXb3Jrc3BhY2VFZGl0LmlzKGNhbmRpZGF0ZS5lZGl0KSk7XG4gICAgfVxuICAgIENvZGVBY3Rpb24uaXMgPSBpcztcbn0pKENvZGVBY3Rpb24gfHwgKENvZGVBY3Rpb24gPSB7fSkpO1xuLyoqXG4gKiBUaGUgQ29kZUxlbnMgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbQ29kZUxlbnNdKCNDb2RlTGVucykgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgQ29kZUxlbnM7XG4oZnVuY3Rpb24gKENvZGVMZW5zKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBDb2RlTGVucyBsaXRlcmFsLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShyYW5nZSwgZGF0YSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0geyByYW5nZTogcmFuZ2UgfTtcbiAgICAgICAgaWYgKElzLmRlZmluZWQoZGF0YSkpXG4gICAgICAgICAgICByZXN1bHQuZGF0YSA9IGRhdGE7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIENvZGVMZW5zLmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICAvKipcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0aGUgZ2l2ZW4gbGl0ZXJhbCBjb25mb3JtcyB0byB0aGUgW0NvZGVMZW5zXSgjQ29kZUxlbnMpIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSkgJiYgUmFuZ2UuaXMoY2FuZGlkYXRlLnJhbmdlKSAmJiAoSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS5jb21tYW5kKSB8fCBDb21tYW5kLmlzKGNhbmRpZGF0ZS5jb21tYW5kKSk7XG4gICAgfVxuICAgIENvZGVMZW5zLmlzID0gaXM7XG59KShDb2RlTGVucyB8fCAoQ29kZUxlbnMgPSB7fSkpO1xuLyoqXG4gKiBUaGUgRm9ybWF0dGluZ09wdGlvbnMgbmFtZXNwYWNlIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gd29yayB3aXRoXG4gKiBbRm9ybWF0dGluZ09wdGlvbnNdKCNGb3JtYXR0aW5nT3B0aW9ucykgbGl0ZXJhbHMuXG4gKi9cbmV4cG9ydCB2YXIgRm9ybWF0dGluZ09wdGlvbnM7XG4oZnVuY3Rpb24gKEZvcm1hdHRpbmdPcHRpb25zKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBGb3JtYXR0aW5nT3B0aW9ucyBsaXRlcmFsLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZSh0YWJTaXplLCBpbnNlcnRTcGFjZXMpIHtcbiAgICAgICAgcmV0dXJuIHsgdGFiU2l6ZTogdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzOiBpbnNlcnRTcGFjZXMgfTtcbiAgICB9XG4gICAgRm9ybWF0dGluZ09wdGlvbnMuY3JlYXRlID0gY3JlYXRlO1xuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBsaXRlcmFsIGNvbmZvcm1zIHRvIHRoZSBbRm9ybWF0dGluZ09wdGlvbnNdKCNGb3JtYXR0aW5nT3B0aW9ucykgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLmRlZmluZWQoY2FuZGlkYXRlKSAmJiBJcy5udW1iZXIoY2FuZGlkYXRlLnRhYlNpemUpICYmIElzLmJvb2xlYW4oY2FuZGlkYXRlLmluc2VydFNwYWNlcyk7XG4gICAgfVxuICAgIEZvcm1hdHRpbmdPcHRpb25zLmlzID0gaXM7XG59KShGb3JtYXR0aW5nT3B0aW9ucyB8fCAoRm9ybWF0dGluZ09wdGlvbnMgPSB7fSkpO1xuLyoqXG4gKiBBIGRvY3VtZW50IGxpbmsgaXMgYSByYW5nZSBpbiBhIHRleHQgZG9jdW1lbnQgdGhhdCBsaW5rcyB0byBhbiBpbnRlcm5hbCBvciBleHRlcm5hbCByZXNvdXJjZSwgbGlrZSBhbm90aGVyXG4gKiB0ZXh0IGRvY3VtZW50IG9yIGEgd2ViIHNpdGUuXG4gKi9cbnZhciBEb2N1bWVudExpbmsgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRG9jdW1lbnRMaW5rKCkge1xuICAgIH1cbiAgICByZXR1cm4gRG9jdW1lbnRMaW5rO1xufSgpKTtcbmV4cG9ydCB7IERvY3VtZW50TGluayB9O1xuLyoqXG4gKiBUaGUgRG9jdW1lbnRMaW5rIG5hbWVzcGFjZSBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIHdvcmsgd2l0aFxuICogW0RvY3VtZW50TGlua10oI0RvY3VtZW50TGluaykgbGl0ZXJhbHMuXG4gKi9cbihmdW5jdGlvbiAoRG9jdW1lbnRMaW5rKSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBEb2N1bWVudExpbmsgbGl0ZXJhbC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjcmVhdGUocmFuZ2UsIHRhcmdldCwgZGF0YSkge1xuICAgICAgICByZXR1cm4geyByYW5nZTogcmFuZ2UsIHRhcmdldDogdGFyZ2V0LCBkYXRhOiBkYXRhIH07XG4gICAgfVxuICAgIERvY3VtZW50TGluay5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtEb2N1bWVudExpbmtdKCNEb2N1bWVudExpbmspIGludGVyZmFjZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpcyh2YWx1ZSkge1xuICAgICAgICB2YXIgY2FuZGlkYXRlID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBJcy5kZWZpbmVkKGNhbmRpZGF0ZSkgJiYgUmFuZ2UuaXMoY2FuZGlkYXRlLnJhbmdlKSAmJiAoSXMudW5kZWZpbmVkKGNhbmRpZGF0ZS50YXJnZXQpIHx8IElzLnN0cmluZyhjYW5kaWRhdGUudGFyZ2V0KSk7XG4gICAgfVxuICAgIERvY3VtZW50TGluay5pcyA9IGlzO1xufSkoRG9jdW1lbnRMaW5rIHx8IChEb2N1bWVudExpbmsgPSB7fSkpO1xuZXhwb3J0IHZhciBFT0wgPSBbJ1xcbicsICdcXHJcXG4nLCAnXFxyJ107XG5leHBvcnQgdmFyIFRleHREb2N1bWVudDtcbihmdW5jdGlvbiAoVGV4dERvY3VtZW50KSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBJVGV4dERvY3VtZW50IGxpdGVyYWwgZnJvbSB0aGUgZ2l2ZW4gdXJpIGFuZCBjb250ZW50LlxuICAgICAqIEBwYXJhbSB1cmkgVGhlIGRvY3VtZW50J3MgdXJpLlxuICAgICAqIEBwYXJhbSBsYW5ndWFnZUlkICBUaGUgZG9jdW1lbnQncyBsYW5ndWFnZSBJZC5cbiAgICAgKiBAcGFyYW0gY29udGVudCBUaGUgZG9jdW1lbnQncyBjb250ZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZSh1cmksIGxhbmd1YWdlSWQsIHZlcnNpb24sIGNvbnRlbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGdWxsVGV4dERvY3VtZW50KHVyaSwgbGFuZ3VhZ2VJZCwgdmVyc2lvbiwgY29udGVudCk7XG4gICAgfVxuICAgIFRleHREb2N1bWVudC5jcmVhdGUgPSBjcmVhdGU7XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGxpdGVyYWwgY29uZm9ybXMgdG8gdGhlIFtJVGV4dERvY3VtZW50XSgjSVRleHREb2N1bWVudCkgaW50ZXJmYWNlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzKHZhbHVlKSB7XG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIElzLmRlZmluZWQoY2FuZGlkYXRlKSAmJiBJcy5zdHJpbmcoY2FuZGlkYXRlLnVyaSkgJiYgKElzLnVuZGVmaW5lZChjYW5kaWRhdGUubGFuZ3VhZ2VJZCkgfHwgSXMuc3RyaW5nKGNhbmRpZGF0ZS5sYW5ndWFnZUlkKSkgJiYgSXMubnVtYmVyKGNhbmRpZGF0ZS5saW5lQ291bnQpXG4gICAgICAgICAgICAmJiBJcy5mdW5jKGNhbmRpZGF0ZS5nZXRUZXh0KSAmJiBJcy5mdW5jKGNhbmRpZGF0ZS5wb3NpdGlvbkF0KSAmJiBJcy5mdW5jKGNhbmRpZGF0ZS5vZmZzZXRBdCkgPyB0cnVlIDogZmFsc2U7XG4gICAgfVxuICAgIFRleHREb2N1bWVudC5pcyA9IGlzO1xuICAgIGZ1bmN0aW9uIGFwcGx5RWRpdHMoZG9jdW1lbnQsIGVkaXRzKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gZG9jdW1lbnQuZ2V0VGV4dCgpO1xuICAgICAgICB2YXIgc29ydGVkRWRpdHMgPSBtZXJnZVNvcnQoZWRpdHMsIGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IGEucmFuZ2Uuc3RhcnQubGluZSAtIGIucmFuZ2Uuc3RhcnQubGluZTtcbiAgICAgICAgICAgIGlmIChkaWZmID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyIC0gYi5yYW5nZS5zdGFydC5jaGFyYWN0ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGlmZjtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBsYXN0TW9kaWZpZWRPZmZzZXQgPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IHNvcnRlZEVkaXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgZSA9IHNvcnRlZEVkaXRzW2ldO1xuICAgICAgICAgICAgdmFyIHN0YXJ0T2Zmc2V0ID0gZG9jdW1lbnQub2Zmc2V0QXQoZS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICB2YXIgZW5kT2Zmc2V0ID0gZG9jdW1lbnQub2Zmc2V0QXQoZS5yYW5nZS5lbmQpO1xuICAgICAgICAgICAgaWYgKGVuZE9mZnNldCA8PSBsYXN0TW9kaWZpZWRPZmZzZXQpIHtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgc3RhcnRPZmZzZXQpICsgZS5uZXdUZXh0ICsgdGV4dC5zdWJzdHJpbmcoZW5kT2Zmc2V0LCB0ZXh0Lmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ092ZWxhcHBpbmcgZWRpdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFzdE1vZGlmaWVkT2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuICAgIFRleHREb2N1bWVudC5hcHBseUVkaXRzID0gYXBwbHlFZGl0cztcbiAgICBmdW5jdGlvbiBtZXJnZVNvcnQoZGF0YSwgY29tcGFyZSkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgLy8gc29ydGVkXG4gICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcCA9IChkYXRhLmxlbmd0aCAvIDIpIHwgMDtcbiAgICAgICAgdmFyIGxlZnQgPSBkYXRhLnNsaWNlKDAsIHApO1xuICAgICAgICB2YXIgcmlnaHQgPSBkYXRhLnNsaWNlKHApO1xuICAgICAgICBtZXJnZVNvcnQobGVmdCwgY29tcGFyZSk7XG4gICAgICAgIG1lcmdlU29ydChyaWdodCwgY29tcGFyZSk7XG4gICAgICAgIHZhciBsZWZ0SWR4ID0gMDtcbiAgICAgICAgdmFyIHJpZ2h0SWR4ID0gMDtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICB3aGlsZSAobGVmdElkeCA8IGxlZnQubGVuZ3RoICYmIHJpZ2h0SWR4IDwgcmlnaHQubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgcmV0ID0gY29tcGFyZShsZWZ0W2xlZnRJZHhdLCByaWdodFtyaWdodElkeF0pO1xuICAgICAgICAgICAgaWYgKHJldCA8PSAwKSB7XG4gICAgICAgICAgICAgICAgLy8gc21hbGxlcl9lcXVhbCAtPiB0YWtlIGxlZnQgdG8gcHJlc2VydmUgb3JkZXJcbiAgICAgICAgICAgICAgICBkYXRhW2krK10gPSBsZWZ0W2xlZnRJZHgrK107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBncmVhdGVyIC0+IHRha2UgcmlnaHRcbiAgICAgICAgICAgICAgICBkYXRhW2krK10gPSByaWdodFtyaWdodElkeCsrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAobGVmdElkeCA8IGxlZnQubGVuZ3RoKSB7XG4gICAgICAgICAgICBkYXRhW2krK10gPSBsZWZ0W2xlZnRJZHgrK107XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHJpZ2h0SWR4IDwgcmlnaHQubGVuZ3RoKSB7XG4gICAgICAgICAgICBkYXRhW2krK10gPSByaWdodFtyaWdodElkeCsrXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICB9XG59KShUZXh0RG9jdW1lbnQgfHwgKFRleHREb2N1bWVudCA9IHt9KSk7XG4vKipcbiAqIFJlcHJlc2VudHMgcmVhc29ucyB3aHkgYSB0ZXh0IGRvY3VtZW50IGlzIHNhdmVkLlxuICovXG5leHBvcnQgdmFyIFRleHREb2N1bWVudFNhdmVSZWFzb247XG4oZnVuY3Rpb24gKFRleHREb2N1bWVudFNhdmVSZWFzb24pIHtcbiAgICAvKipcbiAgICAgKiBNYW51YWxseSB0cmlnZ2VyZWQsIGUuZy4gYnkgdGhlIHVzZXIgcHJlc3Npbmcgc2F2ZSwgYnkgc3RhcnRpbmcgZGVidWdnaW5nLFxuICAgICAqIG9yIGJ5IGFuIEFQSSBjYWxsLlxuICAgICAqL1xuICAgIFRleHREb2N1bWVudFNhdmVSZWFzb24uTWFudWFsID0gMTtcbiAgICAvKipcbiAgICAgKiBBdXRvbWF0aWMgYWZ0ZXIgYSBkZWxheS5cbiAgICAgKi9cbiAgICBUZXh0RG9jdW1lbnRTYXZlUmVhc29uLkFmdGVyRGVsYXkgPSAyO1xuICAgIC8qKlxuICAgICAqIFdoZW4gdGhlIGVkaXRvciBsb3N0IGZvY3VzLlxuICAgICAqL1xuICAgIFRleHREb2N1bWVudFNhdmVSZWFzb24uRm9jdXNPdXQgPSAzO1xufSkoVGV4dERvY3VtZW50U2F2ZVJlYXNvbiB8fCAoVGV4dERvY3VtZW50U2F2ZVJlYXNvbiA9IHt9KSk7XG52YXIgRnVsbFRleHREb2N1bWVudCA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGdWxsVGV4dERvY3VtZW50KHVyaSwgbGFuZ3VhZ2VJZCwgdmVyc2lvbiwgY29udGVudCkge1xuICAgICAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgICAgIHRoaXMuX2xhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuICAgICAgICB0aGlzLl92ZXJzaW9uID0gdmVyc2lvbjtcbiAgICAgICAgdGhpcy5fY29udGVudCA9IGNvbnRlbnQ7XG4gICAgICAgIHRoaXMuX2xpbmVPZmZzZXRzID0gbnVsbDtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bGxUZXh0RG9jdW1lbnQucHJvdG90eXBlLCBcInVyaVwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3VyaTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bGxUZXh0RG9jdW1lbnQucHJvdG90eXBlLCBcImxhbmd1YWdlSWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9sYW5ndWFnZUlkO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVsbFRleHREb2N1bWVudC5wcm90b3R5cGUsIFwidmVyc2lvblwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3ZlcnNpb247XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIEZ1bGxUZXh0RG9jdW1lbnQucHJvdG90eXBlLmdldFRleHQgPSBmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLm9mZnNldEF0KHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIHZhciBlbmQgPSB0aGlzLm9mZnNldEF0KHJhbmdlLmVuZCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29udGVudC5zdWJzdHJpbmcoc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRlbnQ7XG4gICAgfTtcbiAgICBGdWxsVGV4dERvY3VtZW50LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAoZXZlbnQsIHZlcnNpb24pIHtcbiAgICAgICAgdGhpcy5fY29udGVudCA9IGV2ZW50LnRleHQ7XG4gICAgICAgIHRoaXMuX3ZlcnNpb24gPSB2ZXJzaW9uO1xuICAgICAgICB0aGlzLl9saW5lT2Zmc2V0cyA9IG51bGw7XG4gICAgfTtcbiAgICBGdWxsVGV4dERvY3VtZW50LnByb3RvdHlwZS5nZXRMaW5lT2Zmc2V0cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2xpbmVPZmZzZXRzID09PSBudWxsKSB7XG4gICAgICAgICAgICB2YXIgbGluZU9mZnNldHMgPSBbXTtcbiAgICAgICAgICAgIHZhciB0ZXh0ID0gdGhpcy5fY29udGVudDtcbiAgICAgICAgICAgIHZhciBpc0xpbmVTdGFydCA9IHRydWU7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNMaW5lU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZU9mZnNldHMucHVzaChpKTtcbiAgICAgICAgICAgICAgICAgICAgaXNMaW5lU3RhcnQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGNoID0gdGV4dC5jaGFyQXQoaSk7XG4gICAgICAgICAgICAgICAgaXNMaW5lU3RhcnQgPSAoY2ggPT09ICdcXHInIHx8IGNoID09PSAnXFxuJyk7XG4gICAgICAgICAgICAgICAgaWYgKGNoID09PSAnXFxyJyAmJiBpICsgMSA8IHRleHQubGVuZ3RoICYmIHRleHQuY2hhckF0KGkgKyAxKSA9PT0gJ1xcbicpIHtcbiAgICAgICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0xpbmVTdGFydCAmJiB0ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBsaW5lT2Zmc2V0cy5wdXNoKHRleHQubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2xpbmVPZmZzZXRzID0gbGluZU9mZnNldHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVPZmZzZXRzO1xuICAgIH07XG4gICAgRnVsbFRleHREb2N1bWVudC5wcm90b3R5cGUucG9zaXRpb25BdCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgICAgICAgb2Zmc2V0ID0gTWF0aC5tYXgoTWF0aC5taW4ob2Zmc2V0LCB0aGlzLl9jb250ZW50Lmxlbmd0aCksIDApO1xuICAgICAgICB2YXIgbGluZU9mZnNldHMgPSB0aGlzLmdldExpbmVPZmZzZXRzKCk7XG4gICAgICAgIHZhciBsb3cgPSAwLCBoaWdoID0gbGluZU9mZnNldHMubGVuZ3RoO1xuICAgICAgICBpZiAoaGlnaCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFBvc2l0aW9uLmNyZWF0ZSgwLCBvZmZzZXQpO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigobG93ICsgaGlnaCkgLyAyKTtcbiAgICAgICAgICAgIGlmIChsaW5lT2Zmc2V0c1ttaWRdID4gb2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgaGlnaCA9IG1pZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gbG93IGlzIHRoZSBsZWFzdCB4IGZvciB3aGljaCB0aGUgbGluZSBvZmZzZXQgaXMgbGFyZ2VyIHRoYW4gdGhlIGN1cnJlbnQgb2Zmc2V0XG4gICAgICAgIC8vIG9yIGFycmF5Lmxlbmd0aCBpZiBubyBsaW5lIG9mZnNldCBpcyBsYXJnZXIgdGhhbiB0aGUgY3VycmVudCBvZmZzZXRcbiAgICAgICAgdmFyIGxpbmUgPSBsb3cgLSAxO1xuICAgICAgICByZXR1cm4gUG9zaXRpb24uY3JlYXRlKGxpbmUsIG9mZnNldCAtIGxpbmVPZmZzZXRzW2xpbmVdKTtcbiAgICB9O1xuICAgIEZ1bGxUZXh0RG9jdW1lbnQucHJvdG90eXBlLm9mZnNldEF0ID0gZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBsaW5lT2Zmc2V0cyA9IHRoaXMuZ2V0TGluZU9mZnNldHMoKTtcbiAgICAgICAgaWYgKHBvc2l0aW9uLmxpbmUgPj0gbGluZU9mZnNldHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29udGVudC5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocG9zaXRpb24ubGluZSA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsaW5lT2Zmc2V0ID0gbGluZU9mZnNldHNbcG9zaXRpb24ubGluZV07XG4gICAgICAgIHZhciBuZXh0TGluZU9mZnNldCA9IChwb3NpdGlvbi5saW5lICsgMSA8IGxpbmVPZmZzZXRzLmxlbmd0aCkgPyBsaW5lT2Zmc2V0c1twb3NpdGlvbi5saW5lICsgMV0gOiB0aGlzLl9jb250ZW50Lmxlbmd0aDtcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KE1hdGgubWluKGxpbmVPZmZzZXQgKyBwb3NpdGlvbi5jaGFyYWN0ZXIsIG5leHRMaW5lT2Zmc2V0KSwgbGluZU9mZnNldCk7XG4gICAgfTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVsbFRleHREb2N1bWVudC5wcm90b3R5cGUsIFwibGluZUNvdW50XCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRMaW5lT2Zmc2V0cygpLmxlbmd0aDtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgcmV0dXJuIEZ1bGxUZXh0RG9jdW1lbnQ7XG59KCkpO1xudmFyIElzO1xuKGZ1bmN0aW9uIChJcykge1xuICAgIHZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG4gICAgZnVuY3Rpb24gZGVmaW5lZCh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJztcbiAgICB9XG4gICAgSXMuZGVmaW5lZCA9IGRlZmluZWQ7XG4gICAgZnVuY3Rpb24gdW5kZWZpbmVkKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnO1xuICAgIH1cbiAgICBJcy51bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgZnVuY3Rpb24gYm9vbGVhbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgPT09IHRydWUgfHwgdmFsdWUgPT09IGZhbHNlO1xuICAgIH1cbiAgICBJcy5ib29sZWFuID0gYm9vbGVhbjtcbiAgICBmdW5jdGlvbiBzdHJpbmcodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBTdHJpbmddJztcbiAgICB9XG4gICAgSXMuc3RyaW5nID0gc3RyaW5nO1xuICAgIGZ1bmN0aW9uIG51bWJlcih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IE51bWJlcl0nO1xuICAgIH1cbiAgICBJcy5udW1iZXIgPSBudW1iZXI7XG4gICAgZnVuY3Rpb24gZnVuYyh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXSc7XG4gICAgfVxuICAgIElzLmZ1bmMgPSBmdW5jO1xuICAgIGZ1bmN0aW9uIG9iamVjdExpdGVyYWwodmFsdWUpIHtcbiAgICAgICAgLy8gU3RyaWN0bHkgc3BlYWtpbmcgY2xhc3MgaW5zdGFuY2VzIHBhc3MgdGhpcyBjaGVjayBhcyB3ZWxsLiBTaW5jZSB0aGUgTFNQXG4gICAgICAgIC8vIGRvZXNuJ3QgdXNlIGNsYXNzZXMgd2UgaWdub3JlIHRoaXMgZm9yIG5vdy4gSWYgd2UgZG8gd2UgbmVlZCB0byBhZGQgc29tZXRoaW5nXG4gICAgICAgIC8vIGxpa2UgdGhpczogYE9iamVjdC5nZXRQcm90b3R5cGVPZihPYmplY3QuZ2V0UHJvdG90eXBlT2YoeCkpID09PSBudWxsYFxuICAgICAgICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JztcbiAgICB9XG4gICAgSXMub2JqZWN0TGl0ZXJhbCA9IG9iamVjdExpdGVyYWw7XG4gICAgZnVuY3Rpb24gdHlwZWRBcnJheSh2YWx1ZSwgY2hlY2spIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmV2ZXJ5KGNoZWNrKTtcbiAgICB9XG4gICAgSXMudHlwZWRBcnJheSA9IHR5cGVkQXJyYXk7XG59KShJcyB8fCAoSXMgPSB7fSkpO1xuIiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbid1c2Ugc3RyaWN0JztcclxuaW1wb3J0IHsgV29ya2VyTWFuYWdlciB9IGZyb20gJy4vd29ya2VyTWFuYWdlci5qcyc7XHJcbmltcG9ydCAqIGFzIGxhbmd1YWdlRmVhdHVyZXMgZnJvbSAnLi9sYW5ndWFnZUZlYXR1cmVzLmpzJztcclxuaW1wb3J0IHsgY3JlYXRlVG9rZW5pemF0aW9uU3VwcG9ydCB9IGZyb20gJy4vdG9rZW5pemF0aW9uLmpzJztcclxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwTW9kZShkZWZhdWx0cykge1xyXG4gICAgdmFyIGRpc3Bvc2FibGVzID0gW107XHJcbiAgICB2YXIgY2xpZW50ID0gbmV3IFdvcmtlck1hbmFnZXIoZGVmYXVsdHMpO1xyXG4gICAgZGlzcG9zYWJsZXMucHVzaChjbGllbnQpO1xyXG4gICAgdmFyIHdvcmtlciA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgdXJpcyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XHJcbiAgICAgICAgICAgIHVyaXNbX2ldID0gYXJndW1lbnRzW19pXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNsaWVudC5nZXRMYW5ndWFnZVNlcnZpY2VXb3JrZXIuYXBwbHkoY2xpZW50LCB1cmlzKTtcclxuICAgIH07XHJcbiAgICB2YXIgbGFuZ3VhZ2VJZCA9IGRlZmF1bHRzLmxhbmd1YWdlSWQ7XHJcbiAgICBkaXNwb3NhYmxlcy5wdXNoKG1vbmFjby5sYW5ndWFnZXMucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGxhbmd1YWdlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLkNvbXBsZXRpb25BZGFwdGVyKHdvcmtlcikpKTtcclxuICAgIGRpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckhvdmVyUHJvdmlkZXIobGFuZ3VhZ2VJZCwgbmV3IGxhbmd1YWdlRmVhdHVyZXMuSG92ZXJBZGFwdGVyKHdvcmtlcikpKTtcclxuICAgIGRpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIobGFuZ3VhZ2VJZCwgbmV3IGxhbmd1YWdlRmVhdHVyZXMuRG9jdW1lbnRTeW1ib2xBZGFwdGVyKHdvcmtlcikpKTtcclxuICAgIGRpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihsYW5ndWFnZUlkLCBuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIod29ya2VyKSkpO1xyXG4gICAgZGlzcG9zYWJsZXMucHVzaChtb25hY28ubGFuZ3VhZ2VzLnJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIobGFuZ3VhZ2VJZCwgbmV3IGxhbmd1YWdlRmVhdHVyZXMuRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIod29ya2VyKSkpO1xyXG4gICAgZGlzcG9zYWJsZXMucHVzaChuZXcgbGFuZ3VhZ2VGZWF0dXJlcy5EaWFnbm9zdGljc0FkYXB0ZXIobGFuZ3VhZ2VJZCwgd29ya2VyLCBkZWZhdWx0cykpO1xyXG4gICAgZGlzcG9zYWJsZXMucHVzaChtb25hY28ubGFuZ3VhZ2VzLnNldFRva2Vuc1Byb3ZpZGVyKGxhbmd1YWdlSWQsIGNyZWF0ZVRva2VuaXphdGlvblN1cHBvcnQodHJ1ZSkpKTtcclxuICAgIGRpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmxhbmd1YWdlcy5zZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCwgcmljaEVkaXRDb25maWd1cmF0aW9uKSk7XHJcbiAgICBkaXNwb3NhYmxlcy5wdXNoKG1vbmFjby5sYW5ndWFnZXMucmVnaXN0ZXJDb2xvclByb3ZpZGVyKGxhbmd1YWdlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLkRvY3VtZW50Q29sb3JBZGFwdGVyKHdvcmtlcikpKTtcclxuICAgIGRpc3Bvc2FibGVzLnB1c2gobW9uYWNvLmxhbmd1YWdlcy5yZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyKGxhbmd1YWdlSWQsIG5ldyBsYW5ndWFnZUZlYXR1cmVzLkZvbGRpbmdSYW5nZUFkYXB0ZXIod29ya2VyKSkpO1xyXG59XHJcbnZhciByaWNoRWRpdENvbmZpZ3VyYXRpb24gPSB7XHJcbiAgICB3b3JkUGF0dGVybjogLygtP1xcZCpcXC5cXGRcXHcqKXwoW15cXFtcXHtcXF1cXH1cXDpcXFwiXFwsXFxzXSspL2csXHJcbiAgICBjb21tZW50czoge1xyXG4gICAgICAgIGxpbmVDb21tZW50OiAnLy8nLFxyXG4gICAgICAgIGJsb2NrQ29tbWVudDogWycvKicsICcqLyddXHJcbiAgICB9LFxyXG4gICAgYnJhY2tldHM6IFtcclxuICAgICAgICBbJ3snLCAnfSddLFxyXG4gICAgICAgIFsnWycsICddJ11cclxuICAgIF0sXHJcbiAgICBhdXRvQ2xvc2luZ1BhaXJzOiBbXHJcbiAgICAgICAgeyBvcGVuOiAneycsIGNsb3NlOiAnfScsIG5vdEluOiBbJ3N0cmluZyddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIG5vdEluOiBbJ3N0cmluZyddIH0sXHJcbiAgICAgICAgeyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJywgbm90SW46IFsnc3RyaW5nJ10gfVxyXG4gICAgXVxyXG59O1xyXG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5pbXBvcnQgKiBhcyBscyBmcm9tICcuL19kZXBzL3ZzY29kZS1sYW5ndWFnZXNlcnZlci10eXBlcy9tYWluLmpzJztcclxudmFyIFVyaSA9IG1vbmFjby5Vcmk7XHJcbnZhciBSYW5nZSA9IG1vbmFjby5SYW5nZTtcclxuLy8gLS0tIGRpYWdub3N0aWNzIC0tLSAtLS1cclxudmFyIERpYWdub3N0aWNzQWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIERpYWdub3N0aWNzQWRhcHRlcihfbGFuZ3VhZ2VJZCwgX3dvcmtlciwgZGVmYXVsdHMpIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xyXG4gICAgICAgIHRoaXMuX2xhbmd1YWdlSWQgPSBfbGFuZ3VhZ2VJZDtcclxuICAgICAgICB0aGlzLl93b3JrZXIgPSBfd29ya2VyO1xyXG4gICAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gW107XHJcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG4gICAgICAgIHZhciBvbk1vZGVsQWRkID0gZnVuY3Rpb24gKG1vZGVsKSB7XHJcbiAgICAgICAgICAgIHZhciBtb2RlSWQgPSBtb2RlbC5nZXRNb2RlSWQoKTtcclxuICAgICAgICAgICAgaWYgKG1vZGVJZCAhPT0gX3RoaXMuX2xhbmd1YWdlSWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgaGFuZGxlO1xyXG4gICAgICAgICAgICBfdGhpcy5fbGlzdGVuZXJbbW9kZWwudXJpLnRvU3RyaW5nKCldID0gbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChoYW5kbGUpO1xyXG4gICAgICAgICAgICAgICAgaGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBfdGhpcy5fZG9WYWxpZGF0ZShtb2RlbC51cmksIG1vZGVJZCk7IH0sIDUwMCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBfdGhpcy5fZG9WYWxpZGF0ZShtb2RlbC51cmksIG1vZGVJZCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICB2YXIgb25Nb2RlbFJlbW92ZWQgPSBmdW5jdGlvbiAobW9kZWwpIHtcclxuICAgICAgICAgICAgbW9uYWNvLmVkaXRvci5zZXRNb2RlbE1hcmtlcnMobW9kZWwsIF90aGlzLl9sYW5ndWFnZUlkLCBbXSk7XHJcbiAgICAgICAgICAgIHZhciB1cmlTdHIgPSBtb2RlbC51cmkudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gX3RoaXMuX2xpc3RlbmVyW3VyaVN0cl07XHJcbiAgICAgICAgICAgIGlmIChsaXN0ZW5lcikge1xyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXIuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgZGVsZXRlIF90aGlzLl9saXN0ZW5lclt1cmlTdHJdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKG1vbmFjby5lZGl0b3Iub25EaWRDcmVhdGVNb2RlbChvbk1vZGVsQWRkKSk7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZXMucHVzaChtb25hY28uZWRpdG9yLm9uV2lsbERpc3Bvc2VNb2RlbChmdW5jdGlvbiAobW9kZWwpIHtcclxuICAgICAgICAgICAgb25Nb2RlbFJlbW92ZWQobW9kZWwpO1xyXG4gICAgICAgICAgICBfdGhpcy5fcmVzZXRTY2hlbWEobW9kZWwudXJpKTtcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZXMucHVzaChtb25hY28uZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZShmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgICAgb25Nb2RlbFJlbW92ZWQoZXZlbnQubW9kZWwpO1xyXG4gICAgICAgICAgICBvbk1vZGVsQWRkKGV2ZW50Lm1vZGVsKTtcclxuICAgICAgICAgICAgX3RoaXMuX3Jlc2V0U2NoZW1hKGV2ZW50Lm1vZGVsLnVyaSk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzLnB1c2goZGVmYXVsdHMub25EaWRDaGFuZ2UoZnVuY3Rpb24gKF8pIHtcclxuICAgICAgICAgICAgbW9uYWNvLmVkaXRvci5nZXRNb2RlbHMoKS5mb3JFYWNoKGZ1bmN0aW9uIChtb2RlbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vZGVsLmdldE1vZGVJZCgpID09PSBfdGhpcy5fbGFuZ3VhZ2VJZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIG9uTW9kZWxSZW1vdmVkKG1vZGVsKTtcclxuICAgICAgICAgICAgICAgICAgICBvbk1vZGVsQWRkKG1vZGVsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzLnB1c2goe1xyXG4gICAgICAgICAgICBkaXNwb3NlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBtb25hY28uZWRpdG9yLmdldE1vZGVscygpLmZvckVhY2gob25Nb2RlbFJlbW92ZWQpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIF90aGlzLl9saXN0ZW5lcikge1xyXG4gICAgICAgICAgICAgICAgICAgIF90aGlzLl9saXN0ZW5lcltrZXldLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIG1vbmFjby5lZGl0b3IuZ2V0TW9kZWxzKCkuZm9yRWFjaChvbk1vZGVsQWRkKTtcclxuICAgIH1cclxuICAgIERpYWdub3N0aWNzQWRhcHRlci5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcy5mb3JFYWNoKGZ1bmN0aW9uIChkKSB7IHJldHVybiBkICYmIGQuZGlzcG9zZSgpOyB9KTtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IFtdO1xyXG4gICAgfTtcclxuICAgIERpYWdub3N0aWNzQWRhcHRlci5wcm90b3R5cGUuX3Jlc2V0U2NoZW1hID0gZnVuY3Rpb24gKHJlc291cmNlKSB7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyKCkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7XHJcbiAgICAgICAgICAgIHdvcmtlci5yZXNldFNjaGVtYShyZXNvdXJjZS50b1N0cmluZygpKTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBEaWFnbm9zdGljc0FkYXB0ZXIucHJvdG90eXBlLl9kb1ZhbGlkYXRlID0gZnVuY3Rpb24gKHJlc291cmNlLCBsYW5ndWFnZUlkKSB7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyKHJlc291cmNlKS50aGVuKGZ1bmN0aW9uICh3b3JrZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHdvcmtlci5kb1ZhbGlkYXRpb24ocmVzb3VyY2UudG9TdHJpbmcoKSkudGhlbihmdW5jdGlvbiAoZGlhZ25vc3RpY3MpIHtcclxuICAgICAgICAgICAgICAgIHZhciBtYXJrZXJzID0gZGlhZ25vc3RpY3MubWFwKGZ1bmN0aW9uIChkKSB7IHJldHVybiB0b0RpYWdub3N0aWNzKHJlc291cmNlLCBkKTsgfSk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbW9kZWwgPSBtb25hY28uZWRpdG9yLmdldE1vZGVsKHJlc291cmNlKTtcclxuICAgICAgICAgICAgICAgIGlmIChtb2RlbC5nZXRNb2RlSWQoKSA9PT0gbGFuZ3VhZ2VJZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vbmFjby5lZGl0b3Iuc2V0TW9kZWxNYXJrZXJzKG1vZGVsLCBsYW5ndWFnZUlkLCBtYXJrZXJzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSkudGhlbih1bmRlZmluZWQsIGZ1bmN0aW9uIChlcnIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBEaWFnbm9zdGljc0FkYXB0ZXI7XHJcbn0oKSk7XHJcbmV4cG9ydCB7IERpYWdub3N0aWNzQWRhcHRlciB9O1xyXG5mdW5jdGlvbiB0b1NldmVyaXR5KGxzU2V2ZXJpdHkpIHtcclxuICAgIHN3aXRjaCAobHNTZXZlcml0eSkge1xyXG4gICAgICAgIGNhc2UgbHMuRGlhZ25vc3RpY1NldmVyaXR5LkVycm9yOiByZXR1cm4gbW9uYWNvLk1hcmtlclNldmVyaXR5LkVycm9yO1xyXG4gICAgICAgIGNhc2UgbHMuRGlhZ25vc3RpY1NldmVyaXR5Lldhcm5pbmc6IHJldHVybiBtb25hY28uTWFya2VyU2V2ZXJpdHkuV2FybmluZztcclxuICAgICAgICBjYXNlIGxzLkRpYWdub3N0aWNTZXZlcml0eS5JbmZvcm1hdGlvbjogcmV0dXJuIG1vbmFjby5NYXJrZXJTZXZlcml0eS5JbmZvO1xyXG4gICAgICAgIGNhc2UgbHMuRGlhZ25vc3RpY1NldmVyaXR5LkhpbnQ6IHJldHVybiBtb25hY28uTWFya2VyU2V2ZXJpdHkuSGludDtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gbW9uYWNvLk1hcmtlclNldmVyaXR5LkluZm87XHJcbiAgICB9XHJcbn1cclxuZnVuY3Rpb24gdG9EaWFnbm9zdGljcyhyZXNvdXJjZSwgZGlhZykge1xyXG4gICAgdmFyIGNvZGUgPSB0eXBlb2YgZGlhZy5jb2RlID09PSAnbnVtYmVyJyA/IFN0cmluZyhkaWFnLmNvZGUpIDogZGlhZy5jb2RlO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBzZXZlcml0eTogdG9TZXZlcml0eShkaWFnLnNldmVyaXR5KSxcclxuICAgICAgICBzdGFydExpbmVOdW1iZXI6IGRpYWcucmFuZ2Uuc3RhcnQubGluZSArIDEsXHJcbiAgICAgICAgc3RhcnRDb2x1bW46IGRpYWcucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyICsgMSxcclxuICAgICAgICBlbmRMaW5lTnVtYmVyOiBkaWFnLnJhbmdlLmVuZC5saW5lICsgMSxcclxuICAgICAgICBlbmRDb2x1bW46IGRpYWcucmFuZ2UuZW5kLmNoYXJhY3RlciArIDEsXHJcbiAgICAgICAgbWVzc2FnZTogZGlhZy5tZXNzYWdlLFxyXG4gICAgICAgIGNvZGU6IGNvZGUsXHJcbiAgICAgICAgc291cmNlOiBkaWFnLnNvdXJjZVxyXG4gICAgfTtcclxufVxyXG4vLyAtLS0gY29tcGxldGlvbiAtLS0tLS1cclxuZnVuY3Rpb24gZnJvbVBvc2l0aW9uKHBvc2l0aW9uKSB7XHJcbiAgICBpZiAoIXBvc2l0aW9uKSB7XHJcbiAgICAgICAgcmV0dXJuIHZvaWQgMDtcclxuICAgIH1cclxuICAgIHJldHVybiB7IGNoYXJhY3RlcjogcG9zaXRpb24uY29sdW1uIC0gMSwgbGluZTogcG9zaXRpb24ubGluZU51bWJlciAtIDEgfTtcclxufVxyXG5mdW5jdGlvbiBmcm9tUmFuZ2UocmFuZ2UpIHtcclxuICAgIGlmICghcmFuZ2UpIHtcclxuICAgICAgICByZXR1cm4gdm9pZCAwO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgc3RhcnQ6IHsgbGluZTogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiByYW5nZS5zdGFydENvbHVtbiAtIDEgfSwgZW5kOiB7IGxpbmU6IHJhbmdlLmVuZExpbmVOdW1iZXIgLSAxLCBjaGFyYWN0ZXI6IHJhbmdlLmVuZENvbHVtbiAtIDEgfSB9O1xyXG59XHJcbmZ1bmN0aW9uIHRvUmFuZ2UocmFuZ2UpIHtcclxuICAgIGlmICghcmFuZ2UpIHtcclxuICAgICAgICByZXR1cm4gdm9pZCAwO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ldyBSYW5nZShyYW5nZS5zdGFydC5saW5lICsgMSwgcmFuZ2Uuc3RhcnQuY2hhcmFjdGVyICsgMSwgcmFuZ2UuZW5kLmxpbmUgKyAxLCByYW5nZS5lbmQuY2hhcmFjdGVyICsgMSk7XHJcbn1cclxuZnVuY3Rpb24gdG9Db21wbGV0aW9uSXRlbUtpbmQoa2luZCkge1xyXG4gICAgdmFyIG1JdGVtS2luZCA9IG1vbmFjby5sYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kO1xyXG4gICAgc3dpdGNoIChraW5kKSB7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuVGV4dDogcmV0dXJuIG1JdGVtS2luZC5UZXh0O1xyXG4gICAgICAgIGNhc2UgbHMuQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZDogcmV0dXJuIG1JdGVtS2luZC5NZXRob2Q7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb246IHJldHVybiBtSXRlbUtpbmQuRnVuY3Rpb247XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3I6IHJldHVybiBtSXRlbUtpbmQuQ29uc3RydWN0b3I7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuRmllbGQ6IHJldHVybiBtSXRlbUtpbmQuRmllbGQ7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuVmFyaWFibGU6IHJldHVybiBtSXRlbUtpbmQuVmFyaWFibGU7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuQ2xhc3M6IHJldHVybiBtSXRlbUtpbmQuQ2xhc3M7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuSW50ZXJmYWNlOiByZXR1cm4gbUl0ZW1LaW5kLkludGVyZmFjZTtcclxuICAgICAgICBjYXNlIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGU6IHJldHVybiBtSXRlbUtpbmQuTW9kdWxlO1xyXG4gICAgICAgIGNhc2UgbHMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5OiByZXR1cm4gbUl0ZW1LaW5kLlByb3BlcnR5O1xyXG4gICAgICAgIGNhc2UgbHMuQ29tcGxldGlvbkl0ZW1LaW5kLlVuaXQ6IHJldHVybiBtSXRlbUtpbmQuVW5pdDtcclxuICAgICAgICBjYXNlIGxzLkNvbXBsZXRpb25JdGVtS2luZC5WYWx1ZTogcmV0dXJuIG1JdGVtS2luZC5WYWx1ZTtcclxuICAgICAgICBjYXNlIGxzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtOiByZXR1cm4gbUl0ZW1LaW5kLkVudW07XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZDogcmV0dXJuIG1JdGVtS2luZC5LZXl3b3JkO1xyXG4gICAgICAgIGNhc2UgbHMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQ6IHJldHVybiBtSXRlbUtpbmQuU25pcHBldDtcclxuICAgICAgICBjYXNlIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Db2xvcjogcmV0dXJuIG1JdGVtS2luZC5Db2xvcjtcclxuICAgICAgICBjYXNlIGxzLkNvbXBsZXRpb25JdGVtS2luZC5GaWxlOiByZXR1cm4gbUl0ZW1LaW5kLkZpbGU7XHJcbiAgICAgICAgY2FzZSBscy5Db21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlOiByZXR1cm4gbUl0ZW1LaW5kLlJlZmVyZW5jZTtcclxuICAgIH1cclxuICAgIHJldHVybiBtSXRlbUtpbmQuUHJvcGVydHk7XHJcbn1cclxuZnVuY3Rpb24gZnJvbUNvbXBsZXRpb25JdGVtS2luZChraW5kKSB7XHJcbiAgICB2YXIgbUl0ZW1LaW5kID0gbW9uYWNvLmxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ7XHJcbiAgICBzd2l0Y2ggKGtpbmQpIHtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5UZXh0OiByZXR1cm4gbHMuQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQ7XHJcbiAgICAgICAgY2FzZSBtSXRlbUtpbmQuTWV0aG9kOiByZXR1cm4gbHMuQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZDtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5GdW5jdGlvbjogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5GdW5jdGlvbjtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5Db25zdHJ1Y3RvcjogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdHJ1Y3RvcjtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5GaWVsZDogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5GaWVsZDtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5WYXJpYWJsZTogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5WYXJpYWJsZTtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5DbGFzczogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5DbGFzcztcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5JbnRlcmZhY2U6IHJldHVybiBscy5Db21wbGV0aW9uSXRlbUtpbmQuSW50ZXJmYWNlO1xyXG4gICAgICAgIGNhc2UgbUl0ZW1LaW5kLk1vZHVsZTogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGU7XHJcbiAgICAgICAgY2FzZSBtSXRlbUtpbmQuUHJvcGVydHk6IHJldHVybiBscy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHk7XHJcbiAgICAgICAgY2FzZSBtSXRlbUtpbmQuVW5pdDogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Vbml0O1xyXG4gICAgICAgIGNhc2UgbUl0ZW1LaW5kLlZhbHVlOiByZXR1cm4gbHMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlO1xyXG4gICAgICAgIGNhc2UgbUl0ZW1LaW5kLkVudW06IHJldHVybiBscy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bTtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5LZXl3b3JkOiByZXR1cm4gbHMuQ29tcGxldGlvbkl0ZW1LaW5kLktleXdvcmQ7XHJcbiAgICAgICAgY2FzZSBtSXRlbUtpbmQuU25pcHBldDogcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0O1xyXG4gICAgICAgIGNhc2UgbUl0ZW1LaW5kLkNvbG9yOiByZXR1cm4gbHMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yO1xyXG4gICAgICAgIGNhc2UgbUl0ZW1LaW5kLkZpbGU6IHJldHVybiBscy5Db21wbGV0aW9uSXRlbUtpbmQuRmlsZTtcclxuICAgICAgICBjYXNlIG1JdGVtS2luZC5SZWZlcmVuY2U6IHJldHVybiBscy5Db21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGxzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eTtcclxufVxyXG5mdW5jdGlvbiB0b1RleHRFZGl0KHRleHRFZGl0KSB7XHJcbiAgICBpZiAoIXRleHRFZGl0KSB7XHJcbiAgICAgICAgcmV0dXJuIHZvaWQgMDtcclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmFuZ2U6IHRvUmFuZ2UodGV4dEVkaXQucmFuZ2UpLFxyXG4gICAgICAgIHRleHQ6IHRleHRFZGl0Lm5ld1RleHRcclxuICAgIH07XHJcbn1cclxudmFyIENvbXBsZXRpb25BZGFwdGVyID0gLyoqIEBjbGFzcyAqLyAoZnVuY3Rpb24gKCkge1xyXG4gICAgZnVuY3Rpb24gQ29tcGxldGlvbkFkYXB0ZXIoX3dvcmtlcikge1xyXG4gICAgICAgIHRoaXMuX3dvcmtlciA9IF93b3JrZXI7XHJcbiAgICB9XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQ29tcGxldGlvbkFkYXB0ZXIucHJvdG90eXBlLCBcInRyaWdnZXJDaGFyYWN0ZXJzXCIsIHtcclxuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFsnICcsICc6J107XHJcbiAgICAgICAgfSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxyXG4gICAgfSk7XHJcbiAgICBDb21wbGV0aW9uQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZUNvbXBsZXRpb25JdGVtcyA9IGZ1bmN0aW9uIChtb2RlbCwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIHdvcmRJbmZvID0gbW9kZWwuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zaXRpb24pO1xyXG4gICAgICAgIHZhciByZXNvdXJjZSA9IG1vZGVsLnVyaTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fd29ya2VyKHJlc291cmNlKS50aGVuKGZ1bmN0aW9uICh3b3JrZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHdvcmtlci5kb0NvbXBsZXRlKHJlc291cmNlLnRvU3RyaW5nKCksIGZyb21Qb3NpdGlvbihwb3NpdGlvbikpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGluZm8pIHtcclxuICAgICAgICAgICAgaWYgKCFpbmZvKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGl0ZW1zID0gaW5mby5pdGVtcy5tYXAoZnVuY3Rpb24gKGVudHJ5KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgaXRlbSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogZW50cnkubGFiZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0VGV4dDogZW50cnkuaW5zZXJ0VGV4dCB8fCBlbnRyeS5sYWJlbCxcclxuICAgICAgICAgICAgICAgICAgICBzb3J0VGV4dDogZW50cnkuc29ydFRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyVGV4dDogZW50cnkuZmlsdGVyVGV4dCxcclxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudGF0aW9uOiBlbnRyeS5kb2N1bWVudGF0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogZW50cnkuZGV0YWlsLFxyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IHRvQ29tcGxldGlvbkl0ZW1LaW5kKGVudHJ5LmtpbmQpLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGlmIChlbnRyeS50ZXh0RWRpdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZW0ucmFuZ2UgPSB0b1JhbmdlKGVudHJ5LnRleHRFZGl0LnJhbmdlKTtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtLmluc2VydFRleHQgPSBlbnRyeS50ZXh0RWRpdC5uZXdUZXh0O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGVudHJ5LmFkZGl0aW9uYWxUZXh0RWRpdHMpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtLmFkZGl0aW9uYWxUZXh0RWRpdHMgPSBlbnRyeS5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcCh0b1RleHRFZGl0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5pbnNlcnRUZXh0Rm9ybWF0ID09PSBscy5JbnNlcnRUZXh0Rm9ybWF0LlNuaXBwZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtLmluc2VydFRleHRSdWxlcyA9IG1vbmFjby5sYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBpc0luY29tcGxldGU6IGluZm8uaXNJbmNvbXBsZXRlLFxyXG4gICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IGl0ZW1zXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIENvbXBsZXRpb25BZGFwdGVyO1xyXG59KCkpO1xyXG5leHBvcnQgeyBDb21wbGV0aW9uQWRhcHRlciB9O1xyXG5mdW5jdGlvbiBpc01hcmt1cENvbnRlbnQodGhpbmcpIHtcclxuICAgIHJldHVybiB0aGluZyAmJiB0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnICYmIHR5cGVvZiB0aGluZy5raW5kID09PSAnc3RyaW5nJztcclxufVxyXG5mdW5jdGlvbiB0b01hcmtkb3duU3RyaW5nKGVudHJ5KSB7XHJcbiAgICBpZiAodHlwZW9mIGVudHJ5ID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHZhbHVlOiBlbnRyeVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBpZiAoaXNNYXJrdXBDb250ZW50KGVudHJ5KSkge1xyXG4gICAgICAgIGlmIChlbnRyeS5raW5kID09PSAncGxhaW50ZXh0Jykge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgdmFsdWU6IGVudHJ5LnZhbHVlLnJlcGxhY2UoL1tcXFxcYCpfe31bXFxdKCkjK1xcLS4hXS9nLCAnXFxcXCQmJylcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdmFsdWU6IGVudHJ5LnZhbHVlXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIHJldHVybiB7IHZhbHVlOiAnYGBgJyArIGVudHJ5Lmxhbmd1YWdlICsgJ1xcbicgKyBlbnRyeS52YWx1ZSArICdcXG5gYGBcXG4nIH07XHJcbn1cclxuZnVuY3Rpb24gdG9NYXJrZWRTdHJpbmdBcnJheShjb250ZW50cykge1xyXG4gICAgaWYgKCFjb250ZW50cykge1xyXG4gICAgICAgIHJldHVybiB2b2lkIDA7XHJcbiAgICB9XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShjb250ZW50cykpIHtcclxuICAgICAgICByZXR1cm4gY29udGVudHMubWFwKHRvTWFya2Rvd25TdHJpbmcpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFt0b01hcmtkb3duU3RyaW5nKGNvbnRlbnRzKV07XHJcbn1cclxuLy8gLS0tIGhvdmVyIC0tLS0tLVxyXG52YXIgSG92ZXJBZGFwdGVyID0gLyoqIEBjbGFzcyAqLyAoZnVuY3Rpb24gKCkge1xyXG4gICAgZnVuY3Rpb24gSG92ZXJBZGFwdGVyKF93b3JrZXIpIHtcclxuICAgICAgICB0aGlzLl93b3JrZXIgPSBfd29ya2VyO1xyXG4gICAgfVxyXG4gICAgSG92ZXJBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlSG92ZXIgPSBmdW5jdGlvbiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbikge1xyXG4gICAgICAgIHZhciByZXNvdXJjZSA9IG1vZGVsLnVyaTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fd29ya2VyKHJlc291cmNlKS50aGVuKGZ1bmN0aW9uICh3b3JrZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHdvcmtlci5kb0hvdmVyKHJlc291cmNlLnRvU3RyaW5nKCksIGZyb21Qb3NpdGlvbihwb3NpdGlvbikpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGluZm8pIHtcclxuICAgICAgICAgICAgaWYgKCFpbmZvKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHJhbmdlOiB0b1JhbmdlKGluZm8ucmFuZ2UpLFxyXG4gICAgICAgICAgICAgICAgY29udGVudHM6IHRvTWFya2VkU3RyaW5nQXJyYXkoaW5mby5jb250ZW50cylcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICByZXR1cm4gSG92ZXJBZGFwdGVyO1xyXG59KCkpO1xyXG5leHBvcnQgeyBIb3ZlckFkYXB0ZXIgfTtcclxuLy8gLS0tIGRlZmluaXRpb24gLS0tLS0tXHJcbmZ1bmN0aW9uIHRvTG9jYXRpb24obG9jYXRpb24pIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdXJpOiBVcmkucGFyc2UobG9jYXRpb24udXJpKSxcclxuICAgICAgICByYW5nZTogdG9SYW5nZShsb2NhdGlvbi5yYW5nZSlcclxuICAgIH07XHJcbn1cclxuLy8gLS0tIGRvY3VtZW50IHN5bWJvbHMgLS0tLS0tXHJcbmZ1bmN0aW9uIHRvU3ltYm9sS2luZChraW5kKSB7XHJcbiAgICB2YXIgbUtpbmQgPSBtb25hY28ubGFuZ3VhZ2VzLlN5bWJvbEtpbmQ7XHJcbiAgICBzd2l0Y2ggKGtpbmQpIHtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuRmlsZTogcmV0dXJuIG1LaW5kLkFycmF5O1xyXG4gICAgICAgIGNhc2UgbHMuU3ltYm9sS2luZC5Nb2R1bGU6IHJldHVybiBtS2luZC5Nb2R1bGU7XHJcbiAgICAgICAgY2FzZSBscy5TeW1ib2xLaW5kLk5hbWVzcGFjZTogcmV0dXJuIG1LaW5kLk5hbWVzcGFjZTtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuUGFja2FnZTogcmV0dXJuIG1LaW5kLlBhY2thZ2U7XHJcbiAgICAgICAgY2FzZSBscy5TeW1ib2xLaW5kLkNsYXNzOiByZXR1cm4gbUtpbmQuQ2xhc3M7XHJcbiAgICAgICAgY2FzZSBscy5TeW1ib2xLaW5kLk1ldGhvZDogcmV0dXJuIG1LaW5kLk1ldGhvZDtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuUHJvcGVydHk6IHJldHVybiBtS2luZC5Qcm9wZXJ0eTtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuRmllbGQ6IHJldHVybiBtS2luZC5GaWVsZDtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuQ29uc3RydWN0b3I6IHJldHVybiBtS2luZC5Db25zdHJ1Y3RvcjtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuRW51bTogcmV0dXJuIG1LaW5kLkVudW07XHJcbiAgICAgICAgY2FzZSBscy5TeW1ib2xLaW5kLkludGVyZmFjZTogcmV0dXJuIG1LaW5kLkludGVyZmFjZTtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuRnVuY3Rpb246IHJldHVybiBtS2luZC5GdW5jdGlvbjtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuVmFyaWFibGU6IHJldHVybiBtS2luZC5WYXJpYWJsZTtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuQ29uc3RhbnQ6IHJldHVybiBtS2luZC5Db25zdGFudDtcclxuICAgICAgICBjYXNlIGxzLlN5bWJvbEtpbmQuU3RyaW5nOiByZXR1cm4gbUtpbmQuU3RyaW5nO1xyXG4gICAgICAgIGNhc2UgbHMuU3ltYm9sS2luZC5OdW1iZXI6IHJldHVybiBtS2luZC5OdW1iZXI7XHJcbiAgICAgICAgY2FzZSBscy5TeW1ib2xLaW5kLkJvb2xlYW46IHJldHVybiBtS2luZC5Cb29sZWFuO1xyXG4gICAgICAgIGNhc2UgbHMuU3ltYm9sS2luZC5BcnJheTogcmV0dXJuIG1LaW5kLkFycmF5O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1LaW5kLkZ1bmN0aW9uO1xyXG59XHJcbnZhciBEb2N1bWVudFN5bWJvbEFkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XHJcbiAgICBmdW5jdGlvbiBEb2N1bWVudFN5bWJvbEFkYXB0ZXIoX3dvcmtlcikge1xyXG4gICAgICAgIHRoaXMuX3dvcmtlciA9IF93b3JrZXI7XHJcbiAgICB9XHJcbiAgICBEb2N1bWVudFN5bWJvbEFkYXB0ZXIucHJvdG90eXBlLnByb3ZpZGVEb2N1bWVudFN5bWJvbHMgPSBmdW5jdGlvbiAobW9kZWwsIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikgeyByZXR1cm4gd29ya2VyLmZpbmREb2N1bWVudFN5bWJvbHMocmVzb3VyY2UudG9TdHJpbmcoKSk7IH0pLnRoZW4oZnVuY3Rpb24gKGl0ZW1zKSB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbXMpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gaXRlbXMubWFwKGZ1bmN0aW9uIChpdGVtKSB7IHJldHVybiAoe1xyXG4gICAgICAgICAgICAgICAgbmFtZTogaXRlbS5uYW1lLFxyXG4gICAgICAgICAgICAgICAgZGV0YWlsOiAnJyxcclxuICAgICAgICAgICAgICAgIGNvbnRhaW5lck5hbWU6IGl0ZW0uY29udGFpbmVyTmFtZSxcclxuICAgICAgICAgICAgICAgIGtpbmQ6IHRvU3ltYm9sS2luZChpdGVtLmtpbmQpLFxyXG4gICAgICAgICAgICAgICAgcmFuZ2U6IHRvUmFuZ2UoaXRlbS5sb2NhdGlvbi5yYW5nZSksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25SYW5nZTogdG9SYW5nZShpdGVtLmxvY2F0aW9uLnJhbmdlKVxyXG4gICAgICAgICAgICB9KTsgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIERvY3VtZW50U3ltYm9sQWRhcHRlcjtcclxufSgpKTtcclxuZXhwb3J0IHsgRG9jdW1lbnRTeW1ib2xBZGFwdGVyIH07XHJcbmZ1bmN0aW9uIGZyb21Gb3JtYXR0aW5nT3B0aW9ucyhvcHRpb25zKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHRhYlNpemU6IG9wdGlvbnMudGFiU2l6ZSxcclxuICAgICAgICBpbnNlcnRTcGFjZXM6IG9wdGlvbnMuaW5zZXJ0U3BhY2VzXHJcbiAgICB9O1xyXG59XHJcbnZhciBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XHJcbiAgICBmdW5jdGlvbiBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoX3dvcmtlcikge1xyXG4gICAgICAgIHRoaXMuX3dvcmtlciA9IF93b3JrZXI7XHJcbiAgICB9XHJcbiAgICBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucHJvdG90eXBlLnByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucywgdG9rZW4pIHtcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB3b3JrZXIuZm9ybWF0KHJlc291cmNlLnRvU3RyaW5nKCksIG51bGwsIGZyb21Gb3JtYXR0aW5nT3B0aW9ucyhvcHRpb25zKSkudGhlbihmdW5jdGlvbiAoZWRpdHMpIHtcclxuICAgICAgICAgICAgICAgIGlmICghZWRpdHMgfHwgZWRpdHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRzLm1hcCh0b1RleHRFZGl0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcjtcclxufSgpKTtcclxuZXhwb3J0IHsgRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIH07XHJcbnZhciBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKF93b3JrZXIpIHtcclxuICAgICAgICB0aGlzLl93b3JrZXIgPSBfd29ya2VyO1xyXG4gICAgfVxyXG4gICAgRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucHJvdG90eXBlLnByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzID0gZnVuY3Rpb24gKG1vZGVsLCByYW5nZSwgb3B0aW9ucywgdG9rZW4pIHtcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB3b3JrZXIuZm9ybWF0KHJlc291cmNlLnRvU3RyaW5nKCksIGZyb21SYW5nZShyYW5nZSksIGZyb21Gb3JtYXR0aW5nT3B0aW9ucyhvcHRpb25zKSkudGhlbihmdW5jdGlvbiAoZWRpdHMpIHtcclxuICAgICAgICAgICAgICAgIGlmICghZWRpdHMgfHwgZWRpdHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRzLm1hcCh0b1RleHRFZGl0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyO1xyXG59KCkpO1xyXG5leHBvcnQgeyBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB9O1xyXG52YXIgRG9jdW1lbnRDb2xvckFkYXB0ZXIgPSAvKiogQGNsYXNzICovIChmdW5jdGlvbiAoKSB7XHJcbiAgICBmdW5jdGlvbiBEb2N1bWVudENvbG9yQWRhcHRlcihfd29ya2VyKSB7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyID0gX3dvcmtlcjtcclxuICAgIH1cclxuICAgIERvY3VtZW50Q29sb3JBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlRG9jdW1lbnRDb2xvcnMgPSBmdW5jdGlvbiAobW9kZWwsIHRva2VuKSB7XHJcbiAgICAgICAgdmFyIHJlc291cmNlID0gbW9kZWwudXJpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl93b3JrZXIocmVzb3VyY2UpLnRoZW4oZnVuY3Rpb24gKHdvcmtlcikgeyByZXR1cm4gd29ya2VyLmZpbmREb2N1bWVudENvbG9ycyhyZXNvdXJjZS50b1N0cmluZygpKTsgfSkudGhlbihmdW5jdGlvbiAoaW5mb3MpIHtcclxuICAgICAgICAgICAgaWYgKCFpbmZvcykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBpbmZvcy5tYXAoZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuICh7XHJcbiAgICAgICAgICAgICAgICBjb2xvcjogaXRlbS5jb2xvcixcclxuICAgICAgICAgICAgICAgIHJhbmdlOiB0b1JhbmdlKGl0ZW0ucmFuZ2UpXHJcbiAgICAgICAgICAgIH0pOyB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBEb2N1bWVudENvbG9yQWRhcHRlci5wcm90b3R5cGUucHJvdmlkZUNvbG9yUHJlc2VudGF0aW9ucyA9IGZ1bmN0aW9uIChtb2RlbCwgaW5mbywgdG9rZW4pIHtcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7IHJldHVybiB3b3JrZXIuZ2V0Q29sb3JQcmVzZW50YXRpb25zKHJlc291cmNlLnRvU3RyaW5nKCksIGluZm8uY29sb3IsIGZyb21SYW5nZShpbmZvLnJhbmdlKSk7IH0pLnRoZW4oZnVuY3Rpb24gKHByZXNlbnRhdGlvbnMpIHtcclxuICAgICAgICAgICAgaWYgKCFwcmVzZW50YXRpb25zKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHByZXNlbnRhdGlvbnMubWFwKGZ1bmN0aW9uIChwcmVzZW50YXRpb24pIHtcclxuICAgICAgICAgICAgICAgIHZhciBpdGVtID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiBwcmVzZW50YXRpb24ubGFiZWwsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHByZXNlbnRhdGlvbi50ZXh0RWRpdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZW0udGV4dEVkaXQgPSB0b1RleHRFZGl0KHByZXNlbnRhdGlvbi50ZXh0RWRpdCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAocHJlc2VudGF0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtLmFkZGl0aW9uYWxUZXh0RWRpdHMgPSBwcmVzZW50YXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAodG9UZXh0RWRpdCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIERvY3VtZW50Q29sb3JBZGFwdGVyO1xyXG59KCkpO1xyXG5leHBvcnQgeyBEb2N1bWVudENvbG9yQWRhcHRlciB9O1xyXG52YXIgRm9sZGluZ1JhbmdlQWRhcHRlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIEZvbGRpbmdSYW5nZUFkYXB0ZXIoX3dvcmtlcikge1xyXG4gICAgICAgIHRoaXMuX3dvcmtlciA9IF93b3JrZXI7XHJcbiAgICB9XHJcbiAgICBGb2xkaW5nUmFuZ2VBZGFwdGVyLnByb3RvdHlwZS5wcm92aWRlRm9sZGluZ1JhbmdlcyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGV4dCwgdG9rZW4pIHtcclxuICAgICAgICB2YXIgcmVzb3VyY2UgPSBtb2RlbC51cmk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmtlcihyZXNvdXJjZSkudGhlbihmdW5jdGlvbiAod29ya2VyKSB7IHJldHVybiB3b3JrZXIucHJvdmlkZUZvbGRpbmdSYW5nZXMocmVzb3VyY2UudG9TdHJpbmcoKSwgY29udGV4dCk7IH0pLnRoZW4oZnVuY3Rpb24gKHJhbmdlcykge1xyXG4gICAgICAgICAgICBpZiAoIXJhbmdlcykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiByYW5nZXMubWFwKGZ1bmN0aW9uIChyYW5nZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgICAgICAgICBzdGFydDogcmFuZ2Uuc3RhcnRMaW5lICsgMSxcclxuICAgICAgICAgICAgICAgICAgICBlbmQ6IHJhbmdlLmVuZExpbmUgKyAxXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiByYW5nZS5raW5kICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5raW5kID0gdG9Gb2xkaW5nUmFuZ2VLaW5kKHJhbmdlLmtpbmQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIEZvbGRpbmdSYW5nZUFkYXB0ZXI7XHJcbn0oKSk7XHJcbmV4cG9ydCB7IEZvbGRpbmdSYW5nZUFkYXB0ZXIgfTtcclxuZnVuY3Rpb24gdG9Gb2xkaW5nUmFuZ2VLaW5kKGtpbmQpIHtcclxuICAgIHN3aXRjaCAoa2luZCkge1xyXG4gICAgICAgIGNhc2UgbHMuRm9sZGluZ1JhbmdlS2luZC5Db21tZW50OiByZXR1cm4gbW9uYWNvLmxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQ7XHJcbiAgICAgICAgY2FzZSBscy5Gb2xkaW5nUmFuZ2VLaW5kLkltcG9ydHM6IHJldHVybiBtb25hY28ubGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQuSW1wb3J0cztcclxuICAgICAgICBjYXNlIGxzLkZvbGRpbmdSYW5nZUtpbmQuUmVnaW9uOiByZXR1cm4gbW9uYWNvLmxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLlJlZ2lvbjtcclxuICAgIH1cclxuICAgIHJldHVybiB2b2lkIDA7XHJcbn1cclxuIiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbid1c2Ugc3RyaWN0JztcclxuaW1wb3J0ICogYXMganNvbiBmcm9tICcuL19kZXBzL2pzb25jLXBhcnNlci9tYWluLmpzJztcclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRva2VuaXphdGlvblN1cHBvcnQoc3VwcG9ydENvbW1lbnRzKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkgeyByZXR1cm4gbmV3IEpTT05TdGF0ZShudWxsLCBudWxsLCBmYWxzZSk7IH0sXHJcbiAgICAgICAgdG9rZW5pemU6IGZ1bmN0aW9uIChsaW5lLCBzdGF0ZSwgb2Zmc2V0RGVsdGEsIHN0b3BBdE9mZnNldCkgeyByZXR1cm4gdG9rZW5pemUoc3VwcG9ydENvbW1lbnRzLCBsaW5lLCBzdGF0ZSwgb2Zmc2V0RGVsdGEsIHN0b3BBdE9mZnNldCk7IH1cclxuICAgIH07XHJcbn1cclxuZXhwb3J0IHZhciBUT0tFTl9ERUxJTV9PQkpFQ1QgPSAnZGVsaW1pdGVyLmJyYWNrZXQuanNvbic7XHJcbmV4cG9ydCB2YXIgVE9LRU5fREVMSU1fQVJSQVkgPSAnZGVsaW1pdGVyLmFycmF5Lmpzb24nO1xyXG5leHBvcnQgdmFyIFRPS0VOX0RFTElNX0NPTE9OID0gJ2RlbGltaXRlci5jb2xvbi5qc29uJztcclxuZXhwb3J0IHZhciBUT0tFTl9ERUxJTV9DT01NQSA9ICdkZWxpbWl0ZXIuY29tbWEuanNvbic7XHJcbmV4cG9ydCB2YXIgVE9LRU5fVkFMVUVfQk9PTEVBTiA9ICdrZXl3b3JkLmpzb24nO1xyXG5leHBvcnQgdmFyIFRPS0VOX1ZBTFVFX05VTEwgPSAna2V5d29yZC5qc29uJztcclxuZXhwb3J0IHZhciBUT0tFTl9WQUxVRV9TVFJJTkcgPSAnc3RyaW5nLnZhbHVlLmpzb24nO1xyXG5leHBvcnQgdmFyIFRPS0VOX1ZBTFVFX05VTUJFUiA9ICdudW1iZXIuanNvbic7XHJcbmV4cG9ydCB2YXIgVE9LRU5fUFJPUEVSVFlfTkFNRSA9ICdzdHJpbmcua2V5Lmpzb24nO1xyXG5leHBvcnQgdmFyIFRPS0VOX0NPTU1FTlRfQkxPQ0sgPSAnY29tbWVudC5ibG9jay5qc29uJztcclxuZXhwb3J0IHZhciBUT0tFTl9DT01NRU5UX0xJTkUgPSAnY29tbWVudC5saW5lLmpzb24nO1xyXG52YXIgSlNPTlN0YXRlID0gLyoqIEBjbGFzcyAqLyAoZnVuY3Rpb24gKCkge1xyXG4gICAgZnVuY3Rpb24gSlNPTlN0YXRlKHN0YXRlLCBzY2FuRXJyb3IsIGxhc3RXYXNDb2xvbikge1xyXG4gICAgICAgIHRoaXMuX3N0YXRlID0gc3RhdGU7XHJcbiAgICAgICAgdGhpcy5zY2FuRXJyb3IgPSBzY2FuRXJyb3I7XHJcbiAgICAgICAgdGhpcy5sYXN0V2FzQ29sb24gPSBsYXN0V2FzQ29sb247XHJcbiAgICB9XHJcbiAgICBKU09OU3RhdGUucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSlNPTlN0YXRlKHRoaXMuX3N0YXRlLCB0aGlzLnNjYW5FcnJvciwgdGhpcy5sYXN0V2FzQ29sb24pO1xyXG4gICAgfTtcclxuICAgIEpTT05TdGF0ZS5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKG90aGVyKSB7XHJcbiAgICAgICAgaWYgKG90aGVyID09PSB0aGlzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIW90aGVyIHx8ICEob3RoZXIgaW5zdGFuY2VvZiBKU09OU3RhdGUpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NhbkVycm9yID09PSBvdGhlci5zY2FuRXJyb3IgJiZcclxuICAgICAgICAgICAgdGhpcy5sYXN0V2FzQ29sb24gPT09IG90aGVyLmxhc3RXYXNDb2xvbjtcclxuICAgIH07XHJcbiAgICBKU09OU3RhdGUucHJvdG90eXBlLmdldFN0YXRlRGF0YSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGU7XHJcbiAgICB9O1xyXG4gICAgSlNPTlN0YXRlLnByb3RvdHlwZS5zZXRTdGF0ZURhdGEgPSBmdW5jdGlvbiAoc3RhdGUpIHtcclxuICAgICAgICB0aGlzLl9zdGF0ZSA9IHN0YXRlO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBKU09OU3RhdGU7XHJcbn0oKSk7XHJcbmZ1bmN0aW9uIHRva2VuaXplKGNvbW1lbnRzLCBsaW5lLCBzdGF0ZSwgb2Zmc2V0RGVsdGEsIHN0b3BBdE9mZnNldCkge1xyXG4gICAgaWYgKG9mZnNldERlbHRhID09PSB2b2lkIDApIHsgb2Zmc2V0RGVsdGEgPSAwOyB9XHJcbiAgICAvLyBoYW5kbGUgbXVsdGlsaW5lIHN0cmluZ3MgYW5kIGJsb2NrIGNvbW1lbnRzXHJcbiAgICB2YXIgbnVtYmVyT2ZJbnNlcnRlZENoYXJhY3RlcnMgPSAwLCBhZGp1c3RPZmZzZXQgPSBmYWxzZTtcclxuICAgIHN3aXRjaCAoc3RhdGUuc2NhbkVycm9yKSB7XHJcbiAgICAgICAgY2FzZSAyIC8qIFVuZXhwZWN0ZWRFbmRPZlN0cmluZyAqLzpcclxuICAgICAgICAgICAgbGluZSA9ICdcIicgKyBsaW5lO1xyXG4gICAgICAgICAgICBudW1iZXJPZkluc2VydGVkQ2hhcmFjdGVycyA9IDE7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMSAvKiBVbmV4cGVjdGVkRW5kT2ZDb21tZW50ICovOlxyXG4gICAgICAgICAgICBsaW5lID0gJy8qJyArIGxpbmU7XHJcbiAgICAgICAgICAgIG51bWJlck9mSW5zZXJ0ZWRDaGFyYWN0ZXJzID0gMjtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICB2YXIgc2Nhbm5lciA9IGpzb24uY3JlYXRlU2Nhbm5lcihsaW5lKSwga2luZCwgcmV0LCBsYXN0V2FzQ29sb24gPSBzdGF0ZS5sYXN0V2FzQ29sb247XHJcbiAgICByZXQgPSB7XHJcbiAgICAgICAgdG9rZW5zOiBbXSxcclxuICAgICAgICBlbmRTdGF0ZTogc3RhdGUuY2xvbmUoKVxyXG4gICAgfTtcclxuICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgdmFyIG9mZnNldCA9IG9mZnNldERlbHRhICsgc2Nhbm5lci5nZXRQb3NpdGlvbigpLCB0eXBlID0gJyc7XHJcbiAgICAgICAga2luZCA9IHNjYW5uZXIuc2NhbigpO1xyXG4gICAgICAgIGlmIChraW5kID09PSAxNyAvKiBFT0YgKi8pIHtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENoZWNrIHRoYXQgdGhlIHNjYW5uZXIgaGFzIGFkdmFuY2VkXHJcbiAgICAgICAgaWYgKG9mZnNldCA9PT0gb2Zmc2V0RGVsdGEgKyBzY2FubmVyLmdldFBvc2l0aW9uKCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTY2FubmVyIGRpZCBub3QgYWR2YW5jZSwgbmV4dCAzIGNoYXJhY3RlcnMgYXJlOiAnICsgbGluZS5zdWJzdHIoc2Nhbm5lci5nZXRQb3NpdGlvbigpLCAzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEluIGNhc2Ugd2UgaW5zZXJ0ZWQgLyogb3IgXCIgY2hhcmFjdGVyLCB3ZSBuZWVkIHRvXHJcbiAgICAgICAgLy8gYWRqdXN0IHRoZSBvZmZzZXQgb2YgYWxsIHRva2VucyAoZXhjZXB0IHRoZSBmaXJzdClcclxuICAgICAgICBpZiAoYWRqdXN0T2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIG9mZnNldCAtPSBudW1iZXJPZkluc2VydGVkQ2hhcmFjdGVycztcclxuICAgICAgICB9XHJcbiAgICAgICAgYWRqdXN0T2Zmc2V0ID0gbnVtYmVyT2ZJbnNlcnRlZENoYXJhY3RlcnMgPiAwO1xyXG4gICAgICAgIC8vIGJyYWNrZXRzIGFuZCB0eXBlXHJcbiAgICAgICAgc3dpdGNoIChraW5kKSB7XHJcbiAgICAgICAgICAgIGNhc2UgMSAvKiBPcGVuQnJhY2VUb2tlbiAqLzpcclxuICAgICAgICAgICAgICAgIHR5cGUgPSBUT0tFTl9ERUxJTV9PQkpFQ1Q7XHJcbiAgICAgICAgICAgICAgICBsYXN0V2FzQ29sb24gPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDIgLyogQ2xvc2VCcmFjZVRva2VuICovOlxyXG4gICAgICAgICAgICAgICAgdHlwZSA9IFRPS0VOX0RFTElNX09CSkVDVDtcclxuICAgICAgICAgICAgICAgIGxhc3RXYXNDb2xvbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMyAvKiBPcGVuQnJhY2tldFRva2VuICovOlxyXG4gICAgICAgICAgICAgICAgdHlwZSA9IFRPS0VOX0RFTElNX0FSUkFZO1xyXG4gICAgICAgICAgICAgICAgbGFzdFdhc0NvbG9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA0IC8qIENsb3NlQnJhY2tldFRva2VuICovOlxyXG4gICAgICAgICAgICAgICAgdHlwZSA9IFRPS0VOX0RFTElNX0FSUkFZO1xyXG4gICAgICAgICAgICAgICAgbGFzdFdhc0NvbG9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA2IC8qIENvbG9uVG9rZW4gKi86XHJcbiAgICAgICAgICAgICAgICB0eXBlID0gVE9LRU5fREVMSU1fQ09MT047XHJcbiAgICAgICAgICAgICAgICBsYXN0V2FzQ29sb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgNSAvKiBDb21tYVRva2VuICovOlxyXG4gICAgICAgICAgICAgICAgdHlwZSA9IFRPS0VOX0RFTElNX0NPTU1BO1xyXG4gICAgICAgICAgICAgICAgbGFzdFdhc0NvbG9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA4IC8qIFRydWVLZXl3b3JkICovOlxyXG4gICAgICAgICAgICBjYXNlIDkgLyogRmFsc2VLZXl3b3JkICovOlxyXG4gICAgICAgICAgICAgICAgdHlwZSA9IFRPS0VOX1ZBTFVFX0JPT0xFQU47XHJcbiAgICAgICAgICAgICAgICBsYXN0V2FzQ29sb24gPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDcgLyogTnVsbEtleXdvcmQgKi86XHJcbiAgICAgICAgICAgICAgICB0eXBlID0gVE9LRU5fVkFMVUVfTlVMTDtcclxuICAgICAgICAgICAgICAgIGxhc3RXYXNDb2xvbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTAgLyogU3RyaW5nTGl0ZXJhbCAqLzpcclxuICAgICAgICAgICAgICAgIHR5cGUgPSBsYXN0V2FzQ29sb24gPyBUT0tFTl9WQUxVRV9TVFJJTkcgOiBUT0tFTl9QUk9QRVJUWV9OQU1FO1xyXG4gICAgICAgICAgICAgICAgbGFzdFdhc0NvbG9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxMSAvKiBOdW1lcmljTGl0ZXJhbCAqLzpcclxuICAgICAgICAgICAgICAgIHR5cGUgPSBUT0tFTl9WQUxVRV9OVU1CRVI7XHJcbiAgICAgICAgICAgICAgICBsYXN0V2FzQ29sb24gPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBjb21tZW50cywgaWZmIGVuYWJsZWRcclxuICAgICAgICBpZiAoY29tbWVudHMpIHtcclxuICAgICAgICAgICAgc3dpdGNoIChraW5kKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDEyIC8qIExpbmVDb21tZW50VHJpdmlhICovOlxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSBUT0tFTl9DT01NRU5UX0xJTkU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDEzIC8qIEJsb2NrQ29tbWVudFRyaXZpYSAqLzpcclxuICAgICAgICAgICAgICAgICAgICB0eXBlID0gVE9LRU5fQ09NTUVOVF9CTE9DSztcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXQuZW5kU3RhdGUgPSBuZXcgSlNPTlN0YXRlKHN0YXRlLmdldFN0YXRlRGF0YSgpLCBzY2FubmVyLmdldFRva2VuRXJyb3IoKSwgbGFzdFdhc0NvbG9uKTtcclxuICAgICAgICByZXQudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICBzdGFydEluZGV4OiBvZmZzZXQsXHJcbiAgICAgICAgICAgIHNjb3BlczogdHlwZVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJldDtcclxufVxyXG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG52YXIgU1RPUF9XSEVOX0lETEVfRk9SID0gMiAqIDYwICogMTAwMDsgLy8gMm1pblxyXG52YXIgV29ya2VyTWFuYWdlciA9IC8qKiBAY2xhc3MgKi8gKGZ1bmN0aW9uICgpIHtcclxuICAgIGZ1bmN0aW9uIFdvcmtlck1hbmFnZXIoZGVmYXVsdHMpIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xyXG4gICAgICAgIHRoaXMuX2RlZmF1bHRzID0gZGVmYXVsdHM7XHJcbiAgICAgICAgdGhpcy5fd29ya2VyID0gbnVsbDtcclxuICAgICAgICB0aGlzLl9pZGxlQ2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgcmV0dXJuIF90aGlzLl9jaGVja0lmSWRsZSgpOyB9LCAzMCAqIDEwMDApO1xyXG4gICAgICAgIHRoaXMuX2xhc3RVc2VkVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5fY29uZmlnQ2hhbmdlTGlzdGVuZXIgPSB0aGlzLl9kZWZhdWx0cy5vbkRpZENoYW5nZShmdW5jdGlvbiAoKSB7IHJldHVybiBfdGhpcy5fc3RvcFdvcmtlcigpOyB9KTtcclxuICAgIH1cclxuICAgIFdvcmtlck1hbmFnZXIucHJvdG90eXBlLl9zdG9wV29ya2VyID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGlmICh0aGlzLl93b3JrZXIpIHtcclxuICAgICAgICAgICAgdGhpcy5fd29ya2VyLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgdGhpcy5fd29ya2VyID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5fY2xpZW50ID0gbnVsbDtcclxuICAgIH07XHJcbiAgICBXb3JrZXJNYW5hZ2VyLnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5faWRsZUNoZWNrSW50ZXJ2YWwpO1xyXG4gICAgICAgIHRoaXMuX2NvbmZpZ0NoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcclxuICAgICAgICB0aGlzLl9zdG9wV29ya2VyKCk7XHJcbiAgICB9O1xyXG4gICAgV29ya2VyTWFuYWdlci5wcm90b3R5cGUuX2NoZWNrSWZJZGxlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5fd29ya2VyKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHRpbWVQYXNzZWRTaW5jZUxhc3RVc2VkID0gRGF0ZS5ub3coKSAtIHRoaXMuX2xhc3RVc2VkVGltZTtcclxuICAgICAgICBpZiAodGltZVBhc3NlZFNpbmNlTGFzdFVzZWQgPiBTVE9QX1dIRU5fSURMRV9GT1IpIHtcclxuICAgICAgICAgICAgdGhpcy5fc3RvcFdvcmtlcigpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBXb3JrZXJNYW5hZ2VyLnByb3RvdHlwZS5fZ2V0Q2xpZW50ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHRoaXMuX2xhc3RVc2VkVGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcclxuICAgICAgICAgICAgdGhpcy5fd29ya2VyID0gbW9uYWNvLmVkaXRvci5jcmVhdGVXZWJXb3JrZXIoe1xyXG4gICAgICAgICAgICAgICAgLy8gbW9kdWxlIHRoYXQgZXhwb3J0cyB0aGUgY3JlYXRlKCkgbWV0aG9kIGFuZCByZXR1cm5zIGEgYEpTT05Xb3JrZXJgIGluc3RhbmNlXHJcbiAgICAgICAgICAgICAgICBtb2R1bGVJZDogJ3ZzL2xhbmd1YWdlL2pzb24vanNvbldvcmtlcicsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogdGhpcy5fZGVmYXVsdHMubGFuZ3VhZ2VJZCxcclxuICAgICAgICAgICAgICAgIC8vIHBhc3NlZCBpbiB0byB0aGUgY3JlYXRlKCkgbWV0aG9kXHJcbiAgICAgICAgICAgICAgICBjcmVhdGVEYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGFuZ3VhZ2VTZXR0aW5nczogdGhpcy5fZGVmYXVsdHMuZGlhZ25vc3RpY3NPcHRpb25zLFxyXG4gICAgICAgICAgICAgICAgICAgIGxhbmd1YWdlSWQ6IHRoaXMuX2RlZmF1bHRzLmxhbmd1YWdlSWQsXHJcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlU2NoZW1hUmVxdWVzdDogdGhpcy5fZGVmYXVsdHMuZGlhZ25vc3RpY3NPcHRpb25zLmVuYWJsZVNjaGVtYVJlcXVlc3RcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuX2NsaWVudCA9IHRoaXMuX3dvcmtlci5nZXRQcm94eSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50O1xyXG4gICAgfTtcclxuICAgIFdvcmtlck1hbmFnZXIucHJvdG90eXBlLmdldExhbmd1YWdlU2VydmljZVdvcmtlciA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xyXG4gICAgICAgIHZhciByZXNvdXJjZXMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBfaSA9IDA7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xyXG4gICAgICAgICAgICByZXNvdXJjZXNbX2ldID0gYXJndW1lbnRzW19pXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIF9jbGllbnQ7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldENsaWVudCgpLnRoZW4oZnVuY3Rpb24gKGNsaWVudCkge1xyXG4gICAgICAgICAgICBfY2xpZW50ID0gY2xpZW50O1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKF8pIHtcclxuICAgICAgICAgICAgcmV0dXJuIF90aGlzLl93b3JrZXIud2l0aFN5bmNlZFJlc291cmNlcyhyZXNvdXJjZXMpO1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKF8pIHsgcmV0dXJuIF9jbGllbnQ7IH0pO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBXb3JrZXJNYW5hZ2VyO1xyXG59KCkpO1xyXG5leHBvcnQgeyBXb3JrZXJNYW5hZ2VyIH07XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=