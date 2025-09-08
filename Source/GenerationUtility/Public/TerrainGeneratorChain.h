#pragma once

#include "ProcGeneratorChain.h"
#include "HeightmapDeformersLibrary.h"
#include "ProceduralMeshComponent.h"
#include "RealtimeMeshComponent.h"
#include "GridSurfaceCache.h"
#include "TerrainGeneratorChain.generated.h"

USTRUCT(BlueprintType)
struct FTGMaskReference
{
	GENERATED_USTRUCT_BODY();

	//Optional, raw reference to mask texture
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	UTexture2D* MaskTexture;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FTransform MaskTransform;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	TArray<float> MaskFloatArray;

	/** Applies to all values */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float MaskScale;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 StackIndex;

	/** Mask could be an operation, if not null, process it with context*/
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	UProcGeneratorChain* MaskChainOp;

	//Default op for given mask, will run if chain op not specified
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	EFloatAppendTypes MaskDefaultOp;


	FTGMaskReference()
	{
		MaskTransform = FTransform();
		StackIndex = 1;	//Should be processed just after flat gen
		MaskTexture = nullptr;
		MaskChainOp = nullptr;
		MaskScale = 1.f;
		MaskDefaultOp = EFloatAppendTypes::Add;
	}
};

USTRUCT(BlueprintType)
struct FTGMasks
{
	GENERATED_USTRUCT_BODY();

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bUseMasks;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	TArray<FTGMaskReference> Masks;

	FTGMasks()
	{
		bUseMasks = true;
	}
};

USTRUCT(BlueprintType)
struct FTerrainGenerationParams
{
	GENERATED_USTRUCT_BODY();

	//Swaps into mode 2 instead of flat planar terrain
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bGenerateCubeQuadSphere;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bCalculateTangents;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 QuadPatchResolution;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float QuadScaling;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float QuadSphereFactor;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float QuadEquiangularFactor;

	/** For Testing quad splits */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FVector QuadCameraWorldVector;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 CubeQuadMaxDepth;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float CubeQuadBaseline;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bQuadTopOnly;

	//debug to toggle quad splitting or not on surfaces
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bQuadSplit;


	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 Seed;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 PatchSize;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float Frequency;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FVector FrequencyShift;
	
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float Magnitude;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 Octaves;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float OctaveFactor;

	//will apply (1-abs(x)) to perlin
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bRidgedSource;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bApplyErosion;

	//instead of vertex shader procgen comps
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bOutputToGeneratedMesh;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FHydroErosionParams HydroParams;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	UMaterial* Material;

	/** Syncs spacing to patch size*/
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	bool bSyncSpacingToPatchSize;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float VisualSpacing;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	float PerlinSpacing;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	int32 ComputeGridSize;

	//Temporary - needs to be in it's own node in layered structure
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	TEnumAsByte<EPixelFormat> GeneratedTextureType;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FTGMasks Masks;

	//For debugging
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	TArray<UTexture2D*> Debug2DResults;



	FTerrainGenerationParams()
	{
		Frequency = 0.01f;
		Magnitude = 1.f;
		PatchSize = 512;
		Seed = 1;
		FrequencyShift = FVector(0.f);
		bApplyErosion = false;
		bOutputToGeneratedMesh = false;
		Octaves = 1;
		OctaveFactor = 2.f;
		bRidgedSource = false;
		Material = nullptr;

		GeneratedTextureType = EPixelFormat::PF_FloatRGBA;

		bSyncSpacingToPatchSize = true;
		PerlinSpacing = PatchSize;
		VisualSpacing = (PatchSize-1)*16;
		ComputeGridSize = 2;

		//Quad tests
		bGenerateCubeQuadSphere = true;
		bCalculateTangents = false; //this can be slow!
		QuadPatchResolution = 64;
		QuadScaling = 1000.f;
		QuadSphereFactor = 1.f;
		QuadEquiangularFactor = 1.f;
		QuadCameraWorldVector = FVector(0.f);
		CubeQuadMaxDepth = 8;
		CubeQuadBaseline = 4000.f;
		bQuadTopOnly = false;
		bQuadSplit = true;
	}
};

UCLASS(Blueprintable)
class GENERATIONUTILITY_API UArrayWrapper : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	TArray<float> FloatData;
};

//Wrapper for pass through
UCLASS(Blueprintable)
class GENERATIONUTILITY_API UTerrainGenParams : public UObject
{
	GENERATED_BODY()

public:

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FTerrainGenerationParams ParamsStruct;
};

struct WorkProduct
{
	URealtimeMeshComponent* Mesh;
	UMaterialInstanceDynamic* MaterialInstance;
	UTexture2D* FloatTexture;
	TArray<float> FloatData;
	FTransform Origin;
	bool bHasSource;
	bool bIsEroded;

	WorkProduct()
	{
		bHasSource = false;
		bIsEroded = false;
		Mesh = nullptr;
		FloatTexture = nullptr;
		Origin = FTransform();
		MaterialInstance = nullptr;
	}

	void GenerateMesh(AActor* Owner, int32 PatchSize, bool bWelded = true);
};


/** 
* Add a caching system fclass that can be added to our terrain chain
*/

/**
 * Main chain class for running terrain generation
 */
UCLASS(Blueprintable)
class GENERATIONUTILITY_API UTerrainGeneratorChain : public UProcGeneratorChain
{
	GENERATED_BODY()

public:

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = TerrainParams)
	FTerrainGenerationParams Params;

	void OnPreProcessChain_Implementation(UPGContextDataObject* InOutContextData);

	void OnPostProcessChain_Implementation(UPGContextDataObject* InOutContextData);

	void OnChainFinished_Implementation(UPGContextDataObject* InOutContextData);

public:

	UFUNCTION(BlueprintCallable, Category="Terrain Generation")
	void GenerateTerrain(UPGContextDataObject* Data);


	//Temp: test generation code
	UFUNCTION(BlueprintCallable, Category = "Terrain Generation")
	void GenerateCubeQuadSphere(UPGContextDataObject* Data);

protected:
	TQueue<WorkProduct> WorkGrid;
	FThreadSafeBool bSafeToAccessGrid;
	FThreadSafeBool bWorkersShouldRun;
};