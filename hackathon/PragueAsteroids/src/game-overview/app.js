function run() {
    connectToPragueGlobalMap(true).then(() => {

        logCurrentGlobalView();

        var keys = getAllConnectedClientKeys();
        var games=[];
        for (var key of keys) {
            var value = getClientInfo(key);
            if (value != null && value.game) {
               games.push({key, value});
            }
        }

        if(games.length==0)
        {
            document.getElementById('gameList').innerHTML="No active games found";
        }
        else
        {
            document.getElementById('gameList').innerHTML="";
            games=games.sort((a,b)=>b.value.clients - a.value.clients);
            for(g of games)
            {
                document.getElementById('gameList').innerHTML += 
                    generateListItem(g.key, g.value.clients, g.value.lastUpdatedTime);
            }
        }

    });
}

function loadGameData(docid, value){
    return connectToDocumentRootView(docid, true).then(
        view=>
        {
            var clientCount = 0;
            var keys = view.keys();
            for (var key of keys) {
                if (key.startsWith("ship")) {
                    clientCount++;
                }
            }
            
            value.clients=clientCount ;
            //collabDoc.close();

            return {
                key: docid,
                value
            }
        }
    ).catch((err)=>console.log(`key/docid: ${key} err: ${err}`));
}

function renderList() {

}

function generateListItem(docId, connectedClients, lastUpdated) {
    return '<h3 style="margin-bottom:0">' + docId + '  <span style="font-size:14px"><a href="../game-asteroids\?docId='+docId+'" target="_blank">JOIN</a>   <a href="../game-asteroids/bots.html?docId='+docId+'" target="_blank">Bot Control</a></span></h3><ul style="margin-top:5px"><li>Clients: <b>' + connectedClients + '</b></li><li>LastUpdated: <b>' + generateTimeString(lastUpdated) + '</b></li></ul>';
}

function generateTimeString(timeint) {
    var time = (Date.now().valueOf() - timeint)/ 10000;
    var minutes = Math.floor(time / 60);
    var seconds = Math.floor(time - minutes * 60);
    var timeString = '';

    if (minutes > 0){
        timeString = minutes + " minutes";

        if (seconds == 0){
            timeString = timeString + "ago";
        }
    }

    if (seconds > 0){
        if (minutes > 0)
            timeString = timeString + ' ';

        timeString = timeString + seconds + " seconds ago";
    }

    if (minutes + seconds <= 0){
        timeString = 'now';
    }

    return timeString;
}

function onNewGameSubmit() {
    const docId = document.getElementById("docId").value;

    if (!docId) {
        alert("How can you play without a game id? :(");
    }
    else {
        window.open('../game-asteroids/?docId=' + docId);
    }

    return false;
}

run();