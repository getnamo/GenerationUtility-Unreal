

//Todo: add support for feature imports from e.g. village generator

class ImportFeature
{
	//scale is coordinate scale, assuming meters means 100uu default
	constructor(object, scale=100){
		this.features = {};
		this.meshTypes = {};
		this.scale = scale;
		if(object){
			Object.assign(this, object);
		}
		
	}

	//fill it with mesh types
	setMeshTypes(name, types){
		const feature = this.featureByType(name);
		if(feature){
			feature.meshTypes = types;
		}
	}

	meshTypes(name, types){
		const feature = this.featureByType(name);
		if(feature){
			return feature.meshTypes;
		}
	}

	featureByType(featureType) {
		return this.features.find(feature => feature.type === featureType);
	}

	coordinateToUeVector(coordinate){
		return Vector.MakeVector(coordinate[0] * this.scale, coordinate[1] * -this.scale);
	}

	calculateAngleOfVector(pointA, pointB) {
		const deltaX = pointB.X - pointA.X;
		const deltaY = pointB.Y - pointA.Y;
		
		// Get the angle in radians between -π and π
		let angle = Math.atan2(deltaY, deltaX);
		
		// Convert the angle to degrees
		angle = angle * (180 / Math.PI);
		
		// Convert angle to the range 0-360
		if (angle < 0) {
			angle += 360;
		}
		
		return angle;
	}

	//call to get an organized callback with scaled UE vector and assigned types
	iterateThroughFeatures(callback = ()=>{ console.warn('callback not implemented')}, filterId = undefined){
		this.features.forEach(feature=>{

			//logObj(feature);

			//skip non matching if using filtering
			if(filterId){
				if(feature.id != filterId){
					return;
				}
			}
			
			const featureInfo = {
				type : feature.type,                
				id : feature.id,
				meshTypes : feature.meshTypes
			}

			if(feature.coordinates){
				//trees
				if(feature.type == "MultiPoint"){
					feature.coordinates.forEach(coordinate=>{
						callback(featureInfo, this.coordinateToUeVector(coordinate));
					});
				}

				//fields or houses
				if(feature.type == "MultiPolygon"){
					feature.coordinates.forEach((polygonSet, index)=>{
						polygonSet.forEach(polygon=>{
							const vectorPoints = polygon.map(coordinate=>this.coordinateToUeVector(coordinate));
							callback(featureInfo, vectorPoints, index, feature.coordinates.length);
						});
					});
				}
			}

			//typically roads
			if(feature.geometries){
				if(feature.type == "GeometryCollection"){
					feature.geometries.forEach(geometry=>{
						const vectors = geometry.coordinates.map(coordinate=>this.coordinateToUeVector(coordinate));

						callback(featureInfo, {
							type: geometry.type,
							width: geometry.width,
							coordinates: vectors
						});
					});
				}
			}
		});
	}
}

exports.ImportFeature = ImportFeature;