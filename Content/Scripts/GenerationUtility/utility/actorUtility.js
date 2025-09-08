/// <reference path="../../typings/gu.d.ts" />

const { uScale, copy, makeTransform } = require('GenerationUtility/utility/objectUtility.js');

class ActorSpawner{
	constructor(options={}){
		this.origin = options.origin ? options.origin : { 
			X:0,
			Y:0,
			Z:0
		}

		this.rotation = options.rotation ? options.rotation : {
			X:0.0,
			Y:0.0,
			Z:0.0
		}
		this.defaultScale = options.scale? options.rotation: 1;
		this.spawnedList = [];

		this.defaultMesh = '/Engine/BasicShapes/Cube';
		this.defaultmaterial = '/Engine/BasicShapes/BasicShapeMaterial';

		this.cursor = {
			Scale3D: uScale(this.defaultScale),
			Translation: copy(this.origin),
			Rotation: copy(this.rotation)
		}; 
	}

	resetCursor(transform){
		this.cursor = transform? transform : {
			Scale3D: uScale(this.defaultScale),
			Translation: copy(this.origin),
			Rotation: this.rotation
		}; ;
	}

	//spawn actor with some basic presets like mesh and material
	spawnActor(transform, options={}){

		let actor = StaticMeshActor.C(GWorld.BeginSpawningActorFromClass(StaticMeshActor, transform, false));
		actor.StaticMeshComponent.SetMobility('Movable');

		actor.StaticMeshComponent.StaticMesh = StaticMesh.Load(options.mesh? options.mesh : this.defaultMesh);	
		actor.StaticMeshComponent.SetMaterial(0, Material.Load(options.material? options.material :this.defaultmaterial));
		//actor.StaticMeshComponent.SetMaterial(0, Material.Load('/Game/BasicShapeMaterial_Inst'));
		//actor.StaticMeshComponent.SetCastShadow(false);
		actor.StaticMeshComponent.ReregisterComponent();
		actor.FinishSpawningActor(transform);

		this.spawnedList.push(actor);
	}

	//use a cursor to move some offset and place an actor
	addActor(change={}, options){ 
		//offset, scale, location, transform
		if(!change.transform){
			change.transform = this.cursor;
		}

		if(change.loc){ 
			if(change.loc.X)
				change.transform.Translation.X = change.loc.X;
			if(change.loc.Y)
				change.transform.Translation.Y = change.loc.Y;
			if(change.loc.Z)
				change.transform.Translation.Z = change.loc.Z;
		}
		if(change.rot){
			if(change.rot.X)
				change.transform.Rotation.X = change.rot.X;
			if(change.rot.Y)
				change.transform.Rotation.Y = change.rot.Y;
			if(change.rot.Z)
				change.transform.Rotation.Z = change.rot.Z;
		}
		if(change.offset){
			if(change.offset.X)
				change.transform.Translation.X += change.offset.X;
			if(change.offset.Y)
				change.transform.Translation.Y += change.offset.Y;
			if(change.offset.Z)
				change.transform.Translation.Z += change.offset.Z;
		}
		if(change.scale){
			if(change.scale.X)
				change.transform.Scale3D.X = change.scale.X;
			if(change.scale.Y)
				change.transform.Scale3D.Y = change.scale.Y;
			if(change.scale.Z)
				change.transform.Scale3D.Z = change.scale.Z;
		}

		this.spawnActor(change.transform, options)
	}

	cleanup(){
		spawnedList.forEach(actor =>{
			log('cleaning up ' + actor)
			actor.DestroyActor();
		});
	}
}

function newMeshGenActor({loc={},rot={}}, {complexAsSimple=true}={}){
	let meshActor = new MeshGeneratorActorBase(GWorld, loc, rot);
	
	meshActor.SourceType = 'ExternallyGenerated';
	if(complexAsSimple){
		meshActor.CollisionMode = 'ComplexAsSimple';
	}
	return meshActor;
}

function newSMActor(sm, {loc={},rot={}}, {complexAsSimple=true}={}){
	let meshActor = new StaticMeshActor(GWorld, loc, rot);
	
	if(complexAsSimple){
		meshActor.CollisionMode = 'ComplexAsSimple';
	}
	meshActor.StaticMeshComponent.SetMobility('Movable');

	meshActor.StaticMeshComponent.StaticMesh = sm;
	//meshActor.StaticMesh = sm;
	//meshActor.StaticMeshComponent.StaticMesh = StaticMesh.Load('/Engine/BasicShapes/Sphere');
	
	meshActor.StaticMeshComponent.ReregisterComponent();

	return meshActor;
}

function duplicateActor(actor, {loc={},rot={}}){
	return newSMActor(actor.StaticMeshComponent.StaticMesh, {loc, rot});
}

function spawnBp(type, loc={},rot={}){
	const Type_C = type.GeneratedClass();
	return new Type_C(GWorld, loc, rot);
}

function spawnActorFromBp(actorBlueprint, transform = makeTransform()){
	let actor = GWorld.BeginSpawningActorFromBlueprint(actorBlueprint, transform, false);
	actor.FinishSpawningActor(transform);
	return actor;
}

//NB: need a reliable way to runtime destroy actors

exports.ActorSpawner = ActorSpawner;

//static utility
exports.uScale = uScale;
exports.copy = copy;
exports.newMeshGenActor = newMeshGenActor;
exports.newSMActor = newSMActor;
exports.duplicateActor = duplicateActor;
exports.spawnBp = spawnBp;
exports.spawnActorFromBp = spawnActorFromBp;