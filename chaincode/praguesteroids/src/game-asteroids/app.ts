// tslint:disable:no-bitwise
import * as Stage from "stage-js";
import { getParameterByName } from "../lib/utils";

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

const highScoreConst = "HIGH_SCORE";

let pragueConnectedClients = 0;

let pragueFriendlyName = "";

const SHIP_SPEED_DEFAULT = 2;
let SHIP_SPEED = SHIP_SPEED_DEFAULT;

const shipIdPrefix = "ship";
const shipUniqueId = customGuid(shipIdPrefix);

const bulletIdPrefix = "bullet";
const bulletUniqueId = customGuid(bulletIdPrefix);
let bulletCounter = 0;

// Only send every _sendLocationUpdateMod frame
const pragueSendLocationUpdateMod = 2;
let pragueSendLocationUpdateCount = 1;

const ships = {};
const bullets = {};
let pragueView;

if (docId === null) {
  window.location.replace("../game-overview");
} else {
  connectToDocumentRootView(docId, true)
    .then((view) => {
        pragueView = view;

        const hs = view.get(highScoreConst);
        if (hs == null) {
          view.set(highScoreConst, JSON.stringify({ user: "", friendlyName: "", score: 0 }));
        }

        pragueView.document.on("clientLeave", (name) => {
          // ignored
        });

        doStage();
      });
}

function customGuid(prefix) {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return prefix + "-" + s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
}

function Physics(ui) {
  const pl = planck;
  const Vec2 = pl.Vec2;

  const SHIP = 2;
  const BULLET = 4;
  const ASTEROID = 4;

  const SPACE_WIDTH = 16 * 2.5;
  const SPACE_HEIGHT = 9 * 2.5;

  const SHIP_SIZE = 0.30;
  const FIRE_RELOAD_TIME = 400;
  const BULLET_LIFE_TIME = 1100;
  const BULLET_SIZE = 0.08;

  // game state
  const state = {
    connectedClients: 0,
    crash: () => {
      this.lives--;
    },
    endGame: () => {
      this.gameover = true;
    },
    gameover: false,
    level: 0,
    levelUp: () => {
      this.level++;
    },
    lives: 0,
    startGame: () => {
      this.gameover = false;
      this.level = 0;
      this.lives = 3;
      this.connectedClients = pragueConnectedClients;
    },
  };

  let allowCrashTime = 0;
  let allowFireTime = 0;

  let world;
  const bulletBodies = [];
  let shipBody;

  world = pl.World();

  // Todo: check if several bullets hit the same asteroid in the same time step
  world.on("pre-solve", (contact) => {
    const fixtureA = contact.getFixtureA();
    const fixtureB = contact.getFixtureB();

    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();

    const aship = bodyA === shipBody;
    const bship = bodyB === shipBody;
    const abullet = fixtureA.getFilterCategoryBits() & BULLET;
    const bbullet = fixtureB.getFilterCategoryBits() & BULLET;

    // am I hit?
    if ((aship || bship) && allowCrashTime < globalTime) {
      // Ship collided with something
      const ship = aship ? bodyA : bodyB;
      const ufo = !aship ? bodyA : bodyB;

      setTimeout(
        () => {
          crash(ship, ufo, true);
        },
        1);
    }

    // is the bullet hitting another ship?
    if (abullet || bbullet) {
      // Bullet collided with something
      const ship = abullet ? bodyA : bodyB;
      const bullet = !abullet ? bodyA : bodyB;

      setTimeout(
        () => {
          hit(ship, bullet);
        },
        1);
    }
  });

  function start() {
    state.startGame();
    ui.updateStatus();
    setupShip();
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
      angularDamping: 2.0,
      linearDamping: 0.5,
      position: Vec2(randomnumber(30), randomnumber(15)),
      type: "dynamic",
    });

    shipBody.createFixture(pl.Polygon([
      Vec2(-0.15, -0.15),
      Vec2(0, -0.1),
      Vec2(0.15, -0.15),
      Vec2(0, 0.2),
    ]), {
        density: 1000,
        filterCategoryBits: SHIP,
        filterMaskBits: ASTEROID,
      });

    shipBody.render = { fill: "#ffdd00", stroke: "#000000" };
    allowCrashTime = globalTime + 2000;

    updateMyShipStatus();
  }

  let globalTime = 0;
  function tick(dt) {
    globalTime += dt;

    // resolve this before rendering the fram
    const amIDead = amIBusted();

    if (shipBody) {

      // Set velocities
      if (ui.activeKeys.left && !ui.activeKeys.right) {
        shipBody.applyAngularImpulse(0.1, true);
      } else if (ui.activeKeys.right && !ui.activeKeys.left) {
        shipBody.applyAngularImpulse(-0.1, true);
      }

      // Thrust: add some force in the ship direction
      if (ui.activeKeys.up) {
        const f = shipBody.getWorldVector(Vec2(0.0, SHIP_SPEED));
        const p = shipBody.getWorldPoint(Vec2(0.0, 2.0));
        shipBody.applyLinearImpulse(f, p, true);
      }

      if (ui.activeKeys.a) {
        SHIP_SPEED = 5;
      } else {
        SHIP_SPEED = SHIP_SPEED_DEFAULT;
      }

      // Fire
      if (ui.activeKeys.fire && globalTime > allowFireTime) {

        const magnitude = 10;

        // Create a bullet body
        const bulletBody = world.createDynamicBody({
          bullet: true,
          // mass : 0.05,
          linearVelocity: shipBody.getWorldVector(Vec2(0, magnitude)),
          position: shipBody.getWorldPoint(Vec2(0, SHIP_SIZE)),
        });
        bulletBody.createFixture(new pl.Circle(BULLET_SIZE), {
          filterCategoryBits: BULLET,
          filterMaskBits: ASTEROID,
        });
        bulletBodies.push(bulletBody);

        // Keep track of the last time we shot
        allowFireTime = globalTime + FIRE_RELOAD_TIME;

        // Remember when we should delete this bullet
        bulletBody.dieTime = globalTime + BULLET_LIFE_TIME;

        bulletBody.bulletNo = ++bulletCounter;

        pragueView.set(
          bulletUniqueId + bulletBody.bulletNo,
          JSON.stringify(
            {
              angle: bulletBody.c_position.a,
              bulletNo: bulletBody.bulletNo,
              dieTime: bulletBody.dieTime,
              isAlive: true,
              position: bulletBody.getPosition(),
              velocity: shipBody.getWorldVector(Vec2(0, magnitude)),
            }));

      }

      wrap(shipBody);

      if (pragueView != null) {
        // Only set our position if something has changed
        const myshipString = pragueView.get(shipUniqueId);
        const myship = myshipString != null ? JSON.parse(myshipString) : null;
        const shipBodyPosition = shipBody.getPosition();

        // Send location update every other frame
        if (pragueSendLocationUpdateCount === 1 && !amIDead) {
          if (myship == null ||
              myship.position.x !== shipBodyPosition.x ||
              myship.position.y !== shipBodyPosition.y ||
              myship.angle !== shipBody.c_position.a ||
              Date.now().valueOf() > myship.lastModified + 1000) {
            updateMyShipStatus();
          }
        }

        pragueSendLocationUpdateCount = (pragueSendLocationUpdateCount + 1) % pragueSendLocationUpdateMod;

        const hs = JSON.parse(pragueView.get(highScoreConst));

        let count = 0;
        for (const key of pragueView.keys()) {

          if (key.startsWith(shipIdPrefix)) {
            count = count + 1;

            if (!key.startsWith(shipUniqueId)) {

              const collabShip = JSON.parse(pragueView.get(key));

              // if the other ship hasn't been updated for 60 sec
              // delete it
              if (collabShip.lastModified == null || Date.now().valueOf() - collabShip.lastModified > 5000) {
                pragueView.delete(key);
                if (ships[key] != null) {
                  world.destroyBody(ships[key]);
                  ships[key] = null;
                }
              } else {
                if (ships[key] == null && !collabShip.busted) {
                  ships[key] = createEnemyShip(key, collabShip.isBot);
                }

                if (ships[key]) {
                  ships[key].setPosition(collabShip.position);
                  ships[key].setAngle(collabShip.angle);

                  if (key === hs.user) {
                    ships[key].render = { fill: "#b2b2ff", stroke: "#000" };
                  } else {
                    ships[key].render = { fill: "#bb0000", stroke: "#000000" };
                  }
                }
              }
            }
          } else if (key.startsWith(bulletIdPrefix)) {
            if (!key.startsWith(bulletUniqueId)) {
              const collabBullet = JSON.parse(pragueView.get(key));

              if (!collabBullet.isAlive) {
                pragueView.delete(key);
                if (bullets[key] != null) {
                  world.destroyBody(bullets[key]);
                  bullets[key] = null;
                }
              } else if (bullets[key] == null) {
                bullets[key] = createEnemyBullet(collabBullet.velocity, collabBullet.position);
              }
            }
          }
        }
        if (count !== pragueConnectedClients) {
          pragueConnectedClients = count;
          connectToPragueGlobalMap(false).then(() => addToGlobalMap(docId, pragueConnectedClients));
        }

        state.connectedClients = pragueConnectedClients;
        ui.updateStatus();
      }

    }

    if (amIDead && shipBody != null) {
      crash(shipBody, null, false);
    }

    for (let i = 0; i !== bulletBodies.length; i++) {
      const bulletBody = bulletBodies[i];

      // If the bullet is old, delete it
      if (bulletBody.dieTime <= globalTime) {
        pragueView.set(
          bulletUniqueId + bulletBody.bulletNo,
          JSON.stringify(
            {
              angle: bulletBody.c_position.a,
              bulletNo: bulletBody.bulletNo,
              dieTime: bulletBody.dieTime,
              isAlive: false,
              position: bulletBody.getPosition(),
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
    for (const key in ships) {
      if (ships.hasOwnProperty(key) && ships[key]) {
        wrap(ships[key]);
      }
    }
  }

  function amIBusted() {
    if (!pragueView) {
      return false;
    }

    const myShipString = pragueView.get(shipUniqueId);
    const myShip = myShipString != null ? JSON.parse(myShipString) : null;
    return (myShip != null && myShip.busted);
  }

  function createEnemyBullet(enemyVelocity, enemyPosition) {
    const enemyBulletBody = world.createDynamicBody({
      bullet: true,
      linearVelocity: enemyVelocity, // shipBody.getWorldVector(Vec2(0, magnitude)),
      // mass : 0.05,
      position: enemyPosition, // shipBody.getWorldPoint(Vec2(0, SHIP_SIZE)),
    });
    enemyBulletBody.createFixture(new pl.Circle(BULLET_SIZE), {
      filterCategoryBits: BULLET,
      filterMaskBits: ASTEROID,
    });

    enemyBulletBody.render = { fill: "#ff3232", stroke: "#fff" };

    return enemyBulletBody;
  }

  function updateMyShipStatus() {
    if (pragueView) {
      pragueView.set(
        shipUniqueId,
        JSON.stringify(
          {
            angle: shipBody.c_position.a,
            busted: false,
            lastModified: Date.now().valueOf(),
            position: shipBody.getPosition(),
          }));
    }
  }

  function createEnemyShip(shipId, isBot) {
    let enemy;
    if (isBot) {
      enemy = world.createBody({
        angularDamping: 2.0,
        linearDamping: 0.5,
        position: Vec2(),
        type: "dynamic",
      });

      const radius = 0.3;

      const n = 8;
      const path = [];
      for (let i = 0; i < n; i++) {
        const a = i * 2 * Math.PI / n;
        const x = radius * (Math.sin(a) + rand(0.3));
        const y = radius * (Math.cos(a) + rand(0.3));
        path.push(Vec2(x, y));
      }
      enemy.createFixture(pl.Polygon(path), {
        filterCategoryBits: ASTEROID,
        filterMaskBits: BULLET | SHIP,
      });

      let fillColor = "#00ff00";
      const hs = pragueView.get(highScoreConst);
      if (shipId === hs.user) {
        fillColor = "#0000FF";
      }

      enemy.render = { fill: fillColor, stroke: "#000000" };
    } else {
      enemy = world.createBody({
        angularDamping: 2.0,
        linearDamping: 0.5,
        position: Vec2(),
        type: "dynamic",
      });

      enemy.createFixture(pl.Polygon([
        Vec2(-0.15, -0.15),
        Vec2(0, -0.1),
        Vec2(0.15, -0.15),
        Vec2(0, 0.2),
      ]), {
          density: 1000,
          filterCategoryBits: ASTEROID,
          filterMaskBits: BULLET | SHIP,
        });

      enemy.render = { fill: "#bb0000", stroke: "#000000" };
    }

    enemy.shipId = shipId;

    return enemy;
  }

  function crash(ship, ufo, shouldBroadCastMyCrash) {
    if (!shipBody) {
      return;
    }

    if (shouldBroadCastMyCrash) {
      broadcastBustStatus(shipUniqueId, ship);
    }

    state.crash();
    ui.updateStatus();

    // Remove the ship body for a while
    world.destroyBody(shipBody);

    shipBody = null;

    // if UFO is an enemy ship, destroy it.
    if (ufo !== null && ships[ufo.shipId]) {
      destroyEnemy(ufo);
    }

    if (state.lives <= 0) {
      end();
      return;
    }
    setTimeout(() => {
      // Add ship again
      setupShip();
    }, 1000);
  }

  function hit(enemyShip, bulletBody) {
    const bidx = bulletBodies.indexOf(bulletBody);
    if (ships[enemyShip.shipId] && bidx !== -1) {
      destroyEnemy(enemyShip);

      state.levelUp();
      ui.updateStatus();

      const hs = JSON.parse(pragueView.get(highScoreConst));
      if (hs == null || hs.score < state.level) {
        const name = pragueFriendlyName === "" || pragueFriendlyName == null ? "?" : pragueFriendlyName;
        pragueView.set(highScoreConst, JSON.stringify({ user: shipUniqueId, friendlyName: name, score: state.level }));
      }

      // Remove bullet
      pragueView.set(
        bulletUniqueId + bulletBody.bulletNo,
        JSON.stringify(
          {
            angle: bulletBody.c_position.a,
            bulletNo: bulletBody.bulletNo,
            dieTime: bulletBody.dieTime,
            isAlive: false,
            position: bulletBody.getPosition(),
          }));

      world.destroyBody(bulletBody);
      bulletBodies.splice(bidx, 1);
    }
  }

  function broadcastBustStatus(shipId, shipBodyLocal) {
    pragueView.set(
      shipId,
      JSON.stringify(
        {
          angle: shipBodyLocal.getAngle(),
          busted: true,
          isAlive: false,
          lastModified: Date.now().valueOf(),
          position: shipBodyLocal.getPosition(),
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
    const p = body.getPosition();
    p.x = wrapNumber(p.x, -SPACE_WIDTH / 2, SPACE_WIDTH / 2);
    p.y = wrapNumber(p.y, -SPACE_HEIGHT / 2, SPACE_HEIGHT / 2);
    body.setPosition(p);
  }

  function wrapNumber(num, min, max) {
    if (typeof min === "undefined") {
      max = 1, min = 0;
    } else if (typeof max === "undefined") {
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
  Stage((stage) => {
    const activeKeys = {};
    const KEY_NAMES = {
      32: "fire",
      37: "right",
      38: "up",
      39: "left",
      40: "down",
      65: "a",
    };

    const physics = new Physics({
      activeKeys,
      endGame,
      startGame,
      updateStatus,
    });

    let world;
    let meta;
    let gameover;

    stage.background("#222222");
    stage.on("viewport", (size) => {
      meta.pin({
        scaleHeight: size.height,
        scaleMode: "in-pad",
        scaleWidth: size.width,
      });
      world.pin({
        scaleHeight: size.height,
        scaleMode: "in-pad",
        scaleWidth: size.width,
      });
    });

    world = new Stage
      .planck(physics.world, { ratio: 80 })
      .pin({
        handle: -0.5,
        height: physics.spaceHeight,
        width: physics.spaceWidth,
      })
      .appendTo(stage);

    stage.tick(physics.tick);

    meta = Stage
      .create()
      .pin({ width: 1000, height: 1000 })
      .appendTo(stage);

    const livesStatus = Stage
      .string("text")
      .pin({ align: 0, offset: 20 })
      .appendTo(meta);

    const killStatus = Stage
      .string("text")
      .pin({ align: 0, offsetX: 20, offsetY: 50 })
      .appendTo(meta);

    const clientsStatus = Stage
      .string("text")
      .pin({ alignX: 1, offsetX: -20, offsetY: 20 })
      .appendTo(meta);

    const hsStatus = Stage
      .string("text")
      .pin({ alignX: 1, offsetX: -20, offsetY: 50 })
      .appendTo(meta);

    gameover = Stage
      .string("text")
      .value("Game Over!")
      .pin({ align: 0.5, scale: 1.6 })
      .appendTo(meta);

    function startGame() {
      gameover.hide();
    }

    function endGame() {
      gameover.show();
    }

    function updateStatus() {
      livesStatus.value("Lives:" + getHearts(physics.state.lives));
      killStatus.value("Kills: " + physics.state.level);
      clientsStatus.value("Clients: " + physics.state.connectedClients);

      let owner = "";
      let score = 0;
      const  hs = JSON.parse(pragueView.get(highScoreConst));
      if (hs != null) {
        if (hs.user === shipUniqueId) {
          owner = "You";
        } else {
          owner = hs.friendlyName;
        }

        score = hs.score;
      }

      hsStatus.value("High Score(" + owner + "): " + score);
    }

    document.onkeydown = (evt) => {
      if (physics.state.gameover) {
        physics.start();
      }
      activeKeys[KEY_NAMES[evt.keyCode]] = true;
    };

    document.onkeyup = (evt) => {
      activeKeys[KEY_NAMES[evt.keyCode]] = false;
    };

    physics.start();
  });
}

function getHearts(count) {
  let h = "";
  for (let i = 0; i < count; i++) {
    h += " ♥";
  }

  return h;
}

Stage({
  textures: {
    text: (d) => {
      d += "";
      return Stage.canvas((ctx) => {
        const ratio = 2;
        this.size(16, 24, ratio);
        ctx.scale(ratio, ratio);
        ctx.font = "bold 24px monospace";
        ctx.fillStyle = "#ddd";
        ctx.textBaseline = "top";
        ctx.fillText(d, 0, 1);
      });
    },
  },
});

export function updateFriendlyName() {
  const name = (document.getElementById("friendlyName") as HTMLInputElement).value;
  pragueFriendlyName = name;
  (document.activeElement as HTMLElement).blur();
  return false;
}
