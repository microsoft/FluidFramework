/*
 * Copyright (c) 2016-2018 Ali Shakiba http://shakiba.me/planck.js
 *
 * This software is provided 'as-is', without any express or implied
 * warranty.  In no event will the authors be held liable for any damages
 * arising from the use of this software.
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 * 1. The origin of this software must not be misrepresented; you must not
 * claim that you wrote the original software. If you use this software
 * in a product, an acknowledgment in the product documentation would be
 * appreciated but is not required.
 * 2. Altered source versions must be plainly marked as such, and must not be
 * misrepresented as being the original software.
 * 3. This notice may not be removed or altered from any source distribution.
*/
/*
  This source is heavily modified from the original to integrate multi player support.
*/

const docId = getParameterByName("docId");

const highScoreConst = 'HIGH_SCORE';

var _connectedClients = 0;

var _friendlyName = '';

const SHIP_SPEED_DEFAULT = 2;
var SHIP_SPEED = SHIP_SPEED_DEFAULT;

var shipIdPrefix = 'ship';
var shipUniqueId = customGuid(shipIdPrefix);

var bulletIdPrefix = 'bullet';
var bulletUniqueId = customGuid(bulletIdPrefix);
var bulletCounter = 0;

// Only send every _sendLocationUpdateMod frame
var _sendLocationUpdateMod = 2;
var _sendLocationUpdateCount = 1;


var ships = {};
var bullets = {};
var _view;

if(docId==null)
{
  window.location.replace("../game-overview");
}
else
{

  connectToDocumentRootView(docId, true)
    .then(
      view => {
        _view = view;

        var hs = view.get(highScoreConst);
        if (hs == null)
          view.set(highScoreConst, JSON.stringify({ user: '', friendlyName: '', score: 0 }));

        doSnapshot(_view, docId)

        _view.document.on("clientLeave", (name) => {
          doSnapshot(_view, docId);
        });

        doStage();
      }
    );
}

function customGuid(prefix) {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return prefix + '-' + s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}


function Physics(ui) {
  var pl = planck, Vec2 = pl.Vec2;

  var SHIP = 2;
  var BULLET = 4;
  var ASTEROID = 4;

  var SPACE_WIDTH = 16 * 2.5;
  var SPACE_HEIGHT = 9 * 2.5;

  var SHIP_SIZE = 0.30;
  var FIRE_RELOAD_TIME = 400;
  var BULLET_LIFE_TIME = 1100;
  var BULLET_SIZE = 0.08;

  // game state
  var state = {
    level: 0,
    lives: 0,
    connectedClients: 0,
    gameover: false,
    startGame: function () {
      this.gameover = false;
      this.level = 0;
      this.lives = 3;
      this.connectedClients = _connectedClients
    },
    crash: function () {
      this.lives--;
    },
    levelUp: function () {
      this.level++;
    },
    endGame: function () {
      this.gameover = true;
    }
  };

  var allowCrashTime = 0;
  var allowFireTime = 0;

  var world;
  var bulletBodies = [];
  var shipBody;

  world = pl.World();

  // Todo: check if several bullets hit the same asteroid in the same time step
  world.on('pre-solve', function (contact) {
    var fixtureA = contact.getFixtureA();
    var fixtureB = contact.getFixtureB();

    var bodyA = contact.getFixtureA().getBody();
    var bodyB = contact.getFixtureB().getBody();

    var aship = bodyA == shipBody;
    var bship = bodyB == shipBody;
    var abullet = fixtureA.getFilterCategoryBits() & BULLET;
    var bbullet = fixtureB.getFilterCategoryBits() & BULLET;

    // am I hit?
    if ((aship || bship) && allowCrashTime < globalTime) {
      // Ship collided with something
      var ship = aship ? bodyA : bodyB;
      var ufo = !aship ? bodyA : bodyB;

      setTimeout(function () {
        crash(ship, ufo, true);
      }, 1);
    }

    // is the bullet hitting another ship?
    if (abullet || bbullet) {
      // Bullet collided with something
      var ship = abullet ? bodyA : bodyB;
      var bullet = !abullet ? bodyA : bodyB;

      setTimeout(function () {
        hit(ship, bullet);
      }, 1);
    }
  });

  function start() {
    state.startGame();
    ui.updateStatus();
    setupShip(true);
    // createEnemies();
    ui.startGame();
  }

  function end() {
    state.endGame();
    ui.endGame();
  }

  function randomnumber(maxnumber) {
    return Math.random() * (2 * maxnumber) + maxnumber; // 5 is the max number we want
  }

  function setupShip() {
    shipBody = world.createBody({
      type: 'dynamic',
      angularDamping: 2.0,
      linearDamping: 0.5,
      position: Vec2(randomnumber(30), randomnumber(15)),
    });

    shipBody.createFixture(pl.Polygon([
      Vec2(-0.15, -0.15),
      Vec2(0, -0.1),
      Vec2(0.15, -0.15),
      Vec2(0, 0.2)
    ]), {
        density: 1000,
        filterCategoryBits: SHIP,
        filterMaskBits: ASTEROID
      });

    shipBody.render = { fill: '#ffdd00', stroke: '#000000' };
    allowCrashTime = globalTime + 2000;

    updateMyShipStatus();
  }

  var globalTime = 0;
  function tick(dt) {
    globalTime += dt;

    // resolve this before rendering the fram
    var amIDead = amIBusted();

    if (shipBody) {

      // Set velocities
      if (ui.activeKeys.left && !ui.activeKeys.right) {
        shipBody.applyAngularImpulse(0.1, true);
      } else if (ui.activeKeys.right && !ui.activeKeys.left) {
        shipBody.applyAngularImpulse(-0.1, true);
      }

      // Thrust: add some force in the ship direction
      if (ui.activeKeys.up) {
        var f = shipBody.getWorldVector(Vec2(0.0, SHIP_SPEED));
        var p = shipBody.getWorldPoint(Vec2(0.0, 2.0));
        shipBody.applyLinearImpulse(f, p, true);
      }

      if (ui.activeKeys.a) {
        SHIP_SPEED = 5;
      }
      else {
        SHIP_SPEED = SHIP_SPEED_DEFAULT;
      }

      // Fire
      if (ui.activeKeys.fire && globalTime > allowFireTime) {

        var magnitude = 10, angle = shipBody.Getangle + Math.PI / 2;

        // Create a bullet body
        var bulletBody = world.createDynamicBody({
          // mass : 0.05,
          position: shipBody.getWorldPoint(Vec2(0, SHIP_SIZE)),
          linearVelocity: shipBody.getWorldVector(Vec2(0, magnitude)),
          bullet: true
        });
        bulletBody.createFixture(new pl.Circle(BULLET_SIZE), {
          filterCategoryBits: BULLET,
          filterMaskBits: ASTEROID
        });
        bulletBodies.push(bulletBody);

        // Keep track of the last time we shot
        allowFireTime = globalTime + FIRE_RELOAD_TIME;

        // Remember when we should delete this bullet
        bulletBody.dieTime = globalTime + BULLET_LIFE_TIME;

        bulletBody.bulletNo = ++bulletCounter;


        _view.set(
          bulletUniqueId + bulletBody.bulletNo,
          JSON.stringify(
            {
              isAlive: true,
              bulletNo: bulletBody.bulletNo,
              dieTime: bulletBody.dieTime,
              position: bulletBody.getPosition(),
              angle: bulletBody.c_position.a,
              velocity: shipBody.getWorldVector(Vec2(0, magnitude))
            }));

      }

      wrap(shipBody);

      if (_view != null) {

        // Only set our position if something has changed
        var myshipString = _view.get(shipUniqueId)
        var myship = myshipString != null ? JSON.parse(myshipString) : null;
        var shipBodyPosition = shipBody.getPosition();

        // Send location update every other frame
        if (_sendLocationUpdateCount == 1 && !amIDead) {
          if (myship == null || myship.position.x != shipBodyPosition.x || myship.position.y != shipBodyPosition.y || myship.angle != shipBody.c_position.a || Date.now().valueOf() > myship.lastModified + 1000) {
            updateMyShipStatus();
          }
        }

        _sendLocationUpdateCount = (_sendLocationUpdateCount + 1) % _sendLocationUpdateMod;

        var hs = JSON.parse(_view.get(highScoreConst));

        var count = 0;
        for (var key of _view.keys()) {

          if (key.startsWith(shipIdPrefix)) {
            count = count + 1;

            if (!key.startsWith(shipUniqueId)) {

              var collabShip = JSON.parse(_view.get(key));

              // if the other ship hasn't been updated for 60 sec
              // delete it
              if (collabShip.lastModified == null || Date.now().valueOf() - collabShip.lastModified > 5000) {
                _view.delete(key);
                if (ships[key] != null) {
                  world.destroyBody(ships[key]);
                  ships[key] = null;
                }
              }
              else {
                if (ships[key] == null && !collabShip.busted) {
                  ships[key] = createEnemyShip(key, collabShip.isBot);
                }

                if (ships[key]) {
                  ships[key].setPosition(collabShip.position);
                  ships[key].setAngle(collabShip.angle);

                  if (key == hs.user)
                    ships[key].render = { fill: '#b2b2ff', stroke: '#000' }
                  else
                    ships[key].render = { fill: '#bb0000', stroke: '#000000' }

                }
              }
            }
          }
          else if (key.startsWith(bulletIdPrefix)) {
            if (!key.startsWith(bulletUniqueId)) {

              var collabBullet = JSON.parse(_view.get(key));

              if (!collabBullet.isAlive) {
                _view.delete(key);
                if (bullets[key] != null) {
                  world.destroyBody(bullets[key]);
                  bullets[key] = null;
                }

              }
              else if (bullets[key] == null) {
                bullets[key] = createEnemyBullet(collabBullet.velocity, collabBullet.position);
              }
            }
          }
        }
        if(count != _connectedClients)
        {
          _connectedClients = count;
          connectToPragueGlobalMap(false).then(() => addToGlobalMap(docId, _connectedClients));
        }

        state.connectedClients = _connectedClients;
        ui.updateStatus();
      }

    }

    if (amIDead && shipBody != null) {
      crash(shipBody, null, false);
    }

    for (var i = 0; i !== bulletBodies.length; i++) {
      var bulletBody = bulletBodies[i];

      // If the bullet is old, delete it
      if (bulletBody.dieTime <= globalTime) {
        _view.set(
          bulletUniqueId + bulletBody.bulletNo,
          JSON.stringify(
            {
              isAlive: false,
              bulletNo: bulletBody.bulletNo,
              dieTime: bulletBody.dieTime,
              position: bulletBody.getPosition(),
              angle: bulletBody.c_position.a
            }));
        bulletBodies.splice(i, 1);
        world.destroyBody(bulletBody);
        i--;
        continue;
      }
      wrap(bulletBody);
    }

    renderEnemies();
  }

  function renderEnemies() {
    for (var key in ships) {
      if (ships.hasOwnProperty(key) && ships[key])
        wrap(ships[key]);
    }
  }

  function amIBusted() {
    if (!_view)
      return false;

    var myShipString = _view.get(shipUniqueId)
    var myShip = myShipString != null ? JSON.parse(myShipString) : null;
    return (myShip != null && myShip.busted);
  }

  function createEnemyBullet(enemyVelocity, enemyPosition) {

    var enemyBulletBody = world.createDynamicBody({

      // mass : 0.05,
      position: enemyPosition, //shipBody.getWorldPoint(Vec2(0, SHIP_SIZE)),
      linearVelocity: enemyVelocity, //shipBody.getWorldVector(Vec2(0, magnitude)),
      bullet: true
    });
    enemyBulletBody.createFixture(new pl.Circle(BULLET_SIZE), {
      filterCategoryBits: BULLET,
      filterMaskBits: ASTEROID
    });

    enemyBulletBody.render = { fill: '#ff3232', stroke: '#fff' }

    return enemyBulletBody;
  }

  function updateMyShipStatus() {
    if (_view) {
      _view.set(
        shipUniqueId,
        JSON.stringify(
          {
            lastModified: Date.now().valueOf(),
            position: shipBody.getPosition(),
            angle: shipBody.c_position.a,
            busted: false
          }));
    }

  }

  function createEnemyShip(shipId, isBot) {
    if (isBot) {
      var enemy = world.createBody({
        type: 'dynamic',
        angularDamping: 2.0,
        linearDamping: 0.5,
        position: Vec2(),
      });

      var radius = 0.3;

      var n = 8, path = [];
      for (var i = 0; i < n; i++) {
        var a = i * 2 * Math.PI / n;
        var x = radius * (Math.sin(a) + rand(0.3));
        var y = radius * (Math.cos(a) + rand(0.3));
        path.push(Vec2(x, y));
      }
      enemy.createFixture(pl.Polygon(path), {
        filterCategoryBits: ASTEROID,
        filterMaskBits: BULLET | SHIP
      });

      var fillColor = '#00ff00';
      var hs = _view.get(highScoreConst);
      if (shipId == hs.user)
        fillColor = '#0000FF';

      enemy.render = { fill: fillColor, stroke: '#000000' }

    } else {
      var enemy = world.createBody({
        type: 'dynamic',
        angularDamping: 2.0,
        linearDamping: 0.5,
        position: Vec2(),
      });

      enemy.createFixture(pl.Polygon([
        Vec2(-0.15, -0.15),
        Vec2(0, -0.1),
        Vec2(0.15, -0.15),
        Vec2(0, 0.2)
      ]), {
          density: 1000,
          filterCategoryBits: ASTEROID,
          filterMaskBits: BULLET | SHIP
        });

      enemy.render = { fill: '#bb0000', stroke: '#000000' }
    }

    enemy.shipId = shipId;

    return enemy;
  }

  function crash(ship, ufo, shouldBroadCastMyCrash) {
    if (!shipBody) return;

    if (shouldBroadCastMyCrash)
      broadcastBustStatus(shipUniqueId, ship);

    state.crash();
    ui.updateStatus();

    // Remove the ship body for a while
    world.destroyBody(shipBody);

    shipBody = null;

    // if UFO is an enemy ship, destroy it.
    if (ufo != null && ships[ufo.shipId])
      destroyEnemy(ufo);

    if (state.lives <= 0) {
      end();
      return;
    }
    setTimeout(function () {
      // Add ship again
      setupShip();
    }, 1000);
  }

  function hit(enemyShip, bulletBody) {
    var bidx = bulletBodies.indexOf(bulletBody);
    if (ships[enemyShip.shipId] && bidx != -1) {
      destroyEnemy(enemyShip);

      state.levelUp();
      ui.updateStatus();

      var hs = JSON.parse(_view.get(highScoreConst));
      if (hs == null || hs.score < state.level) {
        var name = _friendlyName == '' || _friendlyName == null ? '?' : _friendlyName;
        _view.set(highScoreConst, JSON.stringify({ user: shipUniqueId, friendlyName: name, score: state.level }));
      }

      // Remove bullet
      _view.set(
        bulletUniqueId + bulletBody.bulletNo,
        JSON.stringify(
          {
            isAlive: false,
            bulletNo: bulletBody.bulletNo,
            dieTime: bulletBody.dieTime,
            position: bulletBody.getPosition(),
            angle: bulletBody.c_position.a
          }));

      world.destroyBody(bulletBody);
      bulletBodies.splice(bidx, 1);
    }
  }

  function broadcastBustStatus(shipId, shipBodyLocal) {
    _view.set(
      shipId,
      JSON.stringify(
        {
          lastModified: Date.now().valueOf(),
          position: shipBodyLocal.getPosition(),
          angle: shipBodyLocal.getAngle(),
          busted: true,
          isAlive: false
        }));
  }

  function destroyEnemy(enemy) {
    if (ships[enemy.shipId]) {
      broadcastBustStatus(enemy.shipId, enemy);
      world.destroyBody(enemy);
      ships[enemy.shipId] = null;
    }
  }

  // If the body is out of space bounds, wrap it to the other side
  function wrap(body) {
    var p = body.getPosition();
    p.x = wrapNumber(p.x, -SPACE_WIDTH / 2, SPACE_WIDTH / 2);
    p.y = wrapNumber(p.y, -SPACE_HEIGHT / 2, SPACE_HEIGHT / 2);
    body.setPosition(p);
  }

  function wrapNumber(num, min, max) {
    if (typeof min === 'undefined') {
      max = 1, min = 0;
    } else if (typeof max === 'undefined') {
      max = min, min = 0;
    }
    if (max > min) {
      num = (num - min) % (max - min);
      return num + (num < 0 ? max : min);
    } else {
      num = (num - max) % (min - max);
      return num + (num <= 0 ? min : max);
    }
  }

  // Returns a random number between -0.5 and 0.5
  function rand(value) {
    return (Math.random() - 0.5) * (value || 1);
  }

  this.start = start;
  this.world = world;
  this.state = state;
  this.spaceWidth = SPACE_WIDTH;
  this.spaceHeight = SPACE_HEIGHT;
  this.tick = tick;
  this.ratio = 64;
}


function doStage() {


  Stage(function (stage) {
    var activeKeys = {};
    var KEY_NAMES = {
      32: 'fire',
      37: 'right',
      38: 'up',
      39: 'left',
      40: 'down',
      65: 'a',
    };

    var physics = new Physics({
      startGame: startGame,
      endGame: endGame,
      updateStatus: updateStatus,
      activeKeys: activeKeys
    });

    var world, meta, status, gameover;

    stage.background('#222222');
    stage.on('viewport', function (size) {
      meta.pin({
        scaleMode: 'in-pad',
        scaleWidth: size.width,
        scaleHeight: size.height
      });
      world.pin({
        scaleMode: 'in-pad',
        scaleWidth: size.width,
        scaleHeight: size.height
      });
    });

    world = new Stage
      .planck(physics.world, { ratio: 80 })
      .pin({
        handle: -0.5,
        width: physics.spaceWidth,
        height: physics.spaceHeight
      })
      .appendTo(stage);

    stage.tick(physics.tick);

    meta = Stage
      .create()
      .pin({ width: 1000, height: 1000 })
      .appendTo(stage);

    livesStatus = Stage
      .string('text')
      .pin({ align: 0, offset: 20 })
      .appendTo(meta);

    killStatus = Stage
      .string('text')
      .pin({ align: 0, offsetX: 20, offsetY: 50 })
      .appendTo(meta);

    clientsStatus = Stage
      .string('text')
      .pin({ alignX: 1, offsetX: -20, offsetY: 20 })
      .appendTo(meta);

    hsStatus = Stage
      .string('text')
      .pin({ alignX: 1, offsetX: -20, offsetY: 50 })
      .appendTo(meta);

    gameover = Stage
      .string('text')
      .value('Game Over!')
      .pin({ align: 0.5, scale: 1.6 })
      .appendTo(meta);

    function startGame() {
      gameover.hide();
    }

    function endGame() {
      /*_view.document.snapshot().then(() => {
          console.log(`Snapshot ${docId}`);
      }, (err) => {
          console.log(`Snapshot ${docId} Error: ${err}`);
      });*/
      gameover.show();
    }

    function updateStatus() {
      livesStatus.value('Lives:' + getHearts(physics.state.lives));
      killStatus.value('Kills: ' + physics.state.level);
      clientsStatus.value('Clients: ' + physics.state.connectedClients);

      var owner = '';
      var score = 0;
      var hs = JSON.parse(_view.get(highScoreConst));
      if (hs != null) {
        if (hs.user == shipUniqueId) {
          owner = 'You';
        }
        else {
          owner = hs.friendlyName;
        }

        score = hs.score;
      }

      hsStatus.value('High Score(' + owner + '): ' + score);
    }

    document.onkeydown = function (evt) {
      if (physics.state.gameover) {
        physics.start();
      }
      activeKeys[KEY_NAMES[evt.keyCode]] = true;
    };

    document.onkeyup = function (evt) {
      activeKeys[KEY_NAMES[evt.keyCode]] = false;
    };

    physics.start();
  });
}

function getHearts(count) {
  var h = '';
  for (var i = 0; i < count; i++) {
    h += " ♥"; //♡
  }

  return h;
}

Stage({
  textures: {
    text: function (d) {
      d += '';
      return Stage.canvas(function (ctx) {
        var ratio = 2;
        this.size(16, 24, ratio);
        ctx.scale(ratio, ratio);
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#ddd';
        ctx.textBaseline = 'top';
        ctx.fillText(d, 0, 1);
      });
    }
  }
});

function updateFriendlyName() {
  const name = document.getElementById("friendlyName").value;
  _friendlyName = name;
  document.activeElement.blur();
  return false;
}