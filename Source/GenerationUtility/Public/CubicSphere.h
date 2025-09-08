#pragma once
#include "RealtimeMeshSimple.h"
#include "ProceduralMeshComponent.h"
#include "RealtimeMeshComponent.h"
#include "GridSurfaceCache.h"

// Template function to convert between TArray of different types
template<typename ToType, typename FromType>
inline TArray<ToType> RMC_ConvertTArray(const TArray<FromType>& SourceArray)
{
	TArray<ToType> ConvertedArray;
	ConvertedArray.Reserve(SourceArray.Num());

	for (const FromType& Element : SourceArray)
	{
		ConvertedArray.Add(ToType(Element));
	}

	return ConvertedArray;
}

// Specialization for FVector3f to FVector3d and vice versa
template<>
inline TArray<FVector3d> RMC_ConvertTArray<FVector3d, FVector3f>(const TArray<FVector3f>& SourceArray)
{
	TArray<FVector3d> ConvertedArray;
	ConvertedArray.Reserve(SourceArray.Num());

	for (const FVector3f& Element : SourceArray)
	{
		ConvertedArray.Add(FVector3d(Element.X, Element.Y, Element.Z));
	}

	return ConvertedArray;
}

template<>
inline TArray<FVector3f> RMC_ConvertTArray<FVector3f, FVector3d>(const TArray<FVector3d>& SourceArray)
{
	TArray<FVector3f> ConvertedArray;
	ConvertedArray.Reserve(SourceArray.Num());

	for (const FVector3d& Element : SourceArray)
	{
		ConvertedArray.Add(FVector3f(Element.X, Element.Y, Element.Z));
	}

	return ConvertedArray;
}

// Specialization for FVector2f to FVector2D and vice versa
template<>
inline TArray<FVector2D> RMC_ConvertTArray<FVector2D, FVector2f>(const TArray<FVector2f>& SourceArray)
{
	TArray<FVector2D> ConvertedArray;
	ConvertedArray.Reserve(SourceArray.Num());

	for (const FVector2f& Element : SourceArray)
	{
		ConvertedArray.Add(FVector2D(Element.X, Element.Y));
	}

	return ConvertedArray;
}

template<>
inline TArray<FVector2f> RMC_ConvertTArray<FVector2f, FVector2D>(const TArray<FVector2D>& SourceArray)
{
	TArray<FVector2f> ConvertedArray;
	ConvertedArray.Reserve(SourceArray.Num());

	for (const FVector2D& Element : SourceArray)
	{
		ConvertedArray.Add(FVector2f(Element.X, Element.Y));
	}

	return ConvertedArray;
}

struct FMeshSectionData
{
	TArray<int32> Triangles;
	TArray<FVector3f> Vertices;
	TArray<FVector3f> Normals;
	TArray<FVector2f> UVs;
	TArray<FLinearColor> VertexColors;
	TArray<FRealtimeMeshTangentsNormalPrecision> Tangents;
	TArray<FProcMeshTangent> PMTangents;

	URealtimeMeshComponent* Mesh;
	int32 Section;

	FMeshSectionData()
	{
		Mesh = nullptr;
		Section = 0;
	}
};

//NB: this should probably be a reflected ustruct...
struct FCubicSphereParams
{
	int32 Resolution;
	float Scaling;
	float Radius;	//Only used for spherical scaling warp
	float SphericalFactor;
	float EquiAngleFactor;
	bool bCalculateTangents;
	bool bTopOnly;
	bool bQuadSplit;
	FVector WorldOrigin;
	FVector WorldCamera;
	FVector LocalOffset;
	int32 QuadDepth;
	int32 QuadBaseline;

	int32 Section;
	bool bOffsetByDirection;

	FCubicSphereParams()
	{
		Resolution = 64;
		Scaling = 1.f;
		Radius = 1.f;
		SphericalFactor = 1.f;
		EquiAngleFactor = 1.f;
		bCalculateTangents = false;
		bTopOnly = false;
		bQuadSplit = true;
		WorldOrigin = FVector(0.f);
		WorldCamera = FVector(0.f);
		LocalOffset = FVector(0.f);
		QuadBaseline = 4000.f;
		QuadDepth = 8;

		Section = 0;
		bOffsetByDirection = true;
	}
};

class GENERATIONUTILITY_API FCubicSphere
{
public:
	FCubicSphere(URealtimeMeshComponent* InMeshComponent);
	void GenerateFace(FVector Direction, const FCubicSphereParams& SphereParams, TFunction<void(FMeshSectionData& MeshData)> GenerateCallback);
	void GenerateCube(const FCubicSphereParams& SphereParams, TFunction<void(FMeshSectionData& MeshData)> GenerateCallback = nullptr);

	//Todo: Specialized for quadtree gen
	static void CreateQuadGridMeshWelded(int32 NumX, int32 NumY,
		TArray<int32>& Triangles, TArray<FVector3f>& Vertices,
		TArray<FVector2f>& UVs, float GridSpacing = 16.0f);

	~FCubicSphere();

protected:
	URealtimeMeshComponent* Mesh;
	TSharedPtr<FPlanetQuad> PlanetQuad;
};