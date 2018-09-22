import * as Stage from "stage-js";

export class PlanckViewer extends Stage {
    // tslint:disable:variable-name
    private _options: any;
    private _world: any;
    // tslint:enable:variable-name

    constructor(world, opts) {
        super();

        super.label("Planck");

        opts = opts || {};

        const options = this._options = {} as any;
        this._options.speed = opts.speed || 1;
        this._options.hz = opts.hz || 60;
        if (Math.abs(this._options.hz) < 1) {
            this._options.hz = 1 / this._options.hz;
        }
        this._options.ratio = opts.ratio || 16;
        this._options.lineWidth = 2 / this._options.ratio;

        this._world = world;

        const timeStep = 1 / this._options.hz;
        let elapsedTime = 0;

        super.tick((dt) => {
            dt = dt * 0.001 * options.speed;
            elapsedTime += dt;
            while (elapsedTime > timeStep) {
                world.step(timeStep);
                elapsedTime -= timeStep;
            }
            this.renderWorld();

            return true;
        }, true);

        world.on("remove-fixture", (obj) => {
            if (obj.ui) {
                obj.ui.remove();
            }
        });

        world.on("remove-joint", (obj) => {
            if (obj.ui) {
                obj.ui.remove();
            }
        });
    }

    private renderWorld() {
        const world = this._world;
        const viewer = this;

        for (let b = world.getBodyList(); b; b = b.getNext()) {
            for (let f = b.getFixtureList(); f; f = f.getNext()) {

                if (!f.ui) {
                    if (f.render && f.render.stroke) {
                        this._options.strokeStyle = f.render.stroke;
                    } else if (b.render && b.render.stroke) {
                        this._options.strokeStyle = b.render.stroke;
                    } else if (b.isDynamic()) {
                        this._options.strokeStyle = "rgba(255,255,255,0.9)";
                    } else if (b.isKinematic()) {
                        this._options.strokeStyle = "rgba(255,255,255,0.7)";
                    } else if (b.isStatic()) {
                        this._options.strokeStyle = "rgba(255,255,255,0.5)";
                    }

                    if (f.render && f.render.fill) {
                        this._options.fillStyle = f.render.fill;
                    } else if (b.render && b.render.fill) {
                        this._options.fillStyle = b.render.fill;
                    } else {
                        this._options.fillStyle = "";
                    }

                    const type = f.getType();
                    const shape = f.getShape();
                    if (type === "circle") {
                        f.ui = viewer.drawCircle(shape, this._options);
                    }
                    if (type === "edge") {
                        f.ui = viewer.drawEdge(shape, this._options);
                    }
                    if (type === "polygon") {
                        f.ui = viewer.drawPolygon(shape, this._options);
                    }
                    if (type === "chain") {
                        f.ui = viewer.drawChain(shape, this._options);
                    }

                    if (f.ui) {
                        f.ui.appendTo(viewer);
                    }
                }

                if (f.ui) {
                    const p = b.getPosition();
                    const r = b.getAngle();
                    if (f.ui.__lastX !== p.x || f.ui.__lastY !== p.y || f.ui.__lastR !== r) {
                        f.ui.__lastX = p.x;
                        f.ui.__lastY = p.y;
                        f.ui.__lastR = r;
                        f.ui.offset(p.x, p.y);
                        f.ui.rotate(r);
                    }
                }
            }
        }

        for (let j = world.getJointList(); j; j = j.getNext()) {
            const a = j.getAnchorA();
            const b = j.getAnchorB();

            if (!j.ui) {
                this._options.strokeStyle = "rgba(255,255,255,0.2)";

                j.ui = viewer.drawJoint(j, this._options);
                j.ui.pin("handle", 0.5);
                if (j.ui) {
                    j.ui.appendTo(viewer);
                }
            }

            if (j.ui) {
                const cx = (a.x + b.x) * 0.5;
                const cy = (a.y + b.y) * 0.5;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                j.ui.width(d);
                j.ui.rotate(Math.atan2(dy, dx));
                j.ui.offset(cx, cy);
            }
        }
    }

    private drawJoint(joint, options) {
        const lw = options.lineWidth;
        const ratio = options.ratio;

        const length = 10;

        const texture = Stage.canvas(function(ctx) {
            this.size(length + 2 * lw, 2 * lw, ratio);

            ctx.scale(ratio, ratio);
            ctx.beginPath();
            ctx.moveTo(lw, lw);
            ctx.lineTo(lw + length, lw);

            ctx.lineCap = "round";
            ctx.lineWidth = options.lineWidth;
            ctx.strokeStyle = options.strokeStyle;
            ctx.stroke();
        });

        const image = Stage.image(texture).stretch();
        return image;
    }

    private drawCircle(shape, options) {
        const lw = options.lineWidth;
        const ratio = options.ratio;

        const r = shape.m_radius;
        const cx = r + lw;
        const cy = r + lw;
        const w = r * 2 + lw * 2;
        const h = r * 2 + lw * 2;

        const texture = Stage.canvas(function(ctx) {
            this.size(w, h, ratio);

            ctx.scale(ratio, ratio);
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            if (options.fillStyle) {
                ctx.fillStyle = options.fillStyle;
                ctx.fill();
            }
            ctx.lineTo(cx, cy);
            ctx.lineWidth = options.lineWidth;
            ctx.strokeStyle = options.strokeStyle;
            ctx.stroke();
        });

        const image = Stage.image(texture)
            .offset(shape.m_p.x - cx, shape.m_p.y - cy);
        const node = Stage.create().append(image);
        return node;
    }

    private drawEdge(edge, options) {
        const lw = options.lineWidth;
        const ratio = options.ratio;

        const v1 = edge.m_vertex1;
        const v2 = edge.m_vertex2;

        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;

        const length = Math.sqrt(dx * dx + dy * dy);

        const texture = Stage.canvas(function(ctx) {
            this.size(length + 2 * lw, 2 * lw, ratio);

            ctx.scale(ratio, ratio);
            ctx.beginPath();
            ctx.moveTo(lw, lw);
            ctx.lineTo(lw + length, lw);

            ctx.lineCap = "round";
            ctx.lineWidth = options.lineWidth;
            ctx.strokeStyle = options.strokeStyle;
            ctx.stroke();
        });

        const minX = Math.min(v1.x, v2.x);
        const minY = Math.min(v1.y, v2.y);

        const image = Stage.image(texture);
        image.rotate(Math.atan2(dy, dx));
        image.offset(minX - lw, minY - lw);
        const node = Stage.create().append(image);
        return node;
    }

    private drawPolygon(shape, options) {
        const lw = options.lineWidth;
        const ratio = options.ratio;

        const vertices = shape.m_vertices;

        if (!vertices.length) {
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const v of vertices) {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
        }

        const width = maxX - minX;
        const height = maxY - minY;

        const texture = Stage.canvas(function(ctx) {
            this.size(width + 2 * lw, height + 2 * lw, ratio);

            ctx.scale(ratio, ratio);
            ctx.beginPath();

            for (let i = 0; i < vertices.length; ++i) {
                const v = vertices[i];
                const x = v.x - minX + lw;
                const y = v.y - minY + lw;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            if (vertices.length > 2) {
                ctx.closePath();
            }

            if (options.fillStyle) {
                ctx.fillStyle = options.fillStyle;
                ctx.fill();
                ctx.closePath();
            }

            ctx.lineCap = "round";
            ctx.lineWidth = options.lineWidth;
            ctx.strokeStyle = options.strokeStyle;
            ctx.stroke();
        });

        const image = Stage.image(texture);
        image.offset(minX - lw, minY - lw);
        const node = Stage.create().append(image);
        return node;
    }

    private drawChain(shape, options) {
        const lw = options.lineWidth;
        const ratio = options.ratio;

        const vertices = shape.m_vertices;

        if (!vertices.length) {
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const v of vertices) {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
        }

        const width = maxX - minX;
        const height = maxY - minY;

        const texture = Stage.canvas(function(ctx) {
            this.size(width + 2 * lw, height + 2 * lw, ratio);

            ctx.scale(ratio, ratio);
            ctx.beginPath();
            for (let i = 0; i < vertices.length; ++i) {
                const v = vertices[i];
                const x = v.x - minX + lw;
                const y = v.y - minY + lw;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            // TODO: if loop
            if (vertices.length > 2) {
                // ctx.closePath();
            }

            if (options.fillStyle) {
                ctx.fillStyle = options.fillStyle;
                ctx.fill();
                ctx.closePath();
            }

            ctx.lineCap = "round";
            ctx.lineWidth = options.lineWidth;
            ctx.strokeStyle = options.strokeStyle;
            ctx.stroke();
        });

        const image = Stage.image(texture);
        image.offset(minX - lw, minY - lw);
        const node = Stage.create().append(image);
        return node;
    }
}
