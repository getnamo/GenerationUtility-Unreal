#include "GridSurfaceCache.h"
#include "SIOJConvert.h"

FVector FGnomonicParams::GnomonicProjection(const FVector& InVector, const FGnomonicParams& Params)
{
	FVector Vertex = InVector;

	//Normalized Cube Sphere
	if (Params.SphericalFactor> 0.f)
	{
		FVector Normal = Vertex.GetSafeNormal();
		FVector SphereVector = Normal * Params.Radius;
		Vertex = FMath::Lerp(Vertex, SphereVector, Params.SphericalFactor);

		//Spherified Cube aka Equiangular Gnomonic grid
		if (Params.EquiangularFactor > 0.f)
		{
			FVector Vp2 = Normal * Normal;

			FVector EquiAngleVector;
			EquiAngleVector.X = Normal.X * FMath::Sqrt(1.f - (0.5f * (Vp2.Y + Vp2.Z)) + (Vp2.Y * Vp2.Z / 3.f));
			EquiAngleVector.Y = Normal.Y * FMath::Sqrt(1.f - (0.5f * (Vp2.X + Vp2.Z)) + (Vp2.X * Vp2.Z / 3.f));
			EquiAngleVector.Z = Normal.Z * FMath::Sqrt(1.f - (0.5f * (Vp2.X + Vp2.Y)) + (Vp2.X * Vp2.Y / 3.f));

			Normal = EquiAngleVector.GetSafeNormal();
			EquiAngleVector = Normal * Params.Radius;

			Vertex = FMath::Lerp(Vertex, EquiAngleVector, Params.EquiangularFactor);
		}
	}

	return Vertex;
}

void FGridSurfaceCache::AddResult(const FPatch2DArray& Result)
{
	AddResult(Result.Index.ToString(), Result);
}

void FGridSurfaceCache::AddResult(const FString& IndexString, const FPatch2DArray& Result)
{
	Cache.Add(IndexString, Result);
}

void FGridSurfaceCache::RemoveResult(const FPatch2DIndex& Index)
{
	RemoveResult(Index.ToString());
}

void FGridSurfaceCache::RemoveResult(const FString& IndexString)
{
	Cache.Remove(IndexString);
}

bool FGridSurfaceCache::ResultForIndex(const FString& Index, FPatch2DArray& OutResult)
{
	if (Cache.Contains(Index))
	{
		OutResult = Cache[Index];
		return true;
	}
	else
	{
		return false;
	}
}

bool FGridSurfaceCache::ContainsResult(const FString& Index)
{
	return Cache.Contains(Index);
}


FGridSurfaceCache::FGridSurfaceCache()
{
	FBox2D Box;
	Box.Min = FVector2D(0, 0);
	Box.Max = FVector2D(1000, 1000);

	float MinQuadSize = 10.f;
}

FGridSurfaceCache::~FGridSurfaceCache()
{

}

FString FPatch2DIndex::ToString() const
{
	FPatch2DIndex Copy;
	Copy = *this;

	//Not performant, but stable for struct changes and small objects are expected
	TSharedPtr<FJsonObject> Object = USIOJConvert::ToJsonObject(FPatch2DIndex::StaticStruct(), &Copy, false);
	return USIOJConvert::ToJsonString(Object);
}

void FPatch2DIndex::SetFromString(const FString& IndexString)
{
	//Not performant, but stable for struct changes and small objects are expected
	FPatch2DIndex Copy;
	TSharedPtr<FJsonObject> Object = USIOJConvert::ToJsonObject(IndexString);
	USIOJConvert::JsonObjectToUStruct(Object, FPatch2DIndex::StaticStruct(), &Copy, false);
	*this = Copy;
}

//FGridQuadNode


FGridQuadNode::FGridQuadNode(int32 InDepth /*= 0*/, int32 InMaxDepth /*= 8*/, FVector InCenter /*= FVector(0.f)*/, FVector InNormal /*= FVector(0,0,1)*/, FVector2D InSize /*= FVector2D(1,1)*/)
{
	Depth = InDepth;
	Size = InSize;
	Center = InCenter;
	Normal = InNormal;
	MaxDepth = InMaxDepth;

	Forward = FVector::CrossProduct(Normal, FVector::RightVector);
	if (Forward == FVector(0.f))
	{
		Forward = FVector::ForwardVector;
	}
}

FGridQuadNode::~FGridQuadNode()
{

}

void FGridQuadNode::BuildTree(FVector CameraPosition, const TMap<int32, float>& DepthComparison, const FGnomonicParams& GnomonicParams /*= FGnomonicParams()*/)
{
	FVector ProjectedCenter = FGnomonicParams::GnomonicProjection(Center, GnomonicParams);

	float Distance = (CameraPosition - ProjectedCenter).Size();

	/*
	//Debug the tree construction
	UE_LOG(LogTemp, Log, TEXT("FGridQuadNode::BuildTree for %d depth at (%s - %s)=> %1.3f Dist. Normal: %s"), Depth,
		*CameraPosition.ToString(),
		*Center.ToString(),
		Distance,
		*Normal.ToString());*/

	//Split condition based on distance
	if (Distance < DepthComparison[Depth] && Depth < MaxDepth)
	{
		//Split Quadtree
		FVector HalfRight = (FVector::CrossProduct(Normal,Forward) * (Size.X / 2.f));	//Normal.RightVector
		FVector HalfForward = (Forward * (Size.Y / 2.f));	//Normal.ForwardVector

		if (!TopLeft.IsValid())
		{
			FVector LeafCenter = Center - HalfRight + HalfForward;
			TopLeft = MakeShareable(new FGridQuadNode(Depth + 1, MaxDepth, LeafCenter, Normal, Size / 2.f));
		}
		TopLeft->BuildTree(CameraPosition, DepthComparison, GnomonicParams);

		if (!TopRight.IsValid())
		{
			FVector LeafCenter = Center + HalfRight + HalfForward;
			TopRight = MakeShareable(new FGridQuadNode(Depth + 1, MaxDepth, LeafCenter, Normal, Size / 2.f));
		}
		TopRight->BuildTree(CameraPosition, DepthComparison, GnomonicParams);

		if (!BottomLeft.IsValid())
		{
			FVector LeafCenter = Center - HalfRight - HalfForward;
			BottomLeft = MakeShareable(new FGridQuadNode(Depth + 1, MaxDepth, LeafCenter, Normal, Size / 2.f));
		}
		BottomLeft->BuildTree(CameraPosition, DepthComparison, GnomonicParams);

		if (!BottomRight.IsValid())
		{
			FVector LeafCenter = Center + HalfRight - HalfForward;
			BottomRight = MakeShareable(new FGridQuadNode(Depth + 1, MaxDepth, LeafCenter, Normal, Size / 2.f));
		}
		BottomRight->BuildTree(CameraPosition, DepthComparison, GnomonicParams);
	}
}

void FGridQuadNode::ClearTree()
{
	TopLeft = nullptr;
	TopRight = nullptr;
	BottomLeft = nullptr;
	BottomRight = nullptr;
}

void FGridQuadNode::FillTipNodes(TArray<FGridQuadNode*>& OutNodes)
{
	if (IsTipNode())
	{
		OutNodes.Add(this);
	}
	else
	{
		if (TopLeft != nullptr)
		{
			TopLeft->FillTipNodes(OutNodes);
		}
		if (TopRight != nullptr)
		{
			TopRight->FillTipNodes(OutNodes);
		}
		if (BottomLeft != nullptr)
		{
			BottomLeft->FillTipNodes(OutNodes);
		}
		if (BottomRight != nullptr)
		{
			BottomRight->FillTipNodes(OutNodes);
		}
	}
}

bool FGridQuadNode::IsTipNode()
{
	return	(TopLeft == nullptr &&
			TopRight == nullptr &&
			BottomLeft == nullptr &&
			BottomRight == nullptr);
}

FPlanetQuad::FPlanetQuad(FVector InCenter, float InRadius)
{
	Center = InCenter;
	Radius = InRadius;

	DepthDistanceScaleFactor = 1.f;

	SetTopOnly(false);

	MaxTreeDepth = 0;	//to ensure we init before bool check
	TreeBaseline = 0.f;
	UpdateTreeResolution(8, 1.f);	//set default map
}

FPlanetQuad::~FPlanetQuad()
{
	DepthDistanceMap.Empty();
}

void FPlanetQuad::UpdateTreeResolution(float InRadius /*= 1000.f*/, int32 InMaxTreeDepth /*= 8*/, float InTreeBaseline /*= 1.f*/)
{
	Radius = InRadius;

	//Update on change only
	if (MaxTreeDepth != InMaxTreeDepth || TreeBaseline != InTreeBaseline)
	{
		MaxTreeDepth = InMaxTreeDepth;
		TreeBaseline = InTreeBaseline;

		float Divisor = 2.f;

		//Build Depth comparison map
		DepthDistanceMap.Empty(MaxTreeDepth);
		DepthDistanceMap.Add(0, FLT_MAX);
		for (int32 i = 1; i < (InMaxTreeDepth + 1); i++)
		{
			DepthDistanceMap.Add(i, TreeBaseline / FMath::Pow(Divisor, i));
		}

		//Build Quads
		PlanetBaseQuads.Empty(6);
		for (int32 i = 0; i < 6; i++)
		{
			//NB: normal needs adjustment per face, this is temp
			FVector Normal = NormalForFaceIndex(i);

			//Node is given relative location to cube, not global (don't add planet center position)
			FGridQuadNode Node(0, MaxTreeDepth, (Normal * Radius), Normal, FVector2D(Radius, Radius));
			PlanetBaseQuads.Add(Node);
		}
	}
}

void FPlanetQuad::Regenerate(FVector CameraPosition, FVector WorldOrigin, const FGnomonicParams& GnomonicParams /*= FGnomonicParams()*/)
{
	if (bTopOnly)
	{
		FGridQuadNode& Node = PlanetBaseQuads[0];	//Top is first one

		Node.ClearTree();
		Node.BuildTree(CameraPosition, DepthDistanceMap, GnomonicParams);
	}
	else
	{
		for (FGridQuadNode& Node : PlanetBaseQuads)
		{
			Node.ClearTree();
			Node.BuildTree(CameraPosition, DepthDistanceMap, GnomonicParams);
		}
	}
}

void FPlanetQuad::FillTipNodes(TArray<FGridQuadNode*>& OutNodes)
{
	if (bTopOnly)
	{
		FGridQuadNode& Node = PlanetBaseQuads[0];
		Node.FillTipNodes(OutNodes);
	}
	else
	{
		for (FGridQuadNode& Node : PlanetBaseQuads)
		{
			Node.FillTipNodes(OutNodes);
		}
	}
}

void FPlanetQuad::SetTopOnly(bool bInTopOnly)
{
	bTopOnly = bInTopOnly;
}

FVector FPlanetQuad::NormalForFaceIndex(int32 Index)
{
	if (Index == 0)
	{
		return FVector::UpVector;
	}
	else if (Index == 1)
	{
		return  FVector::ForwardVector;
	}
	else if (Index == 2)
	{
		return  FVector::LeftVector;
	}
	else if (Index == 3)
	{
		return  FVector::BackwardVector;
	}
	else if (Index == 4)
	{
		return  FVector::RightVector;
	}
	else if (Index == 5)
	{
		return  FVector::DownVector;
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("FPlanetQuad::NormalForFaceIndex invalid index passed in, normal default to UpVector"));
		return FVector::UpVector; //Default
	}
}

