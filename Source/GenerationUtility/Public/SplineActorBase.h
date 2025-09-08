#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/SplineComponent.h"
#include "SplineActorBase.generated.h"

UCLASS()
class GENERATIONUTILITY_API ASplineActorBase : public AActor
{
	GENERATED_BODY()
	
public:	
	ASplineActorBase();

	virtual void Tick(float DeltaTime) override;

	UPROPERTY(BlueprintReadWrite, VisibleAnywhere, Category = "Spline")
	USplineComponent* SplineComponent;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Spline")
	UStaticMesh* Mesh;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Spline")
	bool bUseCustomConstruction;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Spline")
	UMaterialInstance* MaterialOverride;

	virtual void OnConstruction(const FTransform& Transform) override;

	UFUNCTION(BlueprintCallable, Category = "Spline")
	void AddSplinePoint(const FVector& Point,
						const FVector& Tangent = FVector(0.f),
						bool bUpdateMesh = true);

protected:
	// Called when the game starts or when spawned
	virtual void BeginPlay() override;
};
