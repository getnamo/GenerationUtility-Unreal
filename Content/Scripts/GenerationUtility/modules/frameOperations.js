/// <reference path="../../typings/gu.d.ts" />
const { inspect, uScale, copy,
 makeTransform, tryLog,
 randomStream,
 sineRange, toRad,
 copyVector,
 meshBounds,
 logObj,
 concatOffset } = require('GenerationUtility/utility/objectUtility.js');
 const { MeshOps } = require('GenerationUtility/modules/meshOperations.js');




/** Pure utility library for composing mesh actions */
function FrameOps(actor=undefined){

	//use mesh ops internally so we can frame with less external ref
	const mops = new MeshOps(actor);

	/** Core Operations */

	//makes a beam along the X axis with multiple parts to fit length
	function BeamWithLength({
		length = 100,
		part = undefined,
	 	bounds = {X:100,Y:100,Z:100},
	 	offset = undefined,
	 	addOp = 'Append'}){
		if(part == undefined){
			console.warn('BeamWithLength requires a part mesh');
			return;
		}

		let beam = mops.AllocateComputeMesh();

		const beamLength = bounds.X;
		const beamCount = Math.ceil(length / beamLength);

		//console.log('len: ', length)
		//console.log('count: ', beamCount);

		let next = {X:0,Y:0,Z:0};//beamCount
		for(let i=0; i<beamCount; i++){
			next.X = (beamLength * i);
			mops.Boolean(beam, part, {loc:next}, addOp);
		}

		//make the cutter the size of the beam so it can cut it perfectly
		let beamCutter = mops.CreateBox({l:bounds.X, w:bounds.Y*2, h:bounds.Z*2});//l:beamLength{}

		//const beamFullSizeLength = (beamCount - 1) * beamLength; 
		const cutLocationX = (length) + bounds.X/2;
		mops.Boolean(beam, beamCutter, {loc:{X:cutLocationX}});//, 'Union');

		//rotate as needed
		if(offset){
			beam = mops.OffsetMesh(beam, offset);
		}

		return beam;
	}

	function RectangularFrame({
		length=100,
		width=100,
		part=undefined,
		bounds = {X:100,Y:100,Z:100},
	 	offset = undefined,
	 	shortenToFit = true,
	 	addOp = 'Append'}){
		if(part == undefined){
			console.warn('RectangularFrame requires a part mesh');
			return;
		}

		let frame = mops.AllocateComputeMesh();
		let extraOffset = 0;

		//assumes the mesh is centered in y/z axis and starts on X
		//To ensure beams don't overlap, shrink length by 2x width
		if(shortenToFit){
			length -= bounds.Y*2;
			extraOffset = bounds.Y;
		}

		let lengthBeam = BeamWithLength({length, part, bounds,
			offset:{
				loc:{Y:-bounds.Y/2, X: extraOffset}
			}});

		let widthBeam = BeamWithLength({length:width, part, bounds, 
			offset:{loc:{X:-bounds.Y/2}, rot:{Yaw:90}}});

		mops.Boolean(frame, lengthBeam, {},addOp);
		mops.Boolean(frame, widthBeam, {rot:{Yaw:180}},addOp);
		mops.Boolean(frame, lengthBeam, {
			loc:{Y:-width + bounds.Y}},addOp);
		mops.Boolean(frame, widthBeam, {
			loc:{X:length - bounds.Y + (extraOffset*2)},
			rot:{Yaw:180}},addOp);

		if(offset){
			frame = mops.OffsetMesh(frame, offset);
		}
		return frame;
	}

	//Move deform, used to make it more rustic
	function DeformFrameByScene(mesh, scene, vector, 
		{radius=500, hardness=0, magnitude=1}={}){
		let fromDeform = scene.GetRelativeTransform().Translation;
		//let fromDeform =  worldTransform(deformScene).Translation;

		let toDeform = copyVector(fromDeform).Add_VectorVector(vector);
		mesh.DeformMeshMove(fromDeform, toDeform, radius, hardness, magnitude);
	}

		//cubic framing given l,w,h
	function BoxFrame({
		length=100,
		width=100,
		height=100,
		boxBounds=undefined,
		part=undefined,
		bounds = {X:100,Y:100,Z:100},
	 	offset = undefined,
	 	shortenToFit = true,
	 	addPillars = true,
	 	addOp = 'Append'}){
		let box = mops.AllocateComputeMesh();

		//convenience override
		if(boxBounds){
			length = boxBounds.X;
			width = boxBounds.Y;
			height = boxBounds.Z;
		}

		//console.log('bounds: ', JSON.stringify(boxBounds))

		//two rectangular frames
		let frame = RectangularFrame({
			length, 
			width, 
			part, 
			bounds,
			offset,
			shortenToFit,
			addOp});

		//bottom
		mops.Boolean(box, frame, {}, addOp);
		//top
		mops.Boolean(box, frame, {loc:{Z:height}}, addOp);

		//four pillars
		if(addPillars){
			let extraOffset = 0;
			if(shortenToFit){
				height -= bounds.Z;
				extraOffset = bounds.Z;
			}

			let pillar = BeamWithLength({length:height, part, bounds, offset:{
					loc:{Y:-extraOffset/2, X: extraOffset/2, Z:extraOffset/2},
					rot:{Pitch:90}}});

			mops.Boolean(box, pillar, {}, addOp);
			mops.Boolean(box, pillar, {loc:{X:length - extraOffset}}, addOp);
			mops.Boolean(box, pillar, {loc:{Y:-width + extraOffset}}, addOp);
			mops.Boolean(box, pillar, {loc:{
				X:length - extraOffset,
				Y:-width + extraOffset
			}}, addOp);
		}

		return box;
	}

	//frame a door hole with supports
	function DoorFrame(frameSM, floorHeight, part, partBounds, addBottomFrame = false){
		const addOp = 'Append';
		const frameBounds = meshBounds(frameSM);

		let pillar = BeamWithLength({length:floorHeight, part, bounds:partBounds, offset:{
			rot:{Pitch:90},
		}});
		
		let frame = mops.AllocateComputeMesh();
		const frameXform = frameSM.GetRelativeTransform();
		let frameCenter = frameXform.Translation;
		frameCenter = frameXform.Rotation.Quat_UnrotateVector(frameCenter);
		let frameLeft = copyVector(frameCenter);
		frameLeft.Y += partBounds.Z/2;
		frameLeft.Z -= frameBounds.Z/2;
		frameLeft.X += frameBounds.X/2 + partBounds.Z/2;

		let frameRight = copyVector(frameLeft);
		frameRight.X += -frameBounds.X - partBounds.Z;

		//support pillars
		mops.Boolean(frame, pillar, {loc:
			frameLeft
		}, addOp);

		mops.Boolean(frame, pillar, {loc:
			frameRight
		}, addOp);

		
		let frameTop = copyVector(frameRight);
		frameTop.Z += frameBounds.Z;

		//top frame
		pillar = BeamWithLength({length:frameBounds.X + partBounds.Z, part, bounds:partBounds});

		mops.Boolean(frame, pillar, {loc:
			frameTop
		}, addOp);

		addBottomFrame = true
		if(addBottomFrame){
			let frameBottom = copyVector(frameRight);
			mops.Boolean(frame, pillar, {loc:
				frameBottom
			}, addOp);
		}

		frame = mops.OffsetMesh(frame,{rot:frameXform.Rotation.Quat_Rotator()});

		return frame;
	}

	//same as door, but with bottom frame
	function WindowFrame(frameSM, floorHeight, part, partBounds){
		const addOp = 'Append';
		const frameBounds = meshBounds(frameSM);

		let pillar = BeamWithLength({length:floorHeight, part, bounds:partBounds, offset:{
			rot:{Pitch:90},
		}});
		
		let frame = mops.AllocateComputeMesh();

		//get basic orientation
		const frameXform = frameSM.GetRelativeTransform();
		let frameCenter = frameXform.Translation;
		frameCenter = frameXform.Rotation.Quat_UnrotateVector(frameCenter);
		let frameLeft = copyVector(frameCenter);
		frameLeft.Y += partBounds.Z/2;
		frameLeft.Z = 0;
		frameLeft.X += frameBounds.X/2 + (partBounds.Z/2 * 0.8);

		let frameRight = copyVector(frameLeft);
		frameRight.X += -frameBounds.X - (partBounds.Z/2 * 0.8);

		//support pillars
		mops.Boolean(frame, pillar, {loc:frameLeft}, addOp);

		mops.Boolean(frame, pillar, {loc:
			frameRight
		}, addOp);

		//top frame
		let frameTop = copyVector(frameRight);
		frameTop.Z = frameCenter.Z + frameBounds.Z/2;

		pillar = BeamWithLength({length:frameBounds.X + partBounds.Z/2, part, bounds:partBounds});

		mops.Boolean(frame, pillar, {loc:
			frameTop
		}, addOp);

		//bottom frame
		let frameBottom = copyVector(frameRight);
		frameBottom.Z = frameCenter.Z - frameBounds.Z/2;

		mops.Boolean(frame, pillar, {loc:
			frameBottom
		}, addOp);

		frame = mops.OffsetMesh(frame,{
			rot:frameXform.Rotation.Quat_Rotator(),
			loc:{Z:partBounds.Z/2}
		});

		return frame;
	}

	/** 
	* Run a long a wall and add supports of given height
	* with desired spacing.
	* If count is specified it overrides spacing
	*/
	function SupportWall({
		length=100,
		height=100,
		spacing=50,
		part,
		partBounds,
		offset={},
		adjustSpacingToEven=false,
		count=undefined,
		includeEnds=true}){
		
		const addOp = 'Append';
		if(count==undefined){
			count = Math.floor(length/spacing);
		}
		else{
			adjustSpacingToEven = true;
		}

		if(count<2){
			count = 2;
		}

		//adjust count for math
		count -= 1;
		
		if(adjustSpacingToEven){
			spacing = length/count;
		}

		let support = mops.AllocateComputeMesh();

		if(!offset.rot){
			offset.rot = {}
		}
		offset.rot.Pitch = 90;

		let pillar = BeamWithLength({length:height, part, bounds:partBounds, offset});

		//adjust for end trimming
		let start = 0;
		if(!includeEnds){
			start = 1;
			count -= 1;
		}

		for(let i=start; i<count+1; i++){
			mops.Boolean(support, pillar, {loc:{X:i*spacing}}, addOp);
		}
		return support;
	}

	/**
	Fill a section with supports of given spacing
	*/
	function SupportBox({
		bounds={X:100, Y:100, Z:100}, 
		spacingX=50, 
		spacingY=50, 
		part, 
		partBounds, 
		offset={}, 
		adjustSpacingToEven=false,
		countX=undefined,
		countY=undefined}){

		let support = mops.AllocateComputeMesh();
		const addOp = 'Append';

		//Wall length has no begin and end parts, 
		//these will be added via second wall (Y)
		const wallX = SupportWall({
			length:bounds.X,
			height:bounds.Z,
			spacing:spacingX,
			part,
			partBounds,
			adjustSpacingToEven,
			count:countX,
			offset,
			includeEnds: false
		});

		mops.Boolean(support, wallX, {loc:{}}, addOp);
		mops.Boolean(support, wallX, {loc:{Y:-bounds.Y}}, addOp);

		const wallY = SupportWall({
			length:bounds.Y,
			height:bounds.Z,
			spacing:spacingX,
			part,
			partBounds,
			adjustSpacingToEven,
			count:countY,
			offset:{loc:{Z:offset.loc.Z}},
			includeEnds: true
		});

		mops.Boolean(support, wallY, {
			loc:{
				X:-bounds.X/2,
				Y:-bounds.Y/2
			},
			rot:{Yaw:90}}, addOp);

		mops.Boolean(support, wallY, {
			loc:{
				X:bounds.X/2,
				Y:-bounds.Y/2
			},
			rot:{Yaw:90}}, addOp);

		return support;
	}

	/** clear some space, optionally override some dimensions */
	function ClearSpaceInMesh(mesh, SM, {
		offset={}, 
		overrideY=undefined,
		overrideZ=undefined}){
		let cut = mops.BoxFromSM(SM, {overrideZ, overrideY});
		mops.Boolean(mesh, cut, offset, 'Union');
		
		/*let windowBounds = meshBounds(windowSM);
		windowBounds.Z = floorHeight*1.2;
		windowBounds.X *= 1.5
		const windowLoc = windowSM.GetRelativeTransform().Translation;
		const windowRot = windowSM.GetRelativeTransform().Rotation.Quat_Rotator;
		ClearBoundsInMesh()*/
	}

	function ClearBoundsInMesh(mesh, bounds={X:100, Y:100, Z:100}, offset={}){
		let cut = mops.CreateBox({l:bounds.X, w:bounds.Y, h:bounds.Z});
		mops.Boolean(mesh, cut, offset, 'Subtraction');
	}

	function ClearSupportSMInMesh(mesh, staticMesh, supportHeight = 100){
		let bounds = meshBounds(staticMesh);
		bounds.Z = supportHeight*2;
		bounds.X *= 1.4
		const loc = staticMesh.GetRelativeTransform().Translation;
		const rot = staticMesh.GetRelativeTransform().Rotation.Quat_Rotator;

		ClearBoundsInMesh(mesh, bounds, {loc, rot});
	}

	function FloorJoists({
		bounds={X:100, Y:100},
		count=4,
		directionIsX=true,
	 	offset={},
	 	part, 
		partBounds,
		endCap=true,
		addOp='Append'
	}){
		if(!part || !partBounds){
			console.warn('FloorJoists is missing parts or partbounds definition. Skipped');
			return;
		}

		let joists = mops.AllocateComputeMesh();

		//if direction is x, yaw 90 to have beams in y direction
		let length = bounds.X;
		let span = bounds.Y;
		let extraRot = {rot:{Yaw:90}};

		if(!directionIsX){
			length = bounds.Y;
			span = bounds.X;
			extraRot = {rot:{Yaw:0}};
		}

		const spacing = length/count;

		let joist = BeamWithLength({length:span, part, bounds:partBounds});

		//add requested yaw on top
		offset = concatOffset(offset, extraRot);

		if(endCap){
			count++;
		}

		for(let i = 0; i < count; i++){
			offset.loc.X = i * spacing;

			mops.Boolean(joists, joist, offset, addOp);
		}
		

		return joists;
	}

	function CalcAngle(opposite, adjacent) {
  		return Math.atan(opposite / adjacent);
	}

	function AngledRoofSupport({
		bounds={X:100, Y:100, Z:50},
		count=4,
		directionIsX=true,
		angle=undefined,
		part,
		partBounds,
		offset,
		eaveFactor=1.0,
		crossFactor=1.0,
		addRidgeBeam=true,
		addOp='Append'
	}){
		let length = bounds.X;
		let span = bounds.Y;
		if(!directionIsX){
			length = bounds.Y;
			span = bounds.X;
		}

		//copy original offset for later use
		const originalOffset = {...offset};

		let roof = mops.AllocateComputeMesh();

		//no angle override, needs to be calculated
		if(!angle){

			//calculate angle in deg from height
			angle = CalcAngle(bounds.Z, length/2) * 180 / Math.PI;
		}
		const angleRad = angle*Math.PI/180;

		const rafterScale = Math.cos(angleRad);
		const rafterHeightScale = Math.sin(angleRad);
		const rafterHeight = Math.tan(angleRad) * span/2;

		//spread operator doesn't work correctly on unreal classes roots
		let halfBounds = JSON.parse(JSON.stringify(bounds));
		
		const compoundScale = 0.5 / rafterScale * eaveFactor * crossFactor;

		//eaveFactor
		if(directionIsX){
			halfBounds.Y = span * compoundScale;
		}
		else{
			halfBounds.X = span * compoundScale;
		}

		//make the half part using floor joist op
		let oneHalf = FloorJoists({bounds:halfBounds, count, directionIsX, part, partBounds, addOp, offset});

		//we need to move our rafters down and out to make eaves instead of crossrafters
		const extraRot = {rot:{Roll:-angle}};
		
		if(eaveFactor>1){
			//not currently used
			//let eavedSpan = span;
			//eavedSpan = span * eaveFactor * rafterScale;	

			const fullspanFactor = eaveFactor-(compoundScale);

			offset = concatOffset(offset, {
					loc:{
						//this isn't perfect, but close enough for range 
						//we're likely to use for now
						Y:-(span * (eaveFactor-1)*(rafterHeightScale))// - eaveFactor))
					}
				});
			offset = concatOffset(offset, extraRot);	
		}
		else{
			offset = concatOffset(offset, extraRot);
		}

		//attach one roof
		mops.Boolean(roof, oneHalf, offset, addOp);

		//rotate and move the other roof
		offset = concatOffset(offset, {rot:{Yaw:180}, loc:{X:length, Y:span}});
		mops.Boolean(roof, oneHalf, offset, addOp);

		//add a long board support
		if(addRidgeBeam){
			const ridgebeam = BeamWithLength({length, part, bounds:partBounds});
			const ridgebeamOffset = concatOffset(originalOffset, {loc:{Y:span/2, Z:rafterHeight}});
			mops.Boolean(roof, ridgebeam, ridgebeamOffset, addOp);
		}

		return roof;
	}

	/** fill the roof of given parts. Assumes along X only */
	function AngledRoofFill({
		bounds={X:100, Y:100, Z:50},
		angle=undefined,
		part,
		partBounds,
		offset={},
		overlapFraction=0.6,
		overlapAngle=15,
		roofAngle=undefined,
		roofHeight=undefined,	//override
		addOp='Append',
		overlapToFit=true,
		eaveFactor=1.0
	}){
		let roof = mops.AllocateComputeMesh();

		//todo: union for this op is too expensive, 
		//need to fix append (which also solves 90% of cases)

		if(!part){
			console.warn('AngledRoofFill is missing parts or partbounds definition. Skipped');
			return roof;
		}

		const halfSpan = bounds.Y/2;
		let roofAngleRad = Math.atan(roofHeight/bounds.Y);

		if(roofAngle){
			roofAngleRad = roofAngle*Math.PI/180;
			roofHeight = halfSpan * Math.tan(roofAngleRad);
		}
		//only if angle isn't defined
		else if(!roofHeight){
			roofHeight = bounds.Z;
		}

		const overlapAngleRad = overlapAngle*Math.PI/180;
		const partSpan = partBounds.Y * Math.cos(overlapAngleRad) / 3;

		const halfAngledSpan = halfSpan / Math.cos(roofAngleRad) / 2 * eaveFactor;

		let count = Math.ceil(halfAngledSpan/partSpan);

		const spacing = partBounds.Y * overlapFraction;
		
		//make a section of roof filling
		let section = mops.AllocateComputeMesh();
		for(let i=0; i<count; i++){
			const partOffset = concatOffset(offset, {
				loc:{Y:-i*spacing},
				rot:{Roll:overlapAngle}
			});
			mops.Boolean(section, part, partOffset, addOp);
		}
		
		//plane count
		const lengthFraction = bounds.X / partBounds.X;
		count = Math.ceil(lengthFraction);

		//use fraction to determine extra overlap
		let overlapFactor = 1;
		if(overlapToFit){
			overlapFactor = lengthFraction/count;
		} 

		let plane = mops.AllocateComputeMesh();
		for(let i=0; i<count;i++){
			mops.Boolean(plane, section, {
				loc:{
					X:i*(partBounds.X * overlapFactor * 1.08) - (bounds.X/2*1.1),
					Z:roofHeight + partBounds.Z
				},
				rot:{Roll:-roofAngle}}, addOp);
		}

		//cut end - not optimal for now overlap cheat
		//let boxcut = mops.CreateBox({l:bounds.X, w:bounds.Y*2, h:bounds.Z*2});
		//mops.Boolean(plane, boxcut, {loc:{X:bounds.X, Z:bounds.Z/2}});


		mops.Boolean(roof, plane, {}, addOp);

		//re-enable when append works
		mops.Boolean(roof, plane, {rot:{Yaw:180}}, addOp);

		return roof;
	}

	/**
	*	Add angle supports at given angle to corners of the house  
	*/
	function AngleBrackets({
		boxBounds={X:100, Y:100, Z:50},
		angle=45,
		part,
		partBounds,
		placeOnBottomToo=false,
		placeOnSidesToo=true,	//default is on either side (Y) and X
		length=undefined,
		addOp='Append'
	}){
		let brackets = mops.AllocateComputeMesh();

		if(!length){
			length = partBounds.X;
		}
		const bracketYOffset = Math.cos(Math.PI/180*angle) * length;
		const bracketZOffset = Math.sin(Math.PI/180*angle) * length;
		const heightTop = boxBounds.Z + partBounds.Z;

		let bracket = BeamWithLength({length:partBounds.X, part, bounds:partBounds,
			offset:{
				rot:{
					Yaw:-90,
					Pitch:angle
				},
				loc:{
					Z:-bracketZOffset + heightTop
				}
			}});


		let bracketPair = bracket;

		if(placeOnSidesToo){
			bracketPair = mops.AllocateComputeMesh();
			mops.Boolean(bracketPair, bracket, {rot:{Yaw:-90}},'Union'); 
			mops.Boolean(bracketPair, bracket, {},'Append'); 
			
		}

		const height = boxBounds.Z + partBounds.Z;

		//place 2 at each box top vertex
		mops.Boolean(brackets, bracketPair, {
			loc:{
				X:boxBounds.X/2,
				Y:boxBounds.Y/2,// + bracketYOffset,
			}
		}, addOp);

		mops.Boolean(brackets, bracketPair, {
			loc:{
				X:boxBounds.X/2,
				Y:-boxBounds.Y/2,// + bracketYOffset,
			},
			rot:{
				Yaw:-90
			}
		}, addOp);

		mops.Boolean(brackets, bracketPair, {
			loc:{
				X:-boxBounds.X/2,
				Y:boxBounds.Y/2,// + bracketYOffset,
			},
			rot:{
				Yaw:90
			}
		}, addOp);

		mops.Boolean(brackets, bracketPair, {
			loc:{
				X:-boxBounds.X/2,
				Y:-boxBounds.Y/2,// + bracketYOffset,
			},
			rot:{
				Yaw:180
			}
		}, addOp);



		return brackets;
	}

	return Object.freeze({
		BeamWithLength,
		DeformFrameByScene,

		RectangularFrame,
		BoxFrame,

		DoorFrame,
		WindowFrame,

		SupportWall,
		SupportBox,
		ClearSpaceInMesh,
		ClearBoundsInMesh,
		ClearSupportSMInMesh,

		FloorJoists,
		AngledRoofSupport,
		AngledRoofFill,

		AngleBrackets
	});
}

exports.FrameOps = FrameOps;