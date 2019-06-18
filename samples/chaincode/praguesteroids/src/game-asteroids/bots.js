/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var SPACE_WIDTH = 16 * 2.5;
var SPACE_HEIGHT = 9 * 2.5;

function onConnectFormSubmit() {
  const docId = document.getElementById("docId").value;

  if (!docId)
    alert("no docId provided :(");

  connectToGame(docId);

  return false;
}

var ships = document.getElementById("ships");

var timer;
var _view;

var idPrefix = 'ship1';

var bots = [];

const updateRate = 50;
const speedPerTick = 0.03;

function connectToGame(docId) {
  connectToDocumentRootView(docId, true)
  .then(
    view => {
      _view = view;
      //console.log("Keys");
      console.log(view.keys());
      console.log(view.pendingClientId);

      if (!timer)
        window.clearInterval(timer);

      ships.innerHTML = "";

      timer = window.setInterval(() => Tick(), updateRate);
    }
  );
}

function Tick() {
  if (_view != null) {

    ships.innerHTML = "";
    var botUpdates = [];

    for (var key of _view.keys()) {
      if (key.startsWith(idPrefix)) {
        var value = _view.get(key);

        var shipRow = initializeRow(key);

        var collabShip = JSON.parse(value);

        if (collabShip.isBot && collabShip.isAlive) {
          shipRow.className = "bot";

          // check if we control the bot and the Bot Is Alive
          if (bots.indexOf(key) != -1) {
            // move a bit in the current direction
            var angle = collabShip.angle + 0.005;
            var yMove = (Math.abs(angle) - 1.5) * speedPerTick * -1;
            var xMove = (1.5 - Math.abs(Math.abs(angle) - 1.5)) * speedPerTick * -1;

            var newXPosition = collabShip.position.x + xMove;
            var newYPosition = collabShip.position.y + yMove;

            if (newXPosition > 8)
              newXPosition = newXPosition - SPACE_WIDTH;
            else if (newXPosition < -8)
              newXPosition = newXPosition + SPACE_WIDTH;

            if (newYPosition > 4.5)
              newYPosition = newYPosition - SPACE_HEIGHT;
            else if (newYPosition < -4.5)
              newYPosition = newYPosition + SPACE_HEIGHT;

            // update angle to guide next move
            var angleChange = Math.random();
            var newAngle = angle + ((angleChange - 0.5) * speedPerTick * 2); //((angle + speedPerTick) % 6) - 3;

            if (newAngle > 3)
              newAngle = newAngle - 6;
            else if (newAngle < -3)
              newAngle = newAngle + 6;

            // update in prague document
            let ship = {
              isAlive:true,
              lastModified: Date.now().valueOf(),
              angle: newAngle,
              position: {
                x: newXPosition,
                y: newYPosition
              },
              isBot: true
            };

            botUpdates.push({ id: key, ship });
          }
        }

        ships.appendChild(shipRow);

        document.getElementById("ship-" + key + "-id").innerText = key;
        document.getElementById("ship-" + key + "-angle").innerText = collabShip.angle.toFixed(4);
        document.getElementById("ship-" + key + "-x").innerText = collabShip.position.x.toFixed(4);
        document.getElementById("ship-" + key + "-y").innerText = collabShip.position.y.toFixed(4);
      }
    }

    botUpdates.forEach(s => {
      _view.set(
        s.id,
        JSON.stringify(s.ship));
    })
  }
}

function shipguid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return idPrefix + '-' + s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function randomnumber() {
  return Math.random() * 5; // 5 is the max number we want
}

function addBot() {
  if (_view != null) {
    let id = shipguid();
    let ship = {
      isAlive:true,
      lastModified: Date.now().valueOf(),
      angle: 0,
      position: {
        x: randomnumber(),
        y: randomnumber()
      },
      isBot: true
    };

    _view.set(
      id,
      JSON.stringify(ship));

    bots.push(id);
  }
}

function initializeRow(key) {
  shipRow = document.createElement("tr");
  shipRow.id = "ship-" + key;

  var idCell = document.createElement("td");
  idCell.id = "ship-" + key + "-id";
  shipRow.appendChild(idCell);

  var angleCell = document.createElement("td");
  angleCell.id = "ship-" + key + "-angle";
  shipRow.appendChild(angleCell);

  var xCell = document.createElement("td");
  xCell.id = "ship-" + key + "-x";
  shipRow.appendChild(xCell);

  var yCell = document.createElement("td");
  yCell.id = "ship-" + key + "-y";
  shipRow.appendChild(yCell);

  return shipRow;
}

var docId = getParameterByName("docId");
if(docId!=null){
  document.getElementById("docId").setAttribute('value',docId);

  if (!docId)
    alert("no docId provided :(");

  document.getElementById('gameFrame').src = "../game-asteroids\?docId="+docId

  connectToGame(docId);
}
