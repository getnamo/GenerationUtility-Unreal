/**
* A module that helps with hot reloading and accessing modules.
*/

const { logObj } = require('GenerationUtility/utility/objectUtility.js');

function HotReload({
	prepend = '',
	postpend = '_C'
}={}){
	let modules = {};
	let touched = {};
	let chains = {};

	function setFolder(inPrepend){
		prepend = inPrepend;
	}

	/* Assumes a few conventions to be able to
	* automate these imports. PascalCase module name.
	*/
	function reloadModule(name){
		const fileName = prepend + name[0].toLowerCase() + name.substring(1) + '.js';

		console.log(`Importing module: <${fileName}>`);

		const NewModule_C  = require(fileName)[name + postpend];
		modules[name] = NewModule_C;
	}

	//any module that has been accessed via 'find' is in this list
	function reloadTouched(){
		for(let name in touched) {
			reloadModule(name);
		}
		resetTouched();
	}

	//used to do additional js cleanup on hotreload
	function hotReloadCleanup(){
		Object.keys(chains).forEach(key=>{
			const chain = chains[key];

			if(chain.OnCleanupRequest){
				console.warn('OnCleanupRequest called for ', chain);
				chain.OnCleanupRequest(chain.ContextData);
			}
		});
	}

	//manual reset
	function resetTouched(){
		touched = {};
		chains = {};
	}

	function findTouchedModule(name){
		if(chains[name]){
			return chains[name];
		}

		touched[name] = name;
		chains[name] = new modules[name]();
		return chains[name];
	}

	function chainExists(name){
		return chains[name] != undefined;
	}

	function initialImportList(list){
		list.forEach(name => reloadModule(name));
		resetTouched();
	}

	return Object.freeze({
		setFolder,
		reloadModule,
		chainExists,
		hotReloadCleanup,
		findTouchedModule,
		reloadTouched,
		resetTouched,
		initialImportList
	});
}

exports.HotReload = HotReload;