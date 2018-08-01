var prague=require("@prague/routerlicious");


// This page will read from the common Prague Doc that manages all the connected games

const globalrouterlicious = "https://alfred.wu2.prague.office-int.com";
const globalhistorian = "https://historian.wu2.prague.office-int.com";
const globaltenantId = "trusting-wescoff";

const globaldocId = "prague-astroid-global-map" + Math.floor(Date.now().valueOf() / 1000 / 60 / 60 / 24);

var _globalView;

// Register endpoint connection
prague.api.socketStorage.registerAsDefault(globalrouterlicious, globalhistorian, globaltenantId);

window.doSnapshot= function(view, docId)
{
    var lastSnapshot = view.get("lastSnapshot")
    if(lastSnapshot==null || lastSnapshot< Date.now().valueOf()-30000 )
    {
        view.set("lastSnapshot", Date.now().valueOf());

        console.log(`Snapshot  ${docId} Starting`);

        return view.document.snapshot().then(() => {
            console.log(`Snapshot  ${docId} Complete`);
        }, (err) => {
            console.log(`Snapshot ${docId} Error: ${err}`);
        });
    }
    return Promise.resolve();
};

window.connectToPragueGlobalMap=function(waitForLoad)
{
    if(_globalView==null)
    {
        return connectToDocumentRootView(globaldocId, waitForLoad)
            .then(view=>{
                _globalView = view;
                if(waitForLoad){
                    doSnapshot(_globalView, globaldocId);
                }
                return view;
            });
    }
    return Promise.resolve(_globalView);
};

window.connectToDocumentRootView=function(docId, waitForLoad) {
    var init =    {
        method: 'POST',
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        },
        body:
        JSON.stringify({
                payload: {
                    documentId: docId,
                    tenantId: globaltenantId,
                    permission: "read:write",
                    user: {
                        id: "anyone", 
                    }
                },
                secretKey:"865611902d834bc16ed2d7a7f2895ee3"
            })
    };

    return new Promise(function(resolve, reject) {
        fetch("https://jwttokengenerator.azurewebsites.net/api/Sign?code=N85yVEYcaT1uBW5PMWrex2NGovP1Ho1kw8WjOaLaY/lvz8dTW/WFTA==",init)
        .then(function (data) {
            data.json().then(function (json) {
                prague.api.api.load(docId, { encrypted: false, token: json.token }).then(
                    collabDoc => {
                        collabDoc.getRoot().getView().then(
                            view => {
                                if(!collabDoc.isConnected && waitForLoad){
                                    console.log('waiting for document '+docId)
                                    collabDoc.on(
                                        "connected", 
                                        () => 
                                        {
                                            console.log('connected to document '+docId+' (Waited for load)')
                                            resolve(view)
                                        });
                                }
                                else{
                                    console.log('connected to document '+docId+' (Not waiting for load)')
                                    resolve(view);
                                }
                            }
                        )
                    }
                );
            })
        })
        .catch(function (error) {
            alert("Error fetching a new token to connect to prague global map :(");
            reject();
        });
    });
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

window.getParameterByName=function(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};
