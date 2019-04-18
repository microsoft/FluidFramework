var prague=require("@prague/routerlicious");


// This page will read from the common Prague Doc that manages all the connected games

const globalrouterlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const globalhistorian = "https://historian.wu2-ppe.prague.office-int.com";
const globaltenantId = "confident-turing";

const globaldocId = "prague-astroid-readout-0824";

var _globalView;

// Register endpoint connection
prague.api.socketStorage.registerAsDefault(globalrouterlicious, globalhistorian, globaltenantId);

window.connectToPragueGlobalMap=function(waitForLoad)
{
    if(_globalView==null)
    {
        return connectToDocumentRootView(globaldocId, waitForLoad)
            .then(view=>{
                _globalView = view;
                if(waitForLoad){
                }
                return view;
            });
    }
    return Promise.resolve(_globalView);
};

window.addToGlobalMap=function(docId, clientCount){
    if (_globalView == null)
        return;

    _globalView.set(docId, JSON.stringify(createMapObject(clientCount)));
    console.log('set initial prague map state');
};

window.getAllConnectedClientKeys=function(){
    if (_globalView == null){
        return;
    }

    var keys = _globalView.keys();
    console.log("getConnectedClientKeys:" + JSON.stringify(keys));
    return keys;
};

window.logCurrentGlobalView=function(){
    console.log(_globalView);
};

window.getClientInfo=function(key){
    if (_globalView == null)
        return;

    var result = null; 
    var json = _globalView.get(key)
    try {
        result = JSON.parse(json);
    }
    catch (e){
        console.log(`can't parse json ${json}`);
    }

    return result;
};

window.createMapObject=function(clientCount) {
    return {
        game: true,
        clients:clientCount,
        lastUpdatedTime: Date.now().valueOf()
    }
};
