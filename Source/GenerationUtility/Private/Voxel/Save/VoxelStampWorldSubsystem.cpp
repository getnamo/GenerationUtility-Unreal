#include "Voxel/Save/VoxelStampWorldSubsystem.h"
#include "Voxel/Save/VoxelWorldSaveGame.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "UObject/UObjectIterator.h"
#include "CUFileSubsystem.h"
#include "Voxel/Public/VoxelStampActor.h"
#include "Voxel/Public/Graphs/VoxelVolumeGraphStamp.h"
#include "Voxel/Public/Graphs/VoxelHeightGraphStamp.h"
#include "Voxel/Public/StaticMesh/VoxelMeshStamp.h"
#include "Voxel/Public/Heightmap/VoxelHeightmapStamp.h"
#include "Voxel/Public/Shape/VoxelShapeStamp.h"
#include "Voxel/Public/Spline/VoxelHeightSplineStamp.h"
#include "Voxel/Public/Spline/VoxelVolumeSplineStamp.h"
#include "Voxel/Public/Spline/VoxelSplineComponent.h"
#include "Voxel/Public/VoxelSettings.h"
#include "Voxel/Save/SaveDataTypes.h"
#include "Voxel/Save/ProcgenStampActor.h"
#include "SIOJConvert.h"

void UVoxelStampWorldSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	// Any init logic for your world-level voxel state can go here.

    RootPath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("VoxelWorlds"));
}

void UVoxelStampWorldSubsystem::Deinitialize()
{
	// Any teardown for voxel state can go here.
	Super::Deinitialize();
}

void UVoxelStampWorldSubsystem::GetAllVoxelStampActors(
	TArray<AVoxelStampActor*>& OutActors,
	bool bRemoveIgnoreTagged /*= true*/
) const
{
	OutActors.Reset();

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (TActorIterator<AVoxelStampActor> It(World); It; ++It)
	{
		AVoxelStampActor* StampActor = *It;
		if (!IsValid(StampActor))
		{
			continue;
		}

		if (bRemoveIgnoreTagged && StampActor->ActorHasTag(SaveIgnoreTag))
		{
			continue;
		}

		OutActors.Add(StampActor);
	}
}

void UVoxelStampWorldSubsystem::GetAllGenericActors(TArray<AActor*>& OutActors, bool bRemoveIgnoreTagged, bool bAddIncludeTagged) const
{
	OutActors.Reset();

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Actor = *It;
		if (!IsValid(Actor))
		{
			continue;
		}

		//ignoring takes precedence over including
		if (bRemoveIgnoreTagged && Actor->ActorHasTag(SaveIgnoreTag))
		{
			continue;
		}

		//ignore non-save tagged actors
		if (bAddIncludeTagged && !Actor->ActorHasTag(SaveIncludeTag))
		{
			continue;
		}

		OutActors.Add(Actor);
	}
}

FString UVoxelStampWorldSubsystem::FullSavePathForWorld(const FString& WorldName)
{
	return RootPath + TEXT("/") + WorldName + FileExtension;
}

FString UVoxelStampWorldSubsystem::WrapWorldTag(const FString& WorldName)
{
	return FString::Printf(TEXT("VoxelWorldSave-%s"), *WorldName);
}


void UVoxelStampWorldSubsystem::SaveVoxelWorld(
	const FVoxelSaveSettings& SaveSetting,
	TArray<uint8>& OutBinaryData)
{
	OutBinaryData.Reset();

	// Create a SaveGame instance of our custom type
	if (UVoxelWorldSaveGame* SaveGameInstance = Cast<UVoxelWorldSaveGame>(
		UGameplayStatics::CreateSaveGameObject(UVoxelWorldSaveGame::StaticClass())))
	{
		// Fill basic info - you can adjust this however you like
		SaveGameInstance->WorldName = SaveSetting.WorldName;
		SaveGameInstance->MetaData.Add(TEXT("WorldName"), SaveSetting.WorldName);
		SaveGameInstance->MetaData.Add(TEXT("Timestamp"), FDateTime::Now().ToString());

		for (AVoxelStampActor* Actor : SaveSetting.VoxelActorList)
		{
			if (SaveSetting.RequiredTags.Num() > 0)
			{
				bool bIsValid = true;
				for (const FName& Tag : SaveSetting.RequiredTags)
				{
					bIsValid = bIsValid && Actor->Tags.Contains(Tag);
				}
				if (!bIsValid)
				{
					continue;
				}
			}

			FVoxelSaveStampData StampInstance;
			StampInstance.ActorTransform = Actor->GetActorTransform();

			FVoxelStampRef StampRef = Actor->GetStampComponent().GetStamp();

			//TODO: stamp ref might be null when saving!
			if (StampRef)
			{
				TSharedRef<FJsonObject> Json = StampRef->SaveToJson();
				StampInstance.StampJsonString = USIOJConvert::ToJsonString(Json);
			}

			UVoxelSplineComponent* SplineComponent = Cast<UVoxelSplineComponent>(Actor->GetComponentByClass(UVoxelSplineComponent::StaticClass()));
			if (SplineComponent)
			{
				int32 NumPoints = SplineComponent->GetNumberOfSplinePoints();
				for (int32 i = 0; i < NumPoints; i++)
				{
					StampInstance.SplinePoints.Add(SplineComponent->GetSplinePointAt(i, ESplineCoordinateSpace::Local));
				}
			}

			if (Actor && Actor->GetClass()->ImplementsInterface(UJsonSerializableInterface::StaticClass()))
			{
				// Call the interface function safely
				FString JsonString = IJsonSerializableInterface::Execute_SerializeJsonData(Actor);
				StampInstance.MetaData.Add(JsonSerializedKey, JsonString);

				//store our class so we can deserialize it later
				FSoftClassPath ClassPath(Actor->GetClass());
				StampInstance.CustomClassPath = ClassPath.ToString();
			}

			if (SaveSetting.bTagSavedActors)
			{
				StampInstance.Tags = SaveSetting.SaveActorTags;
			}
			
			//UE_LOG(LogTemp, Log, TEXT("%s"), *StampInstance.JsonString);
			SaveGameInstance->VoxelStampActorData.Add(StampInstance);
		}

		for (AActor* Actor : SaveSetting.GenericActorList)
		{
			FActorSaveData ActorData;
			ActorData.ActorTransform = Actor->GetActorTransform();

			if (SaveSetting.RequiredTags.Num() > 0)
			{
				bool bIsValid = true;
				for (const FName& Tag : SaveSetting.RequiredTags)
				{
					bIsValid = bIsValid && Actor->Tags.Contains(Tag);
				}
				if (!bIsValid)
				{
					continue;
				}
			}

			if (Actor && Actor->GetClass()->ImplementsInterface(UJsonSerializableInterface::StaticClass()))
			{
				// Call the interface function safely
				FString JsonString = IJsonSerializableInterface::Execute_SerializeJsonData(Actor);
				ActorData.MetaData.Add(JsonSerializedKey, JsonString);
			}

			//store our class so we can deserialize it later
			FSoftClassPath ClassPath(Actor->GetClass());
			ActorData.CustomClassPath = ClassPath.ToString();

			if (SaveSetting.bTagSavedActors)
			{
				ActorData.Tags = SaveSetting.SaveActorTags;
			}

			SaveGameInstance->GenericActorData.Add(ActorData);
		}

		// Serialize to raw bytes
		TArray<uint8> LocalSaveData;
		if (UGameplayStatics::SaveGameToMemory(SaveGameInstance, LocalSaveData))
		{
			// Success: hand the data back to caller
			OutBinaryData = MoveTemp(LocalSaveData);
		}
		else
		{
			// Failed to serialize; OutBinaryData will remain empty.
			UE_LOG(LogTemp, Warning, TEXT("UVoxelStampWorldSubsystem::SaveVoxelWorld - SaveGameToMemory failed for name '%s'"), *SaveSetting.WorldName);
		}
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("UVoxelStampWorldSubsystem::SaveVoxelWorld - Failed to create UVoxelWorldSaveGame instance."));
	}

	if (SaveSetting.bSaveToDisk)
	{
		SaveBinaryToDefaultPath(OutBinaryData, SaveSetting.WorldName);
	}
}

void UVoxelStampWorldSubsystem::SaveBinaryToDefaultPath(const TArray<uint8>& SaveBytes, const FString& WorldName)
{
    // Save the struct array as before (no UObject pointers now)
	UCUFileSubsystem* CUSystem = GEngine->GetEngineSubsystem<UCUFileSubsystem>();
	if (!CUSystem)
	{
		return;
	}

	FString FullPath = FullSavePathForWorld(WorldName);

	CUSystem->SaveBytesToPath(SaveBytes, FullPath, /*bAppend=*/ false);
}

void UVoxelStampWorldSubsystem::ReadBinaryFromDefaultPath(TArray<uint8>& OutBytes, const FString& WorldName)
{
	
    UCUFileSubsystem* CUSystem = GEngine->GetEngineSubsystem<UCUFileSubsystem>();
    if (!CUSystem)
    {
        return;
    }

	FString FullPath = FullSavePathForWorld(WorldName);

    //Read file bytes
    CUSystem->ReadBytesFromPath(FullPath, OutBytes);
}

bool UVoxelStampWorldSubsystem::LoadVoxelWorldFromData(
	const TArray<uint8>& InBinaryData,
	const FVoxelLoadSettings& LoadSettings,
	TArray<AActor*>& OutStampActors)
{
	OutStampActors.Reset();

	if (InBinaryData.Num() == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("UVoxelStampWorldSubsystem::LoadVoxelWorldFromData - InBinaryData is empty."));
		return false;
	}

	USaveGame* LoadedSaveGame = UGameplayStatics::LoadGameFromMemory(InBinaryData);
	if (!LoadedSaveGame)
	{
		UE_LOG(LogTemp, Warning, TEXT("UVoxelStampWorldSubsystem::LoadVoxelWorldFromData - LoadGameFromMemory failed."));
		return false;
	}

	UVoxelWorldSaveGame* VoxelSave = Cast<UVoxelWorldSaveGame>(LoadedSaveGame);
	if (!VoxelSave)
	{
		UE_LOG(LogTemp, Warning, TEXT("UVoxelStampWorldSubsystem::LoadVoxelWorldFromData - Loaded save is not UVoxelWorldSaveGame."));
		return false;
	}

	// Save the VoxelStampActors (and procgen variants)
	for (int32 i=0; i< VoxelSave->VoxelStampActorData.Num();i++)
	{
		FVoxelSaveStampData& Data = VoxelSave->VoxelStampActorData[i];
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		SpawnParams.Owner = nullptr;       // Optional
		SpawnParams.Instigator = nullptr;  // Optional
		//SpawnParams.Name = FName(*FString::Printf(TEXT("VoxelWorldSpawn-%d"), i)); // Optional

		FTransform FinalActorTransform = Data.ActorTransform * VoxelSave->WorldOffset;

		AVoxelStampActor* SpawnedActor = nullptr;

		//We need a procgenstamp actor
		FString* JsonSerializedDataJsonPtr = Data.MetaData.Find(JsonSerializedKey);
		if (JsonSerializedDataJsonPtr && !Data.CustomClassPath.IsEmpty())
		{
			FSoftClassPath Path(Data.CustomClassPath);
			UClass* ActorClass = Path.TryLoadClass<AActor>();

			FString JsonSerializedDataJson = *JsonSerializedDataJsonPtr;
			AProcgenStampActor* ProcgenActor = GetWorld()->SpawnActor<AProcgenStampActor>(
				ActorClass,
				FinalActorTransform,
				SpawnParams
			);

			if (ProcgenActor && ProcgenActor->GetClass()->ImplementsInterface(UJsonSerializableInterface::StaticClass()))
			{
				IJsonSerializableInterface::Execute_DeserializeJsonData(ProcgenActor, JsonSerializedDataJson);
			}

			SpawnedActor = ProcgenActor;
		}
		else
		{
			SpawnedActor = GetWorld()->SpawnActor<AVoxelStampActor>(
				AVoxelStampActor::StaticClass(),
				FinalActorTransform,
				SpawnParams
			);
		}

		//Tag each actor so we can filter them
		if (LoadSettings.bTagLoadedActors)
		{
			SpawnedActor->Tags.Add(FName(*WrapWorldTag(LoadSettings.WorldName)));
			SpawnedActor->Tags.Append(Data.Tags);
		}

		if (!Data.StampJsonString.IsEmpty())
		{
			TSharedRef<FJsonObject> JsonObject = USIOJConvert::ToJsonObject(Data.StampJsonString).ToSharedRef();

			//Only ones we support loading for now
			if (JsonObject->HasField(TEXT("heightmap")))
			{
				FVoxelHeightmapStamp NewStamp;
				NewStamp.LoadFromJson(JsonObject);
				SpawnedActor->GetStampComponent().SetStamp(NewStamp);
			}
			else if (JsonObject->HasField(TEXT("newMesh")))
			{
				FVoxelMeshStamp NewStamp;
				NewStamp.LoadFromJson(JsonObject);
				SpawnedActor->GetStampComponent().SetStamp(NewStamp);
			}
			else if (JsonObject->HasField(TEXT("shape")))
			{
				FVoxelShapeStamp NewStamp;
				NewStamp.LoadFromJson(JsonObject);
				SpawnedActor->GetStampComponent().SetStamp(NewStamp);
			}
			else if (JsonObject->HasField(TEXT("graph")))
			{
				FString GraphPath = JsonObject->GetStringField((TEXT("graph")));
				if (GraphPath.StartsWith(TEXT("/Script/Voxel.VoxelHeightGraph")))
				{
					FVoxelHeightGraphStamp NewStamp;
					NewStamp.LoadFromJson(JsonObject);
					SpawnedActor->GetStampComponent().SetStamp(NewStamp);
				}
				else if (GraphPath.StartsWith(TEXT("/Script/Voxel.VoxelVolumeSplineGraph")))
				{
					FVoxelVolumeSplineStamp NewStamp;
					NewStamp.LoadFromJson(JsonObject);
					SpawnedActor->GetStampComponent().SetStamp(NewStamp);

					SpawnedActor->UpdateStamp();

					//Spline Graphs require the points as well
					UVoxelSplineComponent* SplineComponent = Cast<UVoxelSplineComponent>(SpawnedActor->GetComponentByClass(UVoxelSplineComponent::StaticClass()));

					//Failed to get a spline component? make one (runtime load fix)
					if (!SplineComponent)
					{
						SplineComponent = NewObject<UVoxelSplineComponent>(SpawnedActor, NAME_None, RF_Transactional);
						if (!SplineComponent)
						{
							continue;
						}
						SpawnedActor->AddInstanceComponent(SplineComponent);
						SplineComponent->SetupAttachment(SpawnedActor->GetRootComponent());
						SplineComponent->SetRelativeTransform(FTransform::Identity);
						SplineComponent->RegisterComponent();

						SpawnedActor->UpdateStamp();
					}

					if (SplineComponent)
					{
						SplineComponent->ClearSplinePoints();
						SplineComponent->AddPoints(Data.SplinePoints);
					}

				}
				else if (GraphPath.StartsWith(TEXT("/Script/Voxel.VoxelHeightSplineGraph")))
				{
					FVoxelHeightSplineStamp NewStamp;
					NewStamp.LoadFromJson(JsonObject);
					SpawnedActor->GetStampComponent().SetStamp(NewStamp);

					SpawnedActor->UpdateStamp();

					//Spline Graphs require the points as well
					UVoxelSplineComponent* SplineComponent = Cast<UVoxelSplineComponent>(SpawnedActor->GetComponentByClass(UVoxelSplineComponent::StaticClass()));

					//Failed to get a spline component? make one (runtime load fix)
					if (!SplineComponent)
					{
						SplineComponent = NewObject<UVoxelSplineComponent>(SpawnedActor, NAME_None, RF_Transactional);
						if (!SplineComponent)
						{
							continue;
						}
						SpawnedActor->AddInstanceComponent(SplineComponent);
						SplineComponent->SetupAttachment(SpawnedActor->GetRootComponent());
						SplineComponent->SetRelativeTransform(FTransform::Identity);
						SplineComponent->RegisterComponent();

						SpawnedActor->UpdateStamp();
					}

					if (SplineComponent)
					{
						SplineComponent->ClearSplinePoints();
						SplineComponent->AddPoints(Data.SplinePoints);
					}

				}
				else if (GraphPath.StartsWith(TEXT("/Script/Voxel.VoxelVolumeGraph")))
				{
					FVoxelVolumeGraphStamp NewStamp;
					NewStamp.LoadFromJson(JsonObject);
					SpawnedActor->GetStampComponent().SetStamp(NewStamp);
				}
			}
		}

		SpawnedActor->UpdateStamp();

		OutStampActors.Add(SpawnedActor);
	}

	//Save the Generic Actors
	for (int32 i = 0; i < VoxelSave->GenericActorData.Num(); i++)
	{
		FActorSaveData& Data = VoxelSave->GenericActorData[i];
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		SpawnParams.Owner = nullptr;       // Optional
		SpawnParams.Instigator = nullptr;  // Optional

		AActor* Actor = nullptr;
		FTransform FinalActorTransform = Data.ActorTransform * VoxelSave->WorldOffset;

		if (!Data.CustomClassPath.IsEmpty())
		{
			//Load custom class
			FSoftClassPath Path(Data.CustomClassPath);
			UClass* ActorClass = Path.TryLoadClass<AActor>();

			Actor = GetWorld()->SpawnActor<AActor>(
				ActorClass,
				FinalActorTransform,
				SpawnParams
			);
		}
		else
		{
			Actor = GetWorld()->SpawnActor<AActor>(
				AActor::StaticClass(),
				FinalActorTransform,
				SpawnParams
			);
		}

		if (Actor && Actor->GetClass()->ImplementsInterface(UJsonSerializableInterface::StaticClass()))
		{
			FString* JsonSerializedDataJsonPtr = Data.MetaData.Find(JsonSerializedKey);
			if (JsonSerializedDataJsonPtr)
			{
				FString JsonDataString = *JsonSerializedDataJsonPtr;
				IJsonSerializableInterface::Execute_DeserializeJsonData(Actor, JsonDataString);
			}
		}
	}

	UE_LOG(LogTemp, Log, TEXT("UVoxelStampWorldSubsystem::LoadVoxelWorldFromData - Loaded %d stamp actors (WorldName: %s)."),
		OutStampActors.Num(),
		*VoxelSave->WorldName);

	return true;
}


bool UVoxelStampWorldSubsystem::LoadVoxelWorldFromDefaultPath(const FVoxelLoadSettings& LoadSettings, TArray<AActor*>& OutActors)
{
	TArray<uint8> WorldBytes;

	ReadBinaryFromDefaultPath(WorldBytes, LoadSettings.WorldName);

	bool bDidSucceedLoading = LoadVoxelWorldFromData(WorldBytes, LoadSettings, OutActors);

	if (!bDidSucceedLoading)
	{
		return false;
	}

	//Offset by given transform
	if (!LoadSettings.Offset.Equals(FTransform::Identity, KINDA_SMALL_NUMBER))
	{
		for (auto Actor : OutActors)
		{
			FTransform NewTransform = Actor->GetActorTransform() * LoadSettings.Offset;
			Actor->SetActorTransform(NewTransform);
		}
	}

	return bDidSucceedLoading;
}

void UVoxelStampWorldSubsystem::ClearWorld(const FString& WorldName)
{
	bool bClearAll = WorldName.IsEmpty();

	const FString& WorldTag = WrapWorldTag(WorldName);

	//TArray<AVoxelStampActor*>& OutActors;

	TArray<AActor*> AllVoxelActors;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), AVoxelStampActor::StaticClass(), AllVoxelActors);

	for (AActor* Actor : AllVoxelActors)
	{
		if (Actor)
		{
			if (bClearAll)
			{
				Actor->Destroy();
			}
			else
			{
				if (Actor->ActorHasTag(FName(*WorldTag)))
				{
					Actor->Destroy();
				}
			}
		}
	}

	//Get matching generic actors

	TArray<AActor*> AllGenericActors;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), AActor::StaticClass(), AllGenericActors);

	for (AActor* Actor : AllGenericActors)
	{
		if (!Actor)
		{
			continue;
		}
		if (!Actor->ActorHasTag(SaveIncludeTag))
		{
			continue;
		}

		bool bShouldDestroy = false;

		if (bClearAll)
		{
			bShouldDestroy = true;
		}
		else
		{
			if (Actor->ActorHasTag(FName(*WorldTag)))
			{
				bShouldDestroy = true;
			}
		}

		if (bShouldDestroy)
		{
			Actor->Destroy();
		}
	}
}
