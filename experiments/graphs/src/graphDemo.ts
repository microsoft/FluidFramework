// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
//const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
//const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, repository);

let id = "testGraph-pooch7";

interface ISharedVertex {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	label: string;
}

interface ISharedEdge {
	nodeId1: string;
	nodeId2: string;
	label: string;
}

class SharedGraph {
	constructor(public vertices: prague.types.ISet<ISharedVertex>,
		public edges: prague.types.ISet<ISharedEdge>) {

	}
	async addVertex(id: string, label: string, x: number, y: number, width: number, height: number) {
		await this.vertices.add(<ISharedVertex>{
			id, x, y, width, height, label
		});
	}
	async addEdge(nodeId1: string, nodeId2: string, label: string) {
		await this.edges.add(<ISharedEdge>{
			nodeId1, nodeId2, label
		});
	}
}

function getLatestVersion(id: string): Promise<any> {
	const versionP = new Promise<any>((resolve, reject) => {
		const versionsP = $.getJSON(`${historian}/repos/${repository}/commits?sha=${encodeURIComponent(id)}&count=1`);
		versionsP
			.done((version) => {
				resolve(version[0]);
			})
			.fail((error) => {
				if (error.status === 400) {
					resolve(null);
				} else {
					reject(error.status);
				}
			});
	});

	return versionP;
}

async function main(container: HTMLDivElement) {
	let sharedGraph: SharedGraph;
	let graphView: prague.types.IMapView;
	// Get the latest version of the document
	const version = await getLatestVersion(id);
	console.log(version);

	// Load in the latest and connect to the document
	const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true }, version);

	const rootView = await collabDoc.getRoot().getView();
	let graphMap: prague.types.IMap;
	if (!rootView.has("graph")) {
		graphMap = collabDoc.createMap();
		rootView.set("graph", graphMap);
		let vertexSet = await graphMap.createSet<ISharedVertex>("vertices");
		let edgeSet = await graphMap.createSet<ISharedEdge>("edges");
		sharedGraph = new SharedGraph(vertexSet, edgeSet);
		graphView = await graphMap.getView();
	} else {
		graphMap = rootView.get("graph");
		graphView = await graphMap.getView();
		let vertexSet: prague.types.ISet<ISharedVertex> = graphView.get("vertices");
		let edgeSet: prague.types.ISet<ISharedEdge> = graphView.get("edges");
		sharedGraph = new SharedGraph(vertexSet, edgeSet);
	}
	mainMX(container, sharedGraph, collabDoc, graphView, graphMap);
}

// Program starts here. Creates a sample graph in the
// DOM node with the specified ID. This function is invoked
// from the onLoad event handler of the document (see below).
function mainMX(container: HTMLDivElement, sharedGraph: SharedGraph,
	collabDoc: prague.api.Document, graphView: prague.types.IMapView,
	graphMap: prague.types.IMap) {
	// Checks if the browser is supported
	if (!mxClient.isBrowserSupported()) {
		// Displays an error message if the browser is not supported.
		mxUtils.error('Browser is not supported!', 200, false);
	}
	else {
		mxEvent.disableContextMenu(container);

		var mxCellRendererInstallCellOverlayListeners = mxCellRenderer.prototype.installCellOverlayListeners;
		mxCellRenderer.prototype.installCellOverlayListeners = function (state, overlay, shape) {
			mxCellRendererInstallCellOverlayListeners.apply(this, arguments);

			mxEvent.addListener(shape.node, (mxClient.IS_POINTER) ? 'pointerdown' : 'mousedown', function (evt) {
				overlay.fireEvent(new mxEventObject('pointerdown', 'event', evt, 'state', state));
			});

			if (!mxClient.IS_POINTER && mxClient.IS_TOUCH) {
				mxEvent.addListener(shape.node, 'touchstart', function (evt) {
					overlay.fireEvent(new mxEventObject('pointerdown', 'event', evt, 'state', state));
				});
			}
		};

		// Creates the graph inside the given container
		var graph = new mxGraph(container);
		graph.setPanning(true);
		graph.panningHandler.useLeftButtonForPanning = true;
		graph.setAllowDanglingEdges(false);
		graph.connectionHandler.select = false;
		graph.view.setTranslate(20, 20);

		// Enables rubberband selection
		new mxRubberband(graph);

		// Gets the default parent for inserting new cells. This
		// is normally the first child of the root (ie. layer 0).
		var parent = graph.getDefaultParent();
		let localVertexMap = Object.create(null);
		let localVertexIndex = 0;
		let localIdPrefix = collabDoc.clientId;

		function makeId(objectType: string) {
			let countSuffix = localVertexIndex++;
			return `${objectType}${localIdPrefix}${countSuffix}`;
		}

		let localOp = false;

		function sendAddVertex(v: IVertex, label: string, x: number, y: number, width: number, height: number) {
			v.sharedId = makeId("N");
			localVertexMap[v.sharedId] = v;
			localOp = true;
			sharedGraph.addVertex(v.sharedId, label, x, y, width, height);
			localOp = false;
		}

		function sendGraphUpdate(v1: IVertex, v2: IVertex, label: string, x: number, y: number,
			width: number, height: number) {
				sendAddVertex(v2, label, x, y, width, height);
			localOp = true;
			sharedGraph.addEdge(v1.sharedId, v2.sharedId, "");
			localOp = false;
		}

		var addOverlay = function (cell) {
			// Creates a new overlay with an image and a tooltip
			var overlay = new mxCellOverlay(new mxImage('images/add.png', 24, 24), 'Add outgoing');
			overlay.cursor = 'hand';

			// Installs a handler for clicks on the overlay							
			overlay.addListener(mxEvent.CLICK, function (sender, evt2) {
				graph.clearSelection();
				var geo = graph.getCellGeometry(cell);

				var v2;

				executeLayout(function () {
					let label = "L"
					v2 = graph.insertVertex(parent, null, label, geo.x, geo.y, 80, 30);
					addOverlay(v2);
					graph.view.refresh(v2);
					graph.insertEdge(parent, null, '', cell, v2);
					sendGraphUpdate(cell, v2, label, geo.x, geo.y, 80, 30);
				}, function () {
					graph.scrollCellToVisible(v2);
				});
			});

			// Special CMS event
			overlay.addListener('pointerdown', function (sender, eo) {
				var evt2 = eo.getProperty('event');
				var state = eo.getProperty('state');

				graph.popupMenuHandler.hideMenu();
				graph.stopEditing(false);

				var pt = mxUtils.convertPoint(graph.container,
					mxEvent.getClientX(evt2), mxEvent.getClientY(evt2));
				graph.connectionHandler.start(state, pt.x, pt.y);
				graph.isMouseDown = true;
				graph.isMouseTrigger = mxEvent.isMouseEvent(evt2);
				mxEvent.consume(evt2);
			});

			// Sets the overlay for the cell in the graph
			graph.addCellOverlay(cell, overlay);
		}

		// Adds cells to the model in a single step
		graph.getModel().beginUpdate();
		var v1;
		try {
			v1 = graph.insertVertex(parent, null, 'Hello,', 0, 0, 80, 30);
			addOverlay(v1);
			sendAddVertex(v1, 'Hello', 0, 0, 80, 30);
		}
		finally {
			// Updates the display
			graph.getModel().endUpdate();
		}

		var layout = new mxHierarchicalLayout(graph, mxConstants.DIRECTION_WEST);

		var executeLayout = function (change?, post?) {
			graph.getModel().beginUpdate();
			try {
				if (change != null) {
					change();
				}

				layout.execute(graph.getDefaultParent(), v1);
			}
			catch (e) {
				throw e;
			}
			finally {
				// New API for animating graph layout results asynchronously
				var morph = new mxMorphing(graph);
				morph.addListener(mxEvent.DONE, mxUtils.bind(this, function () {
					graph.getModel().endUpdate();

					if (post != null) {
						post();
					}
				}));

				morph.startAnimation();
			}
		};

		function addEdgeFromRemote(e: ISharedEdge) {
			let v1 = localVertexMap[e.nodeId1];
			let v2 = localVertexMap[e.nodeId2];
			executeLayout(function () {
				graph.insertEdge(parent, null, e.label, v1, v2);
			}, function () {
				graph.scrollCellToVisible(v2);
			});
		}

		function addVertexFromRemote(v: ISharedVertex) {
			let iv: IVertex;
			executeLayout(function () {
				let iv = graph.insertVertex(parent, null, v.label, v.x, v.y, v.width, v.height);
				localVertexMap[v.id] = iv;
				addOverlay(iv);
				graph.view.refresh(iv);
			}, function () {
				graph.scrollCellToVisible(iv);
			});
		}
		interface IElementAdded {
			key: string;
		}

		interface ITypedElementAdded<T> extends IElementAdded {
			key: string;
			value: T;
		}
		let never = false;
		graphMap.on("setElementAdded", (delta: IElementAdded) => {
			if ((!localOp) && (!never)) {
				if (delta.key === "vertices") {
					let tdelta = <ITypedElementAdded<ISharedVertex>>delta;
					addVertexFromRemote(tdelta.value);
				} else if (delta.key === "edges") {
					let tdelta = <ITypedElementAdded<ISharedEdge>>delta;
					addEdgeFromRemote(tdelta.value);
				}
			}
		});

		var edgeHandleConnect = mxEdgeHandler.prototype.connect;
		mxEdgeHandler.prototype.connect = function (edge, terminal, isSource, isClone, me) {
			edgeHandleConnect.apply(this, arguments);
			executeLayout();
		};

		graph.resizeCell = function () {
			mxGraph.prototype.resizeCell.apply(this, arguments);

			executeLayout();
		};

		graph.connectionHandler.addListener(mxEvent.CONNECT, function () {
			executeLayout();
		});
	}
};
