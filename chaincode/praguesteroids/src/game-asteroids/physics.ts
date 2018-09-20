// tslint:disable:no-bitwise
import { IMapView } from "@prague/map";
// tslint:disable-next-line:no-var-requires
const pl = require("planck-js");

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

const SHIP_SPEED_DEFAULT = 2;

export const highScoreConst = "HIGH_SCORE";

export class GameState {
    public level = 0;
    public lives = 0;
    public connectedClients = 0;
    public gameover = false;

    public startGame() {
        this.gameover = false;
        this.level = 0;
        this.lives = 3;
        this.connectedClients = 0;
    }

    public crash() {
        this.lives--;
    }

    public levelUp() {
      this.level++;
    }

    public endGame() {
      this.gameover = true;
    }
}

export class Physics {
    public world;
    public spaceWidth;
    public spaceHeight;
    public state;

    private globalTime = 0;
    private SHIP_SPEED = SHIP_SPEED_DEFAULT;

    private ships = {};
    private bullets = {};

    private shipIdPrefix = "ship";
    private shipUniqueId = this.customGuid(this.shipIdPrefix);

    private bulletIdPrefix = "bullet";
    private bulletUniqueId = this.customGuid(this.bulletIdPrefix);
    private bulletCounter = 0;

    private pragueFriendlyName = "";

    private bulletBodies = [];
    private shipBody;

    private allowCrashTime = 0;
    private allowFireTime = 0;

    // Only send every _sendLocationUpdateMod frame
    private pragueSendLocationUpdateMod = 2;
    private pragueSendLocationUpdateCount = 1;

    constructor(private pragueView: IMapView, private ui) {
        // game state
        const state = new GameState();
        this.state = state;
        this.spaceWidth = SPACE_WIDTH;
        this.spaceHeight = SPACE_HEIGHT;

        this.world = pl.World();

        // Todo: check if several bullets hit the same asteroid in the same time step
        this.world.on("pre-solve", (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();

            const bodyA = contact.getFixtureA().getBody();
            const bodyB = contact.getFixtureB().getBody();

            const aship = bodyA === this.shipBody;
            const bship = bodyB === this.shipBody;
            const abullet = fixtureA.getFilterCategoryBits() & BULLET;
            const bbullet = fixtureB.getFilterCategoryBits() & BULLET;

            // am I hit?
            if ((aship || bship) && this.allowCrashTime < this.globalTime) {
                // Ship collided with something
                const ship = aship ? bodyA : bodyB;
                const ufo = !aship ? bodyA : bodyB;

                setTimeout(
                    () => {
                        this.crash(ship, ufo, true);
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
                        this.hit(ship, bullet);
                    },
                    1);
            }
        });
    }

    public start() {
        this.state.startGame();
        this.ui.updateStatus();
        this.setupShip();
        // createEnemies();
        this.ui.startGame();
    }

    public updateFriendlyName(name: string) {
        this.pragueFriendlyName = name;
        return false;
    }

    public tick(dt) {
        this.globalTime += dt;

        // resolve this before rendering the fram
        const amIDead = this.amIBusted();

        if (this.shipBody) {
            // Set velocities
            if (this.ui.activeKeys.left && !this.ui.activeKeys.right) {
                this.shipBody.applyAngularImpulse(0.1, true);
            } else if (this.ui.activeKeys.right && !this.ui.activeKeys.left) {
                this.shipBody.applyAngularImpulse(-0.1, true);
            }

            // Thrust: add some force in the ship direction
            if (this.ui.activeKeys.up) {
                const f = this.shipBody.getWorldVector(Vec2(0.0, this.SHIP_SPEED));
                const p = this.shipBody.getWorldPoint(Vec2(0.0, 2.0));
                this.shipBody.applyLinearImpulse(f, p, true);
            }

            if (this.ui.activeKeys.a) {
                this.SHIP_SPEED = 5;
            } else {
                this.SHIP_SPEED = SHIP_SPEED_DEFAULT;
            }

            // Fire
            if (this.ui.activeKeys.fire && this.globalTime > this.allowFireTime) {
                const magnitude = 10;

                // Create a bullet body
                const bulletBody = this.world.createDynamicBody({
                    bullet: true,
                    // mass : 0.05,
                    linearVelocity: this.shipBody.getWorldVector(Vec2(0, magnitude)),
                    position: this.shipBody.getWorldPoint(Vec2(0, SHIP_SIZE)),
                });
                bulletBody.createFixture(new pl.Circle(BULLET_SIZE), {
                    filterCategoryBits: BULLET,
                    filterMaskBits: ASTEROID,
                });
                this.bulletBodies.push(bulletBody);

                // Keep track of the last time we shot
                this.allowFireTime = this.globalTime + FIRE_RELOAD_TIME;

                // Remember when we should delete this bullet
                bulletBody.dieTime = this.globalTime + BULLET_LIFE_TIME;

                bulletBody.bulletNo = ++this.bulletCounter;

                this.pragueView.set(
                    this.bulletUniqueId + bulletBody.bulletNo,
                    JSON.stringify(
                        {
                            angle: bulletBody.c_position.a,
                            bulletNo: bulletBody.bulletNo,
                            dieTime: bulletBody.dieTime,
                            isAlive: true,
                            position: bulletBody.getPosition(),
                            velocity: this.shipBody.getWorldVector(Vec2(0, magnitude)),
                        }));

            }

            this.wrap(this.shipBody);

            if (this.pragueView != null) {
                // Only set our position if something has changed
                const myshipString = this.pragueView.get(this.shipUniqueId);
                const myship = myshipString != null ? JSON.parse(myshipString) : null;
                const shipBodyPosition = this.shipBody.getPosition();

                // Send location update every other frame
                if (this.pragueSendLocationUpdateCount === 1 && !amIDead) {
                    if (myship == null ||
                        myship.position.x !== shipBodyPosition.x ||
                        myship.position.y !== shipBodyPosition.y ||
                        myship.angle !== this.shipBody.c_position.a ||
                        Date.now().valueOf() > myship.lastModified + 1000) {
                        this.updateMyShipStatus();
                    }
                }

                this.pragueSendLocationUpdateCount = (this.pragueSendLocationUpdateCount + 1)
                    % this.pragueSendLocationUpdateMod;

                const hs = JSON.parse(this.pragueView.get(highScoreConst));

                let count = 0;
                for (const key of this.pragueView.keys()) {

                    if (key.startsWith(this.shipIdPrefix)) {
                        count = count + 1;

                        if (!key.startsWith(this.shipUniqueId)) {

                            const collabShip = JSON.parse(this.pragueView.get(key));

                            // if the other ship hasn't been updated for 60 sec
                            // delete it
                            if (collabShip.lastModified == null ||
                                Date.now().valueOf() - collabShip.lastModified > 5000) {

                                this.pragueView.delete(key);

                                if (this.ships[key] != null) {
                                    this.world.destroyBody(this.ships[key]);
                                    this.ships[key] = null;
                                }
                            } else {
                                if (this.ships[key] == null && !collabShip.busted) {
                                    this.ships[key] = this.createEnemyShip(key, collabShip.isBot);
                                }

                                if (this.ships[key]) {
                                    this.ships[key].setPosition(collabShip.position);
                                    this.ships[key].setAngle(collabShip.angle);

                                    if (key === hs.user) {
                                        this.ships[key].render = { fill: "#b2b2ff", stroke: "#000" };
                                    } else {
                                        this.ships[key].render = { fill: "#bb0000", stroke: "#000000" };
                                    }
                                }
                            }
                        }
                    } else if (key.startsWith(this.bulletIdPrefix)) {
                        if (!key.startsWith(this.bulletUniqueId)) {
                            const collabBullet = JSON.parse(this.pragueView.get(key));

                            if (!collabBullet.isAlive) {
                                this.pragueView.delete(key);
                                if (this.bullets[key] != null) {
                                    this.world.destroyBody(this.bullets[key]);
                                    this.bullets[key] = null;
                                }
                            } else if (this.bullets[key] == null) {
                                this.bullets[key] =
                                    this.createEnemyBullet(collabBullet.velocity, collabBullet.position);
                            }
                        }
                    }
                }

                // TODO link back up the connectec clients
                // if (count !== this.pragueConnectedClients) {
                //     this.pragueConnectedClients = count;
                //     connectToPragueGlobalMap(false).then(() => addToGlobalMap(docId, pragueConnectedClients));
                // }

                this.state.connectedClients = count;
                this.ui.updateStatus();
            }

        }

        if (amIDead && this.shipBody != null) {
            this.crash(this.shipBody, null, false);
        }

        for (let i = 0; i !== this.bulletBodies.length; i++) {
            const bulletBody = this.bulletBodies[i];

            // If the bullet is old, delete it
            if (bulletBody.dieTime <= this.globalTime) {
                this.pragueView.set(
                    this.bulletUniqueId + bulletBody.bulletNo,
                    JSON.stringify(
                        {
                            angle: bulletBody.c_position.a,
                            bulletNo: bulletBody.bulletNo,
                            dieTime: bulletBody.dieTime,
                            isAlive: false,
                            position: bulletBody.getPosition(),
                        }));

                this.bulletBodies.splice(i, 1);
                this.world.destroyBody(bulletBody);
                i--;
                continue;
            }
            this.wrap(bulletBody);
        }

        this.renderEnemies();
    }

    private end() {
        this.state.endGame();
        this.ui.endGame();
    }

    private randomnumber(maxnumber) {
        return Math.random() * (2 * maxnumber) + maxnumber; // 5 is the max number we want
    }

    private setupShip() {
        this.shipBody = this.world.createBody({
            angularDamping: 2.0,
            linearDamping: 0.5,
            position: Vec2(this.randomnumber(30), this.randomnumber(15)),
            type: "dynamic",
        });

        this.shipBody.createFixture(
            pl.Polygon([
                Vec2(-0.15, -0.15),
                Vec2(0, -0.1),
                Vec2(0.15, -0.15),
                Vec2(0, 0.2),
            ]),
            {
                density: 1000,
                filterCategoryBits: SHIP,
                filterMaskBits: ASTEROID,
            });

        this.shipBody.render = { fill: "#ffdd00", stroke: "#000000" };
        this.allowCrashTime = this.globalTime + 2000;

        this.updateMyShipStatus();
    }

    private renderEnemies() {
        for (const key in this.ships) {
            if (this.ships.hasOwnProperty(key) && this.ships[key]) {
                this.wrap(this.ships[key]);
            }
        }
    }

    private amIBusted() {
        if (!this.pragueView) {
            return false;
        }

        const myShipString = this.pragueView.get(this.shipUniqueId);
        const myShip = myShipString != null ? JSON.parse(myShipString) : null;
        return (myShip != null && myShip.busted);
    }

    private createEnemyBullet(enemyVelocity, enemyPosition) {
        const enemyBulletBody = this.world.createDynamicBody({
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

    private updateMyShipStatus() {
        if (this.pragueView) {
            this.pragueView.set(
                this.shipUniqueId,
                JSON.stringify(
                    {
                        angle: this.shipBody.c_position.a,
                        busted: false,
                        lastModified: Date.now().valueOf(),
                        position: this.shipBody.getPosition(),
                    }));
        }
    }

    private createEnemyShip(shipId, isBot) {
        let enemy;
        if (isBot) {
            enemy = this.world.createBody({
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
                const x = radius * (Math.sin(a) + this.rand(0.3));
                const y = radius * (Math.cos(a) + this.rand(0.3));
                path.push(Vec2(x, y));
            }
            enemy.createFixture(pl.Polygon(path), {
                filterCategoryBits: ASTEROID,
                filterMaskBits: BULLET | SHIP,
            });

            let fillColor = "#00ff00";
            const hs = this.pragueView.get(highScoreConst);
            if (shipId === hs.user) {
                fillColor = "#0000FF";
            }

            enemy.render = { fill: fillColor, stroke: "#000000" };
        } else {
            enemy = this.world.createBody({
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

    private crash(ship, ufo, shouldBroadCastMyCrash) {
        if (!this.shipBody) {
            return;
        }

        if (shouldBroadCastMyCrash) {
            this.broadcastBustStatus(this.shipUniqueId, ship);
        }

        this.state.crash();
        this.ui.updateStatus();

        // Remove the ship body for a while
        this.world.destroyBody(this.shipBody);

        this.shipBody = null;

        // if UFO is an enemy ship, destroy it.
        if (ufo !== null && this.ships[ufo.shipId]) {
            this.destroyEnemy(ufo);
        }

        if (this.state.lives <= 0) {
            this.end();
            return;
        }
        setTimeout(
            () => {
                // Add ship again
                this.setupShip();
            },
            1000);
    }

    private hit(enemyShip, bulletBody) {
        const bidx = this.bulletBodies.indexOf(bulletBody);
        if (this.ships[enemyShip.shipId] && bidx !== -1) {
            this.destroyEnemy(enemyShip);

            this.state.levelUp();
            this.ui.updateStatus();

            const hs = JSON.parse(this.pragueView.get(highScoreConst));
            if (hs == null || hs.score < this.state.level) {
                const name =
                    this.pragueFriendlyName === "" ||
                    this.pragueFriendlyName == null ? "?" : this.pragueFriendlyName;

                this.pragueView.set(
                    highScoreConst,
                    JSON.stringify({ user: this.shipUniqueId, friendlyName: name, score: this.state.level }));
            }

            // Remove bullet
            this.pragueView.set(
                this.bulletUniqueId + bulletBody.bulletNo,
                JSON.stringify(
                    {
                        angle: bulletBody.c_position.a,
                        bulletNo: bulletBody.bulletNo,
                        dieTime: bulletBody.dieTime,
                        isAlive: false,
                        position: bulletBody.getPosition(),
                    }));

            this.world.destroyBody(bulletBody);
            this.bulletBodies.splice(bidx, 1);
        }
    }

    private broadcastBustStatus(shipId, shipBodyLocal) {
        this.pragueView.set(
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

    private destroyEnemy(enemy) {
        if (this.ships[enemy.shipId]) {
            this.broadcastBustStatus(enemy.shipId, enemy);
            this.world.destroyBody(enemy);
            this.ships[enemy.shipId] = null;
        }
    }

    // If the body is out of space bounds, wrap it to the other side
    private wrap(body) {
        const p = body.getPosition();
        p.x = this.wrapNumber(p.x, -SPACE_WIDTH / 2, SPACE_WIDTH / 2);
        p.y = this.wrapNumber(p.y, -SPACE_HEIGHT / 2, SPACE_HEIGHT / 2);
        body.setPosition(p);
    }

    private wrapNumber(num, min, max) {
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
    private rand(value) {
        return (Math.random() - 0.5) * (value || 1);
    }

    private customGuid(prefix) {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return prefix + "-" + s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
    }
}
