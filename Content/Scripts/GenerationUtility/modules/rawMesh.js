/// <reference path="../../typings/gu.d.ts" />
const { inspect, uScale, copy,
 		makeTransform, uclass } = require('GenerationUtility/utility/objectUtility.js');

const oneMeter = 100;

const newVerts = count =>{
	let v = [];
	v.length = count;
	v.fill({});
	return v;
}
const fillVerts = (v, offset={X:0,Y:0,Z:0},) =>{
	return v.map(vert =>{
		return {X: vert.X? vert.X * oneMeter + (offset.X? offset.X:0): (offset.X? offset.X:0),
				Y: vert.Y? vert.Y * oneMeter + (offset.Y? offset.Y:0): (offset.Y? offset.Y:0),
				Z: vert.Z? vert.Z * oneMeter + (offset.Z? offset.Z:0): (offset.Z? offset.Z:0)}
	});
}

/**
	Example raw mesh actor
*/
class RawMeshActor extends Actor {

	//NB: this gets called twice, once for compile uclass and another for instance
	ctor() {
		try{
			console.log("CustomActor ctor")

			this.Root = SceneComponent.CreateDefaultSubobject("ActorRootComponent")
			this.SetRootComponent(this.Root)

			this.ProcMeshComponent = ProceduralMeshComponent.CreateDefaultSubobject("CustomComponent")
			this.ProcMeshComponent.SetMaterial(0, Material.Load('/Engine/MapTemplates/Materials/BasicAsset01'));
			this.ProcMeshComponent.SetMaterial(1, Material.Load('/Engine/MapTemplates/Materials/BasicAsset02'));
			this.ProcMeshComponent.AttachParent = this.Root;
			
			//this.ProcMeshComponent.CreateMeshSection(0,vertices,[0,1,2]);
			this.ClearMeshData();		
			
			console.log('CustomActor ctor done')
		}
		catch(e){
			console.log(e.stack);
		}
	}
	CreateDefaultMesh(){
		//this.AddTriangle(undefined, {Z:100});
		//this.AddTriangle(undefined, {Z:200});

		const test1 = true;
		const test2 = true;
		const test3 = true;

		if(test1){
			this.AddTriangle(undefined, {Y:100, Z:0});
			this.AddPlane(undefined, {Y:100, Z:100});
			this.AddCube(undefined, {Y:100, Z:200});

			//this.AddTriangle(undefined, {Y:100, Z:100}); 
			//this.AddTriangle(undefined, {Y:100, Z:200}); 
			//this.AddTriangle(undefined, {Y:100, Z:150});

			//Generate some shapes: todo: change from offset to transform
			//this.AddCube(undefined, {X:0});
			//this.AddCube(undefined, {X:200});
			//this.AddCube(undefined, {Z:50, X:50});

			//c.X = 200;
			//verts = [new Vector(),{X:100,Y:0,Z:0},{X:200,Y:0,Z:100}]; 
			//this.AddTriangle(verts);

			this.CreateSection(0, this.vertices, this.triangles);
		}

		

		if(test2){
			

			//Add another section (different material possible)
			this.ClearMeshData();
			this.AddTriangle(undefined, {Y:-100, Z:0});
			this.AddTriangle(undefined, {Y:-100, Z:100});
			this.AddTriangle(undefined, {Y:-100, Z:0, X:100});
			this.AddTriangle(undefined, {Y:-100, Z:100, X:100});
			this.AddPlane(undefined, {X:50, Y:-150})

		}

		//loop it
		if(test3){
			//NB: ~ 500k is about max for this tight loop, 
			//should be much more feasible in an isolated thread and passback 
			for(let i=0;i<10000;i++){
				const spacing = 2;
				const magnitude = 300;
				const xVar = magnitude*Math.sin(i*0.02 + 0);
				//let xVar = (i*2);
				this.AddCube(undefined, {X:-50+(xVar), Y:-300-(i*spacing)})
			}
		}
		this.CreateSection(1, this.vertices, this.triangles);

	}

	CreateSection(index=0, vertices, triangles){
		this.ProcMeshComponent.CreateMeshSection(index, vertices, triangles);
	}

	ClearMeshData(){
		this.vertices = [];
		this.triangles = [];
		this.indexCount = 0;
	}

	AddTriangle(verts, offset={X:0,Y:0,Z:0}, autoIndex=true){
		if(!verts || verts.length < 3){
			//console.warn('AddTriangle not enough verts, generating default');

			verts = newVerts(3);
			verts[1] = {Y:1}
			verts[2] = {Z:1, Y:1}

			verts = fillVerts(verts, offset);
		}
		//only push first 3
		for(let i=0; i<3; i++){
			this.vertices.push(verts[i]);
			if(autoIndex){
				this.AddIndexIncrease();
			}
		}
	}
	AddIndexIncrease(){
		this.triangles.push(this.indexCount);
		this.indexCount++;
	}
	AddTriangleIndices(indices, baseIndex){
		if(baseIndex == undefined){
			baseIndex = this.indexCount;
		}
		indices.forEach(index=>{
			this.triangles.push(index + baseIndex);
		})
	}

	AddPlane(verts, offset={X:0,Y:0,Z:0}, autoIndex=true){
		if(!verts || verts.length < 4){
			//console.warn('AddPlane not enough verts, generating default');
			verts = newVerts(4);

			verts[1] = {Y:1};
			verts[2] = {Y:1,Z:1};
			verts[3] = {Z:1};

			verts = fillVerts(verts, offset);
		}
		for(let i=0; i<4; i++){
			this.vertices.push(verts[i]);
		}

		if(autoIndex){
			this.AddTriangleIndices([0,1,2]);
			this.AddTriangleIndices([0,2,3]);
			this.indexCount += 4;
		}
	}
	AddCube(verts, offset={X:0,Y:0,Z:0}, autoIndex=true){
		//should have 8 verts
		if(!verts || verts.length < 8){
			//console.warn('AddCube not enough verts, generating default');
			verts = newVerts(8);

			verts[1] = {Y:1};
			verts[2] = {Y:1,Z:1};
			verts[3] = {Z:1};

			verts[4] = {X:1, Y:1};
			verts[5] = {X:1, Y:1, Z: 1};
			verts[6] = {Z:1, X:1};
			verts[7] = {X:1};

			verts = fillVerts(verts, offset);
		}

		for(let i=0; i<8; i++){
			this.vertices.push(verts[i]);
		}

		//there should be 2 triangles per side, total 12
		if(autoIndex){
			//Front
			this.AddTriangleIndices([0,1,2]);
			this.AddTriangleIndices([0,2,3]);

			//Right
			this.AddTriangleIndices([1,5,2]);
			this.AddTriangleIndices([1,4,5]);

			//Back
			this.AddTriangleIndices([4,7,6]);
			this.AddTriangleIndices([4,6,5]);

			//Left
			this.AddTriangleIndices([7,0,3]);
			this.AddTriangleIndices([7,3,6]);

			//Top
			this.AddTriangleIndices([2,6,3]);
			this.AddTriangleIndices([2,5,6]);

			//Bottom
			this.AddTriangleIndices([4,1,0]);
			this.AddTriangleIndices([4,0,7]);

			this.indexCount += 8;
		}

	}

	properties() {
		this.Root /*VisibleAnywhere+BlueprintReadOnly+SceneComponent*/;
		this.ProcMeshComponent /*VisibleAnywhere+BlueprintReadOnly+SceneComponent*/;
	}
}


//Wrapper for tests
class RawMeshHandler{
	constructor(){
		this.RawMeshActor_C = uclass(RawMeshActor);
	}

	spawnProcMeshActor(){
		console.log('spawnProcMeshActor begin')

		let transform = makeTransform();

		try{			
			let actor = new this.RawMeshActor_C(GWorld, {Z:100});

			actor.CreateDefaultMesh();
			//console.log(JSON.stringify(actor));
		}
		catch(e){
			console.log(e.stack)
		}

		console.log('spawnProcMeshActon done')
	}
}

exports.RawMeshHandler = RawMeshHandler;