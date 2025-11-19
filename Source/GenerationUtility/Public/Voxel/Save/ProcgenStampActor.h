#pragma once

#include "CoreMinimal.h"
#include "Voxel/Public/VoxelStampActor.h"
#include "Voxel/Public/VoxelFloatMetadata.h"
#include "JsonSerializableInterface.h"
#include "ProcgenStampActor.generated.h"

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FDungeonSpawnerData
{
	GENERATED_USTRUCT_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	bool bEnabled = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	FString DungeonName = TEXT("-generate");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	FTransform Offset;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	int32 Seed = 776;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	int32 Floors = 2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	bool bSpawnEnemies = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	bool bPlaceOutdoorKeep = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	bool bFlattenTerrain = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	bool bPlaceInteriorLightingVolume = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	FVector BoxExtents = FVector(5271.256942f, 7099.405721f, 1580.f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	FVector2D DungeonGridSize = FVector2D(11, 14);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	TArray<FString> EnemyTypes = { TEXT("Skeleton") };

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	TArray<FString> EnemySpawnRoomTypes = { TEXT("Barracks"), TEXT("Storage") };

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = DungeonSpawnerData)
	TMap<FString, FString> MetaData;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FVillageSpawnerData
{
	GENERATED_USTRUCT_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	bool bEnabled = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	bool bMakeFields = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	bool bFlattenTerrain = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	FString VillageImportName = TEXT("default");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	FTransform Offset;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = VillageSpawnerData)
	TMap<FString, FString> MetaData;
};

/**
 * A procedural variant of a Voxel Stamp Actor.
 */
UCLASS(Blueprintable)
class GENERATIONUTILITY_API AProcgenStampActor : public AVoxelStampActor, public IJsonSerializableInterface
{
	GENERATED_BODY()

public:
	AProcgenStampActor();

protected:
	/** Called when the game starts or when spawned */
	virtual void BeginPlay() override;

public:

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ProcgenDungeonStampActor)
	FString Type = TEXT("Generic");

	/** Called every frame */
	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "ProcgenStampActor")
	void SetFloatMetaData(UVoxelFloatMetadata* MetaData, float Value);

	UFUNCTION(BlueprintCallable, Category = "ProcgenStampActor")
	void SetGraphParameter(FString Key, float Value);

	//IJsonSerializableInterface
	virtual FString SerializeAdditionalData_Implementation();
	virtual bool DeserializeAdditionalData_Implementation(const FString& JsonData);

};


UCLASS(Blueprintable)
class GENERATIONUTILITY_API AProcgenDungeonStampActor : public AProcgenStampActor
{
	GENERATED_BODY()

public:
	AProcgenDungeonStampActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ProcgenDungeonStampActor)
	FDungeonSpawnerData DungeonData;

	//IJsonSerializableInterface
	virtual FString SerializeAdditionalData_Implementation() override;
	virtual bool DeserializeAdditionalData_Implementation(const FString& JsonData) override;
};

UCLASS(Blueprintable)
class GENERATIONUTILITY_API AProcgenVillageStampActor : public AProcgenStampActor
{
	GENERATED_BODY()

public:
	AProcgenVillageStampActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ProcgenVillageStampActor)
	FVillageSpawnerData VillageData;

	//IJsonSerializableInterface
	virtual FString SerializeAdditionalData_Implementation() override;
	virtual bool DeserializeAdditionalData_Implementation(const FString& JsonData) override;
};