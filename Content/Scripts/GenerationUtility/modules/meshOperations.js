/// <reference path="../../typings/gu.d.ts" />
const { inspect, uScale, copy,
 makeTransform, tryLog,
 randomStream,
 sineRange, toRad } = require('GenerationUtility/utility/objectUtility.js');

console.log('imported meshops')

/** Pure utility library for composing mesh actions */
function MeshOps(actor=undefined){

	/** Core Operations */
	function AllocateComputeMesh(){
		return actor.AllocateComputeMesh();
	}

	function Boolean(mesh, other, offset={}, operation='Subtraction'){
		if(operation == 'Append'){
			mesh.AppendTiled(other, makeTransform(offset), 1, true);
		}
		else{
			mesh.BooleanWithTransformed(other, makeTransform(offset), operation);
		}
	}

	function FromStatic(staticMesh){
		return actor.AllocateComputeMesh().MeshFromStatic(staticMesh);
	}

	//convenience wrapper for when we just need to place static meshes
	function SpawnStaticMesh({mesh=undefined, 
		world=GWorld,
		offset={},
		mobility='Movable'
	}){
		const transform = makeTransform(offset);
		let sma = StaticMeshActor.C(GWorld.BeginDeferredActorSpawnFromClass(StaticMeshActor, transform));

		sma.StaticMeshComponent.SetMobility(mobility);
		sma.StaticMeshComponent.StaticMesh = mesh? mesh : StaticMesh.Load('/Engine/BasicShapes/Cube');
		sma.StaticMeshComponent.ReregisterComponent();
		sma.FinishSpawningActor(transform);

		return sma;
	}

	//When you're done with all the mesh ops, finalize it to copy the mesh for viewing
	function FinalizeShape(mesh){
		actor.CopyFromMesh(mesh, false, false);
		actor.ReleaseAllComputeMeshes();
	}

	function GetActor(){
		return actor;
	}
	function SetActor(newActor){
		actor = newActor;
	}

	function SetMaterial(index=0, materialPath='/Engine/MapTemplates/Materials/BasicAsset01'){
		actor.MeshComponent.SetMaterial(0, Material.Load(materialPath));
	}
	function SetMaterialLoaded(index=0, material){
		actor.MeshComponent.SetMaterial(0, material);
	}

	//this function can't scale it
	function CopyMesh(mesh, offset={}){
		let copyMesh = AllocateComputeMesh();
		copyMesh.AppendTiled(mesh, offset, 1, false);
		return copyMesh;
	}

	//allows scale
	function OffsetMesh(mesh, offset={}){
		let final = AllocateComputeMesh();
		Boolean(final, mesh, offset,'Union');
		return final;
	}

	/** Util */
	function MakeBoxDim(dim={l:100,w:100, h:100}, scale=1){
		return {
			Min:{X:-dim.l/2*scale,Y:-dim.w/2*scale,Z:-dim.h/2*scale},
			Max:{X:dim.l/2*scale,Y:dim.w/2*scale,Z:dim.h/2*scale}
		};
	}

	function CreateSquarePolygon(){
		let polygon = [
			{X:0,Y:0},
			{X:1,Y:0},
			{X:1,Y:1},
			{X:0,Y:1}
		];
		return polygon;
	}

	//Box modeling tools (place vertices/triangles)
	/** TODO add via load mesh from verts/triangles */

	//Deforms - utility wrappers for input clarity

	//move tool 
	function DeformMove(mesh, {
		from = {X:0, Y:0, Z:0},
		to = {X:0, Y:0, Z:0},
		radius = 1,
		hardness = 1,
		magnitude = 1}){

		mesh.DeformMeshMove(from, to, radius, hardness, magnitude);
	}

	function DeformAxisSine1D(mesh, {
		magnitude = 1, 
		frequency = 1, 
		frequencyShift = 0, 
		axisIn = {X:1, Y:0, Z:0},
		upIn = {X:0, Y:0, Z:1}
	}){
		mesh.DeformMeshAxisSinWave1D(mesh, 
			magnitude, 
			frequency, 
			frequencyShift, 
			axisIn,
			upIn);
	}

	function DeformAxisSinRadial(mesh, {
		magnitude = 1, 
		frequency = 1, 
		frequencyShift = 0, 
		axis = {X:1, Y:0, Z:0}
	}){
		mesh.DeformMeshAxisSinWaveRadial(mesh, 
			magnitude, 
			frequency, 
			frequencyShift, 
			axis);
	}

	function DeformPerlinNoiseNormal(mesh, {
		magnitude = 1, 
		frequency = 1, 
		frequencyShift = {X:0, Y:0, Z:0}, 
		randomSeed = 31337
	}){
		mesh.DeformMeshPerlinNoiseNormal(
			magnitude, 
			frequency, 
			frequencyShift, 
			randomSeed);
	}


	/** Base Types */

	//this one needs an update as it's the first one
	function CreateBox(dim={l:100,w:100, h:100}, options={}){
		if(!options.scale)
			options.scale = 1;
		if(!options.segments)
			options.segments = 2;
		if(!options.segmentsX){
			options.segmentsX = options.segments;
		}
		if(!options.segmentsY){
			options.segmentsY = options.segments;
		}
		if(!options.segmentsZ){
			options.segmentsZ = options.segments;
		}
		if(!options.transform)
			options.transform = makeTransform();

		let mesh = AllocateComputeMesh();
		mesh.SetAppendTransform(options.transform);
		mesh.AppendBox(MakeBoxDim(dim, options.scale), 
			options.segmentsX,
			options.segmentsY,
			options.segmentsZ);
		mesh.ClearAppendTransform();
		return mesh;
	}

	//more convenient box formulation until creatbox is deprecated
	function BoxFromBounds({
		bounds={X:100,Y:100,Z:100}, 
		offset={},
		segments=undefined,
		segmentsX=undefined, 
		segmentsY=undefined,
		segmentsZ=undefined,
		transform=undefined}){
		options = {};
		options.segments = segments;
		options.segmentsX = segmentsX;
		options.segmentsY = segmentsY;
		options.segmentsZ = segmentsZ;
		if(transform){
			options.transform = transform
		}
		else{
			options.transform = makeTransform(offset);
		}
		return CreateBox({l:bounds.X, w:bounds.Y,h:bounds.Z}, options);
	}

	function BoxFromSM(staticMesh, options={
		overrideX:undefined,
		overrideY:undefined,
		overrideZ:undefined
	}){
		const boxDim = {l:100,w:100, h:100};

		if(!options.transform){
			options.transform = staticMesh.GetRelativeTransform()
		}
		
		if(options.overrideX){
			options.transform.Scale3D.X = 1;
			boxDim.l = options.overrideX;
		}
		if(options.overrideY){
			options.transform.Scale3D.Y = 1;
			boxDim.w = options.overrideY;
		}
		if(options.overrideZ){
			options.transform.Scale3D.Z = 1;
			boxDim.h = options.overrideZ;
		}


		return CreateBox(boxDim, options);
	}


	function CreateCylinder({scale=1, width=50, length=100, sections=16, lengthSections=1}={}){
		let mesh = AllocateComputeMesh();
		const finalLengthSections = lengthSections <= 0? 0: lengthSections-1;
		mesh.AppendCylinder(width/2*scale, length*scale, sections, finalLengthSections, true);
		return mesh;
	}
	function CreateHollowCylinder({scale=1, width=50, length=100, thickness=0.2, sections=16, lengthSections=8}={}){
		//NB lengthSections need a bit of breathing room so that geometry combines better
		
		let mesh = CreateCylinder({scale, width, length, sections, lengthSections});
		let other = CreateCylinder({scale, width: width*(1-thickness), length, sections, lengthSections});

		//store the hollow volume for piping convenience
		mesh.hollow = other;

		this.Boolean(mesh, other);

		return mesh;
	}

	//valid angle is 0-360 degrees
	function CreatePie({radius=100, angle=90, height=10, segments=16}={}){
		if(angle>360){
			angle=360;
		}
		if(angle<0){
			angle=0;
		}

		let mesh = CreateCylinder({width:radius*2, length:height, sections:segments, lengthSections:0});

		//rotate to get a bit better mesh topology
		mesh = OffsetMesh(mesh, {rot:{Yaw:180}});

		//get reciprocal and cut that out
		if(angle>180){
			console.log(angle);
			const extraAngle = 180-(angle-180);
			let reciprocal = CreatePie({radius:radius*2, angle: extraAngle, height, segments});
			Boolean(mesh, reciprocal, {rot:{Yaw:angle}}, 'Subtraction');
			return mesh;
		}
		
		//cut twice to get desired pie
		let cut = CreateBox({l:radius*2,w:radius,h:height},{segmentsX:segments/4+1, segmentsY:0, segmentsZ:0});

		//cut1
		Boolean(mesh, cut, {loc:{Y:-radius/2, Z:height/2}}, 'Subtraction');

		//second cut only needed for <180
		if(angle < 180){
			//cut2
			let moveY = radius/2*Math.cos(toRad(angle));
			let moveX = -radius/2*Math.sin(toRad(angle));
			Boolean(mesh, cut, {loc:{X:moveX, Y:moveY, Z:height/2}, rot:{Yaw:angle}}, 'Subtraction');		
		}

		return mesh;
	}

	function CreateSpiralStairs({	width=500, height=1000, stepHeight=25, 
									anglePerStep=20, coreWidth=100, segments=16, 
									simplifyTarget=-1}={}){
		
		const totalSteps = height/stepHeight;
		const windings = totalSteps/(360/anglePerStep);
		const sectionsPerWinding = 360/anglePerStep/ 4;	//8 steps per split
		let core = CreateCylinder({width:coreWidth, length:height, sections:segments, 
			lengthSections:windings*sectionsPerWinding});
		let step = CreatePie({radius:width/2, angle:anglePerStep, height:stepHeight, segments});

		
		for(let i=0; i<totalSteps; i++){
			Boolean(core, step, {rot:{Yaw:i*anglePerStep}, loc:{Z:i*stepHeight}}, 'Union');
		}
		
		if(simplifyTarget!=-1){
			core.SimplifyMeshToTriCount(simplifyTarget, false);
		}

		return core;
	}

	function CarveSpiralStairs(mesh,{width=500, height=1000, stepHeight=25, 
									 anglePerStep=20, coreWidth=100, segments=16, 
									 simplifyTarget=-1, offset={}}){
		const totalSteps = height/stepHeight;
		const windings = totalSteps/(360/anglePerStep);

		let emptyCore = CreateCylinder({width, length:height, sections:segments, 
			lengthSections:windings});

		Boolean(mesh, emptyCore, offset);

		let stairs = CreateSpiralStairs({width, height, stepHeight, 
										anglePerStep, coreWidth, segments, simplifyTarget});

		Boolean(mesh, stairs, offset, 'Union');

	}

	function CreatePerlinRock({
		size=100, sections=12, magnitude=30, 
		frequency=0.1, direction={X:100,Y:0,Z:0},
		seed='l33t'}){

		let mesh = AllocateComputeMesh();
		mesh.AppendSphereBox(size, sections);
		mesh.DeformMeshPerlinNoiseNormal(magnitude, frequency, direction, seed);

		return mesh;
	}

	function CreateRoundedCoin({width=100, depth=10, sections=16, ringSections=8}={}){
		let mesh = AllocateComputeMesh();
		let other = AllocateComputeMesh();
		mesh.AppendCylinder(width/2, depth*2, sections, 1, true);
		other.AppendTorus(width/2, depth, sections, ringSections);
		
		Boolean(mesh, other,{loc:{Z:depth}},'Union');
		return mesh;
	}

	function CreateRoundedTopWindow(dim={h:100,w:50}, options={sections:12}){
		let other = AllocateComputeMesh();

		//create box
		let mesh = CreateBox({h:dim.h, w:dim.w, l:dim.w*1.5});

		//the top cylinder
		other.AppendCylinder(dim.w/2, dim.w, options.sections, 0, true);

		//Union with a cylinder
		Boolean(mesh, other, {loc:{X:dim.w/2, Z:dim.h/2},rot:{Pitch:90}}, 'Union');

		//mesh.SimplifyMeshToTriCount(40, false);

		return mesh;
	}

	/** Higher level composed Types */
	function CreateCave({seed=0, 
		simplify=false, 
		simplifyPolyTarget=1000,
		smooth=false,
		smoothIterations=1}={}){
		let scale = 1.2;
		let mesh = CreatePerlinRock({size:220*scale, magnitude:50*scale});

		
		let other = CreatePerlinRock({size:100*scale, magnitude:50*scale});

		Boolean(mesh, other, {loc:{Z:140*scale}});

		other = CreatePerlinRock({size:100*scale, magnitude:50*scale, seed:seed+2});
		Boolean(mesh, other, {loc:{X:20*scale,Z:90*scale}});

		other = CreatePerlinRock({size:80*scale, magnitude:50*scale, seed:seed+4});
		Boolean(mesh, other, {loc:{X:-20*scale,Y:30*scale, Z:0*scale}});

		other = CreatePerlinRock({size:120*scale, magnitude:50*scale, seed:seed+5});
		Boolean(mesh, other, {loc:{X:20*scale,Y:-30*scale, Z:-50*scale}});

		other = CreatePerlinRock({size:60*scale, magnitude:50*scale, seed:seed+5});
		Boolean(mesh, other, {loc:{X:60*scale,Y:-100*scale, Z:-100*scale}});
		
		if(smooth){
			mesh.SmoothMeshUniform(1, smoothIterations);		
		}

		if(simplify){
			mesh.SimplifyMeshToTriCount(simplifyPolyTarget, false);
		}

		return mesh;
	}

	function PipeCylinder(mesh, other, offset={})
	{
		const hollowWidth1 = mesh.cylinderHollowWidth ? mesh.cylinderHollowWidth: 0;
		const hollowHeight1 = mesh.cylinderHollowHeight ? mesh.cylinderHollowHeight: 0;
		const hollowWidth2 = other.cylinderHollowWidth ? other.cylinderHollowWidth: 0;
		const hollowHeight2 = other.cylinderHollowHeight ? other.cylinderHollowHeight: 0;

		if(!offset.loc && !offset.scale && !offset.rot)
		{
			offset.loc = {Z:hollowHeight};
		}

		//combine pipe shapes
		Boolean(mesh, other, offset, 'Union');

		//combine hollows
		Boolean(mesh.hollow, other.hollow, offset, 'Union');

		Boolean(mesh, mesh.hollow, 'Subtraction');

		//mesh.SimplifyMeshToTriCount(1000, false);
	}

	function CreateTower({
		h=300,
		w=100,
		topH=300, 
		topScale=1.2,
	 	simplify=false,
	 	segments=16}){
		//todo: add windows per scale
		//todo: add internal stairs? options?

		let mesh = AllocateComputeMesh();
		let other = AllocateComputeMesh();

		//Hollow base
		mesh.AppendCylinder(w, h , segments, 0, true);
		const scale = 0.95
		other.AppendCylinder(w*scale, h , segments, 0, true);
		Boolean(mesh, other, {loc:{Z:0}}, 'Subtraction');

		//top
		other = AllocateComputeMesh();
		other.AppendCone(w*topScale, 0 , topH, segments, 0, true);
		Boolean(mesh, other, {loc:{Z:h}}, 'Union');

		//door
		let door = CreateRoundedTopWindow({h:300,w:100});
		Boolean(mesh, door, {loc:{X:w}});
		
		//windows
		other = CreateRoundedTopWindow();
		Boolean(mesh, other, {loc:{X:w, Z:h*0.75}, scale:uScale(0.5)});
		Boolean(mesh, other, {loc:{X:-w, Z:h*0.75}, scale:uScale(0.5)});

		Boolean(mesh, other, {loc:{Y: w, Z:h/2}, rot:{Yaw:90}, scale:uScale(0.5)});
		Boolean(mesh, other, {loc:{Y: -w, Z:h/2}, rot:{Yaw:90}, scale:uScale(0.5)});

		//move us down
		let final = AllocateComputeMesh();
		Boolean(final, mesh, {loc:{Z:-200}},'Union');

		if(simplify){
			final.SimplifyMeshToTriCount(200, false);
		}

		return final;
	}
	function CreateSeatingArea(){
		let mesh = AllocateComputeMesh();
		let coin = CreateRoundedCoin({sections:32, ringSections:32});
		let roundedSquare = CreateRoundedCoin({sections:4, ringSections:16});

		Boolean(mesh, coin, {scale:uScale(0.2), loc:{Z:-5}}, 'Union');
		Boolean(mesh, coin, {scale:uScale(0.2), loc:{X:30}}, 'Union');
		Boolean(mesh, coin, {scale:uScale(0.2), loc:{X:-30}}, 'Union');
		Boolean(mesh, coin, {scale:uScale(0.5), loc:{}}, 'Union');

		//{Z:0.4,Y:0.4,X:0.8}
		Boolean(mesh, roundedSquare, {scale:uScale(0.4), loc:{Y:20}, rot:{Yaw:45}}, 'Union');
		Boolean(mesh, roundedSquare, {scale:uScale(0.4), loc:{Y:-20}, rot:{Yaw:45}}, 'Union');

		return mesh;
	}

	function CreateSlantedRoof({dim={l:1000,w:400, h:300}, offset={}}={}){
		let roof = CreateBox({l:dim.l*1.1, w:dim.w*0.9, h:dim.w*0.9}, {
			transform:makeTransform({
				rot:{Roll:45}
			})
		});
		let roofLineCut = CreateBox({l:dim.l*1.1, w:dim.w*1.5, h:dim.w});
		let roofRim = CreateBox({l:dim.l*1.1, w:dim.w*1.4, h:20});

		//rotate and cut
		Boolean(roof, roofLineCut, {loc:{Z:-dim.h+40, Y:0}},'Subtraction');
		Boolean(roof, roofRim, {loc:{Z:0, Y:0}},'Union');

		return roof;
	}

	function CreateTownHouseShape(dim={l:1000,w:400, h:300}, options={}){
		if(options.isCornerHouse){
			//dim.w = dim.l/2;
			dim.l = dim.w;
			options.hasSlantedRoof = false;
			options.hasWindows = true;
			options.floorCount = 4;
		}

		//main shape
		let mesh = AllocateComputeMesh();
		let other = {};

		//shortcut functions
		const subtractOther = (otherMesh, change) =>{
			Boolean(mesh, otherMesh, change, 'Subtraction');
		}
		const appendOther = (otherMesh, change) =>{
			Boolean(mesh, otherMesh, change, 'Append');
		}

		function makeDoor({doorHeight=280, doorWidth=150, loc={
			Y: 0,
			X:dim.l/2-50,
			Z:(dim.h)/2- doorHeight/1.3}}={}
		){
			other = CreateBox({l:doorWidth, w:doorWidth, h:doorHeight});
			subtractOther(other, {loc});
		}

		function makeFloor(floorIndex = 0, isLast = false){

			//windows need to take floor index into account
			function makeWindow({offsetW = dim.w/3}={}){
				other = CreateBox({l:100, w:120, h:150}, {scale:1});
				subtractOther(other, {
					loc:{
						Y:offsetW,
						X:dim.l/2,
						Z:floorIndex*dim.h},
					rot:{
						Yaw: 0
					}
				});
			}

			let mainShape = CreateBox(dim, {scale:1});
			let mainHollow = CreateBox(dim, {scale:0.98});
			Boolean(mainShape, mainHollow, {}, 'Subtraction');
			appendOther(mainShape, {loc:{Z:floorIndex*dim.h}});

			subtractOther(other);

			//Make door/s if it's the ground floor
			if(floorIndex==0){
				makeDoor();
				if(options.hasBackDoor){
					makeDoor({loc:{
						Y: dim.w/3,	//skewed left
						X:-dim.l/2+50,
						Z:(dim.h)/2- 280/1.3}});
				}
			}
			
			//Make windows
			if(options.hasWindows){
				if(floorIndex == 0){
					if(options.hasWindowsOnFirstFloor){
						makeWindow({offsetW: dim.w/3});
						makeWindow({offsetW: -dim.w/3});
					}
				}
				else if((floorIndex+options.windowsOnLeft) %2 == 0){
					makeWindow({offsetW: dim.w/3});
					makeWindow({offsetW: 0});
					makeWindow({offsetW: -dim.w/3});
				}
				else{
					makeWindow({offsetW: dim.w/4});
					makeWindow({offsetW: -dim.w/4});
				}
			}

			if(isLast){
				if(options.hasSlantedRoof){
					//add a slanted roof - rotated box cut with rim
					let roof = CreateBox({l:dim.l*1.1, w:dim.w*0.9, h:dim.w*0.9}, {
						transform:makeTransform({
							rot:{Roll:45}
						})
					});
					let roofLineCut = CreateBox({l:dim.l*1.1, w:dim.w*1.5, h:dim.w});
					let roofRim = CreateBox({l:dim.l*1.1, w:dim.w*1.4, h:20});
		
					//rotate and cut
					Boolean(roof, roofLineCut, {loc:{Z:-dim.h+40, Y:0}},'Subtraction');
					Boolean(roof, roofRim, {loc:{Z:0, Y:0}},'Union');
		
					Boolean(mesh, roof, {loc:{Z:floorIndex*dim.h + dim.h/2+10}},'Union');
				}
			}
		}

		for(let i = 0; i< options.floorCount; i++){
			makeFloor(i, i==(options.floorCount-1));
		}

		return mesh;
	}

	function CreateHouseShape(dim={l:1000,w:400, h:300}, options={}){
		//Box with a doorway test

		//main shape
		let mesh = CreateBox(dim, {scale:1});


		//subtract interior space
		let other = CreateBox(dim, {scale:0.95});

		//shortcut function
		const subtractOther = (change, operation) =>{
			Boolean(mesh, other, change, operation);
		}

		subtractOther({loc:{Z:-20}});

		//subtract doorway
		const doorHeight = 200;
		other = CreateBox({l:100, w:100, h:doorHeight});
		subtractOther({loc:{
			Y: 0,
			X:dim.l/2-50,
			Z:dim.h/2-doorHeight}});

		//add a window - todo: identify mid surface pt/etc
		if(options.hasWindows){
			other = CreateBox({l:100, w:120, h:150}, {scale:1});
			subtractOther({
				loc:{
					Y: 0,
					X:-dim.l/2,
					Z:0},
				rot:{
					Yaw: 0
				}
			});

			//two more windows on the side
			const windowSide = options.windowsOnLeft? 1:-1;
			subtractOther({
				loc:{
					Y: dim.w/2 * windowSide,
					X:-100,
					Z:0},
				rot:{
					Yaw: 0
				}
			});

			subtractOther({
				loc:{
					Y: dim.w/2 * windowSide,
					X:100,
					Z:0},
				rot:{
					Yaw: 0
				}
			});
		}

		if(options.hasSlantedRoof){
			//add a slanted roof - rotated box cut with rim
			let roof = CreateBox({l:dim.l*1.1, w:dim.w*0.9, h:dim.w*0.9}, {
				transform:makeTransform({
					rot:{Roll:45}
				})
			});
			let roofLineCut = CreateBox({l:dim.l*1.1, w:dim.w*1.5, h:dim.w});
			let roofRim = CreateBox({l:dim.l*1.1, w:dim.w*1.4, h:20});

			//rotate and cut
			Boolean(roof, roofLineCut, {loc:{Z:-dim.h+40, Y:0}},'Subtraction');
			Boolean(roof, roofRim, {loc:{Z:0, Y:0}},'Union');

			Boolean(mesh, roof, {loc:{Z:dim.h/2+10}},'Union');
		}
		//make a rim roof
		else{

			let roof = CreateBox({l:dim.l*1.1, w:dim.w*1.1, h:100});
			let roofRimCut = CreateBox({l:dim.l, w:dim.w, h:80}, {
				transform:makeTransform({
				loc:{Z:20}})
			});
			Boolean(roof, roofRimCut, {loc:{Z:0, Y:0}},'Subtraction');
			Boolean(mesh, roof, {loc:{Z:dim.h/2+10}},'Union');

			//rerun house
			if(options.secondLevel){
				let secondOptions = JSON.parse(JSON.stringify(options));
				secondOptions.level = secondOptions.level? secondOptions.level+1:1;

				secondOptions.secondLevel = false;//Math.round(Math.random());
				//secondOptions.

				let secondFloor = CreateHouseShape(dim, secondOptions);

				Boolean(mesh, secondFloor, {loc:{Z:dim.h}},'Union');
			}

			//dome
			if(!options.secondLevel && options.dome){
				if(options.level){
					console.log('stairs!' + options.level)
					//CarveSpiralStairs(mesh, {height:dim.h*(options.level+1)});
				}
				let cutout = AllocateComputeMesh();
				cutout.AppendSphereBox(200, 10);
				Boolean(mesh, cutout, {loc:{Z:150}},'Union');
				Boolean(mesh, cutout, {loc:{Z:130}},'Subtraction');
			}
		}

		return mesh;
	}

	return Object.freeze({
		GetActor,
		SetActor,
		SetMaterial,
		SetMaterialLoaded,
		AllocateComputeMesh,
		FromStatic,
		Boolean,
		FinalizeShape,
		CopyMesh,
		OffsetMesh,
		SpawnStaticMesh,

		DeformMove,
		DeformAxisSine1D,
		DeformAxisSinRadial,
		DeformPerlinNoiseNormal,
		
		MakeBoxDim,
		CreateSquarePolygon,

		CreateCylinder,
		CreateHollowCylinder,
		CreatePie,
		CreateSpiralStairs,
		CarveSpiralStairs,
		CreatePerlinRock,
		CreateRoundedCoin,
		BoxFromSM,
		BoxFromBounds,
		CreateBox,
		CreateRoundedTopWindow,
		CreateSlantedRoof,

		CreateCave,
		PipeCylinder,
		CreateTower,
		CreateSeatingArea,
		CreateHouseShape,
		CreateTownHouseShape
	});
}

exports.MeshOps = MeshOps;