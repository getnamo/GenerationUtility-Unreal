#include "CubicSphere.h"
#include "CUMeasureTimer.h"
#include "KismetProceduralMeshLibrary.h"

#define DEBUG_CUBIC_SPHERE_TIMINGS 0

FCubicSphere::FCubicSphere(URealtimeMeshComponent* InMeshComponent)
{
	Mesh = InMeshComponent;
	PlanetQuad = MakeShareable(new FPlanetQuad(
		InMeshComponent->GetOwner()->GetActorLocation(),
		1000.f));
}

FCubicSphere::~FCubicSphere()
{
	Mesh = nullptr;
	PlanetQuad = nullptr;
}

void FCubicSphere::GenerateFace(FVector Direction, const FCubicSphereParams& SphereParams, TFunction<void(FMeshSectionData& MeshData)> GenerateCallback)
{
	FMeshSectionData Data;
	Data.Mesh = Mesh;
	Data.Section = SphereParams.Section;

	float GridCount = SphereParams.Resolution;
	if (GridCount < 2)
	{
		GridCount = 2;
	}

	float Spacing = SphereParams.Scaling / (GridCount - 1);
	//FVector ChunkCenter = FVector(0.f);	//move chunks around to fit...

	FTransform Transform;
	float HalfOffset = (Spacing * (GridCount - 1)) / 2;

	FCubicSphere::CreateQuadGridMeshWelded(GridCount, GridCount, Data.Triangles, Data.Vertices, Data.UVs, Spacing);
	Data.Normals.SetNumUninitialized(Data.Vertices.Num());

	if (SphereParams.bOffsetByDirection)
	{
		Transform.SetLocation((Direction * HalfOffset) + SphereParams.LocalOffset);
	}
	else
	{
		Transform.SetLocation(SphereParams.LocalOffset);
	}

	Transform.SetRotation(Direction.ToOrientationQuat() * FRotator(-90, 0, 0).Quaternion());

	FGnomonicParams Gnomonic;
	Gnomonic.Radius = SphereParams.Radius;
	Gnomonic.SphericalFactor = SphereParams.SphericalFactor;
	Gnomonic.EquiangularFactor = SphereParams.EquiAngleFactor;

	//Transform Vertices of resolution plane to match desired shape
	{
#if DEBUG_CUBIC_SPHERE_TIMINGS
		FCUScopeTimer Timer0(TEXT("Full Transform"));
#endif
		for (int32 i = 0; i < Data.Vertices.Num(); i++)
		{
			FVector3d Vertex = FVector3d(Data.Vertices[i]);
			FVector3d Normal = FVector3d(Data.Normals[i]);

			//Cube vertex
			Vertex = Transform.TransformPosition(Vertex);

			//Spherize this vertex if factors > 0.f
			Vertex = FGnomonicParams::GnomonicProjection(Vertex, Gnomonic);

			Data.Vertices[i] = (FVector3f)Vertex;

		}
	}

	//This can be costly but improves lighting
	if (SphereParams.bCalculateTangents)
	{
#if DEBUG_CUBIC_SPHERE_TIMINGS
		FCUScopeTimer Timer0(TEXT("Normals"));
#endif
		//NB: need to convert calc for RMC tangents, currently semi-broken
		TArray<FVector3d> Normals = RMC_ConvertTArray<FVector3d>(Data.Normals);
		UKismetProceduralMeshLibrary::CalculateTangentsForMesh(RMC_ConvertTArray<FVector3d>(Data.Vertices),
			Data.Triangles,
			RMC_ConvertTArray<FVector2d>(Data.UVs),
			Normals,
			Data.PMTangents);
		Data.Normals = RMC_ConvertTArray<FVector3f>(Normals);
	}

	GenerateCallback(Data);
}

/*
* #if DEBUG_CUBIC_SPHERE_TIMINGS
				FCUScopeTimer Timer0(TEXT("CreateMeshSection"));
#endif
*/


void FCubicSphere::GenerateCube(const FCubicSphereParams& SphereParams, TFunction<void(FMeshSectionData& MeshData)> GenerateCallback)
{
	//Ensure we sync our desired resolution (NB: could be skipped if params didn't change...)
	//Scaling == desired diameter, pass in half for radius
	PlanetQuad->UpdateTreeResolution(SphereParams.Scaling / 2.f, SphereParams.QuadDepth, SphereParams.QuadBaseline);

	TFunction<void(FMeshSectionData&)> DefaultGenerateCallback = [](FMeshSectionData& Data)
	{
		//NB: overwrite condition possible if WaitFor is omitted.
		Async(EAsyncExecution::TaskGraphMainThread, [&]
			{
				/*TODO: RUNTIMEMESHCOMPONENT fix
				Data.Mesh->CreateMeshSection(Data.Section,
					Data.Vertices, Data.Triangles,
					Data.Normals, Data.UVs,
					Data.VertexColors, Data.Tangents,
					false);*/
			}).WaitFor(FTimespan(0, 0, 3));
	};

	if (GenerateCallback == nullptr)
	{
		GenerateCallback = DefaultGenerateCallback;
	}

	//Pass the generate face param to match

	//Uses QuadTree lodding, generate quadtree and generate one face per quad
	if (SphereParams.bQuadSplit)
	{
		PlanetQuad->SetTopOnly(SphereParams.bTopOnly);

		//Specify sphericity params for node center comparison using gnomonic sphere cube projection
		FGnomonicParams Gnomonic;
		Gnomonic.Radius = SphereParams.Radius;
		Gnomonic.SphericalFactor = SphereParams.SphericalFactor;
		Gnomonic.EquiangularFactor = SphereParams.EquiAngleFactor;

		PlanetQuad->Regenerate(SphereParams.WorldCamera, SphereParams.WorldOrigin, Gnomonic);

		TArray<FGridQuadNode*> TipNodes;
		PlanetQuad->FillTipNodes(TipNodes);

		UE_LOG(LogTemp, Log, TEXT("GenerateCube: Total TipNodes: %d"), TipNodes.Num());

		int32 N = 0;
		FCubicSphereParams NodeParams = SphereParams;
		for (FGridQuadNode* Node : TipNodes)
		{

			NodeParams.LocalOffset = Node->Center;
			NodeParams.Scaling = Node->Size.X * 2.f;
			NodeParams.Section = N;
			NodeParams.bOffsetByDirection = false;

			GenerateFace(Node->Normal, NodeParams, GenerateCallback);
			N++;
		}
	}
	else
	{
		FCubicSphereParams NodeParams = SphereParams;
		NodeParams.Section = 0;

		//No Quad loding, just apply as single mesh
		GenerateFace(FVector::UpVector, NodeParams, GenerateCallback);

		if (!SphereParams.bTopOnly)
		{
			for (int32 i = 1; i < 6; i++)
			{
				NodeParams.Section = 0;
				GenerateFace(FPlanetQuad::NormalForFaceIndex(i), NodeParams, GenerateCallback);
			}
		}
	}
}

void FCubicSphere::CreateQuadGridMeshWelded(int32 NumX, int32 NumY, TArray<int32>& Triangles, TArray<FVector3f>& Vertices, TArray<FVector2f>& UVs, float GridSpacing)
{
	Triangles.Empty();
	Vertices.Empty();
	UVs.Empty();

	if (NumX >= 2 && NumY >= 2)
	{
		FVector2D Extent = FVector2D((NumX - 1) * GridSpacing, (NumY - 1) * GridSpacing) / 2;

		for (int i = 0; i < NumY; i++)
		{
			for (int j = 0; j < NumX; j++)
			{
				Vertices.Add(FVector3f((float)j * GridSpacing - Extent.X, (float)i * GridSpacing - Extent.Y, 0));
				UVs.Add(FVector2f((float)j / ((float)NumX - 1), (float)i / ((float)NumY - 1)));
			}
		}

		for (int i = 0; i < NumY - 1; i++)
		{
			for (int j = 0; j < NumX - 1; j++)
			{
				int idx = j + (i * NumX);
				Triangles.Add(idx);
				Triangles.Add(idx + NumX);
				Triangles.Add(idx + 1);

				Triangles.Add(idx + 1);
				Triangles.Add(idx + NumX);
				Triangles.Add(idx + NumX + 1);
			}
		}
	}
}

