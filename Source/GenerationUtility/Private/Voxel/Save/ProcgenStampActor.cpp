#include "Voxel/Save/ProcgenStampActor.h"
#include "Voxel/Public/VoxelStampComponent.h"
#include "SIOJConvert.h"
#include "Voxel/Public/Graphs/VoxelHeightGraphStamp_K2.h"

AProcgenStampActor::AProcgenStampActor()
{
	// Enable ticking if you need per-frame logic
	//PrimaryActorTick.bCanEverTick = true;
}

void AProcgenStampActor::BeginPlay()
{
	Super::BeginPlay();
}

void AProcgenStampActor::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
}

void AProcgenStampActor::SetFloatMetaData(UVoxelFloatMetadata* MetaData, float Value)
{
	GetStampComponent().GetStamp()->MetadataOverrides.Overrides.Add(FVoxelMetadataOverride
	{
		MetaData,
		FVoxelPinValue::Make(Value)
	});
}

void AProcgenStampActor::SetGraphParameter(FString Key, float Value)
{
	EVoxelStampCastResult Result;
	FVoxelHeightGraphStampRef StampRef = UVoxelHeightGraphStamp_K2::CastToHeightGraphStamp(GetStampComponent().GetStamp(), Result);

	StampRef->SetParameter(FName(*Key), FVoxelPinValue::Make(Value));
}

FString AProcgenStampActor::SerializeAdditionalData_Implementation()
{
	return FString(TEXT("{}"));
}

bool AProcgenStampActor::DeserializeAdditionalData_Implementation(const FString& JsonData)
{
	return false;
}

AProcgenDungeonStampActor::AProcgenDungeonStampActor()
{
	Type = TEXT("DungeonSpawner");
}

FString AProcgenDungeonStampActor::SerializeAdditionalData_Implementation()
{
	TSharedPtr<FJsonObject> JsonObject = USIOJConvert::ToJsonObject(FDungeonSpawnerData::StaticStruct(), &DungeonData, false);

	return USIOJConvert::JsonObjectToString(JsonObject);
}

bool AProcgenDungeonStampActor::DeserializeAdditionalData_Implementation(const FString& JsonData)
{
	TSharedPtr<FJsonObject> JsonObject = USIOJConvert::ToJsonObject(JsonData);

	return USIOJConvert::JsonObjectToUStruct(JsonObject, FDungeonSpawnerData::StaticStruct(), &DungeonData);
}

AProcgenVillageStampActor::AProcgenVillageStampActor()
{
	Type = TEXT("VillageSpawner");
}

FString AProcgenVillageStampActor::SerializeAdditionalData_Implementation()
{
	TSharedPtr<FJsonObject> JsonObject = USIOJConvert::ToJsonObject(FVillageSpawnerData::StaticStruct(), &VillageData, false);

	return USIOJConvert::JsonObjectToString(JsonObject);
}

bool AProcgenVillageStampActor::DeserializeAdditionalData_Implementation(const FString& JsonData)
{
	TSharedPtr<FJsonObject> JsonObject = USIOJConvert::ToJsonObject(JsonData);

	return USIOJConvert::JsonObjectToUStruct(JsonObject, FVillageSpawnerData::StaticStruct(), &VillageData);
}
