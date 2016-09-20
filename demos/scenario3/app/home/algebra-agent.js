
var algebraAgent = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    var counter = 0;

    //////////////////////////////////////////////////////// validateContentWithService
    // Send the text to the service to be validated.
    function validateContentWithService(text) {
        if (text.length == 0)
            return null;

        //app.showNotification("Monitoring", text);
        
        if (text.search("3𝑥=8") != -1) {
            return " √";
        }

        if (text.search("𝑥=\,8-3\.") != -1) {
            return " √";
        }

        return null;
    }

    //////////////////////////////////////////////////////// reactToParagraphText
    // Get the text of the paragrph and see if we wish to react to it. Returns a boolean
    // to indicate whether it did anything
    function reactToParagraphText(paragraph, contentControls) {
        var paragraphText = paragraph.text; 
        var checkMark = validateContentWithService(paragraphText);
            
        var insertedRange = null;
        if (contentControls.items.length == 0) {
            if (checkMark == null) {
                return false;
            }

            insertedRange = paragraph.insertText(checkMark, Word.InsertLocation.end);
            insertedRange.font.color = 'green';
            var contentControl = insertedRange.insertContentControl();
            contentControl.appearance = 'hidden';
        } else {
            if (checkMark == null) {
                contentControls.items[0].delete(false /* keepContent*/);
            } else {
                // The content control is here, and we do wish to put a checkMark in.
                // Assume it's the check mark
                // insertedRange = contentControls.items[0].insertText(checkMark, Word.InsertLocation.replace);
                return false;
            }
        }

        return true;
    }

    //////////////////////////////////////////////////////// reactToParagraph
    // Retrieves the content controls within the paragraph (to see if we already have 
    // a check-mark here) and call into the next layer
    function reactToParagraph(paragraph, context) {
        var contentControls = paragraph.contentControls;
        context.load(contentControls, 'text');
        context.sync().then(function () {
            var originalSelection = context.document.getSelection();

            var didReact = reactToParagraphText(paragraph, contentControls);

            // There's really no functional harm in re-selecting the original or sync'ing the context
            // but it will add a little visual glitch as the selection redraws. Avoid it.
            if (didReact) {
                originalSelection.select();
                context.sync();
                }
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

