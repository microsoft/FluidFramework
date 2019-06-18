/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var conversionAgent = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    var _inputContentControlId = null;
    var _feetContentControlId = null;
    var _inchesContentControlId = null;

    self.invokeAgent = function(event) {
        Word.run(setupConversion);
    }

    ///////////////////////////////////////// setup conversion
    function setupConversion(context) {
        var selectionRange = context.document.getSelection();
        selectionRange.insertText(
            "To convert ", 
            Word.InsertLocation.end);

        var inputContentControl = insertContentControl(selectionRange);        
            
        selectionRange.insertText(
            " inches to feet and inches, divide inches by 12. The result is ", 
            Word.InsertLocation.end);

        var feetContentControl = insertContentControl(selectionRange);        
            
        selectionRange.insertText(
            " feet (quotient) and ", 
            Word.InsertLocation.end);

        var inchesContentControl = insertContentControl(selectionRange);        
            
        selectionRange.insertText(
            " inches (remainder).", 
            Word.InsertLocation.end);

        context.load(inputContentControl, '');
        context.load(feetContentControl, '');
        context.load(inchesContentControl, '');
        context.sync().then(function() {
            _inputContentControlId = inputContentControl.id;
            _feetContentControlId = feetContentControl.id;
            _inchesContentControlId = inchesContentControl.id;

            setInterval(worker, 200);
        });
    }

    ///////////////////////////////////////// insertContentControl
    function insertContentControl(range) {
        var contentControlRange = range.insertText(" ", Word.InsertLocation.end);
        var contentControl = contentControlRange.insertContentControl();

        contentControl.appearance = 'boundingBox';
        contentControl.placeholderText = '____';
        contentControl.color = 'orange';

        return contentControl;         
    }

    //////////////////////////////////////////////////////// worker
    function worker() {
        Word.run(updateValues);            
    }
    
    var _lastValue = null;
    //////////////////////////////////////////////////////// updateValues
    function updateValues(context) {

        var inputContentControl = context.document.contentControls.getById(_inputContentControlId);
        var feetContentControl = context.document.contentControls.getById(_feetContentControlId);
        var inchesContentControl = context.document.contentControls.getById(_inchesContentControlId);

        context.load(inputContentControl, 'text');
        context.load(feetContentControl, '');
        context.load(inchesContentControl, '');
        context.sync().then(function() {
            var value = inputContentControl.text;

            if (isNaN(value)) {
                if (_lastValue != null) {
                    feetContentControl.clear();
                    inchesContentControl.clear();
                    context.sync();
                }
                _lastValue = null;
                return;
            }

            if (value == _lastValue) {
                return;
            }

            _lastValue = value;

            var numeric = value * 1.0;

            var quotient = Math.floor(numeric /12);
            var rem = numeric % 12;                

            feetContentControl.insertText(quotient + "", Word.InsertLocation.replace);
            inchesContentControl.insertText(rem + "", Word.InsertLocation.replace);

            context.sync();
        });
    }

    return self;
})();

