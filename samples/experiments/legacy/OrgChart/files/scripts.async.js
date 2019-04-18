var margin = { top: 20, right: 120, bottom: 20, left: 120 };

var i = 0;
var duration = 750;
var root;

var viewWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) - 100;
var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) - 100;

// size of the diagram
var width = viewWidth - margin.left - margin.right;
var height = viewHeight - margin.top - margin.bottom;

var tree = d3.layout.tree()
    .size([height, width])
    .sort(function (a, b) {
        var aName = a.employee.Name.toLowerCase();
        var bName = b.employee.Name.toLowerCase();
        return aName < bName ? -1 : (aName > bName ? 1 : 0);
    });

var diagonal = d3.svg.diagonal()
    .projection(function (d) { return [d.y, d.x]; });

var svg = d3.select("body").append("svg")
    .attr("width", width + margin.right + margin.left)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


var NodeState = {
    ShowFocused: 1,
    HideReports: 2,
    ShowReports: 3,
};

var NodeType = {
    Normal: 1,
    Focused: 2,
    FocusedManager: 3,
};

var nodes = {};
// var aliases = ['yangg', 'takim', 'itair', 'kurtb'];
var aliases = [
    'alexcro',
    'alexgrig',
    'alit',
    'ashm',
    'benr',
    'bholley',
    'davidlee',
    'dcheung',
    'dconger',
    'gabehall',
    'iawillia',
    'igorz',
    'igorzv',
    'ilyatum',
    'kaushikn',
    'kurtb',
    'markyang',
    'maschmid',
    'mruhlen',
    'rlittle',
    'sabroner',
    'shaozhu',
    'steveluc',
    'yangg',
];

main();

async function main() {
    // why is await not allowed here?
    // aliases.forEach(alias => await addEmployee(alias));
    for (var alias of aliases) {
        console.log(alias);
        await addEmployee(alias.toLocaleUpperCase());
    }

    updateRoot();
}

async function addEmployee(alias) {
    if (alias in nodes) {
        nodes[alias].nodeType = NodeType.Focused;
        return;
    }

    var employee = await getEmployee(alias);
    var node = createNode(employee, null, NodeType.Focused, NodeState.ShowFocused);
    console.log(node);
    nodes[employee.Alias] = node;

    while (employee.ManagerEmployeeId != 0) {
        employee = await getEmployeeById(employee.ManagerEmployeeId);
        if (employee.Alias in nodes) {
            nodes[employee.Alias].children.push(node);
            break;
        }

        node = createNode(employee, node, NodeType.FocusedManager, NodeState.ShowFocused);
        console.log(node);
        nodes[employee.Alias] = node;
    }
}

function getEmployee(alias) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/api/EmployeeByAlias/' + alias,
        }).done(function (json) {
            console.log(json);
            resolve(json);
        });
    });
}

function getEmployeeById(id) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/api/EmployeeById/' + id,
        }).done(function (json) {
            console.log(json);
            resolve(json);
        });
    });
}

function getReports(id) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/api/Reports/' + id,
        }).done(function (reports) {
            console.log(reports);
            resolve(reports);
        });
    });
}

function createNode(employee, report, nodeType, nodeState) {
    var node = {
        name: employee.Name,
        children: report != null ? [report] : [],
        employee: employee,
        reportsPopulated: false,
        nodeType: nodeType,
        nodeState: nodeState,
        hasReports: employee.FullTimeReports + employee.VendorReports > 0,
    };

    if (report != null) {
        report.Manager = node;
    }

    return node;
}

function updateRoot() {
    for (var alias in nodes) {
        root = nodes[alias];
        break;
    }

    while (root.Manager && root.Manager != null) {
        root = root.Manager;
    }

    root.x0 = height / 2;
    root.y0 = 0;
    update(root);
}

function update(source) {

    // Compute the new tree layout.
    var nodes = tree.nodes(root).reverse(),
        links = tree.links(nodes);

    // Normalize for fixed-depth.
    nodes.forEach(function (d) { d.y = d.depth * 180; });

    // Update the nodes?
    var node = svg.selectAll("g.node")
        .data(nodes, function (d) { return d.id || (d.id = ++i); });

    // Enter any new nodes at the parent's previous position.
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", function (d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
        .on("click", click);

    function getColor(nodeType) {
        switch (nodeType) {
            case NodeType.Focused:
                return 'red';
            case NodeType.FocusedManager:
                return 'purple';
            case NodeType.Normal:
            default:
                return 'steelblue';
        }
    }

    nodeEnter.append("circle")
        .on("mouseover", mouseover)
        .on("mousemove", function (d) { mousemove(d); })
        .on("mouseout", mouseout)
        .attr("r", 1e-6)
        .style("fill", function (d) { return d.hasReports ? "lightsteelblue" : "#fff"; })
        .style('stroke', function (d) { return getColor(d.nodeType); });

    nodeEnter.append("text")
        .attr("x", -10)
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .text(function (d) { return d.name; })
        .style("fill-opacity", 1e-6);

    // Transition nodes to their new position.
    var nodeUpdate = node.transition()
        .duration(duration)
        .attr("transform", function (d) { return "translate(" + d.y + "," + d.x + ")"; });

    nodeUpdate.select("circle")
        .attr("r", 4.5)
        .style("fill", function (d) { return d.hasReports ? "lightsteelblue" : "#fff"; });

    nodeUpdate.select("text")
        .style("fill-opacity", 1);

    // Transition exiting nodes to the parent's new position.
    var nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", function (d) { return "translate(" + source.y + "," + source.x + ")"; })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    // Update the links?
    var link = svg.selectAll("path.link")
        .data(links, function (d) { return d.target.id; });

    // Enter any new links at the parent's previous position.
    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
            var o = { x: source.x0, y: source.y0 };
            return diagonal({ source: o, target: o });
        });

    // Transition links to their new position.
    link.transition()
        .duration(duration)
        .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit().transition()
        .duration(duration)
        .attr("d", function (d) {
            var o = { x: source.x, y: source.y };
            return diagonal({ source: o, target: o });
        })
        .remove();

    // Stash the old positions for transition.
    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

var div = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 1e-6);

function mouseover() {
    div.transition()
        .duration(300)
        .style("opacity", 1);
}

function mousemove(d) {
    var tooltip =
        d.name + "<br>" +
        d.employee.Alias + "<br>" +
        d.employee.Title + "<br>";

    if (d.employee.Office) {
        tooltip += d.employee.Office;
    }

    div
        .html(tooltip)
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY + 10) + "px");
}

function mouseout() {
    div.transition()
        .duration(300)
        .style("opacity", 1e-6);
}

// Toggle children on click.
async function click(d) {
    switch (d.nodeState) {
        case NodeState.ShowFocused:
            if (!d.reportsPopulated) {
                var reports = await getReports(d.employee.EmployeeId);
                d.reportsPopulated = true;

                if (!d.children || d.children == null) {
                    d.children = [];
                }

                var childAliases = d.children.map(c => c.employee.Alias);
                reports.forEach(r => {
                    if (!(childAliases.includes(r.Alias))) {
                        var node = createNode(r, null, NodeType.Normal, NodeState.ShowFocused);
                        node.Manager = d;
                        d.children.push(node);
                    }
                });
            }
            else {
                d.children = d._children;
            }

            d.nodeState = NodeState.ShowReports;
            break;

        case NodeState.ShowReports:
            d._children = d.children;
            d.children = null;
            d.nodeState = NodeState.HideReports;
            break;

        case NodeState.HideReports:
            d.children = d._children.filter(c => c.nodeType == NodeType.Focused || c.nodeType == NodeType.FocusedManager);
            if (d.children.length == 0) {
                d.children = d._children;
                d.nodeState = NodeState.ShowReports;
            }
            else {
                d.nodeState = NodeState.ShowFocused;
            }
            break;
    }

    update(d);
}

