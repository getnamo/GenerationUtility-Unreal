//extra utility for dealing with array structures
//TODO: include numjs like capabilities?

//sub group ops on values
exports.splitArrayIntoChunks = function(arr, n) {
	const result = [];
	
	for (let i = 0; i < arr.length; i += n) {
		result.push(arr.slice(i, i + n));
	}
	return result;
}

//sub group ops on indices
exports.splitArrayIntoIndexChunks = function(arr, n) {
	const result = [];
	
	for (let i = 0; i < arr.length; i += n) {
		const chunk = [];
		for (let j = i; j < i + n && j < arr.length; j++) {
			chunk.push(j);
		}
		result.push(chunk);
	}
	return result;
}

//modify the array to have a for each combination setup
//Disabled by default until use case is found
// Array.prototype.forEachCombination = function(callback) {
// 	for (let i = 0; i < this.length; i++) {
// 		for (let j = i + 1; j < this.length; j++) {
// 			const shouldContinue = callback(this[i], this[j]);
// 			if(shouldContinue === false){
// 				return;
// 			}
// 		}
// 	}
// };

//export variant
exports.forEachCombination = function(array, callback) {
	for (let i = 0; i < array.length; i++) {
		for (let j = i + 1; j < array.length; j++) {
			const shouldContinue = callback(array[i], array[j]);
			if(shouldContinue === false){
				return;
			}
		}
	}
}