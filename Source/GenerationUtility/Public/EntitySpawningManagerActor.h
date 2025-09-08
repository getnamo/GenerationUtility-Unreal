#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "EntityPlanningSystem.h"
#include "ActorSwapPool.h"
#include "EntitySpawningManagerActor.generated.h"


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FInstancePlacementCache
{
	GENERATED_USTRUCT_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
	FString MeshPath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
	TArray<FMatrix> TransformMatrices;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
	TArray<float> CustomData;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FInstanceMapPlacementCache
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceMapPlacementCache)
    TArray<FInstancePlacementCache> CacheData;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FInstanceSpecializedData
{
    GENERATED_USTRUCT_BODY()

    //targeting data
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    FVector Target;

    //target movement speed in cm/s
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    float Speed = 100.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    bool bReachedTarget = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    bool bIsNearFieldSwapped = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    bool bIsAlive = true;

    //If still nullptr, then it's not been swapped out
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    AActor* NearFieldActor = nullptr;

    //Temp Hack due to lack of actor->setposition being respected...
    //UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    //FTransform LastNearFieldTransform;

    //Optional data object containing entity data, this is typically 
    // passed back and forth between near field actor and far field group instances
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    UObject* DataObject = nullptr;

    //template or unique instance id
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstanceSpecializedData)
    int32 Uid = -1;
};

USTRUCT()
struct FIdDistanceEntry
{
    GENERATED_USTRUCT_BODY()

    //In cm
    UPROPERTY()
    float Distance = MAX_FLT;

    //Instance id or uid depending on context
    UPROPERTY()
    int32 Id;

    UPROPERTY()
    bool bIsNearField;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FISMSpecializedCommonData
{
    GENERATED_USTRUCT_BODY()

    //Within a cm
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    float TargetTolerance = 1.f;

    //Within a meter
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    float NearfieldTargetTolerance = 100.f;

    //for facing direction
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    FRotator FacingOffset = FRotator(0.f, -90.f, 0.f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    float CustomDataMoving = 1.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    float CustomDataIdle = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    float CustomDataDeath = 3.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedCommonData)
    int32 MovementCustomDataIndex = 0;
};


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FNearFieldBaseInfo
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    bool bNearFieldSwapEnabled = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    float NearFieldSwapDistance = 1000.f;   //~10m

    //Not really meant for blueprint consumption, but exposed for settings adjustments
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    FActorSwapPool SwapPool;
};


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FNearFieldDynamicInfo: public FNearFieldBaseInfo
{
    GENERATED_USTRUCT_BODY()
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FNearFieldStaticInfo : public FNearFieldBaseInfo
{
    GENERATED_USTRUCT_BODY()

    //by default we only enable object to swap to nearfield on interaction (optimization)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    bool bNearFieldSwapByDistance = false;

    //This is when we want items to swap back to farfield
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    bool bFarFieldSwapByDistance = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    float FarFieldSwapDistance = 1000.f;   //~10m
};


//Static swap data
USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FStaticSwapPerInstanceData
{
    GENERATED_USTRUCT_BODY()

    //Unique ID that's related to database data (cached or saved lookup)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    int32 EntityId = -1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    bool bIsNearfieldSwapped = false;

    //extra cached data. Most items will have this as nullptr and use EntityId to lookup data in database
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = FNearFieldDynamicInfo)
    UObject* DataObject = nullptr;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FStaticSwapCommonData
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    TArray<FStaticSwapPerInstanceData> PerInstance;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    FNearFieldStaticInfo NearFieldInfo;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FISMSpecializedData
{
    GENERATED_USTRUCT_BODY();

    //targeting data
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    TArray<FInstanceSpecializedData> PerInstance;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    TSet<int32> ReachedTargetSet;

    //this set invalidates each update frame
    UPROPERTY(BlueprintReadWrite, Category = ISMSpecializedData)
    TSet<int32> ReachedSetSinceLastCheck;

    //optimization to nearly fully remove travel tick cost when not moving
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bAllReachedTarget = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    FISMSpecializedCommonData Common;

    //This determines live swapping instances
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    FNearFieldDynamicInfo NearFieldInfo;

    //Used internally
    int32 LastReachedCount = 0;
};


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FISMBaseMapData
{
    GENERATED_USTRUCT_BODY();

    //Mesh-> component lookup
    TMap<UStaticMesh*, UInstancedStaticMeshComponent*> MeshComponentMap;

    //Mesh-> list of ids
    TMap<UStaticMesh*, TArray<int32>> InstanceIds; //may be duplicated but it is emitted;

    void Clear();
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FISMStaticMapData : public FISMBaseMapData
{
    GENERATED_USTRUCT_BODY();

    UPROPERTY()
    TMap<UStaticMesh*, FStaticSwapCommonData> SwapData;
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FISMDynamicMapData : public FISMBaseMapData
{
    GENERATED_USTRUCT_BODY();

    UPROPERTY()
    TMap<UStaticMesh*, FISMSpecializedData> TargetData;
};


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FESMSettings
{
    GENERATED_USTRUCT_BODY();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bDefaultToHISM = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bAutoDetectHISMCase = true;

    //if uclass isn't null it will try to swap nearfield actors if relevant
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bSwapActorsNearFieldActors = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    float SwapHysteresis = 1.3f;

    //flip if you want to get logs for transitions
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bDebugLogNearFieldSwaps = false;

    //Allow InteractionComponentInterface to interact with instances on this ESM
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ISMSpecializedData)
    bool bEnableInstanceInteraction = true;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FESMTargetReachedCountSignature, UStaticMesh*, Mesh, int32, ReachedTargetCount);

/**
* Custom manager that handles all ISM interaction with useful spawning/saving/updating utilities.
* Uses two roots to support both static and movable ISM types. By default ISM is a HISM.
*/
UCLASS()
class GENERATIONUTILITY_API AEntitySpawningManagerActor : public AActor 
{
    GENERATED_BODY()
    
public:    
    // Sets default values for this actor's properties
    AEntitySpawningManagerActor();

protected:
    // Called when the game starts or when spawned
    virtual void BeginPlay() override;

public:    
    // Called every frame
    virtual void Tick(float DeltaTime) override;

    UPROPERTY(BlueprintReadWrite, Category = "ESM Settings")
    FPGCacheSettings CacheSettings;

    UPROPERTY(BlueprintReadWrite, Category = "ESM Settings")
    FESMSettings Settings;


    UPROPERTY(BlueprintAssignable, Category = "ESM Events")
    FESMTargetReachedCountSignature OnTargetsReached;

    //This generally should be called when you get OnTargetsReached callback
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void GetReachedInstanceIds(UStaticMesh* ForMesh, TArray<int32>& OutTargetReachedIndices);

    //Call the function will clear the list
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    TArray<int32> GetReachedInstanceIdsSinceLastCheck(UStaticMesh* ForMesh);

    //for efficient polling test for dependencies
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    bool DidInstanceReachTarget(UStaticMesh* ForMesh, int32 QueryEntityId);

    //This is the set/construct method, use UpdateISMTransforms for updating positions efficiently.
	UFUNCTION(BlueprintCallable, Category = "ESM Functions")
	void SetISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms,
        EComponentMobility::Type Mobility = EComponentMobility::Static,
        ECollisionEnabled::Type CollisionEnabled = ECollisionEnabled::QueryAndPhysics,
        UClass* SwapClass = nullptr);


    //update the default settings for swap
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetStaticSwapCommonData(UStaticMesh* Mesh, const FStaticSwapCommonData& SwapCommonData);


    //workaround api attempt
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    UClass* GetClassForObject(UObject* Object);

    //Syncs per instance data to specified. NB: it should be NumCustomFloats (per instance) x total instances size
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetISMCustomFloats(UStaticMesh* Mesh, const TArray<float> AllCustomFloats, int32 NumCustomFloats = 1, bool bMarkRenderStateDirty = false, bool bTypeDynamic=true);

    //NB: checks dynamic map first before static map. Can't have same mesh key as both dynamic and static if you want to update static
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetNearFieldActor(UStaticMesh* Mesh, UClass* NearFieldActorClass);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetNearFieldActorFromObject(UStaticMesh* Mesh, UObject* NearFieldActorClassObject);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetDynamicNearFieldSettings(UStaticMesh* Mesh, const FNearFieldDynamicInfo& NearFieldSetting);

    //Link given instance to a specific id
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetStaticNearFieldDatabaseId(UStaticMesh* Mesh, int32 StaticEntityId, int32 DBEntityId);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetBatchStaticSwapDataForMesh(UStaticMesh* Mesh, TArray<int32> DBEntityIds);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    AActor* SwapStaticInstanceToNearField(UStaticMesh* Mesh, int32 StaticEntityId);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    bool SwapStaticInstanceActorToFarField(AActor* NearfieldActor, UStaticMesh* ISMMeshKey, int32 StaticEntityId);

    //this will batch swap all instances within sphere and return the array of woken actors
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void WakeStaticSwappableInstancesWithinSphere(TArray<AActor*>& OutSwappedActors, FVector WorldCenter = FVector(0.f), float Radius = 100.f);

    //Appends them to current
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    TArray<int32> AppendISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms);

    //removes by ID
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void RemoveISMTransforms(UStaticMesh* Mesh, const TArray<int32>& ISMIds);

    //This updates the dynamic map, we expect SetISMTransforms for static updates (for now)
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void UpdateDynamicISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms);

    //Expects using FArrayBufferAccessor
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void UpdateISMTransformsFromMemory(UStaticMesh* Mesh, int32 Num = 0);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void UpdateISMTransformsFromBuffer(UStaticMesh* Mesh, const TArray<uint8>& Buffer);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetISMMovementBatchTargetData(UStaticMesh* Mesh, const TArray<FVector>& Targets);

    //Target speed is optional if not set different from default it will not change it
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetISMMovementTargetDataForIndex(UStaticMesh* Mesh, const FVector& Target, int32 Index, float TargetSpeed = -1.f);

    //When we need to know what the current target is
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    FVector GetISMMovementTargetDataForIndex(UStaticMesh* Mesh, int32 Index);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetISMMovementTargetCommonData(UStaticMesh* Mesh, const FISMSpecializedCommonData& CommonData);


    //update a specific transform
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetISMTransformForIndex(UStaticMesh* Mesh, const FTransform& Transform, int32 Index, bool bMarkDirty = false);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    FTransform GetISMTransformForIndex(UStaticMesh* Mesh, int32 Index);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    UInstancedStaticMeshComponent* StaticInstanceComponentForMesh(UStaticMesh* Mesh);

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    UInstancedStaticMeshComponent* DynamicInstanceComponentForMesh(UStaticMesh* Mesh);

	UFUNCTION(BlueprintCallable, Category = "ESM Functions")
	void ClearAllInstances();

    // New version with nearfield swap
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void TravelDynamicISMTowardTargets(UStaticMesh* Mesh, float DeltaTime, bool bFaceTravel = true);


    /** baseline function for backup */
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void TravelDynamicISMTowardTargetsBaseline(UStaticMesh* Mesh, float DeltaTime, bool bFaceTravel = true);

    //Stop a specific instance from moving by matching it's target with it's current position.
    //stops travel in the next travel tick.
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void StopTravelForInstance(UStaticMesh* Mesh, int32 Index);


    //will disable dynamic movement for this instance and change it's movement anim to dead
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SetInstanceToKilled(UStaticMesh* Mesh, int32 Index);

    //convenience check
    UFUNCTION(BlueprintPure, Category = "ESM Functions")
    bool IsInstanceDead(UStaticMesh* Mesh, int32 Index);

    //use with AllInstanceIdsForDynamicMesh to stop all instances immediately
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void StopTravelForInstances(UStaticMesh* Mesh, const TArray<int32>& Indices);

    //convenience fill of all ids in use (atm just returns full array from 0-n
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void AllInstanceIdsForDynamicMesh(UStaticMesh* Mesh, TArray<int32>& OutIndices);

    //Caching - generate a cache for all placement data
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    FInstanceMapPlacementCache CacheResults();

    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void LoadFromCache(const FInstanceMapPlacementCache& Cache);

    //If not full path, path is determined by settings
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void LoadCacheFromFile(const FString& FileName, bool bIsFullPath = false);

    //todo: bypass dynamic instances via option?
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void SaveCacheToFile(const FString& FileName, bool bIsFullPath = false);

    // Root Scene components
	UPROPERTY(VisibleAnywhere, Category = "Components")
	USceneComponent* MovableRootComponent;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	USceneComponent* StaticRootComponent;

    /**
    * Handles logic for parsing plans into schedules.
    */
    UPROPERTY(BlueprintReadOnly, Category = "ESM SubSystem")
    UEntityPlanningSystem* PlanningSystem;

    //Handle hit results
    UFUNCTION(BlueprintCallable, Category = "ESM Functions")
    void HitResultSwapInteraction(AActor* InInteractingActor, const FHitResult& HitResult, bool& bSuccess);

private:
    //Todo swap into this data struct vs per lookup
    UPROPERTY()
    FISMStaticMapData StaticMapData;

    UPROPERTY()
    FISMDynamicMapData DynamicMapData;

    //Utility
    UStaticMesh* LoadMeshFromPath(const FString& Path, UObject* WorldContextObject);
    FString TrimPathEnding(const FString& InputPath);

    //A low level utility to handle render command api that has implementation hidden
    void ResetRenderCommand(UInstancedStaticMeshComponent* Mesh);

    AActor* GetDefaultPossessedActor();

    bool HasMultipleLODsAndNotNanite(UStaticMesh* StaticMesh);
};