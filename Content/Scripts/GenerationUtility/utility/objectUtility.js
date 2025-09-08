/// <reference path="../../typings/gu.d.ts" />

//call to compile js class
exports.uclass = require('uclass')().bind(this, global);

//Log an object using json.stringify - uses pretty print by default
exports.logObj = (obj, extraText, spacing=2) =>{

	//convert to serializable format
	if(obj instanceof Map || obj instanceof Set){
		obj = [...obj];
	}
	function stringifyWithBigInt(obj) {
		return JSON.stringify(obj, (key, value) =>
			typeof value === 'bigint'
				? value.toString()
				: value // return everything else unchanged
		, spacing);
	}

	if(extraText){
		console.log(extraText, stringifyWithBigInt(obj));
	}
	else{
		console.log(stringifyWithBigInt(obj));
	}	
}

//NB this only uses an array approach, for 10k+ timers, it may be efficient to sort 
//the array according to deadline
exports.customTimeout = ()=>{
	const customTimeouts = [];

	//forward this
	function onTick(deltaTime){
		for (let i = 0; i < customTimeouts.length; i++) {
			const timeout = customTimeouts[i];
			timeout.elapsed += (deltaTime*1000);	//delta in seconds, timeout in millis
			if (timeout.elapsed >= timeout.delay) {
				timeout.callback();
				customTimeouts.splice(i, 1);
				i--; // Adjust index after removal
			}
		}
	}
	function setTimeout(callback, delay){
		const timeout = {
			callback,
			delay,
			elapsed: 0
		};
		customTimeouts.push(timeout);
	}
	return Object.freeze({
		onTick, 
		setTimeout
	});
}

exports.setArrayFromTransform = (inFloatArray, offset, transform)=>{
	inFloatArray[offset] = transform.Rotation.X;
	inFloatArray[offset + 1] = transform.Rotation.Y;
	inFloatArray[offset + 2] = transform.Rotation.Z;

	inFloatArray[offset + 3] = transform.Translation.X;
	inFloatArray[offset + 4] = transform.Translation.Y;
	inFloatArray[offset + 5] = transform.Translation.Z;

	inFloatArray[offset + 6] = transform.Scale3D.X;
	inFloatArray[offset + 7] = transform.Scale3D.Y;
	inFloatArray[offset + 8] = transform.Scale3D.Z; 
}

//convenience shorthand for debugging positions
exports.debugPoint = (point, {thickness = 20, color = LinearColor.MakeColor(1,0,0,1), duration = 10000, offset=undefined}={})=>{
	if(offset){
		point = Vector.Add_VectorVector(point, offset);
	}
	KismetSystemLibrary.DrawDebugPoint(GWorld, point, thickness, color, duration);
}

exports.debugDrawText = (text, textLocation, {color = LinearColor.MakeColor(1,0,0,1), duration = 5}={})=>{
	KismetSystemLibrary.DrawDebugString(GWorld, textLocation, text, Actor, color, duration);
}

exports.triangleArea = (A, B, C)=>{
	// Subtract vectors using the native Subtract_VectorVector method
    const AB = B.Subtract_VectorVector(A);
    const AC = C.Subtract_VectorVector(A);
    
    // Calculate the cross product using the native Cross_VectorVector method
    const cross = AB.Cross_VectorVector(AC);
    
    // Calculate the area as half the magnitude of the cross product vector
    return 0.5 * cross.VSize();
}

exports.quadrilateralArea = (A, B, C, D)=> {
    // Split the quadrilateral into two triangles: ABC and CDA
    const areaABC = exports.triangleArea(A, B, C);
    const areaCDA = exports.triangleArea(C, D, A);
    
    // Return the total area by summing the areas of the two triangles
    return areaABC + areaCDA;
}


exports.makeVector = ({X=0,Y=0,Z=0}={})=>{
	const vec = new Vector();
	vec.X = X?X:0;
	vec.Y = Y?Y:0;
	vec.Z = Z?Z:0;
	return vec
}

//useful for tracing a function error that gets called multiple times.
exports.getStack = ()=>{
	try {
		throw new Error();
	} catch(e) {
		return e.stack;
	}
}

exports.toRad = degrees =>{
	return degrees*Math.PI/180;
}
exports.toDeg = radians =>{
	return radians*180/Math.PI;
}

//Log an object using an alternative method
exports.inspect = (obj, useAltMethod=false) => {
	if(useAltMethod){
		for (const prop in obj) {
			if (obj.hasOwnProperty(prop)) {
				console.log(`${prop}: ${obj[prop]}`)
			}
		}
	}
	else {
		return JSON.stringify(obj);
	}
}


exports.variance = (stream, from=0, to=10)=>{
	return from + Math.round(stream()*to);
}

//deepish copy
exports.copy = function(obj){
	return {...obj}
}

exports.copyVector = function(vector=Vector()){
	let copyVec = new Vector();
	return copyVec.Add_VectorVector(vector);
}

exports.copyTransform = function(transform=Transform()){
	let copyTransform = new Transform();
	return copyTransform.ComposeTransforms(transform);
}

//uniform scale
exports.uScale = function(scale) {
	return {
		X: scale,
		Y: scale,
		Z: scale
	}
};

exports.scaleVector = function(vector=Vector(), scale=1){
	return {
		X:vector.X*scale, 
		Y:vector.Y*scale, 
		Z:vector.Z*scale
	};
}

exports.rotatorToQuat = (Rotation) => {
	if(!Rotation.Yaw){
		Rotation.Yaw = 0;
	}
	if(!Rotation.Pitch){
		Rotation.Pitch = 0;
	}
	if(!Rotation.Roll){
		Rotation.Roll = 0;
	}
	const DEG_TO_RAD = Math.PI/180;
	const DIVIDE_BY_2 = DEG_TO_RAD/2;

	
	
	let SP = Math.sin(Rotation.Pitch*DIVIDE_BY_2);
	let CP = Math.cos(Rotation.Pitch*DIVIDE_BY_2);

	let SY = Math.sin(Rotation.Yaw*DIVIDE_BY_2);
	let CY = Math.cos(Rotation.Yaw*DIVIDE_BY_2);

	let SR = Math.sin(Rotation.Roll*DIVIDE_BY_2);
	let CR = Math.cos(Rotation.Roll*DIVIDE_BY_2);

	let Quat = {
		X:  CR*SP*SY - SR*CP*CY,
		Y: -CR*SP*CY - SR*CP*SY,
		Z:  CR*CP*SY - SR*SP*CY,
		W:  CR*CP*CY + SR*SP*SY
	};
	
	//console.log(exports.inspect(Rotation))
	//console.log(exports.inspect(Quat))
	return Quat;
}

exports.clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
}

exports.makeTransform = (change={})=>{
	let finalTransform = new Transform();
	/*let finalTransform = {
		Scale3D: exports.uScale(1),
		Translation: {X: 0, Y: 0, Z:0},
		Rotation: {X: 0, Y: 0, Z:0, W:1}
	}*/

	if(change.loc){ 
		if(change.loc.X)
			finalTransform.Translation.X = change.loc.X;
		if(change.loc.Y)
			finalTransform.Translation.Y = change.loc.Y;
		if(change.loc.Z)
			finalTransform.Translation.Z = change.loc.Z;
	}
	if(change.rot){
		finalTransform.Rotation = exports.rotatorToQuat(change.rot)
	}
	if(change.offset){
		if(change.offset.X)
			finalTransform.Translation.X += change.offset.X;
		if(change.offset.Y)
			finalTransform.Translation.Y += change.offset.Y;
		if(change.offset.Z)
			finalTransform.Translation.Z += change.offset.Z;
	}
	if(change.scale){
		if(change.scale.X)
			finalTransform.Scale3D.X = change.scale.X;
		if(change.scale.Y)
			finalTransform.Scale3D.Y = change.scale.Y;
		if(change.scale.Z)
			finalTransform.Scale3D.Z = change.scale.Z;
	}
	return finalTransform;
};

exports.shiftT = (t=makeTransform(), change={})=>{
	return t.ComposeTransforms(exports.makeTransform(change));
}

//compose to translations in offset short form such that
//rotations correctly apply in order without gimbal lock
exports.concatOffset = (base={}, addition={})=>{
	const baseXform = exports.makeTransform(base); 
	const additionXform = exports.makeTransform(addition); 

	/*exports.logObj(base)
	exports.logObj(addition)

	exports.logObj(baseXform)
	exports.logObj(additionXform)

	console.log(baseXform);*/

	const composed = baseXform.ComposeTransforms(additionXform);

	let offset={};
	offset.loc = composed.Translation;
	const euler = composed.Rotation.Quat_Euler();
	offset.rot = {};
	offset.rot.Roll = euler.X;
	offset.rot.Pitch = euler.Y;
	offset.rot.Yaw = euler.Z;
	offset.scale = composed.Scale3D;

	return offset;
}


/**
 * utility map that holds key=> array of objects
 */
exports.ArrayMap = class {
	constructor() {
		this.map = new Map();
	}

	/**
	 * Typically static mesh but can be other
	 * @param {StaticMesh} key 
	 * @param {any} value 
	 * @returns 
	 */
	addValue(key, value) {
		// If the key does not exist, create an empty array for it
		if (!this.map.has(key)) {
			this.map.set(key, []);
		}
		
		// Push the transform into the array for the given key
		const array = this.map.get(key);
		array.push(value);

		//return the index
		return array.length-1;
	}

	/**
	 * @param {StaticMesh} key 
	 * @param {any} values 
	 */
	replaceValues(key, values= []){
		this.map.set(key, values);
	}

	clear(){
		this.map = new Map();
	}

	/**
	 * 
	 * @param {StaticMesh} key 
	 * @param {any} index 
	 */
	removeValueForKeyAtIndex(key, index=0){
		// Check if the key exists
		if (this.map.has(key)) {
			const array = this.map.get(key);
			
			// Check if the index is within the bounds of the array
			if (index >= 0 && index < array.length) {
				array.splice(index, 1);
			}
	
			// If the array is empty after removal, delete the key from the map
			if (array.length === 0) {
				this.map.delete(key);
			}
		}
	}
  
	/**
	 * 
	 * @param {StaticMesh} key 
	 * @returns the values
	 */
	value(key) {
		// Return the array of transforms for the given key, or an empty array if the key does not exist
		return this.map.get(key) || [];
	}

	contains(key){
		return this.map.has(key);
	}

	/**
	 * 
	 * @returns {[StaticMesh]}
	 */
	keys() {
		// Return an array of keys in the map
		return Array.from(this.map.keys());
	}

	copy(){
		const copy = new exports.ArrayMap();

		this.forEach((valueArray, key)=>{
			valueArray.forEach(value=>{
				copy.addValue(key, value);
			});
		});

		return copy;
	}
	
	/**
	 * 
	 * @param {function(Array,StaticMesh)} callback 
	 */
	forEach(callback) {
		// Iterate over each key-value pair in the map
		this.map.forEach((valueArray, key) => {
			callback(valueArray, key);
		});
	}

	//filter every transform by logic, mutates rather than copy
	filterThis(callback){
		this.forEach((arrayValue, key)=>{
			const newArrayValue = arrayValue.filter((element, index)=>{
				const result =  callback(element, index, key);
				//console.log(index, key, result);
				return result;
			});

			this.map.set(key, newArrayValue); 
		});
		return this;
	}

	//return an object with summary data
	mapSummary(){
		let summary = {};
		this.forEach((arrayValue, key)=>{
			let printableKey = key;
			if(key instanceof UObject){
				printableKey = key.GetName();
			}
			summary[printableKey] = arrayValue.length;
		});
		return JSON.stringify(summary, null, 2);
	}
	toString(){
		let summary = {};
		this.forEach((arrayValue, key)=>{
			let printableKey = key;
			if(key instanceof UObject){
				printableKey = key.GetName();
			}
			summary[printableKey] = arrayValue;
		});
		return JSON.stringify(summary, null, 3);
	}
}

//Select a random item from an array
exports.randomItem = function(arr, randfunction = Math.random) {
	// Generate a random index based on the array length
	const randomIndex = Math.floor(randfunction() * arr.length);
	
	// Return the element at the random index
	return arr[randomIndex];
}

exports.randomIndex = function(arr, randfunction = Math.random) {
	// Generate a random index based on the array length
	const randomIndex = Math.floor(randfunction() * arr.length);

	// Return the random index
	return randomIndex;
}

/**
 * Samples N unique random indices from a range [0, total-1].
 * Uses the Fisher-Yates shuffle for optimal efficiency.
 *
 * @param {number} n - The number of unique indices to sample.
 * @param {number} total - The total number of elements to sample from.
 * @param {function} [randFunction=Math.random] - A custom random function (default: Math.random).
 * @returns {number[]} An array of N unique indices.
 * @throws {Error} If n is greater than total.
 */
exports.sampleUniqueIndices = function(n, total, randFunction = Math.random) {
	if (n > total) {
		throw new Error("Cannot sample more elements than available in total.");
	}

	// Generate an array [0, 1, 2, ..., total-1]
	const indices = Array.from({ length: total }, (_, i) => i);

	// Perform Fisher-Yates shuffle but only shuffle the first N elements
	for (let i = 0; i < n; i++) {
		const randIndex = i + Math.floor(randFunction() * (total - i));
		[indices[i], indices[randIndex]] = [indices[randIndex], indices[i]];
	}

	// Return the first N shuffled elements
	return indices.slice(0, n);
}

//lazy wrapper workaround to ensure we get logs of errors
exports.tryLog = function(callback, errorCallback){
	try{
		callback();
	}
	catch(e){
		console.error(e.stack);
		errorCallback(e);
	}
}

exports.withErrorHandling = function(callback){
    return (...params) => {
        exports.tryLog(()=>{
            callback(...params);
        });
    }
}


//Deterministic random generators in js
//from: https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
function sfc32(a, b, c, d) {
	return function() {
	  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
	  let t = (a + b) | 0;
	  a = b ^ b >>> 9;
	  b = c + (c << 3) | 0;
	  c = (c << 21 | c >>> 11);
	  d = d + 1 | 0;
	  t = t + d | 0;
	  c = c + t | 0;
	  return (t >>> 0) / 4294967296;
	}
}

function mulberry32(a) {
	return function() {
	  let t = a += 0x6D2B79F5;
	  t = Math.imul(t ^ t >>> 15, t | 1);
	  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
	  return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

function xoshiro128ss(a, b, c, d) {
	return function() {
		let t = b << 9, r = a * 5; r = (r << 7 | r >>> 25) * 9;
		c ^= a; d ^= b;
		b ^= c; a ^= d; c ^= t;
		d = d << 11 | d >>> 21;
		return (r >>> 0) / 4294967296;
	}
}

function jsf32(a, b, c, d) {
	return function() {
		a |= 0; b |= 0; c |= 0; d |= 0;
		let t = a - (b << 27 | b >>> 5) | 0;
		a = b ^ (c << 17 | c >>> 15);
		b = c + d | 0;
		c = d + t | 0;
		d = a + t | 0;
		return (d >>> 0) / 4294967296;
	}
}

function xmur3(str) {
	for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
		h = h << 13 | h >>> 19;
	return function() {
		h = Math.imul(h ^ h >>> 16, 2246822507);
		h = Math.imul(h ^ h >>> 13, 3266489909);
		return (h ^= h >>> 16) >>> 0;
	}
}

function createRandomStream(seedSource){
	let seed = xmur3(seedSource);
	return sfc32(seed(), seed(), seed(), seed());
}

exports.randomStream = createRandomStream;


exports.sineRange = ({from=0, to=1, pace=1, sine=true}, time) => {
	if(sine){
		return from+((to-from)*Math.sin(time * pace));
	}
	else{
		return from+((to-from)*Math.cos(time * pace));
	}
}

exports.typeObj = (obj, showFullClass) => {

	// get toPrototypeString() of obj (handles all types)
	if (showFullClass && typeof obj === "object") {
		return Object.prototype.toString.call(obj);
	}
	if (obj == null) { return (obj + '').toLowerCase(); } // implicit toString() conversion

	var deepType = Object.prototype.toString.call(obj).slice(8,-1).toLowerCase();
	if (deepType === 'generatorfunction') { return 'function' }

	// Prevent overspecificity (for example, [object HTMLDivElement], etc).
	// Account for functionish Regexp (Android <=2.3), functionish <object> element (Chrome <=57, Firefox <=52), etc.
	// String.prototype.match is universally supported.

	return deepType.match(/^(array|bigint|date|error|function|generator|regexp|symbol)$/) ? deepType :
	   (typeof obj === 'object' || typeof obj === 'function') ? 'object' : typeof obj;
}

exports.absVector = (vector)=>{
	vector.X = Math.abs(vector.X);
	vector.Y = Math.abs(vector.Y);
	vector.Z = Math.abs(vector.Z);
}

//given two vector, get the pointing at vector
exports.lookAtRotation = (a, b)=>{
	return a.FindLookAtRotation(b);
}

exports.worldTransform = (scene)=>{
	return JsOwner.GetComponentTransform(scene).Transform;
}

exports.meshBounds = (staticMesh, scaled = true) =>{
	//console.log('typeof: ', exports.typeObj(staticMesh, true))
	if(exports.typeObj(staticMesh, true) === '[object StaticMesh]'){
		return staticMesh.GetBounds().BoxExtent.Multiply_VectorFloat(2);
	}
	else if (exports.typeObj(staticMesh, true) === '[object StaticMeshComponent]'){
		let smc = staticMesh;	//its a comp
		
		const boundsUnscaled = smc.StaticMesh.GetBounds().BoxExtent.Multiply_VectorFloat(2);

		if(!scaled){
			return boundsUnscaled;
		}
		//scale it by the actual size of the SM component
		const xform = smc.GetRelativeTransform();
		xform.Translation = {X:0, Y: 0, Z:0};	//zero position as we don't want that added

		let boundsXformed = xform.TransformLocation(boundsUnscaled);
		exports.absVector(boundsXformed);
		return boundsXformed;
		
		//scale only adjustment
		//return boundsUnscaled.Multiply_VectorVector(smc.GetRelativeTransform().Scale3D);
	}
	else{
		return Vector();
	}
}

/**
* Get an array of spawn locations in a circular pattern
*/
exports.circularXYSpawnPattern = ({loc={X:0,Y:0,Z:0}, radius=3000, count=5, startAngle=0, seed='l33t', randomMagnitude=0}={})=>{
	const increment = 360/count;
	let pattern = [];

	let rand = exports.randomStream(seed);

	for(let i = 0; i<count;i++){
		const currentAngle = increment * i;
		const angle = currentAngle + startAngle;
		const angleRad = exports.toRad(angle);

		//where X = forward, Y = right
		const spawnLoc = {
			Y:(loc.Y? loc.Y:0) + Math.cos(angleRad) * (radius + (rand()-0.5)*randomMagnitude),
			X:(loc.X? loc.X:0) + Math.sin(angleRad) * (radius + (rand()-0.5)*randomMagnitude),
			Z:(loc.Z? loc.Z:0)
		};
		const spawnRot = {
			Yaw: 360-angle
		}

		pattern.push({loc:spawnLoc, rot:spawnRot});
	}
	return pattern;
}

exports.logIfEnabled = function(enabled) {
	return function(...args) {
		if (enabled) {
		console.log.apply(console, args);
		}
	};
}

//wrapper around (async ()=>{})() so it's more understandable for other devs when scanning code
exports.inAwaitableContext = async (callback = async ()=>{})=>{
	try {
		await callback();
	}
	catch(e){
		console.error(e.stack);
	}
}