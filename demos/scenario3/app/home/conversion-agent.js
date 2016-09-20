
var conversionAgent = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    self.invokeAgent = function(event) {
        Word.run(setupConversion);
        event.Completed();
    }

    ///////////////////////////////////////// setup conversion
    function setupConversion(context) {
        var selectionRange = context.document.getSelection();
        selectionRange.insertText(
            "To convert ", 
            Word.InsertLocation.end);

        var inputContentControl = insertContentControl(selectionRange, true /*isEditable*/);        
            
        selectionRange.insertText(
            " inches to feet and inches, divide inches by 12. The result is ", 
            Word.InsertLocation.end);

        var feetContentControl = insertContentControl(selectionRange, false /*isEditable*/);        
            
        selectionRange.insertText(
            " feet (quotient) and ", 
            Word.InsertLocation.end);

        var inchesContentControl = insertContentControl(selectionRange, false /*isEditable*/);        
            
        selectionRange.insertText(
            " inches (remainder).", 
            Word.InsertLocation.end);
    }

    ///////////////////////////////////////// insertContentControl
    function insertContentControl(range, isEditable) {
        var contentControlRange = range.insertText(" ", Word.InsertLocation.end);
        var contentControl = contentControlRange.insertContentControl();

        contentControl.appearance = 'boundingBox';
        contentControl.placeholderText = '____';
        contentControl.color = 'orange';
        contentControl.cannotDelete = true;
        if (!isEditable) {
            contentControl.cannotEdit = true;
        }

        return contentControl;         
    }    

    return self;
})();

