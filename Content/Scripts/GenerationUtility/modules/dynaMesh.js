/// <reference path="../../typings/gu.d.ts" />

const { inspect, uScale, copy,
 makeTransform, uclass, tryLog,
 randomStream,
 sineRange } = require('GenerationUtility/utility/objectUtility.js');

const { ActorSpawner } = require('GenerationUtility/utility/actorUtility.js');

const { MeshOps } = require('GenerationUtility/modules/meshOperations.js');
const { mainTest, tickShapeTest } = require('tests/meshTests.js');


//TODO: why is this failing recently? is it because of plugin base class lookup?
//Get a blueprint class reference (used for interplay)
//WARNING: this will find the /Game one instead for now...
const DynamicPMCBPActor = Context.ClassByName('/ResearchContent/DynamicPMCBPActor.DynamicPMCBPActor_C');

//const DynamicPMCBPActor = Context.ClassByName('/Game/DynamicPMCBPActor.DynamicPMCBPActor_C');
console.log(`dynamic class check: ${DynamicPMCBPActor}`);
//NB when we figure it out use DynamicPMCBPActor instead of C++ base one


class HouseDynamicMeshActor extends MeshGeneratorActorBase {

	//NB: this gets called twice, once for compile uclass and another for instance
	ctor() {
		tryLog(()=>{

			//console.log(this.SourceType);
			this.SourceType = 'ExternallyGenerated';

			//make an operator that works with current actor
			this.mops = new MeshOps(this);

			/*this.OnJsTick.Add((DeltaTime)=>{
				console.log('hi')
			})*/

			//console.log(inspect(this.OnJsTick));
		})
		
	}
	ReceiveTick(DeltaTime){
		tryLog(()=>{

		});
	}
	
	RunTest(){
		//Defer tests to a separate file
		mainTest(this.mops);
	}
}


//Wrapper for tests
class HouseDMHandler{
	constructor(){
		this.HouseDynamicMeshActor_C = uclass(HouseDynamicMeshActor);
	}

	runTest(){
		console.log('runTest begin')

		let transform = makeTransform();

		tryLog(()=>{
			let actor = new this.HouseDynamicMeshActor_C(GWorld, {Z:150});

			//ensure we can collide with generated mesh
			actor.CollisionMode = 'ComplexAsSimple';

			actor.RunTest();
			
		});

		console.log('runTest done')
	}

}

exports.HouseDMHandler = HouseDMHandler;