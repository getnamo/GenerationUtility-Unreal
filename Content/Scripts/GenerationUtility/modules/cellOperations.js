/// <reference path="../../typings/gu.d.ts" />
const { inspect, uclass, 
	tryLog, logObj, uScale,
	copyVector,	scaleVector, 
	makeTransform, copyTransform,
	shiftT, randomStream, getStack } = require('GenerationUtility/utility/objectUtility.js');
const { newMeshGenActor, newSMActor, duplicateActor, spawnBp } = require('GenerationUtility/utility/actorUtility.js');
const { ZoningHandler} = require('GenerationUtility/modules/zoningHandler.js');

/**CellOperations
* Used to place/generate blocks from a cell grid for housing by parts
* Early work: Very unstable API
*/
function CellOperations(meta, {defaultWall, defaultFloor, defaultFoundation, wallRand}){

	const RELATIVE_DIRECTION = {
		'top':0,
		'bottom':1,
		'left':2,
		'right':3,
		'center':4
	}

	//Definitions
	//NB: [top, bottom, left, right, center]
	const constructionMap = {
		//single node
		'full':[1,1,1,1,1],
		'top':[1,0,0,0,0],
		'bottom':[0,1,0,0,0],
		'left':[0,0,1,0,0],
		'right':[0,0,0,1,0],
		'center':[0,0,0,0,1],

		//2-way combos
		'cornerTL':[1,0,1,0,0],
		'cornerTR':[1,0,0,1,0],
		'cornerBL':[0,1,1,0,0],
		'cornerBR':[0,1,0,1,0],

		//3-way combos
		'uLeft':[1,1,0,1,0],
		'uRight':[1,1,1,0,0],
		'uTop':[0,1,1,1,0],
		'uBottom':[1,0,1,1,0]
	}

	function makeMapKey(x,y){
		return `${x},${y}`
	}

	const defaultCellT = makeTransform();

	let zoneOps = ZoningHandler();


	//Utility
	function forEachCell(cellMap, callback){
		cellMap.forEach((rowArray, y) =>{
			rowArray.forEach((cell, x) =>{
				callback(cell,x,y);
			});
		});	
	}

	function copyMap(cellMap){
		return cellMap.map((rowArray, y) =>{
			return [...rowArray];
		});	
	}

	function logCellMap(cellMap, before=undefined){
		if(before){
			console.log(before);
		}
		cellMap.forEach((rowArray, y) =>{
			console.log(rowArray);
		});	
	}

	//lookup neighbors to determine cell type
	function isBlocking(cellMap, x, y){
		if(y < cellMap.length){
			const row = cellMap[y];

			if(row && x < row.length && x>=0){
				return row[x];
			}
		}
		return 0;
	}

	function wallTypeForCell(cellMap, x=0, y=0){
		const center = isBlocking(cellMap, x, y);
		const left = isBlocking(cellMap, x-1, y);
		const right = isBlocking(cellMap, x+1, y);
		const top = isBlocking(cellMap, x, y-1);
		const bottom = isBlocking(cellMap, x, y+1);

		//debug
		//let fullSample = {center, left, right, top, bottom}
		//logObj(fullSample);

		//return a boolean array
		const keyArray = [top, bottom, left, right, center];

		return keyArray;
	}

	//Main functions

	function hasPositiveOriginShift(staticMesh){
		const origin = staticMesh.ExtendedBounds.Origin;

		if(Math.abs(origin.Y) > Math.abs(origin.X)){
			return origin.Y>=0;
		}
		else{
			return origin.X>=0;
		}
	}

	//obtains a transform such that mesh is origin centered (revert pivot to extent center)
	function meshTransformFromBounds(staticMesh){
		const origin = staticMesh.ExtendedBounds.Origin;
		const extent = staticMesh.ExtendedBounds.BoxExtent;

		//check orientation
		let xForward = true;
		let originMagnitude = origin.X;
		let extentMagnitude = extent.X;
		let originWidth = origin.Y;

		//test major direction (works for rectangular objects)
		if(Math.abs(origin.Y) > Math.abs(origin.X)){
			xForward = false;
			originMagnitude = origin.Y;
			extentMagnitude = extent.Y;
			originWidth = origin.X;
		}
		

		//means it's already centered
		const originIsZero = Math.abs(origin.X) < 0.0001 && Math.abs(origin.Y) < 0.0001;

		//console.log(originMagnitude, staticMesh.GetName())


		const factor = originIsZero? 1 : Math.abs(extentMagnitude/originMagnitude);

		const positive = hasPositiveOriginShift(staticMesh);

		let appliedExtent = originIsZero ? 0: extentMagnitude * (positive? -1:1);

		if(xForward){
			//logObj(origin, 'O')
			//logObj(extent, 'E')
			//console.log(staticMesh.GetName(), appliedExtent);
			
			return makeTransform({
				loc:{
					X: originMagnitude + appliedExtent,
					Y: 0
				},
				rot:{
					Yaw:positive ? 180 : 0
				}
			});
		}
		else
		{
			return makeTransform({
				loc:{
					X:originMagnitude + appliedExtent,
					Y:0
				},
				rot:{
					Yaw:-90
				}
			});
		}
	}

	function makeBlock(inOrigin={}, definition={sm:defaultWall, type:undefined, borders:[], centerValid:false, positive:true}){
		//ensure a type is specified
		if(!definition.sm) definition.sm = defaultWall;

		const originLoc = inOrigin.Translation; //copyVector(inOrigin.Translation);
		const originEuler = inOrigin.Rotation.Quat_Euler();

		const originRot = {Yaw:originEuler.Z};

		if(definition.type){
			definition.borders = constructionMap[definition.type];
		}

		if(!definition.borders){
			console.log(getStack());
		}

		let borders = definition.borders ? definition.borders : [];

		let actors = [];
		let actor = undefined;

		//let smT = makeTransform();//meshTransformFromBounds(definition.sm);
		const positive = hasPositiveOriginShift(definition.sm);

		function appliedTransform(x=0,y=0,yaw=0){
			return {loc:{
				X:originLoc.X + x,
				Y:originLoc.Y + y,
				Z:originLoc.Z
			}, rot:{
				Yaw:originRot.Yaw + yaw + (positive? 0: 180)
			}}
		}

		//Center, special case
		if(borders[4] == 1){
			if(definition.centerValid){
				actor = newSMActor(definition.sm, appliedTransform());
				actors.push(actor);
			}
			return actors;
		}

		//Top
		if(borders[0] == 1){
			if(positive){
				actor = newSMActor(definition.sm, appliedTransform(-meta.blockSize, -2*meta.blockSize, 180));
			}
			else{
				actor = newSMActor(definition.sm, appliedTransform(0, meta.blockSize, 180));
			}
			actors.push(actor);
		}

		//Bottom
		if(borders[1] == 1){
			if(positive){
				actor = newSMActor(definition.sm, appliedTransform(-meta.blockSize, 0));
			}
			else{
				actor = newSMActor(definition.sm, appliedTransform(-meta.blockSize, 0));
			}
			actors.push(actor);
		}

		//Left
		if(borders[2] == 1){
			if(positive){
				actor = newSMActor(definition.sm, appliedTransform(-2*meta.blockSize, -meta.blockSize ,90));
			}
			else{
				actor = newSMActor(definition.sm, appliedTransform(-meta.blockSize, -meta.blockSize, 90));
			}
			actors.push(actor);
		}

		//Right
		if(borders[3] == 1){
			if(positive){
				actor = newSMActor(definition.sm, appliedTransform(0, -meta.blockSize,-90));
			}
			else{
				actor = newSMActor(definition.sm, appliedTransform(0, 0,-90));
			}
			actors.push(actor);
		}

		return actors;
	}

	//replace a given block by defined static mesh (todo: formal full block)
	function replaceBlock(map, x, y, {sm=undefined, smT=makeTransform(), bordersOverride=undefined, centerValid=true}={}){

		//console.log('debug: ', Object.keys(map.cells).length)

		//logObj(map.cells[makeMapKey(x,y)], 'd2')
		let stored = {actors:[], borders:[]};

		if(map && map.cells){
			const validStorage = map.cells[makeMapKey(x,y)];
			if(validStorage){
				stored = validStorage;

				//console.log('stored: ', stored.borders, stored.actors.length)
			}
			else{
				console.log('invalid storage for:', x, y)
			}
		}

		//console.log(type, actors);

		//track new actors
		let cellT = map.origin.ComposeTransforms(makeTransform({
			loc:{X: (x) * meta.blockSize, Y: (y) * meta.blockSize}
		}));

		let didUpdate = false;
		stored.actors.forEach(a=>{
			//console.log('To Replace: ', a.GetDisplayName());
			owner.DestroyActor(a);
			didUpdate = true;
		});

		//we want to replace it with something
		if(sm != undefined){
			let meshT = meshTransformFromBounds(sm);

			//override for vlad blocks
			meshT = makeTransform({
				rot:{Yaw:180},
				loc:{X:meta.blockSize/2, Y:meta.blockSize/2}
			}); //smT;//.ComposeTransforms(meshT);

			meshT = smT.ComposeTransforms(meshT);
			cellT = meshT.ComposeTransforms(cellT);

			//override, e.g. pretend it's this block
			if(bordersOverride){
				stored.borders = bordersOverride;
			}
			//center default if not specified
			if(!stored.borders){
				console.log('No default borders', getStack());
				stored.borders = constructionMap.center;
			}

			let newActors = makeBlock(cellT, {borders:stored.borders, sm, centerValid});

			//update tracking
			map.cells[makeMapKey(x,y)] = {actors:newActors, borders:stored.borders};

			return map.cells[makeMapKey(x,y)];
		}

		if(didUpdate){
			map.cells[makeMapKey(x,y)] = stored;
		}
		return stored;
	}

	//bulk clear a list of blocks (e.g. a hole in a ceiling)
	function clearBlocks(map, blockList){	
		//support clearing blocks using another map (e.g. remainder)
		if(blockList.cells){
			//convert back to an array it can parse
			blockList = Object.keys(blockList.cells).map(keyString=>{
				const xyArray = keyString.split(",");
				return {X:xyArray[0], Y:xyArray[1]};
			});

			//logObj(blockList)
		}

		blockList.forEach(block => {
			//support both array and object specifiers
			if(Array.isArray(block)){
				replaceBlock(map, block[0], block[1]);
			}
			else{
				replaceBlock(map, block.X, block.Y);
			}
		});
	}

	function isWithinRect(x,y, rect){
		return (x>=rect.left && x<=rect.right &&
			y>=rect.top && y<=rect.bottom);
	}

	//pass in a rect and remove it from the cellmap for more analysis/splitting
	function intersectRectWithMap(rect, map, action=undefined){
		//default is logging action
		if(!action){
			action = (inRect, inMap, x,y)=>{
				console.log(x,y, 'isWithinTrue')
			}
		}
		//console.log('intersectRect: ', inspect(rect));

		forEachCell(map, (cell,x,y)=>{
			if(isWithinRect(x,y, rect)){
				//console.log(x,y, 'in', inspect(rect));
				action(rect, map, x, y);
			}
			else{
				//console.log(x,y, 'not in', inspect(rect));
			}
		});
	}

	function removeRectFromMap(rect, map){
		intersectRectWithMap(rect, map, (inRect, inMap, x,y)=>{
			//console.log('removing', x, y);
			inMap[y][x] = 0;
		});
	}

	function fillMap(map, value=0){
		forEachCell(map, (cell,x,y)=>{
			map[y][x] = value;
		});
	}

	//clears out the area where the cell
	function subtractMaps(targetMapCells, mapCellsToSubtract){
		forEachCell(mapCellsToSubtract, (cell, x, y)=>{
			if(cell === 1){
				targetMapCells[y][x] = 0;
			}
		});
	}

	function addRectToMap(rect, map){
		intersectRectWithMap(rect, map, (inRect, inMap, x,y)=>{
			//console.log('adding', x, y);
			inMap[y][x] = 1;
		});
	}

	//print the rect inside the map for debugging purposes
	function logRectInMapCopy(rect, cellMap, before){
		let copiedCells = copyMap(cellMap);
		
		//clear and add rect
		fillMap(copiedCells);
		addRectToMap(rect, copiedCells);

		//log it
		logCellMap(copiedCells, before);
	}

	function intersectRects(rectA, rectB){
		const rightmostLeft = Math.max(rectA.left, rectB.left);
		const leftmostRight = Math.min(rectA.right, rectB.right);
		const topmostBottom = Math.min(rectA.bottom, rectB.bottom);	//NB: bottom is higher number than top
		const bottommostTop = Math.max(rectA.top, rectB.top);		// so these two are swapped in concept

		return {
			left:rightmostLeft,
			right:leftmostRight,
			top:bottommostTop,
			bottom:topmostBottom
		}
	}

	//from a remainder, obtain an overlap rectangle
	function addIntersectRect(cellMap, otherRect){
		const meta = cellMapMetaInformation(cellMap, {debug:false});

		//project in all directions until max
		if(cellMap.length == 0){
			return;
		}

		const maxY = cellMap.length-1;
		const maxX = cellMap[0].length-1;

		let projectionY = {
			left: meta.maxRect.left,
			right: meta.maxRect.right,
			top: 0,
			bottom: maxY
		}
		let projectionX = {
			left: 0,
			right: maxX,
			top: meta.maxRect.top,
			bottom: meta.maxRect.bottom
		}

		// console.log('meta: ', inspect(meta))
		// console.log('projectionY: ', inspect(projectionY))
		// console.log('projectionX: ', inspect(projectionX))
		// console.log('otherRect: ', inspect(otherRect))

		let resultY = intersectRects(projectionY, otherRect);
		let resultX = intersectRects(projectionX, otherRect);

		// console.log('intersectY: ', inspect(resultY))
		// console.log('intersectX: ', inspect(resultX))

		// Log visually
		// logRectInMapCopy(projectionY, cellMap, 'projectionY');
		// logRectInMapCopy(projectionX, cellMap, 'projectionX');

		// logRectInMapCopy(resultY, cellMap, 'resultY');
		// logRectInMapCopy(resultX, cellMap, 'resultX');

		//Add both intersection results
		addRectToMap(resultY, cellMap);
		addRectToMap(resultX, cellMap);
	}

	//obtain the remainder from major axis cellmap
	function minorAxisMapFromFullMap(cellMap, {meta=undefined, addIntersection=true}){
		if(!meta){
			meta = cellMapMetaInformation(cellMap);
		}
		let minorMap = copyMap(cellMap);
		removeRectFromMap(meta.maxRect, minorMap);
		if(addIntersection){
			addIntersectRect(minorMap, meta.maxRect);
		}

		return minorMap;
	}

	//find a block given the filter, e.g. southernmost etc
	function findBlock(cellMap, {facing='down'}){
		let x=0, y=0;

		console.log('not implemented.');

		return {x,y};
	}

	//used in roofLayerPass
	function roofEdgePass(anchor, {
		cellMeta,
		actorMap,
		localT=makeTransform(),
		localEndCapT=makeTransform(),
		t=makeTransform(),
		sm=undefined,
		smEndCap=undefined,
		smEndCapWall=undefined,
		iteration=0,
		borders=constructionMap.center,
		}={}){

		function addRoofBlock(loc, mesh, meshLocalT){
			let cellT = makeTransform({loc});
			cellT = t.ComposeTransforms(cellT);
			cellT = meshLocalT.ComposeTransforms(cellT);

			const actors = makeBlock(cellT, {sm:mesh, centerValid:true, borders});

			//TODO: check if block already exists, if so, place intersection block

			//NB: horizontal axis only map, no Z/layered approach
			actorMap.cells[makeMapKey(loc.X, loc.Y)] = {actors, borders};	
		}

		if(cellMeta.majorAxisX){
			localT = shiftT(localT,{rot:{Yaw:90}});

			for(let i = 0; i < cellMeta.maxRect.width; i++){
				const loc = {X:(anchor.X+i - 1)*meta.blockSize, Y:(anchor.Y)*meta.blockSize};

				addRoofBlock(loc, sm, localT);
			}
		}
		else{
			for(let i = 0; i < cellMeta.maxRect.height; i++){
				const loc = {X:anchor.X*meta.blockSize, Y:(anchor.Y + i)*meta.blockSize};
				addRoofBlock(loc, sm, localT);
			}
		}



		//add endcaps if defined
		if(smEndCap){
			let loc = undefined;

			if(cellMeta.majorAxisX){
				localEndCapT = shiftT(localEndCapT,{rot:{Yaw:90}});
				loc = {X:(anchor.X-1)*meta.blockSize, Y:(anchor.Y)*meta.blockSize};
			}
			else{
				loc = {X:anchor.X*meta.blockSize, Y:(anchor.Y - 1)*meta.blockSize};
			}

			addRoofBlock(loc, smEndCap, localEndCapT);

			if(cellMeta.majorAxisX){
				loc = {X:(anchor.X + cellMeta.maxRect.width-1)*meta.blockSize, Y:(anchor.Y)*meta.blockSize};
			}
			else{
				loc = {X:anchor.X*meta.blockSize, Y:(anchor.Y + cellMeta.maxRect.height-1)*meta.blockSize};
			}

			addRoofBlock(loc, smEndCap, localEndCapT);

			//add walls per iteration
			if(smEndCapWall){
				for(let i = 0; i < iteration;i++){
					if(cellMeta.majorAxisX){
						loc = {
							X:(anchor.X - 1) * meta.blockSize,
							Y:anchor.Y * meta.blockSize,
							Z:-(i+1) * meta.blockSize
						};
					}
					else{
						loc = {
							X:anchor.X * meta.blockSize,
							Y:(anchor.Y - 1) * meta.blockSize,
							Z:-(i+1) * meta.blockSize
						};
					}
					addRoofBlock(loc, smEndCapWall, localEndCapT);

					if(cellMeta.majorAxisX){
						loc = {
							X:(anchor.X  + cellMeta.maxRect.width-1) * meta.blockSize,
							Y:(anchor.Y) * meta.blockSize,
							Z:-(i+1) * meta.blockSize
						};
					}
					else{
						loc = {
							X:anchor.X * meta.blockSize,
							Y:(anchor.Y + cellMeta.maxRect.height-1) * meta.blockSize,
							Z:-(i+1) * meta.blockSize
						};
					}
					addRoofBlock(loc, smEndCapWall, localEndCapT);
				}
			}
		}
	}

	function roofLayerPass({
		cellMeta,
		actorMap,
		t=makeTransform(),
		iteration=0,
		isOddTop=false,
		localT=makeTransform(),
		localEndCapT=makeTransform(), 
		sm=undefined,
		smEndCap=undefined,
		smEndCapWall=defaultWall,
		borders=constructionMap.center}={}){

		const roofZ = meta.blockSize + (iteration*meta.blockSize);

		//if major axis Y
		const topLeft = locationInRect(RELATIVE_DIRECTION.top, cellMeta.maxRect,{centering: RELATIVE_DIRECTION.left});
		let location = topLeft;

		//Find edge
		//console.log('meta is: ', inspect(meta));

		//start top left and build left side edge
		let iterationT = undefined;		

		if(cellMeta.majorAxisX){
			iterationT = makeTransform({
				loc:{
					X:0,
					Y:iteration*meta.blockSize
				}
			}).ComposeTransforms(t);
		}
		else{
			iterationT = makeTransform({
				loc:{
					X:iteration*meta.blockSize,
					Y:0
				}
			}).ComposeTransforms(t);
		}

		roofEdgePass(location, {localT, localEndCapT, t:iterationT,
			sm, smEndCap, smEndCapWall, iteration, 
			cellMeta, actorMap});
		
		if(isOddTop){
			//only one edge pass for odd top
			return;
		}

		//Other side pass
		if(cellMeta.majorAxisX){
			iterationT = makeTransform({
				loc:{
					X:0,
					Y:-iteration*meta.blockSize
				}
			}).ComposeTransforms(t);
		}
		else{
			iterationT = makeTransform({
				loc:{
					X:-iteration*meta.blockSize,
					Y:0
				}
			}).ComposeTransforms(t);
		}

		//offset it to line up
		localT = makeTransform({
			rot:{
				Yaw:180,
			},
			loc:{
				X:meta.blockSize,
				Y:-meta.blockSize
			}
		}).ComposeTransforms(localT);

		localEndCapT = makeTransform({
			rot:{
				Yaw:180,
			},
			loc:{
				X:meta.blockSize,
				Y:10
			}
		}).ComposeTransforms(localEndCapT);


		if(cellMeta.majorAxisX){
			const bottomLeft = locationInRect(RELATIVE_DIRECTION.bottom, cellMeta.maxRect,{centering: RELATIVE_DIRECTION.left});
			location = bottomLeft;
		}
		else{
			const topRight = locationInRect(RELATIVE_DIRECTION.top, cellMeta.maxRect,{centering: RELATIVE_DIRECTION.right});
			location = topRight;
		}
		

		roofEdgePass(location, {localT, localEndCapT, t:iterationT,
			sm, smEndCap, smEndCapWall, iteration,
			cellMeta, actorMap});
	}

	//total area, not caring about shape
	function floorArea(cellMap){
		let area = 0;
		forEachCell(cellMap, cell=>{
			if(cell===1){
				area++;
			}
		});
		return area;
	}

	//pull out information about the floor plan
	function cellMapMetaInformation(cellMap, {debug=false}={}){
		let isRectangular=false;	//otherwise complex required
		const cellFloorArea = floorArea(cellMap);
		const maxRect = zoneOps.maxRectangle(cellMap);
		if(maxRect.area == cellFloorArea){
			isRectangular=true;		//simple roofing
		}

		//determine major axis
		majorAxisX = maxRect.width >= maxRect.height;

		if(debug){
			logCellMap(cellMap);
			console.log('maxRect: ', inspect(maxRect));
			console.log('floorArea: ', cellFloorArea);
			console.log('rectangular:', isRectangular);
			console.log('majorAxisX:', majorAxisX);
		}

		

		return {isRectangular, maxRect, cellFloorArea, majorAxisX};
	}


	function ensureDimensionsInRect(rect){
		if(rect.width==undefined){
			rect.width = rect.right-rect.left + 1;
		}
		if(rect.height==undefined){
			rect.height = rect.bottom-rect.top + 1;
		}
	}
	

	//Given direction find the location relative to the rectangle
	//E.g. 'left' would give center leftmost location in rectangle
	function locationInRect(direction=RELATIVE_DIRECTION.left, rect, {
		paddingX=0,
		paddingY=0,
		centering=RELATIVE_DIRECTION.center,
	}={}){
		//we might be lazy defining rects
		ensureDimensionsInRect(rect);

		//define centering direction
		let centeringX = Math.floor(rect.width/2);

		if(centering === RELATIVE_DIRECTION.left){
			centeringX = 0;
		}
		else if(centering === RELATIVE_DIRECTION.right) {
			centeringX = rect.width-1;
		}

		let centeringY = Math.floor(rect.height/2);

		if(centering === RELATIVE_DIRECTION.top){
			centeringY = 0;
		}
		else if(centering === RELATIVE_DIRECTION.bottom) {
			centeringY = rect.height-1;
		}

		if(direction === RELATIVE_DIRECTION.top){
			return {
				X:rect.left + centeringX + paddingX,
				Y:rect.top + paddingY
			}
		}
		else if(direction === RELATIVE_DIRECTION.bottom){
			return {
				X:rect.left + centeringX - paddingX,
				Y:rect.bottom - paddingY
			}
		}
		else if(direction === RELATIVE_DIRECTION.left){
			return {
				X:rect.left + paddingX,
				Y:rect.top + centeringY + paddingY
			}
		}
		else if(direction === RELATIVE_DIRECTION.right){
			return {
				X:rect.right - paddingX,
				Y:rect.top + centeringY - paddingY
			}
		}
		else if(direction === RELATIVE_DIRECTION.center){
			return {
				X:rect.left + centeringX - paddingX,
				Y:rect.top + centeringY - paddingY
			}
		}
	}

	//Composite/Higher level functions

	//empty custom layer for hand placing such that it doesn't interfere with other layers
	function makeCustomEmptyLayer(cellMap, t=makeTransform(), prefill=false){
		let actorMap = {origin:t, cells:{}};

		if(prefill){
			cellMap.forEach((rowArray, i) =>{
				rowArray.forEach((cell, j) =>{
					const actors = [];
					actorMap.cells[makeMapKey(j, i)] = {actors, type:'empty'};		
				});
			});
		}

		return actorMap;
	}

	//Floor Pass
	function makeFloorsFromCellMap(cellMap, t=makeTransform(), {sm=defaultFloor, smT=undefined}={}){
		let size = cellMap.length;
		let floorActorMap = {origin:t, cells:{}};

		//Obtain local mesh offsets
		let meshT = meshTransformFromBounds(sm);
		if(smT){
			meshT = smT.ComposeTransforms(meshT);
		}

		//logObj(t, 'floorT: ');

		const borders = constructionMap.center;

		cellMap.forEach((rowArray, i) =>{
			rowArray.forEach((cell, j) =>{
				if(cell === 1){
					//make floor
					let cellT = makeTransform({
						loc:{
							X:j*meta.blockSize,
							Y:i*meta.blockSize
						}
					});

					cellT = t.ComposeTransforms(cellT);

					cellT = meshT.ComposeTransforms(cellT);


					const actors = makeBlock(cellT, {sm, centerValid:true, borders});

					floorActorMap.cells[makeMapKey(j, i)] = {actors, borders};						
				}
			});
		});

		return floorActorMap;
	}

	//draw a straight line wall from x,y, to x,y
	function makeStraightWall(cellMap, from={X:0,Y:0}, to={X:0,Y:0}, {sm=defaultWall, smT=undefined}){
		//get coordinates that the straight line makes

		let delta = {
			X: to.X - from.X,
			Y: to.Y - from.Y
		};

		//determine major direction and amount
		let isXMajor = false;
		let isNegative = false;
		let deltaMajor = delta.Y;
		if(Math.abs(delta.X)>=Math.abs(delta.Y)){
			isXMajor = true;
			deltaMajor = delta.X;
		}

		if(deltaMajor<0){
			isNegative = true;
		}

		const count = Math.abs(deltaMajor);

		let x = Math.round(from.X);
		let y = Math.round(from.Y);

		//logObj(delta, 'delta');

		let borders = isXMajor? constructionMap.top : constructionMap.left;

		let replacementCells = [];

		//now that all the info is obtained, iterate
		for(let i=0; i<count; i++){
			//console.log('replacing',x,y);

			replacementCells.push[{X:x, Y:y}];

			let added = replaceBlock(cellMap, x, y, {sm, smT, bordersOverride:borders});

			if(isXMajor){
				if(isNegative){
					x--;
				}
				else{
					x++;
				}
			}
			else{
				if(isNegative){
					y--;
				}
				else{
					y++;
				}
			}
		}

		return replacementCells;
	}

	//Basic wall pass
	function makeWallsFromCellMap(cellMap, t=makeTransform(), {sm=defaultWall, smT=defaultCellT, smList=undefined, randSrc=wallRand, useMeshT=true}={}){
		let size = cellMap.length;

		//store the list of actors (cell info) and origin used
		//for destruction or replacement
		let wallActorMap = {origin:t, cells:{}};

		//Obtain local mesh offsets
		let meshT = useMeshT? meshTransformFromBounds(sm): makeTransform();

		if(smT){
			meshT = smT.ComposeTransforms(meshT);
		}

		//debug/temp override to ignore mesh bounds
		meshT = smT;

		//loop through cells
		for(let y = 0; y < cellMap.length; y++){
			let rowList = cellMap[y];
			for(let x = 0; x < rowList.length; x++){

				//Determine type of cell from list
				let borders = wallTypeForCell(cellMap, x, y);
				//console.log(borders);

				let cellT = makeTransform({
					loc:{
						X: x * meta.blockSize,
						Y: y * meta.blockSize
					}
				});
				
				cellT = t.ComposeTransforms(cellT);
				cellT = meshT.ComposeTransforms(cellT);

				//add some variation to walls
				if(smList){
					sm = smList[Math.round(randSrc()*smList.length)];
				}

				//logObj(sm.StaticMeshDescriptionBulkData);
				const actors = makeBlock(cellT, {borders, sm, centerValid:false});

				//console.log(borders,'actors #:' , actors.length);

				//update this cell map with actor, borders (type info)
				wallActorMap.cells[makeMapKey(x, y)] = {actors, borders};

				/*
				//Debug specific spawns
				if(sm){
					if(sm.GetDisplayName() == 'SM_MH_02_Stone_Wall_Base_03'){
						console.log(sm.GetDisplayName());
					}
				}
				else{
					console.log('sm undefined!');
					//console.log(getStack());
				}*/
			}
		}
		return wallActorMap;
	}


	//apply a foundation around first floor with given sm
	function foundationPass(cellMap, t=makeTransform(), {sm=defaultFoundation, smT=defaultCellT}){
		t = shiftT(t, {loc:{Z:-meta.blockSize}});
		smT = makeTransform({
			loc:{
				X:meta.blockSize/2,
				Y:meta.blockSize/2
		},
			rot:{Yaw:180}
		});

		let foundationActors = makeWallsFromCellMap(cellMap, t, {sm, smT});
	}


	//Handles flat (not yet) and slanted roofs for house cellmap
	function makeRoofFromCellMap(cellMap, t=makeTransform(), {
		cellMeta=undefined,
		smT=makeTransform(),
		smList=undefined,
		randSrc=wallRand,
		slantedRoof=true,			//flat roof or slanted variant?
		roofLineAlongMajor=true, 	//Is this along the long axis of the roof?
		fillEndCaps=false,			//place filler along endcaps, temp default disabled
		sm=defaultFloor,
		smOdd=defaultFloor,
		smOddEndCap=defaultWall,
		smEndCap=defaultWall,
		smEndCapWall=defaultWall,
		loopCount=0
	}={}){
		//Determine Major/Minor walls directions

		//Determine floor area type
		if(!cellMeta){
			cellMeta = cellMapMetaInformation(cellMap, {debug:true});
		}

		let actorMap = {origin:t, cells:{}};

		let meshT = meshTransformFromBounds(sm);

		//determine 2ndary axis
		if(!cellMeta.isRectangular){
			//obtain minor axis information by removing maxrect and add intersection of maxrect
			let minorMap = minorAxisMapFromFullMap(cellMap, {cellMeta, addIntersection:true});
			const minorMeta = cellMapMetaInformation(minorMap, {debug:false});

			//Ok now we have all the information to make a complex roof

			//change major axis into simple roof
			cellMeta.isRectangular = true;
			loopCount++;

			if(loopCount>3){
				console.log("makeRoofFromCellMap: Early loop exit, complex roof failed.")
				return;
			}

			//1 Do major axis roof
			makeRoofFromCellMap(cellMap, t, {
				cellMeta,
				smT, smList, randSrc, slantedRoof, 
				roofLineAlongMajor, fillEndCaps, sm,
				smOdd, smOddEndCap, smEndCap, smEndCapWall, loopCount
			});

			//2 Do minor axis roof
			makeRoofFromCellMap(minorMap, t, {
				minorMeta,
				smT, smList, randSrc, slantedRoof, 
				roofLineAlongMajor, fillEndCaps, sm,
				smOdd, smOddEndCap, smEndCap, smEndCapWall, loopCount
			});


			//3 Handle intersection area
		}
		else{
			//Handle a simple roof

			console.log(inspect(cellMeta));

			//
			let iterationLength = cellMeta.maxRect.width;
			if(cellMeta.majorAxisX){
				iterationLength = cellMeta.maxRect.height;
			}

			//keep iterating layers until roof is complete
			let iterations = Math.round(iterationLength/2);

			for(let i = 0; i < iterations; i++){
				//odd count width and on last iteration
				let isOddTop = ((iterationLength % 2) == 1) && (i == (iterations-1));

				const roofZ = meta.blockSize + (i*meta.blockSize);

				if(isOddTop){
					//Odd top mesh transform
					let localT = makeTransform({
						loc:{
							X:0,
							Y:0,
							Z:roofZ
						},
						rot:{
							Yaw:-90
						}
					}).ComposeTransforms(meshT);

					//odd top mesh endcap local transform
					let localEndCapT= makeTransform({
						loc:{
							X:0,
							Y:0,
							Z:roofZ
						},
						rot:{
							Yaw:0
						}
					}).ComposeTransforms(meshTransformFromBounds(smEndCap));

					roofLayerPass({
						cellMeta, 
						actorMap, 
						t, 
						localT,
						localEndCapT,
						sm:smOdd,
						smEndCap:smOddEndCap,
						smEndCapWall,
						iteration:i,
						isOddTop
					});
				}
				else{
					//Transform for the base mesh
					let localT = makeTransform({
						loc:{
							X:meta.blockSize,
							Y:meta.blockSize,
							Z:roofZ
						},
						rot:{
							Yaw:-90
						}
					}).ComposeTransforms(meshT);

					//transform adjustment for endcap
					let localEndCapT= makeTransform({
						loc:{
							X:0,
							Y:0,
							Z:roofZ
						},
						rot:{
							Yaw:0
						}
					}).ComposeTransforms(meshTransformFromBounds(smEndCap));

					roofLayerPass({
						cellMeta,
						actorMap,
						t,
						localT,
						localEndCapT,
						sm,
						smEndCap,
						smEndCapWall,
						iteration:i
					});
				}
			}
		}

		return actorMap;
	}

	//read the current state and make wall and window passes
	function doorAndWindowPass(cells, actorMap, oMap, {meta=undefined, makeDoor=true}={}){

		//NB: for now hardcoded test
		//find where the 'southern' most block would be, if multiple, select middle one
		
		//replaceBlock(actorMap, 4,4, {sm: oMap.WallWindow1Open});

		if(!meta){
			meta = cellMapMetaInformation(cells, {debug:false});
		}

		//console.log('meta is', inspect(meta));

		let doorLoc = locationInRect(RELATIVE_DIRECTION.bottom, meta.maxRect,{
			centering: RELATIVE_DIRECTION.center,
		});

		if(makeDoor){
			replaceBlock(actorMap, doorLoc.X, doorLoc.Y + 1, {sm: oMap.houseTile_3m_gb_003});
		}

		let windowLoc = locationInRect(RELATIVE_DIRECTION.left, meta.maxRect,{
			centering: RELATIVE_DIRECTION.center,
			paddingX:0
		});

		replaceBlock(actorMap, windowLoc.X-1, windowLoc.Y, {sm: oMap.houseTile_3m_gb_024});

		windowLoc = locationInRect(RELATIVE_DIRECTION.left, meta.maxRect,{
			centering: RELATIVE_DIRECTION.top,
			paddingX:0
		});

		replaceBlock(actorMap, windowLoc.X-1, windowLoc.Y+1, {sm: oMap.houseTile_3m_gb_024});

		windowLoc = locationInRect(RELATIVE_DIRECTION.right, meta.maxRect,{
			centering: RELATIVE_DIRECTION.center,
			paddingX:0
		});
		replaceBlock(actorMap, windowLoc.X+1, windowLoc.Y+1, {sm: oMap.houseTile_3m_gb_024});

		//Plop in a door blueprint

		//Plop in a ramp to base level.
	}

	//Make a maxRect split in the cell area
	function roomSplitMaxRect(cells, wallMap, oMap, {
		minimumArea=5,
		iterations=1,
		splitFraction=0.5,
		doorOnLeft=true,
		iterativeProjectionSplit=true
	}={}){
		if(iterations == 0){
			//early exit
			return;
		}

		const firstFloorArea = floorArea(cells);
		let maxRect = zoneOps.maxRectangle(cells);

		const interiorWallSM = oMap.houseTile_3m_gb_022;
		const interiorDoorSM = oMap.houseTile_3m_gb_023;

		//logCellMap(cells, 'splitting cells');
		//logObj(maxRect);

		let replacedList = [];
		let rooms = [];
		let roomResults = {};

		//only split if valid dim
		if(maxRect.area > minimumArea){
			

			//split along max 2D height/length
			if(maxRect.height >= maxRect.width){
				//console.log('splitting along height (length)');
				let halfWay = Math.round(maxRect.height * splitFraction);

				//Room 1
				rooms.push({
					area:maxRect.width * halfWay,
					top:maxRect.top,
					left:maxRect.left,
					bottom:maxRect.top + halfWay,
					right:maxRect.right,
					width:maxRect.width,
					height:halfWay
				});

				//Room 2
				const inverseHalfway = maxRect.height - halfWay;
				rooms.push({
					area:maxRect.width * inverseHalfway,
					top:maxRect.top + halfWay,
					left:maxRect.left,
					bottom:maxRect.bottom,
					right:maxRect.right,
					width:maxRect.width,
					height:inverseHalfway
				});

				//Ok place a wall half way across volume
				replacedList = makeStraightWall(wallMap, 
					{X:maxRect.left, Y:maxRect.top + halfWay},	//from
					{X:maxRect.left + maxRect.width, Y:maxRect.top + halfWay},	//to
					{sm:interiorWallSM});

				//replace leftmost with door (todo: random)
				let doorXLoc = maxRect.left;

				if(!doorOnLeft){
					doorXLoc = maxRect.right;
				}

				replaceBlock(wallMap, 
						doorXLoc, maxRect.top + halfWay,
						{sm:interiorDoorSM, bordersOverride:constructionMap.top});
			}
			//along width
			else{
				//console.log('splitting along width');
				let halfWay = Math.round(maxRect.width * splitFraction);

				//Room 1
				rooms.push({
					area:maxRect.height*halfWay,
					top:maxRect.top,
					left:maxRect.left,
					bottom:maxRect.bottom,
					right:maxRect.left + halfWay,
					width:maxRect.width,
					height:halfWay
				});

				//Room 2
				const inverseHalfway = maxRect.width - halfWay;
				rooms.push({
					area:maxRect.width*inverseHalfway,
					top:maxRect.top,
					left:maxRect.left + halfWay,
					bottom:maxRect.bottom,
					right:maxRect.right,
					width:maxRect.width,
					height:inverseHalfway
				});


				//Ok place a wall half way across volume
				replacedList = makeStraightWall(wallMap, 
					{X:maxRect.left + halfWay, Y:maxRect.top},	//from
					{X:maxRect.left + halfWay, Y:maxRect.top + maxRect.height},	//to
					{sm:interiorWallSM});

				//replace topmost with door
				let doorYLoc = maxRect.top;

				if(!doorOnLeft){
					doorYLoc = maxRect.bottom;
				}

				replaceBlock(wallMap, 
					maxRect.left + halfWay, doorYLoc, 
					{sm:interiorDoorSM, bordersOverride:constructionMap.left});
			}
		}
		else{
			//stop iterating
			iterations = 0;
		}

		roomResults = {replacedList, maxRect, rooms};

		//keep iterating until we reach 0
		if(iterations > 1){
			iterations--;
			//console.log(`roomSplitMaxRect More iterations (${iterations}) to go...`);

			let leftOverMap = copyMap(cells);

			//remove the max rect, then intersect remainder via projection
			removeRectFromMap(maxRect, leftOverMap);

			if(iterativeProjectionSplit){
				//logCellMap(leftOverMap, 'before add');
				addIntersectRect(leftOverMap, maxRect);
				//logCellMap(leftOverMap, 'after add');
			}

			let additionalResults = roomSplitMaxRect(leftOverMap, wallMap, oMap, 
				{minimumArea, iterations, splitFraction, doorOnLeft, iterativeProjectionSplit});

			roomResults.replacedList = roomResults.replacedList.concat(additionalResults.replacedList);
			roomResults.rooms = roomResults.rooms.concat(additionalResults.rooms);
		}

		//delete rooms that overlap ?

		return roomResults;
	}

	function makeHouse(cellsForFloors, houseOrigin, oMap, blockMeshMap, {
		floorCount=2,
		roomSplit=true,
		mainFloorSplitFraction=0.5,
		otherFloorSplitFraction=0.5,
		buildDoorsAndWindows=true,
		doorsOnTheLeft=false,
		buildStairs=true,
		stairsLeft=false,
		stairsPadding=0,
		buildRoof=true,
		buildWalls=true,
		buildFloors=true,
		spawnFurniture=true,
		buildFoundation=false
	}={}){

		const shiftedCellT = shiftT(makeTransform(), {loc:{X:-meta.blockSize/2,Y:-meta.blockSize/2}});


		//First floor
		const firstFloorCells = cellsForFloors[0];
		const secondFloorCells = cellsForFloors.length>1? cellsForFloors[1] : undefined;

		//1.
		let firstFloorMap = buildFloors? makeFloorsFromCellMap(firstFloorCells, houseOrigin, {
			sm: blockMeshMap.floor,
			smT: shiftedCellT
		}) : undefined;

		//logActorMap(floorActorMap);

		const centerSmT = shiftT(makeTransform(), {
			loc:{X:150, Y:150}, //loc:{X:-meta.blockSize/2, Y:-meta.blockSize},
			rot:{Yaw:180}
		});

		if(buildFoundation){
			foundationPass(firstFloorCells, houseOrigin, {sm:defaultFoundation});
		}

		//2. basic wall pass //{smList:blockMeshMap.wallList}


		let firstWallMap = buildWalls? makeWallsFromCellMap(firstFloorCells, houseOrigin, {
			smList:blockMeshMap.wallList,
			smT:centerSmT
		}) : undefined;

		
		//3. replace a door in the house, Todo: automate placements
		if(buildDoorsAndWindows){
			doorAndWindowPass(firstFloorCells, firstWallMap, oMap, {makeDoor: true});
		}

		//4. Ceilling/second floor
		let secondFloorOrigin = houseOrigin.ComposeTransforms(makeTransform({loc:{Z:meta.blockSize}}));
		let secondFloorMap = undefined;
		let secondFloorWallMap = undefined;

		//for room definition passes
		let roomRects = [];

		if(floorCount > 1){
			secondFloorMap = makeFloorsFromCellMap(secondFloorCells, secondFloorOrigin, {smT: shiftedCellT});
			secondFloorWallMap = makeWallsFromCellMap(secondFloorCells, secondFloorOrigin, {smT: centerSmT, smList:blockMeshMap.wallList});
		}

		//5. Room splitting and doors
		if(roomSplit){
			//first floor splits

			//Todo: add architecture definitions for room splits
			let firstFloorRooms = roomSplitMaxRect(firstFloorCells, firstWallMap, oMap, {
				iterations:2,
				splitFraction:mainFloorSplitFraction,
				doorOnLeft:doorsOnTheLeft,
				iterativeProjectionSplit:true
			});

			//track generated rooms
			roomRects = [...firstFloorRooms.rooms];
		}

		//6. stairs if we have a secondfloor
		let miscLayer = makeCustomEmptyLayer(firstFloorCells, houseOrigin);

		if(secondFloorMap){
			//room split second floor if appropriate
			let secondFloorRooms = [];

			if(roomSplit){
				secondFloorRooms = roomSplitMaxRect(secondFloorCells, secondFloorWallMap, oMap, {
					iterations:2,
					splitFraction:otherFloorSplitFraction,
					doorOnLeft:doorsOnTheLeft,
					iterativeProjectionSplit:true
				});

				roomRects = [...roomRects, ...secondFloorRooms.rooms];
			}

			//make sure we have maxRect information for stairs + other info
			if(!secondFloorRooms.maxRect){
				secondFloorRooms.maxRect = zoneOps.maxRectangle(secondFloorCells);
			}

			if(buildStairs){
				//automatic location
				let stairsDirection = stairsLeft? RELATIVE_DIRECTION.left : RELATIVE_DIRECTION.right;

				//obtain bottom/left/right for stairs
				let stairLoc = locationInRect(stairsDirection, secondFloorRooms.maxRect,{
					centering: RELATIVE_DIRECTION.bottom,
					paddingY:stairsPadding
				});

				//Clear out second floor area for stairs (2 floor blocks)
				clearBlocks(secondFloorMap, [stairLoc, {X: stairLoc.X, Y:stairLoc.Y-1}]);

				//NB: this is specific to currently used stair assets, todo: pass in meta info if needed for block by designers?
				const stairCellT = makeTransform({
					loc:{
						X:+meta.blockSize + 90,
						Y:350,
						Z:-meta.blockSize},
				rot:{Yaw:90}});

				console.log('attempting to place stairs');
				replaceBlock(secondFloorMap, stairLoc.X, stairLoc.Y, {sm: oMap.Stairs, smT:stairCellT});
			}

			if(buildDoorsAndWindows){
				doorAndWindowPass(secondFloorCells, secondFloorWallMap, oMap, {makeDoor: false});
			}

		}

		//7. Roofing pass
		if(buildRoof){
			const roofSM = oMap.Roof1; //Roof2 //RoofThatch1 //Roof1
			const roofEndCapSM = oMap.Roof1EndCap; //Roof1EndCap
			const roofOddSM = oMap.Roof1Odd;	//RoofThatchTop //Roof1Odd
			const roofOddEndCapSM = oMap.Roof1OddEndCap;
			const roofEndCapWallSM = oMap.Roof1Wall; //defaultWall //Roof1Wall

			let roofLayoutCells = secondFloorMap? secondFloorCells : firstFloorCells;
			let roofOrigin = secondFloorMap? secondFloorOrigin : houseOrigin;

			let roofCellMap = makeRoofFromCellMap(roofLayoutCells, roofOrigin, {
				sm:roofSM,
				smEndCap:roofEndCapSM,
				smOdd:roofOddSM,
				smOddEndCap:roofOddEndCapSM,
				smEndCapWall:roofEndCapWallSM
			});

			//find remainin roofing not covered by second floor
			if(secondFloorMap){

				//make a copy so we don't modify our cellmap
				let remainingRoof = copyMap(firstFloorCells);
				subtractMaps(remainingRoof, secondFloorCells);

				//obtain meta about remainder
				// let remainderMeta = cellMapMetaInformation(remainingRoof, {debug:true});

				// let minorMap = minorAxisMapFromFullMap(firstFloorCells, {addIntersection:true});
				// let firstFloorInterior = copyMap(minorMap);

				// //logCellMap(minorMap, 'test1');
				// subtractMaps(firstFloorInterior, remainingRoof);
				// //logCellMap(firstFloorInterior, 'test2');

				//nb we're hardcoding first floor from this. 3+ floors won't work atm
				let firstRoofCellMap = makeRoofFromCellMap(remainingRoof, houseOrigin, {
					sm:roofSM,
					smEndCap:roofEndCapSM,
					smOdd:roofOddSM,
					smOddEndCap:roofOddEndCapSM,
					smEndCapWall:roofEndCapWallSM
				});

				//try this?
				//clearBlocks(roofCellMap, firstRoofCellMap);
				//logObj(Object.keys(roofCellMap.cells))
			}
		}


		//8. Super basic room designation (might be before split if we split smartly)
		//and furniture pass based on room utility

		if(spawnFurniture){

			roomRects.forEach((room, i) =>{
				console.log(`room ${i} (${room.area},${room.width}x${room.height})`);

				let lanternLoc = locationInRect(RELATIVE_DIRECTION.right, room,{
					centering: RELATIVE_DIRECTION.center,
					paddingY:0,
					paddingX:0
				});

				globalThis.d1 = houseOrigin;
				let lanternTransform = makeTransform({
					loc:{
						X:(lanternLoc.X -0.1) * meta.blockSize,
						Y:(lanternLoc.Y) * meta.blockSize,
						Z:meta.blockSize/2
					},
					rot:{
						Yaw:90
					}
				}).ComposeTransforms(houseOrigin);
				spawnBp(oMap.LanternSconce1, lanternTransform.Translation, lanternTransform.Rotation.Quat_Rotator());
			});


		}

		//designate rooms by random for now?

		//find rooms encased by walls, output their rects

		//pick room function by proximity and size

		//place items fitting for designation

		//place basic lantern lights to keep interior lit?
	}

	//Utility
	return Object.freeze({
		meshTransformFromBounds, 
		makeBlock,
		replaceBlock,


		//passes
		makeFloorsFromCellMap,
		makeWallsFromCellMap,
		makeRoofFromCellMap,
		doorAndWindowPass,

		makeHouse
	});
}

exports.CellOperations = CellOperations;