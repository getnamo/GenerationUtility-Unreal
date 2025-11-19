#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Voxel/Save/SaveDataTypes.h"
#include "VoxelWorldSaveGame.generated.h"

class AVoxelStampActor;

UCLASS()
class GENERATIONUTILITY_API UVoxelWorldSaveGame : public USaveGame
{
	GENERATED_BODY()

public:

	/** Optional name / id for this world save */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VoxelSaveData")
	FString WorldName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VoxelSaveData")
	FTransform WorldOffset;

	/** Arbitrary meta-data (version, seed, etc.) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VoxelSaveData")
	TMap<FString, FString> MetaData;

	/** Serialized Voxel Stamp & Procgen Spawner Data */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VoxelSaveData")
	TArray<FVoxelSaveStampData> VoxelStampActorData;

	/** Serialized Generic Actor Data */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VoxelSaveData")
	TArray<FActorSaveData> GenericActorData;

	UVoxelWorldSaveGame();
};
