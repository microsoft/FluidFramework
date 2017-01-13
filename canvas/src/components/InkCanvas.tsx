import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as $ from "jquery";
import * as InkUtils from "../inkutils"

export interface InkCanvasProps { 
    width: number;
    height: number;
    inkColor: string;
}

// If you don't use something in render(), it shouldn't be in state.
// Just make it a property of the class.
export interface InkCanvasState { 
    strokes: InkStroke[];
}

export interface Point {
    x: number;
    y: number;
}

export interface InkStroke {
    points: Point[];
    color: string;
}

export class InkCanvas extends React.Component<InkCanvasProps, InkCanvasState> {
    inking: boolean;
    wetInk: Point[];

	constructor(props : InkCanvasProps) {
        super(props)
        this.state = {
			strokes: []
        }

        this.inking = false

        this.pointerDown = this.pointerDown.bind(this);
        this.pointerMove = this.pointerMove.bind(this);
        this.pointerUp = this.pointerUp.bind(this);
	}
    componentDidMount() {
		this.postRender();
    }
    componentDidUpdate(prevProps: InkCanvasProps, prevState: InkCanvasState) {
        this.postRender();
    }

    pointerDown(event: any) {

        // For now, we will let mouse and pen ink, but ignore touch.
        if (event.pointerType === "touch") {
            return;
        }

		this.inking = true;
        this.wetInk = [{ x: event.clientX, y: event.clientY }];

        // TODO: using any here...
        // TODO: direct DOM access like findDOMNode is generally discouraged, though it may be
        // that this is a reasonable exception if canvas drawing isn't possible
        const canvas : any = ReactDOM.findDOMNode(this.refs["inkcanvas"]);
        const ctx = canvas.getContext("2d");
		ctx.beginPath();

        const color = (this.props.inkColor == 'rainbow' ? InkUtils.createRainbowInkGradient(ctx, canvas.width, canvas.height) : this.props.inkColor);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
	}
	pointerMove(event: any) {
		if (this.inking) {
			const lastPoint = this.wetInk.slice(-1)[0];
			const point = { x: event.clientX, y: event.clientY };

			const canvas : any = ReactDOM.findDOMNode(this.refs["inkcanvas"]);
            const ctx = canvas.getContext("2d");
            ctx.moveTo(lastPoint.x, lastPoint.y);
			ctx.lineTo(point.x, point.y);
			ctx.stroke();

			this.wetInk.push(point);
		}
	}
	pointerUp(event: any) {
		if (this.inking && this.wetInk.length > 1) {
            let stroke : InkStroke = {
                points: this.wetInk,
                color: this.props.inkColor
            }
			this.setState({ strokes: [...this.state.strokes, stroke] })
		}
		this.inking = false;
		this.wetInk = [];
	}
	render() {
		return (
            <canvas id="inkcanvas" 
                    ref="inkcanvas"
                    width={this.props.width} 
                    height={this.props.height}/>
		);
	}
	postRender() {
        const canvas : any = ReactDOM.findDOMNode(this.refs["inkcanvas"]);
		canvas.addEventListener("pointerdown", this.pointerDown);
		canvas.addEventListener("pointermove", this.pointerMove);
		canvas.addEventListener("pointerup", this.pointerUp);

		const ctx = canvas.getContext("2d");
        const grd = InkUtils.createRainbowInkGradient(ctx, canvas.width, canvas.height);

        // render all dried ink strokes we're tracking
        for (const s of this.state.strokes) {
            ctx.beginPath();
			ctx.strokeStyle = (s.color == 'rainbow' ? grd : s.color);
			ctx.moveTo(s.points[0].x, s.points[0].y);

            // connect all points in the stroke
			for (const pt of s.points.slice(1)) {
				ctx.lineTo(pt.x, pt.y);
			}
            ctx.stroke();
		}
	}
}

export default InkCanvas
