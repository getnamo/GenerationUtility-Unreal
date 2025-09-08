const {debugPoint, logObj} = require('GenerationUtility/utility/objectUtility.js');

/** 
 * Simple pathfinding algorithms to traverse edges/points to create shortest paths from a graph.
 * Mainly Dijkstra and AStar.
*/

class PriorityQueue {
	constructor() {
		this.nodes = [];
	}

	enqueue(key, priority) {
		this.nodes.push({ key, priority });
		this.sort();
	}

	dequeue() {
		return this.nodes.shift();
	}

	//sort by priority
	sort() {
		this.nodes.sort((a, b) => a.priority - b.priority);
	}

	isEmpty() {
		return !this.nodes.length;
	}
}

//vector utility (js duplication)
function dot(v1, v2) {
	return v1.X * v2.X + v1.Y * v2.Y + v1.Z * v2.Z;
}

function subtract(v1, v2) {
	return { X: v1.X - v2.X, Y: v1.Y - v2.Y, Z: v1.Z - v2.Z };
}

function add(v1, v2) {
	return { X: v1.X + v2.X, Y: v1.Y + v2.Y, Z: v1.Z + v2.Z };
}

function scale(v, scalar) {
	return { X: v.X * scalar, Y: v.Y * scalar, Z: v.Z * scalar };
}

function distanceSquared(v1, v2) {
	const dx = v1.X - v2.X;
	const dy = v1.Y - v2.Y;
	const dz = v1.Z - v2.Z;
	return dx * dx + dy * dy + dz * dz;
}

// Example heuristic function (Euclidean distance in 3D)
function euclidean(node, end) {
	const dx = node.X - end.X;
	const dy = node.Y - end.Y;
	const dz = node.Z - end.Z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dijkstra(adjacencyList, start, end) {
	const distances = new Map();
	const previous = new Map();
	const pq = new PriorityQueue();

	distances.set(start, 0);
	pq.enqueue(start, 0);

	adjacencyList.forEach((_, vertex) => {
		if (vertex !== start) distances.set(vertex, Infinity);
		previous.set(vertex, null);
	});

	while (!pq.isEmpty()) {
		const { key: currentVertex } = pq.dequeue();

		if (currentVertex === end) {
			const path = [];
			let step = currentVertex;
			while (previous.get(step)) {
				path.push(step);
				step = previous.get(step);
			}
			return path.concat(start).reverse();
		}

		adjacencyList.get(currentVertex).forEach(neighbor => {
			const alt = distances.get(currentVertex) + neighbor.weight;
			if (alt < distances.get(neighbor.to)) {
				distances.set(neighbor.to, alt);
				previous.set(neighbor.to, currentVertex);
				pq.enqueue(alt, neighbor.to);
			}
		});
	}

	return [];
}

//edges and vertices make the graph that we pathfind through
function aStar(edges, vertices, startId, goalId, heuristic = euclidean) {
	const frontier = new PriorityQueue();
	frontier.enqueue(startId, 0);

	const previous = {};
	const costSoFar = {};

	previous[startId] = null;
	costSoFar[startId] = 0;

	while (!frontier.isEmpty()) {
		const currentEntry = frontier.dequeue();
		if(!currentEntry){
			break;
		}
		const current = currentEntry.key;

		if (current === goalId ) {
			break;
		}

		const neighbors = edges[current] || [];
		neighbors.forEach(({ node, weight }) => {
			const newCost = costSoFar[current] + weight;
			if (!(node in costSoFar) || newCost < costSoFar[node]) {
				costSoFar[node] = newCost;
				const priority = newCost + heuristic(vertices[node], vertices[goalId]);
				frontier.enqueue(node, priority);
				previous[node] = current;
			}
		});
	}

	// Reconstruct path
	const path = [];
	let currentNode = goalId;
	while (currentNode !== null) {
		path.push(currentNode);
		currentNode = previous[currentNode];
	}
	path.reverse();

	// Check if goal was reached
	if (path[0] !== startId) {
		return []; // No path found
	}

	return path;
}


// Pseudo-random number generator with a seed
function mulberry32(a) {
	return function() {
		var t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

// Generate random set of points
function generateRandomPoints(numPoints, seed, scale=100) {
	const rand = mulberry32(seed);
	const points = [];
	for (let i = 0; i < numPoints; i++) {
		points.push({ id: i, X: rand() * scale, Y: rand() * scale, Z: rand() * scale });
	}
	return points;
}

// Calculate edges based on Euclidean distance
function calculateEdges(points, radius) {
	const edges = [];
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const distance = euclidean(points[i], points[j]);
			if (distance <= radius) {
				edges.push({ from: points[i].id, to: points[j].id, weight: distance });
			}
		}
	}
	return edges;
}

function testPathFinding(){

	// Example usage:
	const numPoints = 500;
	const radius = 6;
	const seed = 12345;
	const vertices = generateRandomPoints(numPoints, seed, 40);
	const edges = calculateEdges(vertices, radius);

	// Create adjacency list
	const adjacencyList = new Map();

	vertices.forEach(vertex => {
		adjacencyList.set(vertex, []);
	});

	edges.forEach(edge => {
		const fromVertex = vertices.find(v => v.id === edge.from);
		const toVertex = vertices.find(v => v.id === edge.to);
		adjacencyList.get(fromVertex).push({ to: toVertex, weight: edge.weight });
		adjacencyList.get(toVertex).push({ to: fromVertex, weight: edge.weight }); // if the graph is undirected
	});

	// Find shortest path using Dijkstra
	const startVertex = vertices[0]; // Example start point
	const endVertex = vertices[numPoints-1];   // Example end point
	const shortestPathDijkstra = dijkstra(adjacencyList, startVertex, endVertex);

	console.log('Shortest path using Dijkstra:', JSON.stringify(shortestPathDijkstra,null,2));

	// Find shortest path using A*
	const shortestPathAStar = aStar(adjacencyList, startVertex, endVertex);

	console.log('Shortest path using A*:', JSON.stringify(shortestPathAStar,null,2));
}

// Function to build graph (vertices and edges) from Voronoi cell graph
function buildGraphFromVoronoi(cells) {
	const vertexMap = new Map(); // Map to store unique vertices
	const vertices = [];         // Array to store vertex coordinates
	let vertexId = 0;            // Unique ID for each vertex

	// Helper function to create a unique key for a vertex (rounded to avoid floating point issues)
	function vertexKey(x, y) {
		const precision = 1e+6; // Adjust precision as needed
		return `${(x / precision).toFixed(3)},${(y / precision).toFixed(3)}`;
	}

	// Assign unique IDs to vertices
	cells.forEach(cell => {
		cell.forEach(transform => {
			const x = transform.Translation.X;
			const y = transform.Translation.Y;
			const key = vertexKey(x, y);
			if (!vertexMap.has(key)) {
				vertexMap.set(key, vertexId);
				vertices.push({ X: x, Y: y });
				vertexId++;
			}
		});
	});

	// Create edges without duplicates
	const edgeSet = new Set();
	const edges = {};

	// Helper function to create a unique key for an edge
	function edgeKey(idA, idB) {
		return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
	}

	cells.forEach(cell => {
		const n = cell.length;
		for (let i = 0; i < n; i++) {
			const a = cell[i].Translation;
			const b = cell[(i + 1) % n].Translation;

			const keyA = vertexMap.get(vertexKey(a.X, a.Y));
			const keyB = vertexMap.get(vertexKey(b.X, b.Y));

			const eKey = edgeKey(keyA, keyB);

			//console.log(eKey);

			if (!edgeSet.has(eKey)) {
				edgeSet.add(eKey);

				// Initialize adjacency lists if necessary
				if (!edges[keyA]) edges[keyA] = [];
				if (!edges[keyB]) edges[keyB] = [];

				// Calculate Euclidean distance as edge weight
				const dx = a.X - b.X;
				const dy = a.Y - b.Y;
				const distance = Math.hypot(dx, dy);

				if(keyA != keyB){
					// Add the edge to both vertices' adjacency lists
					edges[keyA].push({ node: keyB, weight: distance });
					edges[keyB].push({ node: keyA, weight: distance });
				}
			}
		}
	});

	return { vertices, edges };
}

function findRangeOfCells(cells){
	const MAXVAL = Number.MAX_VALUE;
	let min = Vector.MakeVector(MAXVAL,MAXVAL,MAXVAL);
	let max = Vector.MakeVector(-MAXVAL,-MAXVAL,-MAXVAL);

	cells.forEach(cell=>{
		cell.forEach(transform=>{
			if(transform.Translation.X < min.X){
				min.X = transform.Translation.X;
			}
			if(transform.Translation.Y < min.Y){
				min.Y = transform.Translation.Y;
			}
			if(transform.Translation.Z < min.Z){
				min.Z = transform.Translation.Z;
			}
			// Update max values
			if (transform.Translation.X > max.X) {
				max.X = transform.Translation.X;
			}
			if (transform.Translation.Y > max.Y) {
				max.Y = transform.Translation.Y;
			}
			if (transform.Translation.Z > max.Z) {
				max.Z = transform.Translation.Z;
			}
		});
	});
	return {min, max}
}


// Function to find the two most distant vertices in the graph
function findMostDistantVertices(graph) {
	let maxDistance = 0;
	let startVertex, endVertex;

	for (let i = 0; i < graph.length; i++) {
		for (let j = 0; j < graph[i].length; j++) {
			for (let k = 0; k < graph.length; k++) {
				for (let l = 0; l < graph[k].length; l++) {
					if (i !== k || j !== l) {
						const dist = euclidean(graph[i][j].Translation, graph[k][l].Translation);
						if (dist > maxDistance) {
							maxDistance = dist;
							startVertex = [i, j];
							endVertex = [k, l];
						}
					}
				}
			}
		}
	}

	return [startVertex, endVertex];
}

// Function to find the closest vertex to given coordinates
function findClosestVertex(x, y, vertices) {
	let closestId = -1;
	let minDist = Infinity;
	vertices.forEach((vertex, id) => {
		const dx = vertex.X - x;
		const dy = vertex.Y - y;
		const dist = dx * dx + dy * dy;
		if (dist < minDist) {
			minDist = dist;
			closestId = id;
		}
	});
	return closestId;
}

function findClosestPointOnRoad(road, point) {
	let closestPoint = null;
	let minDistanceSquared = Infinity;

	for (let i = 0; i < road.length - 1; i++) {
		const segmentStart = road[i];
		const segmentEnd = road[i + 1];
		const segment = subtract(segmentEnd, segmentStart);
		const toPoint = subtract(point, segmentStart);

		const segmentLengthSquared = dot(segment, segment);
		if (segmentLengthSquared === 0) continue; // Skip degenerate segments

		// Project the point onto the segment, normalized by segment length
		const t = Math.max(0, Math.min(1, dot(toPoint, segment) / segmentLengthSquared));
		const projection = add(segmentStart, scale(segment, t));

		// Calculate the squared distance from the point to the projection
		const distSquared = distanceSquared(point, projection);
		if (distSquared < minDistanceSquared) {
			minDistanceSquared = distSquared;
			closestPoint = projection;
		}
	}

	return closestPoint;
}
//Build a road network suitable for AStar pathfinding from an array of paths
function buildRoadNetwork(roads, connectionDistance = 0.5) {
    const vertexMap = new Map(); // Map to assign unique IDs to vertices
    const vertices = [];         // Array to store vertices
    const edges = {};            // Object to store adjacency lists

    let vertexId = 0; // Counter for unique vertex IDs

    // Helper function to calculate distance between two points
    function calculateDistance(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.X - p2.X, 2) +
            Math.pow(p1.Y - p2.Y, 2) +
            Math.pow(p1.Z - p2.Z, 2)
        );
    }

    // Helper function to create a unique key for a vertex
    function vertexKey(v) {
        const precision = 1e6; // Adjust precision to avoid floating-point errors
        return `${Math.round(v.X * precision) / precision},${Math.round(v.Y * precision) / precision},${Math.round(v.Z * precision) / precision}`;
    }

    // Assign unique IDs to vertices
    roads.forEach(road => {
        road.forEach(point => {
            const key = vertexKey(point);
            if (!vertexMap.has(key)) {
                vertexMap.set(key, vertexId);
                vertices.push({ X: point.X, Y: point.Y, Z: point.Z });
                edges[vertexId] = []; // Initialize adjacency list for this vertex
                vertexId++;
            }
        });
    });

    // Create edges for each road segment
    roads.forEach(road => {
        for (let i = 0; i < road.length - 1; i++) {
            const a = road[i];
            const b = road[i + 1];

            const keyA = vertexMap.get(vertexKey(a));
            const keyB = vertexMap.get(vertexKey(b));
            const distance = calculateDistance(a, b);

            // Add edge to adjacency list
            edges[keyA].push({ node: keyB, weight: distance });
            edges[keyB].push({ node: keyA, weight: distance });
        }
    });

    // Add edges between close vertices across different roads
    vertices.forEach((v1, id1) => {
        vertices.forEach((v2, id2) => {
            if (id1 !== id2) {
                const distance = calculateDistance(v1, v2);
                if (distance <= connectionDistance) {
                    edges[id1].push({ node: id2, weight: distance });
                    edges[id2].push({ node: id1, weight: distance });
                }
            }
        });
    });

    return { vertices, edges };
}

/**
 * Makes a path within graph from given housemap
 * @param {Transform} a Start transform
 * @param {Transform} b End transfrom
 * @param {Object} graph { vertices, edges } graph
 */
function makePathFromAToBInGraphAndHouseMap(a, b, graph, houseMap, {
	debugPath: debugVisualizePath = false
}={}){
	const startNode = findClosestVertex(a.Translation.X, a.Translation.Y, graph.vertices);
	const endNode = findClosestVertex(b.Translation.X, b.Translation.Y, graph.vertices);
	const duration = 10;

	const path = aStar(graph.edges, graph.vertices, startNode, endNode);

	if(debugVisualizePath){
		//green starting point visualization
		debugPoint(startPoint, {color: LinearColor.MakeColor(0,1,0,1), offset:{Z:2000}, duration});
		
		//red endpoint visualization
		debugPoint(endPoint, {offset:{Z:2000}, duration});

		logObj(startNode, 'start');
		logObj(endNode, 'end');

		//Visualize the path
		path.forEach(node=>{
			const point = graph.vertices[node];
			debugPoint(point, {color: LinearColor.MakeColor(1,1,0,1), offset:{Z:2000}, duration, thickness: 5});
		});
		logObj(path.length, 'path found:');
	}

	return path;
}


//TODO: continue here, test resulting functions
// // Example usage:
// const roads = [
//     [{ X: 0, Y: 0, Z: 0 }, { X: 1, Y: 0, Z: 0 }, { X: 2, Y: 0, Z: 0 }],
//     [{ X: 2, Y: 0, Z: 0 }, { X: 3, Y: 0, Z: 0 }],
//     [{ X: 4, Y: 0, Z: 0 }] // Disconnected road for testing
// ];

// const { isConnected, graph } = buildRoadNetwork(roads);
// console.log('Is Connected:', isConnected);
// console.log('Graph:', graph);

// // Use with aStar function:
// // aStar(graph.edges, graph.vertices, startNode, endNode);



//testPathFinding();

exports.PriorityQueue = PriorityQueue;
exports.euclidean = euclidean;
exports.aStar = aStar;
exports.dijkstra = dijkstra;

//voronoi utilities (graph conversions)
exports.buildGraphFromVoronoi = buildGraphFromVoronoi;
exports.findRangeOfCells = findRangeOfCells;
exports.findClosestVertex = findClosestVertex;

//Offroad pathing
exports.buildRoadNetwork = buildRoadNetwork;
exports.findClosestPointOnRoad = findClosestPointOnRoad;

//calculating path
exports.makePathFromAToBInGraphAndHouseMap = makePathFromAToBInGraphAndHouseMap;