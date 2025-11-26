/**
* A module that helps with hot reloading and accessing modules.
*/

const { logObj } = require('GenerationUtility/utility/objectUtility.js');

function HotReload({
	prepend = '',
	postpend = '_C'
}={}){
	let classes = {};
	let touched = {};
	let objects = {};

	function setFolder(inPrepend){
		prepend = inPrepend;
	}

	function purgeAndGc(){
        purge_modules();
		gc();
    }


	//module == class
	function importModule(name){
		const fileName = prepend + name[0].toLowerCase() + name.substring(1) + '.js';

		console.log(`Importing module: <${fileName}>`);

		const NewModule_C  = require(fileName)[name + postpend];
		classes[name] = NewModule_C;
	}

	//any module that has been accessed via 'find' is in this list
	function reloadTouched(){
		for(let name in touched) {
			importModule(name);
		}
		resetTouched();
	}

	//used to do additional js cleanup on hotreload
	function cleanupModules(){
		Object.keys(objects).forEach(key=>{
			const object = objects[key];

			if(object.OnCleanupRequest){
				console.warn('OnCleanupRequest called for ', object);
				object.OnCleanupRequest(object.ContextData);
			}
		});
	}

	//manual reset
	function resetTouched(){
		touched = {};
		objects = {};
	}

	//this will also add it to the touched list
	function acquireModule(name){
		if(objects[name]){
			return objects[name];
		}

		touched[name] = name;
		objects[name] = new classes[name]();
		return objects[name];
	}

	function chainExists(name){
		return objects[name] != undefined;
	}

	function initialImportList(list){
		list.forEach(name => importModule(name));
		resetTouched();
	}

	return Object.freeze({
		purgeAndGc,
		setFolder,
		importModule,
		chainExists,
		cleanupModules,
		acquireModule,
		reloadTouched,
		resetTouched,
		initialImportList
	});
}

exports.HotReload = HotReload;