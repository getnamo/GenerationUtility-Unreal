const { 
	logObj,
	ArrayMap,
	randomItem,
	randomStream,
	sampleUniqueIndices,
	makeTransform,
	makeVector,
	debugPoint,
	quadrilateralArea,
} = require('GenerationUtility/utility/objectUtility.js');

const {
	aStar,
	buildGraphFromVoronoi,
	findRangeOfCells,
	findClosestVertex,
	buildRoadNetwork 
} = require('GenerationUtility/utility/pathFinding.js');

const generatedLayouts = require('tests/importTestData.js');
const { ImportFeature }	= require('GenerationUtility/modules/importLayout.js');

function LayoutHandler(omap, splineOps, blockOps, probe){
	//fill a field with given density type for given polygon
	function fillField({
		map = new ArrayMap(),
		polygon = [],
		fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1, omap.S_Sunflower_sjrjK_Var2_lod1, omap.S_Sunflower_sjrjK_Var6_lod1],
		//fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1],
		seed = 'l33t',
		densityOptions = {
			numPoints:2000,
			spacing: 200,
			exclusionBounds: [],
		},
		heightAlign = false,
		densityType = 'random',
	}={}){
		const densityTypes = {
			'even': splineOps.generateEvenlySpacedPoints,
			'random': splineOps.generateRandomPoints
		}

		const points = splineOps.generatePointsWithinPolygon(polygon, densityOptions,
			densityTypes[densityType]
		);

		let randF = randomStream(seed);
		let randR = randomStream(seed);

		points.forEach(transform=>{
			const fieldMesh = randomItem(fieldTypes, randF);

			transform = splineOps.randRotateTransform(transform, {range:90,offset:45, randFunction:randR});

			if(heightAlign){
				const location = transform.Translation;
				let detailHit = {};	//we want the detail hit
				const height = probe.lineTraceHeightAtLocation(location, {debugLineTrace:false, detailHit, surface});

				if(!detailHit.hitLandscape){
					return;
				}
				transform.Translation.Z = height;
			}
			
			map.addValue(fieldMesh, transform);
		});

		return map;
	}

	function fillForest(options={
		map : new ArrayMap(),
		polygon : [],
		seed : 'l33t',
		surface : undefined,
	}){
		if(!options.fieldTypes){
			options.fieldTypes = [
				omap.SM_Tree_Fir_01, omap.SM_Tree_Fir_02,
				// omap.SM_Tree_Fir_Dead_M_01,omap.SM_Tree_Fir_Dead_L_01,
			];
		}
		if(!options.densityOptions){
			options.densityOptions = {
				numPoints:500,
				spacing: 1000,
				exclusionBounds: [],
			}
		}
		return fillField(options);
	};

	//make a fence for a given polygon
	function makeFence({
		polygon,
		map = new ArrayMap(),
		fenceTypes = [omap.SM_Fenc01_P1, omap.SM_Fence02_P2],
		endTypes = [omap.SM_Fence01_End],
		overlap = 0.15,
		endCapFraction = 0.3,
		seed = 'l33t'
	}={}){
		let randF = randomStream(seed);

		//limit test
		//polygon = [polygon[0], polygon[1]];
		
		for(let i = 1;i<polygon.length;i++){
			const toTransform = polygon[i];
			const fromTransform = polygon[i-1];
			const to = toTransform.Translation;
			const from = fromTransform.Translation;

			//straightline assembly
			const lookAtRotation = from.FindLookAtRotation(to);

			const pointingVector = to.Subtract_VectorVector(from);

			const lineLength = pointingVector.VSize();
			const direction = pointingVector.Normal();
			
			let accumulatedLength = 0;

			while(accumulatedLength<lineLength){
				let fenceType = randomItem(fenceTypes, randF);
				const segmentLength = fenceType.ExtendedBounds.BoxExtent.X * (2*(1-overlap));
				const pointOffset = direction.Multiply_VectorFloat(accumulatedLength);

				//console.log(accumulatedLength, lineLength);
				accumulatedLength += segmentLength;

				//
				if((accumulatedLength-(segmentLength*endCapFraction))>lineLength){
					fenceType = randomItem(endTypes, randF);
				}
				map.addValue(fenceType, makeTransform({loc:pointOffset, rot:lookAtRotation}).ComposeTransforms(fromTransform));
			}
		}

		//houseWidth = type.ExtendedBounds.BoxExtent.X;

		return map;
	};

	function makeFencedField({
		polygon=[],
		map = new ArrayMap(),
		densityType = 'random',
		// densityType = 'even',
		densityOptions = {
			numPoints: 1000,
			spacing: 100
		},
		fenceTypes = [omap.SM_Fenc01_P1, omap.SM_Fence02_P2],
		fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1, omap.S_Sunflower_sjrjK_Var2_lod1, omap.S_Sunflower_sjrjK_Var6_lod1],
		endTypes = [omap.SM_Fence01_End],
	}={}){
		map = fillField({map, polygon, densityType, densityOptions, fieldTypes});
		map = makeFence({map, polygon, fenceTypes, endTypes});
		return map;
	}

	//two main roads, 1-4 core buildings, houses with fields.
	function villageMap({
		seed = 'l33t',
		makeRoads = true,
		makeHouses = true,
		offset = {loc:{X:-10000, Y: 0}},
		population = 200,
		peoplePerHouse = 5,
		villageRoadExtent = 40000,
		houseTypes = [omap.TownHouse01, omap.TownHouse02, omap.House04],
		fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1, omap.S_Sunflower_sjrjK_Var2_lod1],
		map = new ArrayMap(),
		voronoiCoreOptions
	} = {}) {
		const houses = population / peoplePerHouse;	//rough calculation

		let rand = randomStream(seed);

		//### temp overrides
		
		villageRoadExtent = 20000;
		offset = {loc:{X:0, Y: 0}},

		voronoiCoreOptions.yMax = villageRoadExtent;
		voronoiCoreOptions.xMax = villageRoadExtent;
		voronoiCoreOptions.offset = offset;
		voronoiCoreOptions.seed = seed;
		voronoiCoreOptions.numPoints = 50; // Increased for better path options
		const houseSpacing = 1000; // Adjust as needed
		const housePerpendicularOffset = 100;
		let shouldPathFind = false;
		// shouldPathFind = true;

		houseTypes = [omap.SimpleTree];
		//houseTypes = [omap.House04, null];

		let voronoiGraph = splineOps.voronoiTransforms(voronoiCoreOptions);

		// globalThis.voronoiGraph = voronoiGraph;

		//we use min max to quickly make test points to path to
		const {min, max} = findRangeOfCells(voronoiGraph);

		// logObj(min, 'min');
		// logObj(max, 'max');

		const graph = buildGraphFromVoronoi(voronoiGraph);

		// Define start and end points (use existing points or find nearest)
		const startPoint = { X: min.X, Y: min.Y };
		// const endPoint = { X: max.X, Y: max.Y };
		const endPoint = { X: max.X/2*3, Y: max.Y };

		// Find the closest nodes to start and end points
		const startNode = findClosestVertex(startPoint.X, startPoint.Y, graph.vertices);
        const endNode = findClosestVertex(endPoint.X, endPoint.Y, graph.vertices);

		console.log(`going from ${startNode} to ${endNode}`);

		logObj(graph);

		// Perform A* search
		const path = aStar(graph.edges, graph.vertices, startNode, endNode);

		//logObj(path, 'path found:');

		const pathTransforms = path.map(node=> makeTransform({loc:graph.vertices[node]}));

		// logObj(pathTransforms, 'vertices:');

		//toggling between voronoiGraph and path
		let paths = voronoiGraph;

		if(shouldPathFind){
			paths = [pathTransforms];
		}

		// paths = [path, ...voronoiGraph];    //visualize both

		// Generate road
		if (makeRoads) {
			splineOps.makeVoronoiRoads({voronoiPoints: paths, withCollision: false});
			// splineOps.makeVoronoiRoads({voronoiPoints: [path], withCollision: false});
		}


		// Place houses and fields along roads
		paths.forEach((cell, index) => {

			// logObj(cell,'cell');

			// Get the cell edges (road segments)
			for (let i = 1; i < cell.length; i++) {
				const roadStart = cell[i-1].Translation;
				const roadEnd = cell[i].Translation;
				const roadVector = roadEnd.Subtract_VectorVector(roadStart);
				const roadLength = roadVector.VSize();
				const roadDirection = roadVector.Normal();

				// logObj(roadStart,'roadStart');

				// Place houses along the road
				const numHouses = Math.floor(roadLength / houseSpacing);

				//console.log('numHouses', numHouses);

				for (let j = 0; j < numHouses; j++) {
					const houseOffset = roadDirection.Multiply_VectorFloat(j * houseSpacing);
					const housePosition = roadStart.Add_VectorVector(houseOffset);

					// Offset house from road
					const perpendicular = makeVector({X: -roadDirection.Y, Y: roadDirection.X, Z: 0});
					const housePositionOffset = housePosition.Add_VectorVector(perpendicular.Multiply_VectorFloat(housePerpendicularOffset));

					// Place house
					/** @type{StaticMesh} */
					const houseType = randomItem(houseTypes, rand);
					
					const houseTransform = makeTransform({
						loc: housePositionOffset,
						rot: {Yaw: (Math.atan2(roadDirection.Y, roadDirection.X) * (180 / Math.PI)) + 90}
					});

					if(makeHouses){
						map.addValue(houseType, houseTransform);
					}
				}
			}
		});

		return map;
	}

	function circleMap({
		seed = 'l33t',
		makeRoad = true,
		offset = {loc:{X:-10000, Y: 0}},
		numHouses = 20,
		radius = 5000,
		houseTypes = [omap.TownHouse01, omap.TownHouse02, omap.House04],
		fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1, omap.S_Sunflower_sjrjK_Var2_lod1],
		map = new ArrayMap()
	} = {}) {
		const rand = randomStream(seed);

		// Calculate the angle between each house
		const angleStep = (2 * Math.PI) / numHouses;

		// Place houses in a circle
		for (let i = 0; i < numHouses; i++) {
			const angle = i * angleStep;
			const x = offset.loc.X + radius * Math.cos(angle);
			const y = offset.loc.Y + radius * Math.sin(angle);

			// Calculate rotation to face perpendicular to the circle
			const rotationYaw = (angle * (180 / Math.PI) + 180) % 360;

			const houseType = randomItem(houseTypes, rand);
			const houseTransform = makeTransform({
				loc: {X: x, Y: y, Z: 0},
				rot: {Yaw: rotationYaw}
			});
			map.addValue(houseType, houseTransform);
		}

		// Generate circular road
		if (makeRoad) {
			const roadPoints = [];
			const roadSegments = 36; // Number of segments for the circular road
			const roadAngleStep = (2 * Math.PI) / roadSegments;
			for (let i = 0; i <= roadSegments; i++) {
				const angle = i * roadAngleStep;
				const x = offset.loc.X + (radius - 500) * Math.cos(angle); // Road slightly inside the houses
				const y = offset.loc.Y + (radius - 500) * Math.sin(angle);
				roadPoints.push(makeTransform({loc: {X: x, Y: y, Z: 0}}));
			}
			splineOps.makeVoronoiRoads({voronoiPoints: [roadPoints], withCollision: false});
		}

		return map;
	}

	function centerVectorOfList(list){
		let center = new Vector();
		list.forEach(vector=>{
			center = center.Add_VectorVector(vector);
		});
		center = center.Divide_VectorFloat(list.length);
		return center;
	}

	function villageImportMap({
		seed = 'l33t',
		// makeRoads = false,
		makeRoads = true,
		makeBuildings = true,
		makeTrees = true,
		makeRoadNetwork = false,
		// makeRoadNetwork = true,
		// makeFields = true,
		makeFields = false,
		debugPathingTest = false,
		addPOI = true,
		offset = {loc:{X:0, Y: 0}},
		scale = 100,
		rotOffset = -90,
		//type info
		innCount = 1,
		shopCount = 2,
		// houseTypes = [omap.House04],//omap.TownHouse01, omap.TownHouse02,
		//omap.HouseWhiteV2Merged,
		houseTypes = [omap.HouseWhiteV2Merged, omap.HouseBlueV2Merged, omap.HouseYellowV2Merged, omap.HouseGreenV2Merged],
		fieldTypes = [omap.S_Sunflower_sjrjK_Var7_lod1, omap.S_Sunflower_sjrjK_Var2_lod1],
		// treeTypes = [omap.Broadleaf_Desktop_Field2, omap.Broadleaf_Desktop_Field],
		treeTypes = [omap.SM_Tree_Fir_01, omap.SM_Tree_Fir_02],
		shopTypes = [
					// omap.BigTavernV2Merged,
					// omap.CornerHouseRedV2Merged, 
					omap.TallHouseGreenV2Merged,
					// omap.HouseYellowV2Merged,
				],

		layoutImportName = 'villageForestTree',

		tavernTypes = [
			omap.CornerHouseRedV2Merged, 
		],
		innTypes = [
			//omap.TallHouseGreenV2Merged,
			omap.BigTavernV2Merged,
		],

		map = new ArrayMap(),
		extra = {},	//used to pull out meta data like extra.houseTypeMap
	} = {}){
		const rand = randomStream(seed);

		let layoutData = generatedLayouts[layoutImportName];

		// layoutData = generatedLayouts.villageNisSpring;
		// layoutData = generatedLayouts.villageForestTree;		//main village used for import
		// layoutData = generatedLayouts.villageKilber;
		// layoutData = generatedLayouts.villageGundreaSWood;
		// layoutData = generatedLayouts.villageWheatridge;
		
		// layoutData = generatedLayouts.citySeafair;
		// layoutData = generatedLayouts.cityBrightwood;
		// layoutData = generatedLayouts.villageRyeshield;

		//do the import
		const villageFeatures = new ImportFeature(layoutData, scale);

		//get callbacks and fill map
		if(makeTrees){
			villageFeatures.iterateThroughFeatures((feature, data)=>{

				const treeType = randomItem(treeTypes, rand);

				if(feature.type == "MultiPoint"){
					const transform = new Transform();
					transform.Translation = data;
					map.addValue(treeType, transform);
				}

			}, 'trees');
		}

		//pathing tests
		let startPoint = undefined;
		let endPoint = undefined;

		let buildings = [];
		let houseTypeMap = new ArrayMap();

		if(makeBuildings){
			//simple poi logic for testing, every nth house is a given type
			
			let innIndices = [];
			let checkInnIndex = undefined;
			let shopIndices = [];
			let checkShopIndex = undefined;
			let pickedRandomPoi = false;

			villageFeatures.iterateThroughFeatures((feature, data, index, total)=>{
				if(!pickedRandomPoi){
					//grab a set of random unique indices
					let allIndices = sampleUniqueIndices(innCount + shopCount, total, rand);

					innIndices = allIndices.splice(0, innCount).sort((a, b) => a - b);	
					shopIndices = allIndices.sort((a, b) => a - b); //modified allindices contains remainder
					pickedRandomPoi = true;
					
					logObj(innIndices, 'inn indices');
					logObj(shopIndices, 'shop indices');
				}

				let houseType = randomItem(houseTypes, rand);

				if(feature.type == "MultiPolygon"){
					const center = centerVectorOfList(data);
					let type = 'normal';

					//first point whichever it is
					if(!startPoint && buildings.length == 75){
						//startPoint = center;
					}
					if(!endPoint && buildings.length == 60){
						//endPoint = center;
					}

					if(addPOI){
						// const area = quadrilateralArea(data[0], data[1], data[2], data[3])/ 10000;	//to meters

						//large houses are inns?
						// if(area>200){
						// 	houseType = randomItem(innTypes, rand);
						// 	// houseType = randomItem(tavernTypes, rand);
						// 	//houseType = randomItem(shopTypes, rand);
						// 	type = 'inn';
						// }

						//console.log(index, total, interval, index % interval);
						//make every nth slot

						//check for shops
						if(shopIndices.length>0){
							//invalid check index? shift it
							if(checkShopIndex == undefined){
								checkShopIndex = shopIndices.shift();
								//console.log('new shopIndex check', checkShopIndex, shopIndices.length)
							}
						}

						if(checkShopIndex && index == checkShopIndex){
							houseType = randomItem(shopTypes, rand);
							type = 'shop';
							// console.log('shop made at', index);

							checkShopIndex = undefined;
						}

						//check for inns
						if(innIndices.length>0){
							//invalid check index? shift it
							if(checkInnIndex == undefined){
								checkInnIndex = innIndices.shift();
								//console.log('new shopIndex check', checkShopIndex, innIndices.length)
							}
						}

						if(checkInnIndex && index == checkInnIndex){
							houseType = randomItem(innTypes, rand);
							type = 'inn';
							//console.log('inn made at', index);

							checkInnIndex = undefined;
						}
					}

					// //debug the bounds of the building
					// debugPoint(data[0]);
					// debugPoint(data[1], {color:LinearColor.MakeColor(0,1,0,1)});
					// debugPoint(data[2], {color:LinearColor.MakeColor(0,0,1,1)});
					// debugPoint(data[3], {color:LinearColor.MakeColor(1,1,0,1)});

					// //debug center pt
					// debugPoint(center, LinearColor.MakeColor(1,1,1,1));
						
					
					//logObj(data)
					// const rotDeg = villageFeatures.calculateSquareRotation(data[0], data[1], data[2], data[3]);
					const rotDeg = villageFeatures.calculateAngleOfVector(data[0], data[1]);

					const transform = makeTransform({
						loc:center,
						rot:{Yaw:rotDeg + rotOffset}
					});

					buildings.push(transform);
					houseTypeMap.addValue(type, transform);

					map.addValue(houseType, transform);			
				}

			}, 'buildings');

			console.log(`made ${buildings.length} buildings.`);

			globalThis.dHouseMap = houseTypeMap;

			//extra.buildingCenters = buildings;
			extra.houseTypeMap = houseTypeMap;
		}

		if(makeRoads){
			//Individual road segments
			let segments = [];

			villageFeatures.iterateThroughFeatures((feature, data)=>{
				if(feature.type == "GeometryCollection"){
				
					const roadPoints = [];
					const limitRoadLengths = false;
					const maxN = 10;
					let n = 0;

					data.coordinates.forEach(coordinate=>{
						n++;
						if(!limitRoadLengths || (n<maxN)){
							roadPoints.push(makeTransform({loc: coordinate}));
						}
					});

					roadPoints.forEach(transform=>{
						// logObj(transform.Translation);
					});

					//logObj(roadPoints);

					//road builder expects vectors, not transforms
					segments.push(roadPoints.map(x => x.Translation));

					splineOps.makeVoronoiRoads({voronoiPoints: [roadPoints], withCollision: false});
				}

			}, 'roads');

			if(makeRoadNetwork)
			{
				console.log('found ', segments.length, ' road segments.');

				//Attempt to make a road network for pathing
				const graph = buildRoadNetwork(segments, 10);
				extra.roadNetwork = graph;
			
				//logObj(graph.edges, 'Graph edges:');

				if(debugPathingTest){
					// Use with aStar function:
					const startNode = findClosestVertex(startPoint.X, startPoint.Y, graph.vertices);
					const endNode = findClosestVertex(endPoint.X, endPoint.Y, graph.vertices);
					const duration = 10;

					//Todo:
					/*
					### Goal 
					Take the road network, pick out 1-2 POI and make a schedule for the NPCs to move from their home (by ID assignment) to poi and back again.

					e.g. House -> Work -> Inn -> Work -> House again schedule

					### Steps
					- [ ] We need house assignment locs from the building graph e.g. ID 1-N => location of house center (+ maybe nearest road section point? maybe later).
					- [ ] We need POI locations by array type e.g. 'Inn' => [{structureId, loc}, ...]
					- [ ] Schedule logic to lookup these locations and build a schedule with move & wait.
					- [ ] Enhancement: Tie wait to game time, this would require our wait schedule actions to be cancelable, check logic supports this option
					- [ ] Run ~10, then 100, then 2000 entity in village movement.
					- [ ] Add slight right-hand rule pathing offset to traversal within road network so entities miss eachother most of the time
					*/

					//green starting point visualization
					debugPoint(startPoint, {color: LinearColor.MakeColor(0,1,0,1), offset:{Z:2000}, duration});

					//red endpoint visualization
					debugPoint(endPoint, {offset:{Z:2000}, duration});

					logObj(startNode, 'start');
					logObj(endNode, 'end');

					const path = aStar(graph.edges, graph.vertices, startNode, endNode);

					//Visualize the path
					path.forEach(node=>{
						const point = graph.vertices[node];
						debugPoint(point, {color: LinearColor.MakeColor(1,1,0,1), offset:{Z:2000}, duration, thickness: 5});
					});
					logObj(path.length, 'path found:');
				}
			}
		}
		if(makeFields){
			villageFeatures.iterateThroughFeatures((feature, data)=>{
				if(feature.type == "MultiPolygon"){
					const fieldPolygon = data.map(coordinate=>makeTransform({loc: coordinate}));

					// logObj(fieldPolygon);
					map = makeFencedField({map, polygon:fieldPolygon, densityOptions : {
						numPoints: 3000,
						spacing: 100
					}, densityType:'random', fieldTypes});
					// }, densityType:'even', fieldTypes});
				}

			}, 'fields');
		}

		return map;
	}

	//Make a city using voronoi graph for now
	function cityMap({
		squareSize=32000,
		maxHouses=10000,
		makeRoads=false,
		treeLined=false,
		houseSpacing=-240,
		inset = 2500,
		lloydIterations=1,
		offset={loc:{X:0, Y: 0}},
		//offset={loc:{X:-40000, Y: -60000}},	//small test
		//offset={loc:{X:-40000, Y: -20000}},
		voronoiCells=8,
		voronoiSeed='neato-cheato10',
		map=new ArrayMap(),

		//collision
		checkForCollision=true,

		//height checks
		adjustForHeight=true,
		adjustSplineHeights=true,
		removeNonLandscapeHits=true,

		//housing types
		houseTypes = [
			omap.TownHouse01,
			omap.TownHouse02,
			omap.House04,
			// omap.TownHouse03,
			// omap.TownHouse01,
			// omap.TownHouse02,
			//null		//if null, this will be an empty lot!
		],
		treeOptions={
			treeOffset : 1500,
			treeJitter : {Y:400,X:100},
			treeSelection : [omap.Broadleaf_Desktop_Field2, omap.Broadleaf_Desktop_Field],
		},
		roadData = {},	//used to optionally pass information out
	}={}, {
		debugLogStats=false,
		debugLineTrace=false,
	}={}){
		const collisionExtentScale = 1.41; 
		// const collisionExtentScale = 2; 

		//remap seeds
		const randHouses = randomStream(voronoiSeed);
		const randTrees = randomStream(voronoiSeed + '1');
		const randJitter = randomStream(voronoiSeed + '2');

		//voronoi settings
		const minN = 0;
		const maxN = voronoiCells - 1;

		const vornoiCoreOptions = {
			seed:voronoiSeed,
			numPoints:voronoiCells,
			//numPoints:50,
			xMax : squareSize,
			yMax : squareSize,
			offset,
			polygonizeCells:false,
			smoothCells: false,
			lloydIterations,
			smoothIterations:2,
		}

		const cells = splineOps.voronoiTransforms(vornoiCoreOptions);

		roadData.cells = cells; // use our housing cells for now

		vornoiCoreOptions.smoothCells = true;
		vornoiCoreOptions.smoothIterations = 2;
		vornoiCoreOptions.polygonizeCells = true;
		let roadCells = splineOps.voronoiTransforms(vornoiCoreOptions);

		if(adjustForHeight && adjustSplineHeights){
			roadCells = probe.heightAdjustCells(roadCells, {debugLineTrace});
		}

		//vornoiCoreOptions.smoothCells = false;
		vornoiCoreOptions.numPoints = 1;
		vornoiCoreOptions.inset = -3000;
		//vornoiCoreOptions.offset = {loc:{X:-50000, Y: -18000}};
		vornoiCoreOptions.smoothIterations = 0;
		vornoiCoreOptions.polygonizeCells = true;
		
		//swap road spline for a wall test
		//originActor.RoadSplineMesh = omap.S_RoadPlane;

		//This is likely slow because of blueprint/spline gen logic
		//incurs per spline point cost, related to collision mesh gen (no collision = fast)
		if(makeRoads){
			splineOps.makeVoronoiRoads({voronoiPoints:roadCells, withCollision:false});
		}

		//wall logic
		/*originActor.RoadSplineMesh = omap.WallSection;

		let outerCell = splineOps.voronoiTransforms(vornoiCoreOptions);
		if(adjustForHeight && adjustSplineHeights){
			outerCell = probe.heightAdjustCells(outerCell, {debugLineTrace:false});
		}*/

		//splineOps.makeVoronoiRoads({voronoiPoints:outerCell, withCollision:true});

		let n = 0;
		cells.forEach(cell=>{

			//use a lower 
			if(minN<= n && n<maxN){
				map = blockOps.fillCellWithHouses(houseTypes, {
					cell,
					spacing:houseSpacing,
					depthJitter:200,
					//spacing:0,
					inset,
					//inset:0,
					treeLined,
					checkForCollision,	//expensive op until optimized
					collisionExtentScale,
					randHouses,
					randTrees,
					randJitter,
					treeOptions,
					map
				});
			}
			n++;
		});

		//debug octree stats
		if(debugLogStats){
			console.log(blockOps.octree.toString());
		}
		
		let traceCount = 0;
		let totalPlacementCount = 0;

		//Apply all transforms generated in this group

		map.filterThis((transform, index, key)=>{
			if(adjustForHeight){
				const location = transform.Translation;
				let detailHit = {};	//we want the detail hit
				const height = probe.lineTraceHeightAtLocation(location, {debugLineTrace, detailHit});
				traceCount++;

				if(!detailHit.hitLandscape && removeNonLandscapeHits){
					//console.log('removing index: ', index);
					return false;
				}
				
				//console.log(`Height: ${height}`);
				transform.Translation.Z = height;
			}

			//Limit by count
			if(totalPlacementCount + 1 > maxHouses){
				//console.log('maxed out for index: ', index);
				return false;
			}

			totalPlacementCount++;

			return true;
		});

		if(debugLogStats){
			console.log('Total Line traces: ', traceCount, 'placements: ', totalPlacementCount);
		}

		return map;
	}

	return Object.freeze({
		fillField,
		fillForest,
		makeFence,
		makeFencedField,
		circleMap,
		villageMap,
		villageImportMap,
		cityMap
	});
}

exports.LayoutHandler = LayoutHandler;