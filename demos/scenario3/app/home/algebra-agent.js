
var algebraAgent = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    var counter = 0;

    //////////////////////////////////////////////////////// validateContentWithService
    // Send the text to the service to be validated.
    function validateContentWithService(text) {
        if (text.length == 0)
            return null;

        app.showNotification("Monitoring", text);
        
        if (text.search("3𝑥=8") != -1) {
            return " √";
        }

        if (text.search("𝑥=\,8-3\.") != -1) {
            return " √";
        }

        return null;
    }

    //////////////////////////////////////////////////////// insertContentControl
    // Insert a content control at the end of paragraph, and put the content of 
    // checkMark in it
    function insertContentControl(paragraph, checkMark) {
        var insertedRange = paragraph.insertText(checkMark, Word.InsertLocation.end);
        insertedRange.font.color = 'green';
        var contentControl = insertedRange.insertContentControl();
        contentControl.appearance = 'hidden';        
    }

    //////////////////////////////////////////////////////// reactToParagraphText
    // Get the text of the paragrph and see if we wish to react to it. 
    function reactToParagraphText(paragraph, contentControls, context) {
        var paragraphText = paragraph.text; 
        var originalSelection = context.document.getSelection();
        var checkMark = validateContentWithService(paragraphText);
        var haveContentControl = contentControls.items.length > 0;
        var needContentcontrol = checkMark != null;  

        if (needContentcontrol) {
            if (!haveContentControl) {
                insertContentControl(paragraph, checkMark);
            }
        } else {
            if (haveContentControl) {
            contentControls.items[0].delete(false /* keepContent*/);
            }
        }

        originalSelection.select();
        context.sync();
    }

    //////////////////////////////////////////////////////// reactToParagraph
    // Retrieves the content controls within the paragraph (to see if we already have 
    // a check-mark here) and call into the next layer
    function reactToParagraph(paragraph, context) {
        var contentControls = paragraph.contentControls;
        context.load(contentControls, 'text');
        context.sync().then(function () {
            reactToParagraphText(paragraph, contentControls, context);
            }
        );
    }

    //////////////////////////////////////////////////////// reactToSelectionParagraphs
    // Currently we only care about the first paragraph in the selection (usually just an IP)
    function reactToSelectionParagraphs(paragraphs, context) {
        var paragraph = paragraphs.items[0];
        context.load(paragraph, 'text');
        context.sync().then( function() {
            reactToParagraph(paragraph, context);
            }
        );
    }    

    //////////////////////////////////////////////////////// reactToCurrentSelection
    // Get the paragraphs contained in the current selection and react 
    function reactToCurrentSelection(context) {
        var paragraphs = context.document.getSelection().paragraphs;

        context.load(paragraphs, 'text');
        context.sync().then( function() {
            reactToSelectionParagraphs(paragraphs, context);
            }
        );
    }
    
    //////////////////////////////////////////////////////// worker
    function worker() {
        Word.run(reactToCurrentSelection);            
    }
    
    var _interval = null;
    self.beginMonitoring = function () {
        _interval = setInterval(function () { worker(); }, 1000);
        //app.showNotification("Monitoring", "Monitoring started");
    }

    self.stopMonitoring = function () {
        if (_interval != null) {
            clearInterval(_interval);
        }
    }
    
    return self;
})();

