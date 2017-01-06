window.$ = window.jQuery = require('jquery');
import React from 'react'
import ReactDOM from 'react-dom'

import Whiteboard from './whiteboard'

import InkGeometry from './inkgeometry'

window.createWhiteboard = () => {
	ReactDOM.render(<Whiteboard /> , document.getElementById('whiteboard'));
}

window.createTriangle = (elementId, points, width, height) => {
	ReactDOM.render(<InkGeometry width={width} height={height} points={points} /> , document.getElementById(elementId));
}
