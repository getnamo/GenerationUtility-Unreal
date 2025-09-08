#pragma once
#include "CoreMinimal.h"
#include "GenericQuadTree.h"
#include "GridSurfaceCache.generated.h"

USTRUCT(BlueprintType)
struct FGnomonicParams
{
	GENERATED_USTRUCT_BODY();

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = GnomonicParams)
	float Radius;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = GnomonicParams)
	float SphericalFactor;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = GnomonicParams)
	float EquiangularFactor;

	FGnomonicParams()
	{
		Radius = 1.f;
		SphericalFactor = 0.f;	//default off to encourage radius pass in
		EquiangularFactor = 1.f;
	}

	//Transforms a cube point to a gnomonic equiangular projection point on a sphere of given radius.
	static FVector GnomonicProjection(const FVector& InVector, const FGnomonicParams& Params);
};

USTRUCT(BlueprintType)
struct FPatch2DIndex
{
	GENERATED_USTRUCT_BODY();

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = IndexParams)
	float X;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = IndexParams)
	float Y;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = PatIndexParamschParams)
	int32 Depth;

	//These are fairly heavy using JSON encoding for dev ease on data types early on
	FString ToString() const;
	void SetFromString(const FString& IndexString);
};

//This only stores height values in float array, not texture
//For full cache we need a different structure
USTRUCT(BlueprintType)
struct FPatch2DArray
{
	GENERATED_USTRUCT_BODY();

	/** 2D array collapsed as 1D. Assumes square.*/
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = PatchParams)
	TArray<float> Data;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = PatchParams)
	FPatch2DIndex Index;
};

class FGridSurfaceCache
{
	
	TMap<FString, FPatch2DArray> Cache;

	//add qtree?

public:

	//Caching Update
	void AddResult(const FPatch2DArray& Result);
	void AddResult(const FString& IndexString, const FPatch2DArray& Result);

	void RemoveResult(const FPatch2DIndex& Index);
	void RemoveResult(const FString& IndexString);

	//Caching Query
	bool ResultForIndex(const FString& Index, FPatch2DArray& OutResult);
	bool ContainsResult(const FString& Index);

	FGridSurfaceCache();
	~FGridSurfaceCache();
};

//Custom quad class
class FGridQuadNode
{
	TSharedPtr<FGridQuadNode> TopLeft;
	TSharedPtr<FGridQuadNode> TopRight;
	TSharedPtr<FGridQuadNode> BottomLeft;
	TSharedPtr<FGridQuadNode> BottomRight;

public:
	FVector Center;
	FVector Normal;
	FVector Forward;
	FVector2D Size;
	int32 Depth;
	int32 MaxDepth;

	FGridQuadNode(	int32 InDepth = 0,
					int32 InMaxDepth = 8,
					FVector InCenter = FVector(0.f),
					FVector InNormal = FVector(0,0,1), 
					FVector2D InSize = FVector2D(1,1));
	~FGridQuadNode();

	//Build the tree based on current depth information
	void BuildTree(FVector CameraPosition, const TMap<int32, float>& DepthComparison, const FGnomonicParams& GnomonicParams = FGnomonicParams());

	void ClearTree();

	//Tip nodes are nodes with no children, used for downstream rendering
	void FillTipNodes(TArray<FGridQuadNode*>& OutNodes);

	bool IsTipNode();
	/*
	TODO: 
	- Set desired depth at location
	- Set depth from gradiant circle
	*/
};

class FPlanetQuad
{
	//Should be 6
	TArray<FGridQuadNode> PlanetBaseQuads;

	//Depth comparator
	TMap<int32, float> DepthDistanceMap;
	float DepthDistanceScaleFactor;

	FVector Center;
	float Radius;
	bool bTopOnly;		//Generate top of cube only?

	int32 MaxTreeDepth; //How many levels default 8
	float TreeBaseline;	//What the baseline is used for depth level calculations

public:

	FPlanetQuad(FVector InCenter,
		float InRadius);
	~FPlanetQuad();

	//Set the quad tree resolution and baseline for depth comparison
	void UpdateTreeResolution(float InRadius = 1000.f, int32 InMaxTreeDepth = 8, float InTreeBaseline = 1.f);

	//NB: This might need to pass in a 64 bit position
	//Main function to generate QuadTree
	void Regenerate(FVector CameraPosition, FVector WorldOrigin, const FGnomonicParams& GnomonicParams = FGnomonicParams());

	//Tip nodes are nodes with no children
	void FillTipNodes(TArray<FGridQuadNode*>& OutNodes);

	void SetTopOnly(bool bInTopOnly = false);

	//0-5 to face normals
	static FVector NormalForFaceIndex(int32 Index);
};



