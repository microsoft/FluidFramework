
var algebraAgent = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    var counter = 0;

    function checkRawContent(text) {
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

    function reactToParagraphText(paragraph, contentControls) {
        var paragraphText = paragraph.text; 
        var checkMark = checkRawContent(paragraphText);
            
        var insertedRange = null;
        if (contentControls.items.length == 0) {
            if (checkMark == null) {
                return;
            }

            insertedRange = paragraph.insertText(checkMark, Word.InsertLocation.end);
            insertedRange.insertContentControl();
        } else {
            if (checkMark == null) {
                contentControls.items[0].clear();
            } else {
                insertedRange = contentControls.items[0].insertText(checkMark, Word.InsertLocation.replace);
            }
        }
    }

    function reactToParagraph(paragraph, context) {
        var contentControls = paragraph.contentControls;
        context.load(contentControls, '');
        context.sync().then(function () {
            var originalSelection = context.document.getSelection();

            reactToParagraphText(paragraph, contentControls);
            originalSelection.select();
            context.sync();
            }
        );
    }

    function reactToSelectionParagraphs(paragraphs, context) {
        var paragraph = paragraphs.items[0];
        context.load(paragraph, 'text');
        context.sync().then( function() {
            reactToParagraph(paragraph, context);
            }
        );
    }    

    function reactToCurrentSelection(context) {
        var paragraphs = context.document.getSelection().paragraphs;

        context.load(paragraphs, 'text');
        context.sync().then( function() {
            reactToSelectionParagraphs(paragraphs, context);
            }
        );
    }
    

    function worker() {
        Word.run(reactToCurrentSelection);            
    }
    
    self.beginMonitoring = function () {
        setInterval(function () { worker(); }, 1000);
        //app.showNotification("Monitoring", "Monitoring started");
    }
    
    return self;
})();

