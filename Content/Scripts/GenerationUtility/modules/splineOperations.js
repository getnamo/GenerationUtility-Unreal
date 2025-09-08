/// <reference path="../../typings/gu.d.ts" />
const { inspect, uclass, 
	tryLog, logObj, uScale,
	scaleVector, meshBounds,
	worldTransform,
	makeVector,
	copyVector,
	shiftT,
	ArrayMap,
	randomItem,
	randomStream,
	makeTransform,
	copyTransform } = require('GenerationUtility/utility/objectUtility.js');
const { Voronoi, Delaunay, polygonCentroid, polygonContains } = require('GenerationUtility/utility/thirdParty/d3.v6.min.js');
const { chaikinSmooth } = require('GenerationUtility/utility/chaikinSmooth.js');

function SplineOperations(owner, {seed='voronoi'}={}){

    let originLoc = owner.RootComponent.RelativeLocation;
	let originRot = owner.RootComponent.RelativeRotation;
	let originXForm = makeTransform({loc:originLoc, rot:originRot});

    function voronoiTransforms({
        seed,
        numPoints=20,
        xMax = 30000,
        yMax = 30000,
        smoothCells = false,
        polygonizeCells = false,
        smoothIterations = 2,
        lloydIterations = 0,
        inset = 2,
        offset={}
    }={}){

        let points = [];
        const randV = randomStream(seed);

        const cells = [];
        
        for (let i = 0; i < numPoints; i++) {
            points.push([randV() * xMax, randV() * yMax]);
        }

        if(lloydIterations>0){
            for(let i = 0;i<lloydIterations;i++){
                points = lloydRelaxation(points, xMax, yMax);
            }
        }

        const delaunay = Delaunay.from(points);
        const voronoi = new Voronoi(delaunay, [0, 0, xMax, yMax]);

        
        for (let i = 0; i < points.length; i++) {
            const cell = voronoi.cellPolygon(i);
            //console.log('cells: ', cell.length);
            if (cell) {
                let transforms = [];

                for (let j = 0; j < cell.length; j++) {
                    const point = {X:cell[j][0], Y:cell[j][1]}
                    transforms.push(shiftT(makeTransform({loc:point}),offset));
                }

                if(polygonizeCells){
                    let copyTransforms = [];
                    transforms.forEach(transform=>{
                        copyTransforms.push(transform);
                        copyTransforms.push(transform);
                    });

                    transforms = copyTransforms;
                }
                if(smoothCells){
                    const first = transforms[0];
                    const last = transforms[transforms.length - 1];
                    const vectors = transforms.map(xform=>xform.Translation);

                    transforms = chaikinSmooth(vectors, smoothIterations).map(vector=>makeTransform({loc:vector}));
                    transforms.unshift(first);
                    transforms.push(last);
                }

                if(inset!=0){
                    //Obtain midpoint
                    let midPoint = makeTransform().Translation;
                    transforms.forEach(transform=>{
                        midPoint = midPoint.Add_VectorVector(transform.Translation);
                    });
        
                    midPoint = midPoint.Divide_VectorFloat(cell.length);
        
                    //Scale inset by finding normal for each translation
                    transforms = transforms.map(transform=>{
                        const pointingVector = transform.Translation.Subtract_VectorVector(midPoint);
                        const originalLength = pointingVector.VSize();
                        
                        const direction = pointingVector.Normal();
                        const finalVector = midPoint.Add_VectorVector(direction.Multiply_VectorFloat(originalLength - inset));
                        const finalTransform = makeTransform({loc:finalVector});
                        //console.log(originalLength, inset);
        
                        return finalTransform;
                    });
                }
                
                //console.log('transforms: ', transforms.length);
                cells.push(transforms);
            }
        }

        //console.log('Final cells: ' , cells);
        return cells;
    }

    function lloydRelaxation(points, xMax, yMax) {
	    const voronoi = Delaunay.from(points).voronoi([0, 0, xMax, yMax]);
	    return points.map((point, i) => {
	        const cell = voronoi.cellPolygon(i);
	        const centroid = polygonCentroid(cell);
	        return centroid;
	    });
	}

    function clearRoads(){
        owner.ClearRoads();
    }

    function makeVoronoiRoads({
        voronoiPoints=voronoiTransforms({seed}), 
        roadOrigin = makeTransform(),
        withCollision = false,
    }={}){

        voronoiPoints.forEach(cell=>{
            let splineData = {
                Points: [],
                Origin: roadOrigin
            };
            //console.log('cell', cell)

            cell.forEach(transform=>{
                splineData.Points.push({
                    X:transform.Translation.X,
                    Y:transform.Translation.Y,
                    Z:transform.Translation.Z});
            });

            //TODO: Make this an optimized C++ function
            //slowdown appears to be chaos physics -> createbody for splinemesh
            owner.AddSplineRoad(splineData, withCollision);
        });
    }

    function makeSineRoad({count=10, interval=1000, width=500, offset={}}){
        //Make some roads points
        let points = [];
        points.push({X:0,Y:0});
        const offsetX = 0;
        
        for(let i = 0; i<count; i++){
            //sine wave road
            points.push({X:(i+1)*interval + offsetX, Y:(i%2)*width});

            //slightly curvy road
            //TODO: seeded random road placement
        }
        //, Origin: 
        let roadOrigin = copyTransform(originXForm).ComposeTransforms(makeTransform(offset));

        //logObj(roadOrigin, 'origin');

        roadOrigin.Translation.Y = 500;
        let splineData = {Points: points, Origin: roadOrigin};

        //logObj(splineData)
        return splineData;
    }

    function voronoiRoadsTests({
        polygonizeCells=true,
        smoothCells=true,
        smoothIterations=1
    }={}){
        clearRoads();

        //SineRoad Examples
		makeVoronoiRoads({
            voronoiPoints:voronoiTransforms({
                seed,
                numPoints:20,
                offset:{loc:{X:-30000, Y: -20000}},
                polygonizeCells,
                smoothCells,
                smoothIterations,
            }),
        });
    }

    function sineRoadTests(){
        clearRoads();

        //SineRoad Examples
		owner.AddSplineRoad(makeSineRoad({count:20, offset:{loc:{X:0, Y:1000}}}));
		owner.AddSplineRoad(makeSineRoad({count:10, offset:{loc:{X:1200, Y:-500},rot:{Yaw:90}}}));
		owner.AddSplineRoad(makeSineRoad({count:5, offset:{loc:{X:0},rot:{Yaw:-120}}}));
    }

    //Generating points within a polygon space

    function generateRandomPoints(polygon, {numPoints=100, seed='l33t', exclusionBounds=[]}={}) {
        const points = [];
        const [minX, minY, maxX, maxY] = getBoundingBox(polygon);
        const rand = randomStream(seed);
    
        while (points.length < numPoints) {
            const point = {
                X: rand() * (maxX - minX) + minX,
                Y: rand() * (maxY - minY) + minY
            };
            if (polygonContains(polygon.map(p => [p.X, p.Y]), [point.X, point.Y])) {
                //check exclusion bounds
                let validPoint = true;


                if(exclusionBounds.length > 0){
                    exclusionBounds.forEach(exclusion=>{
                        const exclusionVectors = exclusion.map(t=>t.Translation);
                        if(polygonContains(exclusionVectors.map(p => [p.X, p.Y]), [point.X, point.Y])){
                            validPoint = false;
                        }
                    });
                }
                if(validPoint){
                    points.push(point);
                }
            }
        }
        return points;
    }

    function createSquareTransforms(center, size) {
        // Calculate half extents
        const halfX = size.X / 2;
        const halfY = size.Y / 2;
    
        // Compute corner positions
        const corners = [
            { X: center.X - halfX, Y: center.Y - halfY, Z: center.Z }, // Bottom-left
            { X: center.X + halfX, Y: center.Y - halfY, Z: center.Z }, // Bottom-right
            { X: center.X + halfX, Y: center.Y + halfY, Z: center.Z }, // Top-right
            { X: center.X - halfX, Y: center.Y + halfY, Z: center.Z }, // Top-left
        ];
    
        // Default rotation (identity quaternion) and uniform scale
        const rotation = { X: 0, Y: 0, Z: 0, W: 1 };
        const scale = { X: 1, Y: 1, Z: 1 };

        logObj(center, 'center');
        logObj(size, 'size');
        logObj(corners, 'corners');
    
        // Generate transform objects
        return corners.map(pos => makeTransform({loc:pos}));
    }
    
    function generateEvenlySpacedPoints(polygon, {spacing = 100}={}) {
        const points = [];
        const [minX, minY, maxX, maxY] = getBoundingBox(polygon);
    
        for (let x = minX; x <= maxX; x += spacing) {
            for (let y = minY; y <= maxY; y += spacing) {
                const point = { X: x, Y: y };
                if (polygonContains(polygon.map(p => [p.X, p.Y]), [point.X, point.Y])) {
                    points.push(point);
                }
            }
        }
        return points;
    }

    function randRotateTransform(transform, {range=30, offset=0, randFunction=randomStream('l33t')}={}){
        const randomRot = makeTransform({rot:{Yaw:(range*randFunction()) + offset - (range/2)}});
        return randomRot.ComposeTransforms(transform);
    }

    //TODO: make a density/sparity variant for generation

    //TODO: make a generator that takes into account local dependencies?

    //TODO: polygon group - polygon exlusion group pairing

    function getBoundingBox(polygon) {
        const xs = polygon.map(p => p.X);
        const ys = polygon.map(p => p.Y);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    function extractTranslations(transforms) {
        return transforms.map(transform => ({
            X: transform.Translation.X,
            Y: transform.Translation.Y
        }));
    }

    function addZCoordinate(points, zValue = 0) {
        return points.map(point => ({ ...point, Z: zValue }));
    }

    //main function 
    function generatePointsWithinPolygon(polygonTransforms,
        generatorOptions={
        numPoints:100,  //for random
        seed:'l33t',
        spacing:100, //for evenly spread,
        exclusionBounds:[],
    },
        generatorFunction = generateRandomPoints,
        //generatorFunction = generateEvenlySpacedPoints
    ) {

        const polygon = extractTranslations(polygonTransforms);
        const points = generatorFunction(polygon, generatorOptions);

        //console.log(`(generatePointsWithinPolygon) generated ${points.length} points.`);
        
        const transforms =  addZCoordinate(points, generatorOptions.zValue || 0).map(loc=>makeTransform({loc}));
        return transforms;
    }    

    return Object.freeze({
        voronoiTransforms,
        clearRoads,
        makeVoronoiRoads,
        makeSineRoad,
        sineRoadTests,
        voronoiRoadsTests,
        generateRandomPoints,
        generateEvenlySpacedPoints,
        generatePointsWithinPolygon,
        randRotateTransform,
        createSquareTransforms
    });
}

exports.SplineOperations = SplineOperations;