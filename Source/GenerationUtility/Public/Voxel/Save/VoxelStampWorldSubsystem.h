#pragma once

#include "CoreMinimal.h"

#include "Subsystems/WorldSubsystem.h"
#include "VoxelStampWorldSubsystem.generated.h"

class AVoxelStampActor;
class UVoxelWorldSaveGame;

USTRUCT(BlueprintType)
struct FVoxelLoadSettings
{
	GENERATED_USTRUCT_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	FString WorldName = TEXT("DefaultWorld");

	//If not identity transform this will apply given transform to each actor
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	FTransform Offset;

	//each actor will contain a tag "LoadedWorld-{WorldName}"
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	bool bTagLoadedActors = true;
};

USTRUCT(BlueprintType)
struct FVoxelSaveSettings
{
	GENERATED_USTRUCT_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	FString WorldName = TEXT("DefaultWorld");

	//this is the list of AVoxelStampActor we want to iterate through
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	TArray<AVoxelStampActor*> VoxelActorList;

	//generic actors, generally considered simple placements - unless json serialized
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	TArray<AActor*> GenericActorList;

	//If not identity transform this will apply given transform to each actor
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	FTransform Offset;

	//if not empty, these tags are required for the voxels to save (makes easy layering)
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	TArray<FName> RequiredTags;

	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	bool bSaveToDisk = true;

	//each actor will contain a tag "LoadedWorld-{WorldName}"
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	bool bTagSavedActors = true;

	//extra tags to append to each saved actor
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|Load|Settings")
	TArray<FName> SaveActorTags;
};

/**
 * World-level subsystem responsible for saving/loading voxel stamp actors.
 */
UCLASS()
class GENERATIONUTILITY_API UVoxelStampWorldSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	//~ Begin UWorldSubsystem
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	//~ End UWorldSubsystem

public:

	//Defaults to Saved/VoxelWorlds
    UPROPERTY(BlueprintReadWrite, Category = "Voxel|World|Save")
    FString RootPath;

    UPROPERTY(BlueprintReadWrite, Category = "Voxel|World|Save")
    FString FileExtension = TEXT(".world");

	UPROPERTY(BlueprintReadWrite, Category = "Voxel|World|Save")
	FName SaveIgnoreTag = TEXT("IgnoreActorForSaveSystem");

	UPROPERTY(BlueprintReadWrite, Category = "Voxel|World|Save")
	FName SaveIncludeTag = TEXT("IncludeActorForSaveSystem");

	//actor key used in saving/loading json serialized key in the meta data
	UPROPERTY(BlueprintReadWrite, Category = "Voxel|World|Save")
	FString JsonSerializedKey = TEXT("JsonSerializedData");

	/** Convenience: gather all AVoxelStampActor in this world */
    UFUNCTION(BlueprintCallable, Category = "Voxel|World")
    void GetAllVoxelStampActors(TArray<AVoxelStampActor*>& OutActors, bool bRemoveIgnoreTagged = true) const;

	/** Will get all actors that match the SaveIncludeTag */
	UFUNCTION(BlueprintCallable, Category = "Voxel|World")
	void GetAllGenericActors(TArray<AActor*>& OutActors, bool bRemoveIgnoreTagged = true, bool bAddIncludeTagged = true) const;

	UFUNCTION(BlueprintPure, Category = "Voxel|World")
	FString FullSavePathForWorld(const FString& WorldName);

	UFUNCTION(BlueprintPure, Category = "Voxel|World")
	FString WrapWorldTag(const FString& WorldName);

	// Save a list of voxel stamp actors into a SaveGame object, serialize to binary.
	UFUNCTION(BlueprintCallable, Category = "Voxel|World")
	void SaveVoxelWorld(const FVoxelSaveSettings& SaveSettings, TArray<uint8>& OutBinaryData);

    //Write to file
    UFUNCTION(BlueprintCallable, Category = "Voxel|World")
    void SaveBinaryToDefaultPath(const TArray<uint8>& SaveBytes, const FString& WorldName = TEXT("DefaultWorld"));

    //Read from file
    UFUNCTION(BlueprintCallable, Category = "Voxel|World")
    void ReadBinaryFromDefaultPath(TArray<uint8>& OutBytes, const FString& WorldName = TEXT("DefaultWorld"));

	//Load a voxel world from binary data that was previously created by SaveVoxelWorld().
	UFUNCTION(BlueprintCallable, Category = "Voxel|World")
	bool LoadVoxelWorldFromData(const TArray<uint8>& InBinaryData, const FVoxelLoadSettings& LoadSettings, TArray<AActor*>& OutActors);

	//Convenience loader
	UFUNCTION(BlueprintCallable, Category = "Voxel|World")
	bool LoadVoxelWorldFromDefaultPath(const FVoxelLoadSettings& LoadSettings, TArray<AActor*>& OutActors);

	//Passing an empty world name will clear all voxel stamp actors
	UFUNCTION(BlueprintCallable, Category = "Voxel|World")
	void ClearWorld(const FString& WorldName);
};
