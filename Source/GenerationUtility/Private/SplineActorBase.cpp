// OnceLostGames LLC

//loosely based off of http://jollymonsterstudio.com/2020/05/13/unreal-engine-c-fundamentals-using-spline-components/

#include "SplineActorBase.h"
#include "Engine/StaticMesh.h"
#include "Components/SplineMeshComponent.h"

// Sets default values
ASplineActorBase::ASplineActorBase()
{
 	// Set this actor to call Tick() every frame.  You can turn this off to improve performance if you don't need it.
	PrimaryActorTick.bCanEverTick = true;

	SplineComponent = CreateDefaultSubobject<USplineComponent>("Spline");
	if (SplineComponent)
	{
		SetRootComponent(SplineComponent);
	}
	bUseCustomConstruction = false;
}

void ASplineActorBase::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);

	if (bUseCustomConstruction) 
	{
		return;
	}
	int32 Total = SplineComponent->GetNumberOfSplinePoints();

	for (int i = 0; i < Total - 2; i++)
	{
		FVector Location, Tangent;
		FVector NextLocation, NextTangent;
		SplineComponent->GetLocalLocationAndTangentAtSplinePoint(i, Location, Tangent);
		SplineComponent->GetLocalLocationAndTangentAtSplinePoint(i+1, NextLocation, NextTangent);

		USplineMeshComponent* SplineMesh = NewObject<USplineMeshComponent>(this, USplineMeshComponent::StaticClass());
		SplineMesh->SetStaticMesh(Mesh);
		if (MaterialOverride)
		{

//NOTE: temp disable for packaged build
#if WITH_EDITOR
			SplineMesh->GetStaticMesh()->SetMaterial(0, MaterialOverride);
#else
			UE_LOG(LogTemp, Warning, TEXT("ASplineActorBase::OnConstruction:: Attempted set material in non-editor context. Future note: Fix methods to support this."));
#endif

		}
		SplineMesh->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		SplineMesh->SetMobility(EComponentMobility::Movable);
		SplineMesh->AttachToComponent(SplineComponent, FAttachmentTransformRules::KeepRelativeTransform);

		SplineMesh->SetStartAndEnd(Location, Tangent, NextLocation, NextTangent);
		SplineMesh->SetCollisionEnabled(ECollisionEnabled::Type::QueryAndPhysics);
	}
}


void ASplineActorBase::AddSplinePoint(const FVector& Point,
	const FVector& Tangent /*= FVector(0.f)*/,
	bool bUpdateMesh /*= true*/)
{
	SplineComponent->AddSplinePoint(Point, ESplineCoordinateSpace::Local, bUpdateMesh);
}

// Called when the game starts or when spawned
void ASplineActorBase::BeginPlay()
{
	Super::BeginPlay();
	
}

// Called every frame
void ASplineActorBase::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

}

