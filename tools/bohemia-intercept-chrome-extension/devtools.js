chrome.devtools.network.onRequestFinished.addListener(function(req) {
    // Displayed sample TCP connection time here
   console.log(req.response.content);
});

chrome.devtools.panels.create("WEEEEE", null, "options.html", null);