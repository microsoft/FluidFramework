var kn = (function(){  // jshint ignore:line
    'use strict';

    var self = {};

    // Short 'headers' of the problem set descriptions. Contains mostly meta-data about the problemSetDescription
    // Crucially contains an id that may be then used to retrieve the actual problem set
    var problemSetReferences = [
        {
            "id" : "B7FDBF00-5C78-43F7-AF88-5EB4C81C725D",
            "title" : "Solve for X",
            "className" : "AP Algebra",
            "description": "Simple algebraic equations",
            "due": "Oct 18th",
            "isNew": false
        },

        {
            "id": "0E5AFE02-B875-42C2-BA3A-EA5C3285E5CC",
            "title" : "League of the Iroquois",
            "className" : "History",
            "description": "How and why the league of the Iroquois formed?",
            "due": "Oct 25th",
            "isNew": true
        },

        {
            "id" : "7F4AA69B-D793-4B11-BC45-218522FA9244",
            "title" : "Colinear points",
            "className" : "AP Algebra",
            "description": "Slope equation",
            "due": "Nov 2nd",
            "isNew": true
        },
    ];

    // The actual contents of the problem set, including representations 
    var problemSets = {
        "B7FDBF00-5C78-43F7-AF88-5EB4C81C725D" : {
            "ooxmlUrl" : "/content/solveForX.xml"
        },

        "0E5AFE02-B875-42C2-BA3A-EA5C3285E5CC" : {
            "ooxmlUrl" : "-- bad -- url --"
        },

        "7F4AA69B-D793-4B11-BC45-218522FA9244" : {
            "ooxmlUrl" : "/content/Colinear.xml"
        },
    };

    ////////////////////////////////////////////////// searchForEntities
    self.searchForEntities = function (searchValue) {
        var matchingProblemSets = [];

        if (searchValue.length != 0) {
            $.each(problemSetReferences, function (index, problemSetRef) {
                if (problemSetRef.title.toLowerCase().search(searchValue) != -1 ||
                problemSetRef.className.toLowerCase().search(searchValue) != -1 ||
                problemSetRef.description.toLowerCase().search(searchValue) != -1) {                    
                    matchingProblemSets.push(problemSetRef);
                }
            });
        }

        return matchingProblemSets;
    };

    ////////////////////////////////////////////////// renderEntityInList
    // Expects an object with these properties
    // {
    //    "title" : "title of the homework assignement",
    //    "className" : "name of the class",
    //    "description": "Short description of the assignment",
    //    "due": "due date",
    //    "isNew": "whether this has been viewed by the student or not"
    // }
    self.renderEntityInList = function (unorderedList, entity) {

        // Assume the entity is a problem set.
        var problemSetRef = entity;

        var li = $("<li />", {class: "ms-ListItem is-selectable"});
        var spanPrimary = $("<span />", {class: "ms-ListItem-primaryText"});
        var spanSecondary = $("<span />", {class: "ms-ListItem-secondaryText"});
        var spanTertiary = $("<span />", {class: "ms-ListItem-tertiaryText"});
        var spanMeta = $("<span />", {class: "ms-ListItem-metaText"});

        if (problemSetRef.isNew) {
            li.addClass("is-unread");
        }

        li.click(function () {
            onProblemSetChosen(problemSetRef);
        });

        spanPrimary.text(problemSetRef.title);
        spanSecondary.text(problemSetRef.className);
        spanTertiary.text(problemSetRef.description);
        spanMeta.text(problemSetRef.due);

        li.append(spanPrimary);
        li.append(spanSecondary);
        li.append(spanTertiary);
        li.append(spanMeta);

        unorderedList.append(li);
    };

    function onRequestFailed(xhr, status, error) {
        app.showNotification(status, "An error occurred contacting the MRO api.");
    };
  
    function onContentRetrieved(data, status, jsXHR) {
        Word.run(function (context) {
            context.document.body.insertOoxml(data, Word.InsertLocation.replace);
            algebraAgent.beginMonitoring();
        });
    }

    var _request;
    ///////////////////////////////////////////// onProblemSetChosen
    function onProblemSetChosen(problemSetRef) {        
        var requestSettings = { url: problemSets[problemSetRef.id].ooxmlUrl, dataType: "text" };
        _request = jQuery.ajax(requestSettings)
            .success(onContentRetrieved)
            .error(onRequestFailed);
    }        

  return self;
})();

