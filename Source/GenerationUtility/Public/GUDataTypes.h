#pragma once

#include "CoreMinimal.h"
#include "StructUtils/StructUtilsTypes.h"
#include "StructUtils/InstancedStruct.h"
#include "GUDataTypes.generated.h"

// Planning System
//Entity actions are used in mass entity control. Typically just Wait/Move, but will be expanded to more past base in future

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FEntityBaseAction
{
	GENERATED_BODY();

	//Should be None/Wait/Travel
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FEntityBaseAction)
	FString Type = TEXT("None");

	//Additional data - not defined atm
	//UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FEntityBaseAction)
	//UObject* SpecializedData = nullptr;

	//If duration is negative it is ignored
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FEntityBaseAction)
	float Duration = -1.f;

	virtual FString Description() const;

	virtual ~FEntityBaseAction() { }
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FInstancedAction : public FEntityBaseAction
{
	GENERATED_BODY();

	//Animation data
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FInstancedAction)
	float AnimCustom = 0.f;

	//Travel data
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FInstancedAction)
	FVector Target;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FInstancedAction)
	float Speed = 100.f;

	FInstancedAction()
	{
		Type = TEXT("Instanced");
	}

	virtual FString Description() const override;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FEntityPlan
{
	GENERATED_USTRUCT_BODY();

	//This can a set of various
	UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	TArray<FInstancedStruct> Actions;

	//Used for caching/saving schedules
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FEntityAction)
	FTransform LastTransform;

	//Current/Active one
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FEntityAction)
	int32 ActionIndex = 0;

	UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	bool bIsActive = false;

	UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	bool bShouldLoop = true;

	UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	bool bDidComplete = false;

	UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	bool bActionIsBeingProcessed = false;

	//for esm lookups, we might need to move this info around...
	//UPROPERTY(BlueprintReadWrite, Category = FEntityAction)
	//UStaticMesh* MeshKey;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FPGCacheSettings
{
	GENERATED_USTRUCT_BODY();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FPGCacheSettings)
	FString CacheSavePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FPGCacheSettings)
	FString FileType;

	FPGCacheSettings();

	//Pure convenience functions
	FString FullPath(const FString& InFileName);

	bool IsBinaryFileType();
};


/** Full list of entities with plans. Used for caching. */
USTRUCT()
struct GENERATIONUTILITY_API FEntityMapTrackData
{
	GENERATED_BODY();

	UPROPERTY()
	TMap<int32, FEntityPlan> PlanMap;
};