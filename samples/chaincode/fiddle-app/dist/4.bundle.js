(window["webpackJsonp_name_"] = window["webpackJsonp_name_"] || []).push([[4],{

/***/ "./node_modules/monaco-editor/esm/vs/basic-languages/csp/csp.js":
/*!**********************************************************************!*\
  !*** ./node_modules/monaco-editor/esm/vs/basic-languages/csp/csp.js ***!
  \**********************************************************************/
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
    brackets: [],
    autoClosingPairs: [],
    surroundingPairs: []
};
var language = {
    // Set defaultToken to invalid to see what you do not tokenize yet
    // defaultToken: 'invalid',
    keywords: [],
    typeKeywords: [],
    tokenPostfix: '.csp',
    operators: [],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
        root: [
            [/child-src/, 'string.quote'],
            [/connect-src/, 'string.quote'],
            [/default-src/, 'string.quote'],
            [/font-src/, 'string.quote'],
            [/frame-src/, 'string.quote'],
            [/img-src/, 'string.quote'],
            [/manifest-src/, 'string.quote'],
            [/media-src/, 'string.quote'],
            [/object-src/, 'string.quote'],
            [/script-src/, 'string.quote'],
            [/style-src/, 'string.quote'],
            [/worker-src/, 'string.quote'],
            [/base-uri/, 'string.quote'],
            [/plugin-types/, 'string.quote'],
            [/sandbox/, 'string.quote'],
            [/disown-opener/, 'string.quote'],
            [/form-action/, 'string.quote'],
            [/frame-ancestors/, 'string.quote'],
            [/report-uri/, 'string.quote'],
            [/report-to/, 'string.quote'],
            [/upgrade-insecure-requests/, 'string.quote'],
            [/block-all-mixed-content/, 'string.quote'],
            [/require-sri-for/, 'string.quote'],
            [/reflected-xss/, 'string.quote'],
            [/referrer/, 'string.quote'],
            [/policy-uri/, 'string.quote'],
            [/'self'/, 'string.quote'],
            [/'unsafe-inline'/, 'string.quote'],
            [/'unsafe-eval'/, 'string.quote'],
            [/'strict-dynamic'/, 'string.quote'],
            [/'unsafe-hashed-attributes'/, 'string.quote']
        ]
    }
};


/***/ })

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jaGFpbmNvZGUvY291bnRlci8uL25vZGVfbW9kdWxlcy9tb25hY28tZWRpdG9yL2VzbS92cy9iYXNpYy1sYW5ndWFnZXMvY3NwL2NzcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDYTtBQUNOO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsOENBQThDLElBQUksY0FBYyxFQUFFLGNBQWMsRUFBRTtBQUNsRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiNC5idW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5leHBvcnQgdmFyIGNvbmYgPSB7XHJcbiAgICBicmFja2V0czogW10sXHJcbiAgICBhdXRvQ2xvc2luZ1BhaXJzOiBbXSxcclxuICAgIHN1cnJvdW5kaW5nUGFpcnM6IFtdXHJcbn07XHJcbmV4cG9ydCB2YXIgbGFuZ3VhZ2UgPSB7XHJcbiAgICAvLyBTZXQgZGVmYXVsdFRva2VuIHRvIGludmFsaWQgdG8gc2VlIHdoYXQgeW91IGRvIG5vdCB0b2tlbml6ZSB5ZXRcclxuICAgIC8vIGRlZmF1bHRUb2tlbjogJ2ludmFsaWQnLFxyXG4gICAga2V5d29yZHM6IFtdLFxyXG4gICAgdHlwZUtleXdvcmRzOiBbXSxcclxuICAgIHRva2VuUG9zdGZpeDogJy5jc3AnLFxyXG4gICAgb3BlcmF0b3JzOiBbXSxcclxuICAgIHN5bWJvbHM6IC9bPT48IX4/OiZ8K1xcLSpcXC9cXF4lXSsvLFxyXG4gICAgZXNjYXBlczogL1xcXFwoPzpbYWJmbnJ0dlxcXFxcIiddfHhbMC05QS1GYS1mXXsxLDR9fHVbMC05QS1GYS1mXXs0fXxVWzAtOUEtRmEtZl17OH0pLyxcclxuICAgIHRva2VuaXplcjoge1xyXG4gICAgICAgIHJvb3Q6IFtcclxuICAgICAgICAgICAgWy9jaGlsZC1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvY29ubmVjdC1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvZGVmYXVsdC1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvZm9udC1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvZnJhbWUtc3JjLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbL2ltZy1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvbWFuaWZlc3Qtc3JjLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbL21lZGlhLXNyYy8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9vYmplY3Qtc3JjLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbL3NjcmlwdC1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvc3R5bGUtc3JjLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbL3dvcmtlci1zcmMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvYmFzZS11cmkvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvcGx1Z2luLXR5cGVzLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbL3NhbmRib3gvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvZGlzb3duLW9wZW5lci8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9mb3JtLWFjdGlvbi8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9mcmFtZS1hbmNlc3RvcnMvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvcmVwb3J0LXVyaS8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9yZXBvcnQtdG8vLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvdXBncmFkZS1pbnNlY3VyZS1yZXF1ZXN0cy8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9ibG9jay1hbGwtbWl4ZWQtY29udGVudC8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9yZXF1aXJlLXNyaS1mb3IvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvcmVmbGVjdGVkLXhzcy8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9yZWZlcnJlci8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy9wb2xpY3ktdXJpLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbLydzZWxmJy8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy8ndW5zYWZlLWlubGluZScvLCAnc3RyaW5nLnF1b3RlJ10sXHJcbiAgICAgICAgICAgIFsvJ3Vuc2FmZS1ldmFsJy8sICdzdHJpbmcucXVvdGUnXSxcclxuICAgICAgICAgICAgWy8nc3RyaWN0LWR5bmFtaWMnLywgJ3N0cmluZy5xdW90ZSddLFxyXG4gICAgICAgICAgICBbLyd1bnNhZmUtaGFzaGVkLWF0dHJpYnV0ZXMnLywgJ3N0cmluZy5xdW90ZSddXHJcbiAgICAgICAgXVxyXG4gICAgfVxyXG59O1xyXG4iXSwic291cmNlUm9vdCI6IiJ9