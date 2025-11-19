#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Voxel/Public/VoxelStampComponent.h"
#include "Components/SplineComponent.h"
#include "SaveDataTypes.generated.h"

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FVoxelSaveStampData
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    FTransform ActorTransform;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    FString StampJsonString;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    FString CustomClassPath;
    
    //if spline type
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    TArray<FSplinePoint> SplinePoints;

    //Specialized struct data is saved here
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    TMap<FString, FString> MetaData;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    TArray<FName> Tags;
};

/** Generic actors, saves tags, and serialized data in the metadata structure */
USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FActorSaveData
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    FTransform ActorTransform;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    FString CustomClassPath;

    //Specialized struct data is saved here
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    TMap<FString, FString> MetaData;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VoxelSaveData)
    TArray<FName> Tags;
};