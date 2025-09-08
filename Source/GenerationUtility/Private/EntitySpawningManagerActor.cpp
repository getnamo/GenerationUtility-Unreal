#include "EntitySpawningManagerActor.h"
#include "Engine/World.h"
#include "CUFileSubsystem.h"
#include "CUBlueprintLibrary.h"
#include "SIOJConvert.h"
#include "Misc/Paths.h"
#include "JavascriptContext.h"
#include "CUMeasureTimer.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "GameFramework/Actor.h"
#include "Kismet/GameplayStatics.h"
#include "EntityGroupActionInterface.h"
#include "AI/NavigationSystemBase.h"

void FISMBaseMapData::Clear()
{
    MeshComponentMap.Empty();
    InstanceIds.Empty();
}


// Sets default values
AEntitySpawningManagerActor::AEntitySpawningManagerActor()
{
    // Set this actor to call Tick() every frame.
    PrimaryActorTick.bCanEverTick = true;

    // Create static scene component
    StaticRootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("StaticRootComponent"));
    StaticRootComponent->SetupAttachment(RootComponent);
    StaticRootComponent->SetMobility(EComponentMobility::Static);

    // Create movable scene component
    MovableRootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("MovableRootComponent"));
    MovableRootComponent->SetupAttachment(RootComponent);
    MovableRootComponent->SetMobility(EComponentMobility::Movable);

    //Default allocate
    PlanningSystem = NewObject<UEntityPlanningSystem>(this, UEntityPlanningSystem::StaticClass(), TEXT("PlanningSystem"));
}

void AEntitySpawningManagerActor::GetReachedInstanceIds(UStaticMesh* ForMesh, TArray<int32>& OutTargetReachedIndices)
{
    if (!DynamicMapData.TargetData.Contains(ForMesh))
    {
        return;
    }
    OutTargetReachedIndices = DynamicMapData.TargetData[ForMesh].ReachedTargetSet.Array();
}

TArray<int32> AEntitySpawningManagerActor::GetReachedInstanceIdsSinceLastCheck(UStaticMesh* ForMesh)
{
    TArray<int32> Copy;

    if (!DynamicMapData.TargetData.Contains(ForMesh))
    {
        return Copy;
    }

    //potential double copy error
    Copy = DynamicMapData.TargetData[ForMesh].ReachedSetSinceLastCheck.Array();

    DynamicMapData.TargetData[ForMesh].ReachedSetSinceLastCheck.Empty();

    return Copy;
}

bool AEntitySpawningManagerActor::DidInstanceReachTarget(UStaticMesh* ForMesh, int32 QueryEntityId)
{
    if (!DynamicMapData.TargetData.Contains(ForMesh))
    {
        return false;
    }
    return DynamicMapData.TargetData[ForMesh].ReachedTargetSet.Contains(QueryEntityId);
}

void AEntitySpawningManagerActor::SetISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms,
    EComponentMobility::Type Mobility/*= EComponentMobility::Static*/, ECollisionEnabled::Type CollisionEnabled /*= ECollisionEnabled::QueryAndPhysics*/,
    UClass* SwapClass /*= nullptr*/)
{
    if (!Mesh)
    {
        UE_LOG(LogTemp, Warning, TEXT("Invalid static mesh provided"));
        return;
    }

    // Find existing component
    UInstancedStaticMeshComponent* ISMComponent = nullptr;
    FISMBaseMapData* MapData = nullptr;   //we use a pointer to minimize if branching

    if (Mobility == EComponentMobility::Static)
    {
        ISMComponent = StaticInstanceComponentForMesh(Mesh);
        MapData = &StaticMapData;

        if (SwapClass)
        {
            FStaticSwapCommonData SwapCommonData;
            SwapCommonData.NearFieldInfo.SwapPool.PooledActorClass = SwapClass;
            SwapCommonData.NearFieldInfo.SwapPool.MaxPoolSize = 100;    //default to 100 actors per type
            SwapCommonData.NearFieldInfo.SwapPool.bAutoShrinkSlackSize = 20;    //if more than 20 actors are available autoshrink on next release
            StaticMapData.SwapData.Add(Mesh, SwapCommonData);
        }
    }
    else
    {
        ISMComponent = DynamicInstanceComponentForMesh(Mesh);
        MapData = &DynamicMapData;

        if (SwapClass)
        {
            FISMSpecializedData SwapCommonData;
            SwapCommonData.NearFieldInfo.SwapPool.PooledActorClass = SwapClass;
            DynamicMapData.TargetData.Add(Mesh, SwapCommonData);
        }
    }

    if (!ISMComponent)
    {
        USceneComponent* AttachmentRoot = nullptr;

        bool bSpawnHISM = false;

        //Todo: change from a global default to one that switches depending on if mesh is nanite or single load vs contains multiple lods
        if (Settings.bAutoDetectHISMCase)
        {
            bSpawnHISM = HasMultipleLODsAndNotNanite(Mesh);
        }
        else
        {
            bSpawnHISM = Settings.bDefaultToHISM;
        }
        if (bSpawnHISM)
        {
            ISMComponent = Cast<UInstancedStaticMeshComponent>(NewObject<UHierarchicalInstancedStaticMeshComponent>(this));
        }
        else
        {
            ISMComponent = NewObject<UInstancedStaticMeshComponent>(this);
        }
        ISMComponent->SetMobility(Mobility);    //only first add sets the mobility
        ISMComponent->SetStaticMesh(Mesh);

        if (Mobility == EComponentMobility::Static) 
        {
            AttachmentRoot = StaticRootComponent;
            ISMComponent->SetCollisionObjectType(ECollisionChannel::ECC_WorldStatic);
        }
        else
        {
            AttachmentRoot = MovableRootComponent;
            ISMComponent->SetCollisionObjectType(ECollisionChannel::ECC_WorldDynamic);
        }

        ISMComponent->SetCollisionEnabled(CollisionEnabled);

        // If component doesn't exist, create a new one
        ISMComponent->SetupAttachment(AttachmentRoot);
        ISMComponent->RegisterComponent();
        AddInstanceComponent(ISMComponent); // Ensure the component is added to the actor

        MapData->MeshComponentMap.Add(Mesh, ISMComponent);
    }
    else
    {
        // If it exists, clear existing instances
        ISMComponent->ClearInstances();
        MapData->InstanceIds.Remove(Mesh);
    }

    //UE_LOG(LogTemp, Log, TEXT("Transforms provided: %d"), Transforms.Num());

    // Add the instances
    const TArray<int32>& Ids = ISMComponent->AddInstances(Transforms, true);
    MapData->InstanceIds.Add(Mesh, Ids);
}

void AEntitySpawningManagerActor::SetStaticSwapCommonData(UStaticMesh* Mesh, const FStaticSwapCommonData& SwapCommonData)
{
    StaticMapData.SwapData.Add(Mesh, SwapCommonData);
}

UClass* AEntitySpawningManagerActor::GetClassForObject(UObject* Object)
{
    if (Object)
    {
        return Cast<UBlueprint>(Object)->StaticClass();
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("AGetClassForObject received nullptr"));
        return nullptr;
    }
}

void AEntitySpawningManagerActor::SetISMCustomFloats(UStaticMesh* Mesh, const TArray<float> AllCustomFloats,
    int32 NumCustomFloats /*= 1*/, bool bMarkRenderStateDirty /*=false*/, bool bTypeDynamic /*= true*/ )
{
    UInstancedStaticMeshComponent* ISMComponent = nullptr;

    if (bTypeDynamic)
    {
        ISMComponent = DynamicInstanceComponentForMesh(Mesh);
    }
    else
    {
        ISMComponent = StaticInstanceComponentForMesh(Mesh);
    }

    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SetCustomFloats couldn't find matching instance. Ensure to use SetISMTransforms first."));
        return;
    }

    if (bMarkRenderStateDirty)
    {
        ISMComponent->Modify();
    }

    ISMComponent->NumCustomDataFloats = NumCustomFloats;
    ISMComponent->PerInstanceSMCustomData = AllCustomFloats;

    //TODO optimize?

    // Force recreation of the render data when proxy is created
    ISMComponent->MarkRenderInstancesDirty();

    if (bMarkRenderStateDirty)
    {
        ISMComponent->MarkRenderStateDirty();
    }
}

void AEntitySpawningManagerActor::SetNearFieldActor(UStaticMesh* Mesh, UClass* NearFieldActorClass)
{
    if (DynamicMapData.TargetData.Contains(Mesh))
    {
        DynamicMapData.TargetData[Mesh].NearFieldInfo.SwapPool.PooledActorClass = NearFieldActorClass;
    }
    else if (StaticMapData.SwapData.Contains(Mesh))
    {
        StaticMapData.SwapData[Mesh].NearFieldInfo.SwapPool.PooledActorClass = NearFieldActorClass;
    }
}

void AEntitySpawningManagerActor::SetNearFieldActorFromObject(UStaticMesh* Mesh, UObject* NearFieldActorClassObject)
{
    SetNearFieldActor(Mesh, NearFieldActorClassObject->GetClass());
}

void AEntitySpawningManagerActor::SetDynamicNearFieldSettings(UStaticMesh* Mesh, const FNearFieldDynamicInfo& NearFieldSettings)
{
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        //Create the
        //FISMSpecializedData SpecializedDataList;

        //DynamicMapData.TargetData.Add(Mesh, SpecializedDataList);

        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SetNearFieldSettings DynamicMapData target data doesn't contain mesh. Call SetISMMovementBatchTargetData first; Settings not set."));
        return;
    }

    DynamicMapData.TargetData[Mesh].NearFieldInfo = NearFieldSettings;

    /*DynamicMapData.TargetData[Mesh].NearFieldInfo.SwapPool.ActorOffset = NearFieldSettings.SwapPool.ActorOffset;
    DynamicMapData.TargetData[Mesh].NearFieldInfo.SwapPool.MaxPoolSize = NearFieldSettings.SwapPool.MaxPoolSize;
    DynamicMapData.TargetData[Mesh].NearFieldInfo.SwapPool.ActorClass = NearFieldSettings.SwapPool.ActorClass;*/
}

void AEntitySpawningManagerActor::SetStaticNearFieldDatabaseId(UStaticMesh* Mesh, int32 StaticEntityId, int32 DBEntityId)
{
    if (!StaticMapData.SwapData.Contains(Mesh))
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SetStaticNearFieldId StaticMapData SwapData doesn't contain mesh. Id not set."));
        return;
    }
    if (StaticEntityId >= StaticMapData.SwapData[Mesh].PerInstance.Num())
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SetStaticNearFieldId Static Id out of range."));
        return;
    }

    StaticMapData.SwapData[Mesh].PerInstance[StaticEntityId].EntityId = DBEntityId;
}

void AEntitySpawningManagerActor::SetBatchStaticSwapDataForMesh(UStaticMesh* Mesh, TArray<int32> DBEntityIds)
{
    if (!StaticMapData.SwapData.Contains(Mesh))
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SetStaticNearFieldId StaticMapData SwapData doesn't contain mesh. Id not set."));
        return;
    }

    StaticMapData.SwapData[Mesh].PerInstance.Empty();

    for (int32 DBId : DBEntityIds)
    {
        FStaticSwapPerInstanceData StaticSwapData;
        StaticSwapData.EntityId = DBId;

        StaticMapData.SwapData[Mesh].PerInstance.Add(StaticSwapData);
    }
}

AActor* AEntitySpawningManagerActor::SwapStaticInstanceToNearField(UStaticMesh* Mesh, int32 StaticEntityId)
{
    UInstancedStaticMeshComponent* ISMComponent = StaticInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SwapStaticInstanceToNearField no static ISM component."));
        return nullptr;
    }

    if (!StaticMapData.SwapData.Contains(Mesh))
    {
        //Typical failure, let's not log it
        //UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SwapStaticInstanceToNearField StaticMapData SwapData doesn't contain mesh. Id not set."));
        return nullptr;
    }

    //Get Actor
    AActor* NearFieldActor = StaticMapData.SwapData[Mesh].NearFieldInfo.SwapPool.RequestActor(this, StaticEntityId);

    if (!NearFieldActor)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SwapStaticInstanceToNearField Swap Pool exhausted for %s. Swap didn't happen."), *Mesh->GetName());
        return nullptr;
    }

    //Grab current transform for syncing actor
    int32 InstanceIndex = ISMComponent->GetInstanceIndexForId({ StaticEntityId });
    FTransform InstanceLastTransform;
    ISMComponent->GetInstanceTransform(InstanceIndex, InstanceLastTransform, true);


    FTransform OutOfWorldTransform;
    OutOfWorldTransform.SetTranslation(StaticMapData.SwapData[Mesh].NearFieldInfo.SwapPool.OutOfWorldLocation);

    FStaticSwapPerInstanceData& PerInstanceData = StaticMapData.SwapData[Mesh].PerInstance[StaticEntityId];

    PerInstanceData.bIsNearfieldSwapped = true;

    //ISMComponent->SetPreviousTransformById({ StaticEntityId }, OutOfWorldTransform, false);  //atm we have no previous transform list so ignore it

    ISMComponent->UpdateInstanceTransformById({ StaticEntityId }, OutOfWorldTransform, false, false);

    if (NearFieldActor->Implements<UEntityGroupActionInterface>())
    {
        IEntityGroupActionInterface::Execute_OnGroupTransformUpdate(NearFieldActor, InstanceLastTransform); //give position update first

        FESMNearFieldSwapData SwapData;
        SwapData.EntityId = StaticEntityId;
        SwapData.InstanceMesh = Mesh;
        SwapData.ESMActor = this;
        SwapData.DataObject = PerInstanceData.DataObject;
        IEntityGroupActionInterface::Execute_OnSwapToNearFieldActor(NearFieldActor, SwapData);
    }

    return NearFieldActor;

    //Don't remove for now we don't have an entity <-> ism id system that's solid yet.
    //ISMComponent->RemoveInstanceById(StaticEntityId);
}

bool AEntitySpawningManagerActor::SwapStaticInstanceActorToFarField(AActor* NearfieldActor, UStaticMesh* Mesh, int32 StaticEntityId)
{
    //Todo: Implement properly

    UInstancedStaticMeshComponent* ISMComponent = StaticInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SwapStaticInstanceToNearField no static ISM component."));
        return false;
    }

    if (!StaticMapData.SwapData.Contains(Mesh))
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::SwapStaticInstanceActorToFarField StaticMapData SwapData doesn't contain mesh. Id not set."));
        return false;
    }

    FTransform ActorLastTransform = NearfieldActor->GetTransform();

    StaticMapData.SwapData[Mesh].NearFieldInfo.SwapPool.ReleaseActor(NearfieldActor);

    FStaticSwapPerInstanceData& PerInstanceData = StaticMapData.SwapData[Mesh].PerInstance[StaticEntityId];
    PerInstanceData.bIsNearfieldSwapped = false;

    //ISMComponent->SetPreviousTransformById({ StaticEntityId }, ActorLastTransform, false);
    ISMComponent->UpdateInstanceTransformById({ StaticEntityId }, ActorLastTransform, false, false);

    //ISMComponent->AddInstanceById(StaticEntityId);

    return true;
}

void AEntitySpawningManagerActor::WakeStaticSwappableInstancesWithinSphere(TArray<AActor*>& OutSwappedActors, FVector WorldCenter, float Radius)
{
    TArray<UStaticMesh*> Keys;
    StaticMapData.MeshComponentMap.GetKeys(Keys);

    for (UStaticMesh* Key : Keys)
    {
        UInstancedStaticMeshComponent* Component = StaticMapData.MeshComponentMap[Key];

        //if it contains swap data it can be swapped
        if (StaticMapData.SwapData.Contains(Key))
        {
            TArray<int32> OverlappingIds = Component->GetInstancesOverlappingSphere(WorldCenter, Radius, true);

            FStaticSwapCommonData& SwapData = StaticMapData.SwapData[Key];

            for (int32 ISMId : OverlappingIds)
            {
                AActor* SwappedActor = SwapStaticInstanceToNearField(Key, ISMId);
                if (SwappedActor)
                {
                    OutSwappedActors.Add(SwappedActor);
                }
            }
        }
    }
}

TArray<int32> AEntitySpawningManagerActor::AppendISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms)
{
    TArray<int32> AppendedInstanceIds;

    UInstancedStaticMeshComponent* ISMComponent = StaticInstanceComponentForMesh(Mesh);
    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::AddISMTransforms couldn't find matching instance. Ensure to SetISMTransforms transforms first."));
        return AppendedInstanceIds;
    }

    AppendedInstanceIds = ISMComponent->AddInstances(Transforms, false);

    return AppendedInstanceIds;
}
void AEntitySpawningManagerActor::RemoveISMTransforms(UStaticMesh* Mesh, const TArray<int32>& ISMIds)
{
    UInstancedStaticMeshComponent* ISMComponent = StaticInstanceComponentForMesh(Mesh);
    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Warning, TEXT("AEntitySpawningManagerActor::RemoveISMTransforms couldn't find matching instance."));
        return;
    }

    ISMComponent->RemoveInstances(ISMIds);
}

void AEntitySpawningManagerActor::ClearAllInstances()
{
    TArray<UActorComponent*> Components = GetComponents().Array();
    for (int32 i = 0; i < Components.Num(); i++)//UActorComponent* Component
    {
        UActorComponent* Component = Components[i];
        if (UInstancedStaticMeshComponent* TempISMComponent = Cast<UInstancedStaticMeshComponent>(Component))
        {
            TempISMComponent->DestroyComponent();
        }
    }
    StaticMapData.Clear();
}

//Main ISM update function meant to handle ~10k instances, fairly optimally.
// Lerps to targets. Consider adding more waypoints if heightmaps have hills between points (curvature).
void AEntitySpawningManagerActor::TravelDynamicISMTowardTargets(UStaticMesh* Mesh, float DeltaTime, bool bFaceTravel /*= true*/)
{
    // Get the ISM component for the given mesh.
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);
    if (!ISMComponent)
    {
        return;
    }

    // Early exit if we don't have targeting data for this mesh.
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    // Determine if we need to perform near-field swap calculations.
    const bool bDoNearFieldSwapCalculations =
        ISMSpecializedData.NearFieldInfo.bNearFieldSwapEnabled &&
        ISMSpecializedData.NearFieldInfo.SwapPool.PooledActorClass != nullptr;

    // Early out if all targets are reached and no swap calculations are needed.
    if (ISMSpecializedData.bAllReachedTarget && !bDoNearFieldSwapCalculations)
    {
        return;
    }

    // Arrays to hold transforms.
    TArray<FTransform> PrevTransforms;
    TArray<FTransform> NextTransforms;

    FNearFieldDynamicInfo& NearFieldInfo = ISMSpecializedData.NearFieldInfo;
    FActorSwapPool& SwapPool = NearFieldInfo.SwapPool;

    // Get number of instances.
    const int32 MaxSMNum = ISMComponent->PerInstanceSMData.Num();

    // Cache the current transforms.
    for (int32 i = 0; i < MaxSMNum; i++)
    {
        FTransform InstanceTransform(ISMComponent->PerInstanceSMData[i].Transform);
        NextTransforms.Add(InstanceTransform);
    }

    // Optionally, get player location (only if we need near-field swaps).
    FVector PlayerLocation;
    FTransform PlayerTransform;
    if (bDoNearFieldSwapCalculations)
    {
        if (AActor* PlayerActor = GetDefaultPossessedActor())
        {
            PlayerTransform = PlayerActor->GetActorTransform();
            PlayerLocation = PlayerTransform.GetTranslation();
        }
    }

    // Fill the previous transforms if not already set.
    if (ISMComponent->PerInstancePrevTransform.Num() == 0)
    {
        for (int32 i = 0; i < NextTransforms.Num(); i++)
        {
            ISMComponent->PerInstancePrevTransform.Add(NextTransforms[i].ToMatrixWithScale());
        }
    }

    // Copy current transforms to previous (to use as last frame�s positions).
    PrevTransforms = NextTransforms;

    const FQuat FacingOffset = ISMSpecializedData.Common.FacingOffset.Quaternion();

    int32 ReachedTargetCount = 0;

    // Instead of indices, collect unique instance IDs for batched updates.
    //TArray<FPrimitiveInstanceId> CustomDataUpdateIds;
    TArray<FPrimitiveInstanceId> TransformUpdateIds;

    // This list is used to track instances that are near the player (for swapping).
    TArray<FIdDistanceEntry> OverlappingList;
    bool bHasSwapUpdates = false;

    const int32 NumCustomDataFloats = ISMComponent->NumCustomDataFloats;

    // Process each instance.
    for (int32 i = 0; i < MaxSMNum; i++)
    {
        FInstanceSpecializedData& SpecializedData = ISMSpecializedData.PerInstance[i];
        // Grab the Uid
        FPrimitiveInstanceId InstanceId = { SpecializedData.Uid };

        FTransform& Transform = NextTransforms[i];  
        //todo: properly handle uid based transforms not by index, see below refs
        //NB: 	bool IsValidId(FPrimitiveInstanceId InstanceId);
        //      int32 GetInstanceIndexForId(FPrimitiveInstanceId InstanceId) const { return PrimitiveInstanceDataManager.IdToIndex(InstanceId); }

        FVector CurrentPosition = Transform.GetTranslation();
        float TargetTolerance = ISMSpecializedData.Common.TargetTolerance;  //default far field value

        // Near-field swap handling.
        if (bDoNearFieldSwapCalculations)
        {
            FTransform& PrevTransform = PrevTransforms[i];

            if (SpecializedData.bIsNearFieldSwapped && SpecializedData.NearFieldActor)
            {
                // If already swapped, use the actor position instead of instance position to test distances
                CurrentPosition = SwapPool.ToIsmTransform(SpecializedData.NearFieldActor->GetActorTransform()).GetLocation();
                TargetTolerance = ISMSpecializedData.Common.NearfieldTargetTolerance; //larger if we're nearfield due to physics/etc - todo: get closer?
            }

            const float DistanceToPlayer = (PlayerLocation - CurrentPosition).Size();

            if (DistanceToPlayer < NearFieldInfo.NearFieldSwapDistance)
            {
                FIdDistanceEntry DistanceEntry;
                DistanceEntry.Distance = DistanceToPlayer;
                DistanceEntry.Id = i; // keep the instance index for later lookup
                DistanceEntry.bIsNearField = SpecializedData.bIsNearFieldSwapped;
                OverlappingList.Add(DistanceEntry);
            }
            else if (DistanceToPlayer >= (NearFieldInfo.NearFieldSwapDistance * Settings.SwapHysteresis) &&
                SpecializedData.bIsNearFieldSwapped)
            {
                // Swap back to far-field.
                if (AActor* Actor = SpecializedData.NearFieldActor)
                {
                    if (Actor->Implements<UEntityGroupActionInterface>())
                    {
                        SpecializedData.DataObject = IEntityGroupActionInterface::Execute_OnSwapToFarFieldGroup(Actor);
                    }

                    const FTransform ActorFarfieldTransform = SwapPool.ToIsmTransform(Actor->GetActorTransform());

                    // Return the actor to the pool.
                    SwapPool.ReleaseActor(Actor);
                    SpecializedData.bIsNearFieldSwapped = false;

                    // Sync both transforms to the actor�s last known position.
                    Transform = ActorFarfieldTransform;
                    PrevTransform = ActorFarfieldTransform;

                    TransformUpdateIds.Add(InstanceId);
                    bHasSwapUpdates = true;
                    SpecializedData.NearFieldActor = nullptr;

                    if (Settings.bDebugLogNearFieldSwaps)
                    {
                        UE_LOG(LogTemp, Log, TEXT("%d Transition to farfield due to distance. LastPos: %s"), SpecializedData.Uid, *ActorFarfieldTransform.GetLocation().ToCompactString());
                    }
                    continue; //skip if we swap out
                }
                else
                {
                    UE_LOG(LogTemp, Warning, TEXT("%d failed to transition due to SpecializedData.NearFieldActor being nullptr."), SpecializedData.Uid);
                }
            }
        }

        // Check if not alive
        if (!SpecializedData.bIsAlive) 
        {
            const float CurrentValue = ISMComponent->PerInstanceSMCustomData[i * NumCustomDataFloats + ISMSpecializedData.Common.MovementCustomDataIndex];
            
            //set our death state custom value if relevant
            if (CurrentValue != ISMSpecializedData.Common.CustomDataDeath)
            {
                ISMComponent->SetCustomDataValueById(
                    InstanceId,
                    ISMSpecializedData.Common.MovementCustomDataIndex,
                    ISMSpecializedData.Common.CustomDataDeath
                );

                //skeleton death state, specific values have to be pushed
                if (NumCustomDataFloats > 1)
                {
                    //custom death override for single one-off anim
                    ISMComponent->SetCustomDataValueById(
                        InstanceId,
                        1,
                        0.53
                    );
                }
                //CustomDataUpdateIds.Add(InstanceId);
            }
            else
            {
                continue;
            }
        }

        // Skip updating if the instance has already reached its target.
        if (SpecializedData.bReachedTarget)
        {
            ReachedTargetCount++;
            continue;
        }

        if (!SpecializedData.bIsNearFieldSwapped)
        {
            TransformUpdateIds.Add(InstanceId);
        }

        // Check if the instance is close enough to its target.
        const float DistanceToTarget = (SpecializedData.Target - CurrentPosition).Size();
        if (DistanceToTarget < TargetTolerance)
        {
            if (ISMSpecializedData.Common.MovementCustomDataIndex != -1)
            {
                ISMComponent->SetCustomDataValueById(
                    InstanceId,
                    ISMSpecializedData.Common.MovementCustomDataIndex,
                    ISMSpecializedData.Common.CustomDataIdle
                );
                //CustomDataUpdateIds.Add(InstanceId);
            }
            ISMSpecializedData.ReachedTargetSet.Add(i);
            ISMSpecializedData.ReachedSetSinceLastCheck.Add(i);
            SpecializedData.bReachedTarget = true;
            continue;
        }

        // Update moving custom data if needed.
        if (ISMSpecializedData.Common.MovementCustomDataIndex != -1)
        {
            const float CurrentValue = ISMComponent->PerInstanceSMCustomData[i * NumCustomDataFloats + ISMSpecializedData.Common.MovementCustomDataIndex];
            if (CurrentValue != ISMSpecializedData.Common.CustomDataMoving)
            {
                ISMComponent->SetCustomDataValueById(
                    InstanceId,
                    ISMSpecializedData.Common.MovementCustomDataIndex,
                    ISMSpecializedData.Common.CustomDataMoving
                );
                //CustomDataUpdateIds.Add(InstanceId);
            }
        }

        // Calculate the normalized forward direction from the previous position.
        FVector Forward = (SpecializedData.Target - PrevTransforms[i].GetTranslation()).GetSafeNormal();
        if (bFaceTravel)
        {
            Transform.SetRotation(Forward.Rotation().Quaternion() * FacingOffset);
        }

        // Move the instance toward the target.
        const float MovementMagnitude = SpecializedData.Speed * DeltaTime;
        if (DistanceToTarget < MovementMagnitude)
        {
            Transform.SetTranslation(SpecializedData.Target);
        }
        else
        {
            FVector DesiredMoveLocation = CurrentPosition + (Forward * MovementMagnitude);
            Transform.SetTranslation(DesiredMoveLocation);
        }
    } // End per-instance loop

    // Process near-field swaps if needed.
    if (bDoNearFieldSwapCalculations)
    {
        OverlappingList.Sort([](const FIdDistanceEntry& A, const FIdDistanceEntry& B)
        {
            return A.Distance < B.Distance;
        });

        // Any instances past the visible pool should be swapped back to far-field.
        for (int32 i = SwapPool.MaxPoolSize; i < OverlappingList.Num(); i++)
        {
            FIdDistanceEntry& Entry = OverlappingList[i];
            if (Entry.bIsNearField)
            {
                const int32 idx = Entry.Id;
                FInstanceSpecializedData& SpecializedData = ISMSpecializedData.PerInstance[idx];

                if (AActor* Actor = SpecializedData.NearFieldActor)
                {
                    if (Actor->Implements<UEntityGroupActionInterface>())
                    {
                        SpecializedData.DataObject = IEntityGroupActionInterface::Execute_OnSwapToFarFieldGroup(Actor);
                    }

                    const FTransform ActorFarfieldTransform = SwapPool.ToIsmTransform(Actor->GetActorTransform());
                    SwapPool.ReleaseActor(Actor);
                    SpecializedData.bIsNearFieldSwapped = false;

                    NextTransforms[idx] = ActorFarfieldTransform;
                    PrevTransforms[idx] = ActorFarfieldTransform;
                    TransformUpdateIds.Add({ SpecializedData.Uid });
                    bHasSwapUpdates = true;

                    if (Settings.bDebugLogNearFieldSwaps)
                    {
                        UE_LOG(LogTemp, Log, TEXT("%d Released due to oversubscribed pool and farthest away. LastPos: %s"), SpecializedData.Uid, *ActorFarfieldTransform.GetLocation().ToCompactString());
                    }
                }
            }
        }

        // Make sure that the closest instances (up to pool size) are swapped in.
        const int32 MaxVisible = FMath::Min(SwapPool.MaxPoolSize, OverlappingList.Num());
        for (int32 i = 0; i < MaxVisible; i++)
        {
            FIdDistanceEntry& Entry = OverlappingList[i];
            const int32 EntryId = Entry.Id;
            FInstanceSpecializedData& SpecializedData = ISMSpecializedData.PerInstance[EntryId];
            
            //should be visible, but isn't
            if (!Entry.bIsNearField)
            {
                const FTransform PreSwapXForm = NextTransforms[EntryId];
                const FTransform NearfieldXform = SwapPool.ToActorTransform(PreSwapXForm);

                // Request an actor from the pool and swap this instance in.
                if (AActor* PoolActor = SwapPool.RequestActor(this, EntryId))
                {
                    
                    //PoolActor->SetActorTransform(PreSwapXForm);   //removed to not use
                    //SpecializedData.LastNearFieldTransform = PreSwapXForm;

                    SpecializedData.bIsNearFieldSwapped = true;
                    SpecializedData.NearFieldActor = PoolActor;

                    if (PoolActor->Implements<UEntityGroupActionInterface>())
                    {
                        FESMNearFieldSwapData SwapData;
                        SwapData.EntityId = SpecializedData.Uid;
                        SwapData.InstanceMesh = Mesh;
                        SwapData.ESMActor = this;
                        SwapData.DataObject = SpecializedData.DataObject;

                        IEntityGroupActionInterface::Execute_OnSwapToNearFieldActor(PoolActor, SwapData);
                    }
                    
                    //We're not ready for this
                    //ISMComponent->RemoveInstanceById({ SpecializedData.Uid });

                    //For debug space the out of world swap so we can see which one is swapped out
                    FVector OutOfWorldDebug = SwapPool.OutOfWorldLocation + FVector(100 * EntryId, 0, 0);

                    // Move the ISM instance offscreen while its actor is handling movement.
                    FPrimitiveInstanceId InstanceId = { SpecializedData.Uid };
                    NextTransforms[EntryId].SetLocation(OutOfWorldDebug);   
                    PrevTransforms[EntryId].SetLocation(OutOfWorldDebug);
                    TransformUpdateIds.Add(InstanceId);  //NB: we use aggregate construction to pass in a FPrimitiveInstanceId from int32

                    //set ISM instance custom data to idle
                    ISMComponent->SetCustomDataValueById(
                        InstanceId,
                        ISMSpecializedData.Common.MovementCustomDataIndex,
                        ISMSpecializedData.Common.CustomDataIdle);
                    //CustomDataUpdateIds.Add(InstanceId);

                    bHasSwapUpdates = true;

                    if (Settings.bDebugLogNearFieldSwaps)
                    {
                        UE_LOG(LogTemp, Log, TEXT("%d Transition to nearfield as nearest overlap. LastPos: %s"), SpecializedData.Uid, *PreSwapXForm.GetLocation().ToCompactString());
                    }
                }

                //Forward position update to the actor only once if now swapper with valid actor. (todo always forward logic)
                if (SpecializedData.bIsNearFieldSwapped && SpecializedData.NearFieldActor)
                {
                    if (SpecializedData.NearFieldActor->Implements<UEntityGroupActionInterface>())
                    {
                        //Sync to latest position
                        IEntityGroupActionInterface::Execute_OnGroupTransformUpdate(SpecializedData.NearFieldActor, NearfieldXform);

                        //Also let the nearfield actor know what the current target is
                        IEntityGroupActionInterface::Execute_OnGroupWaypointTargetUpdate(SpecializedData.NearFieldActor, SpecializedData.Target);
                        IEntityGroupActionInterface::Execute_OnGroupTargetSpeedUpdate(SpecializedData.NearFieldActor, SpecializedData.Speed);
                    }
                }
            }
        }
    } // End near-field swap block

    // If all instances have reached their target and no swap updates occurred, finish early.
    if (ReachedTargetCount == MaxSMNum && !bHasSwapUpdates)
    {
        ISMSpecializedData.bAllReachedTarget = true;
        OnTargetsReached.Broadcast(Mesh, ReachedTargetCount);
        return;
    }
    else if (ReachedTargetCount > 0 && (ReachedTargetCount != ISMSpecializedData.LastReachedCount))
    {
        OnTargetsReached.Broadcast(Mesh, ReachedTargetCount);
    }
    ISMSpecializedData.LastReachedCount = ReachedTargetCount;

    // Begin batched updates.
    ISMComponent->Modify();

    // Batch update transforms using the new API (by unique InstanceId).
    for (FPrimitiveInstanceId InstanceId : TransformUpdateIds)
    {
        const int32 InstanceIndex = ISMComponent->GetInstanceIndexForId(InstanceId);
        if (InstanceIndex == INDEX_NONE)
        {
            continue;
        }
        const FTransform& Next = NextTransforms[InstanceIndex];
        const FTransform& Prev = PrevTransforms[InstanceIndex];

        ISMComponent->SetHasPerInstancePrevTransforms(true);
        ISMComponent->SetPreviousTransformById(InstanceId, Prev, false);
        ISMComponent->UpdateInstanceTransformById(InstanceId, Next, false, false);
    }

    // Batch update custom data.
    /*for (FPrimitiveInstanceId InstanceId : CustomDataUpdateIds)
    {
        const int32 InstanceIndex = ISMComponent->GetInstanceIndexForId(InstanceId);
        if (InstanceIndex == INDEX_NONE)
        {
            continue;
        }
        TArray<float> CustomDataFloats;
        for (int32 i = 0; i < NumCustomDataFloats; i++)
        {
            CustomDataFloats.Add(ISMComponent->PerInstanceSMCustomData[InstanceIndex * NumCustomDataFloats + i]);
        }
        ISMComponent->SetCustomDataById(InstanceId, CustomDataFloats);
    }*/

    ISMComponent->MarkRenderInstancesDirty();
}



void AEntitySpawningManagerActor::TravelDynamicISMTowardTargetsBaseline(UStaticMesh* Mesh, float DeltaTime, bool bFaceTravel /*=true*/)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    //Early exit if we don't have targeting data for this mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    //this can de-optimize a 'settled' loop, todo: swap out settled actors that aren't near
    //or do more targeted nearfield calculations
    const bool bDoNearFieldSwapCalculations = ISMSpecializedData.NearFieldInfo.bNearFieldSwapEnabled && ISMSpecializedData.NearFieldInfo.SwapPool.PooledActorClass != nullptr;

    //Early out optimization
    if (ISMSpecializedData.bAllReachedTarget && !bDoNearFieldSwapCalculations)
    {
        return;
    }

    //Obtain prev transforms & current transforms
    TArray<FTransform> PrevTransforms;
    TArray<FTransform> NextTransforms;

    //Calculate nearfield for every position
    int32 MaxSMNum = ISMComponent->PerInstanceSMData.Num();

    for (int32 i = 0; i < MaxSMNum; i++)
    {
        FTransform Transform = FTransform(ISMComponent->PerInstanceSMData[i].Transform);
        NextTransforms.Add(Transform);
    }

    int32 MaxPrevNum = ISMComponent->PerInstancePrevTransform.Num();
    if (MaxPrevNum == 0)
    {
        //No previous data, fill it
        for (int32 i = 0; i < PrevTransforms.Num(); i++)
        {
            ISMComponent->PerInstancePrevTransform.Add(PrevTransforms[i].ToMatrixWithScale());
        }
    }

    //Copy prev from next
    PrevTransforms = NextTransforms;

    const FQuat FacingOffset = ISMSpecializedData.Common.FacingOffset.Quaternion();

    int32 ReachedTargetCount = 0;

    TArray<int32> CustomDataUpdates;
    TArray<int32> TransformUpdates;

    TArray<FIdDistanceEntry> OverlappingList;

    bool bHasSwapUpdates = false;

    const int32 NumCustomDataFloats = ISMComponent->NumCustomDataFloats;

    //Modify targets to next transforms
    for (int32 i = 0; i < MaxSMNum; i++)
    {
        FInstanceSpecializedData& SpecializedData = ISMSpecializedData.PerInstance[i];
        FTransform& Transform = NextTransforms[i];
        FVector CurrentPosition = Transform.GetTranslation();

        //Earliest skip - reached target or is dead
        if (SpecializedData.bReachedTarget)
        {
            ReachedTargetCount++;
            continue;
        }

        if (!SpecializedData.bIsNearFieldSwapped)
        {
            //Only parse the update if you are not nearfield swapped
            TransformUpdates.Add(i);
        }

        //Early skip, we've already arrived
        const float DistanceToTarget = (SpecializedData.Target - CurrentPosition).Size();
        if (DistanceToTarget < ISMSpecializedData.Common.TargetTolerance)
        {
            //Sync VAT custom data. NB: -1 signifies ignore the value update
            if (ISMSpecializedData.Common.MovementCustomDataIndex != -1)
            {
                ISMComponent->SetCustomDataValue(i,
                    ISMSpecializedData.Common.MovementCustomDataIndex,
                    ISMSpecializedData.Common.CustomDataIdle, false);
                CustomDataUpdates.Add(i);
            }

            //Set this only once for callback reasons
            ISMSpecializedData.ReachedTargetSet.Add(i);
            ISMSpecializedData.ReachedSetSinceLastCheck.Add(i);

            SpecializedData.bReachedTarget = true;
            continue;
        }

        if (ISMSpecializedData.Common.MovementCustomDataIndex != -1)
        {
            //Check past value, if different add to update set
            const float CurrentValue = ISMComponent->PerInstanceSMCustomData[i * NumCustomDataFloats + ISMSpecializedData.Common.MovementCustomDataIndex];
            if (CurrentValue != ISMSpecializedData.Common.CustomDataMoving)
            {
                ISMComponent->SetCustomDataValue(i,
                    ISMSpecializedData.Common.MovementCustomDataIndex,
                    ISMSpecializedData.Common.CustomDataMoving);
                CustomDataUpdates.Add(i);
            }
        }

        const FVector Forward = (SpecializedData.Target - PrevTransforms[i].GetTranslation()).GetSafeNormal();

        //rotate to face the travel direction
        if (bFaceTravel)
        {
            Transform.SetRotation(Forward.Rotation().Quaternion() * FacingOffset);
        }

        //Do the move, check magnitude of move to ensure we don't overshoot it
        const float MovementMagnitude = SpecializedData.Speed * DeltaTime;

        if (DistanceToTarget < MovementMagnitude)
        {
            Transform.SetTranslation(SpecializedData.Target);
        }
        else
        {
            FVector DesiredMoveLocation = CurrentPosition + (Forward * MovementMagnitude);
            Transform.SetTranslation(DesiredMoveLocation);
        }
    }//End modify transforms

    //If all targets have reached the final point, no need to run no-change update
    if (ReachedTargetCount == MaxSMNum && !bHasSwapUpdates)
    {
        //We can turn on our earliest out optimization
        ISMSpecializedData.bAllReachedTarget = true;
        OnTargetsReached.Broadcast(Mesh, ReachedTargetCount);
        return;
    }

    //otherwise notify the current set of reached target if different from last count
    if (ReachedTargetCount > 0 && (ReachedTargetCount != ISMSpecializedData.LastReachedCount))
    {
        OnTargetsReached.Broadcast(Mesh, ReachedTargetCount);
    }

    ISMSpecializedData.LastReachedCount = ReachedTargetCount;

    //and run update

    //New Method - lower level manual direct update. Can lower our render thread cost
    // 
    //NB: If we split the ISM into ~ 1k groups we can round robin their updates (especially further back units)
    //and potentially drive the illusion of 20k+ updates (skip small distant updates too)

    ISMComponent->Modify();

    //ResetRenderCommand(ISMComponent);

    for (int32 i = 0; i < TransformUpdates.Num(); i++)
    {
        const int32 Index = TransformUpdates[i];
        const FTransform Next = NextTransforms[Index];
        const FTransform Prev = PrevTransforms[Index];

        //NB: we need to do Id<->Index changes for our own purposes: add/remove by id etc
        FPrimitiveInstanceId Id = { Index };

        ISMComponent->SetHasPerInstancePrevTransforms(true);
        ISMComponent->SetPreviousTransformById(Id, Prev);

        ISMComponent->UpdateInstanceTransform(Index, Next);

        //We don't have enough access to make this work in 5.4, subclass?
        //ISMComponent->PerInstanceSMData[Index].Transform = Next;
    }

    for (int32 Index : CustomDataUpdates)
    {
        TArray<float> CustomDataFloats;
        for (int32 i = 0; i < NumCustomDataFloats; i++)
        {
            CustomDataFloats.Add(ISMComponent->PerInstanceSMCustomData[Index * NumCustomDataFloats + i]);
        }

        ISMComponent->SetCustomData(Index, CustomDataFloats);
    }

    ISMComponent->MarkRenderInstancesDirty();
}

void AEntitySpawningManagerActor::StopTravelForInstance(UStaticMesh* Mesh, int32 Index)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    //Early exit if we don't have targeting data for this mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    if (!ISMSpecializedData.PerInstance.IsValidIndex(Index))
    {
        //no such instance, ignore
        return;
    }

    ISMSpecializedData.PerInstance[Index].bReachedTarget = true;

    FTransform CurrentTransform;
    ISMComponent->GetInstanceTransform(Index, CurrentTransform);

    //Copy the current position as target, next tick will properly stop the instance
    ISMSpecializedData.PerInstance[Index].Target = CurrentTransform.GetTranslation();
}

void AEntitySpawningManagerActor::SetInstanceToKilled(UStaticMesh* Mesh, int32 Index)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    //Early exit if we don't have targeting data for this mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    if (!ISMSpecializedData.PerInstance.IsValidIndex(Index))
    {
        //no such instance, ignore
        return;
    }

    //Stop travel by changing it's target information
    ISMSpecializedData.PerInstance[Index].bReachedTarget = true;
    FTransform CurrentTransform;
    ISMComponent->GetInstanceTransform(Index, CurrentTransform);
    ISMSpecializedData.PerInstance[Index].Target = CurrentTransform.GetTranslation();

    //Set to killed.
    ISMSpecializedData.PerInstance[Index].bIsAlive = false;

    //Todo: rotate/set movement to dead anim
}

bool AEntitySpawningManagerActor::IsInstanceDead(UStaticMesh* Mesh, int32 Index)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return true;
    }

    //Early exit if we don't have targeting data for this mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return true;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    if (!ISMSpecializedData.PerInstance.IsValidIndex(Index))
    {
        //no such instance, ignore, assume dead
        return true;
    }

    //return !alive
    return !ISMSpecializedData.PerInstance[Index].bIsAlive;
}

void AEntitySpawningManagerActor::StopTravelForInstances(UStaticMesh* Mesh, const TArray<int32>& Indices)
{
    for (int32 Index : Indices)
    {
        StopTravelForInstance(Mesh, Index);
    }
}

void AEntitySpawningManagerActor::AllInstanceIdsForDynamicMesh(UStaticMesh* Mesh, TArray<int32>& OutIndices)
{
    //Early exit if we don't have targeting data for this mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return;
    }

    FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];

    OutIndices.Reserve(ISMSpecializedData.PerInstance.Num());
    for (int32 i = 0; i < ISMSpecializedData.PerInstance.Num(); i++)
    {
        OutIndices.Add(i);
    }
}

FInstanceMapPlacementCache AEntitySpawningManagerActor::CacheResults()
{
    FInstanceMapPlacementCache Cache;

    //TODO: add filter to cache only e.g. static meshes.

    for (UActorComponent* Component : GetComponents())
    {
        if (UInstancedStaticMeshComponent* TempISMComponent = Cast<UInstancedStaticMeshComponent>(Component))
        {
            FInstancePlacementCache InstanceCache;       
            InstanceCache.MeshPath = TempISMComponent->GetStaticMesh()->GetPathName();
            
            for (int32 i = 0; i < TempISMComponent->PerInstanceSMData.Num(); i++)
            {
                InstanceCache.TransformMatrices.Add(TempISMComponent->PerInstanceSMData[i].Transform);
            }
            Cache.CacheData.Add(InstanceCache);
        }
    }

    return Cache;
}

void AEntitySpawningManagerActor::LoadFromCache(const FInstanceMapPlacementCache& Cache)
{
    ClearAllInstances();

    for (const FInstancePlacementCache& InstanceCache : Cache.CacheData)
    {
        UStaticMesh* Mesh = LoadMeshFromPath(InstanceCache.MeshPath, this);
        TArray<FTransform> Transforms;
        Transforms.Reserve(InstanceCache.TransformMatrices.Num());

        for (int32 i = 0; i < InstanceCache.TransformMatrices.Num(); i++)
        {
            FTransform Transform;
            Transform.SetFromMatrix(InstanceCache.TransformMatrices[i]);
            Transforms.Add(Transform);
        }

        //Todo: support mobility enum and custom data
        
        SetISMTransforms(Mesh, Transforms);
    }
}

void AEntitySpawningManagerActor::LoadCacheFromFile(const FString& FileName, bool bIsFullPath)
{
    UCUFileSubsystem* CUSystem = GEngine->GetEngineSubsystem<UCUFileSubsystem>();
    if (!CUSystem)
    {
        return;
    }

    FString FullPath = FileName;
    bool bIsBinaryType = FileName.EndsWith(TEXT(".bin"));
    if (!bIsFullPath)
    {
        FullPath = CacheSettings.FullPath(FileName);
        bIsBinaryType = CacheSettings.IsBinaryFileType();
    }

    //Read file bytes
    TArray<uint8> Bytes;
    CUSystem->ReadBytesFromPath(FullPath, Bytes);

    //deserialize into cache struct
    FInstanceMapPlacementCache Cache;

    if (bIsBinaryType)
    {
        
        UCUBlueprintLibrary::DeserializeStruct(FInstanceMapPlacementCache::StaticStruct(), &Cache, Bytes);
    }
    else
    {
        USIOJConvert::BytesToStruct(Bytes, FInstanceMapPlacementCache::StaticStruct(), &Cache);
    }


    //Convert
    LoadFromCache(Cache);
}

void AEntitySpawningManagerActor::SaveCacheToFile(const FString& FileName, bool bIsFullPath)
{
    UCUFileSubsystem* CUSystem = GEngine->GetEngineSubsystem<UCUFileSubsystem>();
    if (!CUSystem)
    {
        return;
    }

    FString FullPath = FileName;
    bool bIsBinaryType = FileName.EndsWith(TEXT(".bin"));
    if (!bIsFullPath)
    {
        FullPath = CacheSettings.FullPath(FileName);
        bIsBinaryType = CacheSettings.IsBinaryFileType();
    }

    //Obtain cache by conversion
    FInstanceMapPlacementCache Cache = CacheResults();

    //Serialize into bytes
    TArray<uint8> Bytes;

    if (bIsBinaryType)
    {
        UCUBlueprintLibrary::SerializeStruct(FInstanceMapPlacementCache::StaticStruct(), &Cache, Bytes);
    }
    else
    {
        USIOJConvert::StructToBytes(FInstanceMapPlacementCache::StaticStruct(), &Cache, Bytes);
    }

    //Save bytes to file
    CUSystem->SaveBytesToPath(Bytes, FullPath, false);
}

void AEntitySpawningManagerActor::HitResultSwapInteraction(AActor* InInteractingActor, const FHitResult& HitResult, bool& bSuccess)
{
    bSuccess = false;

    if (!Settings.bEnableInstanceInteraction)
    {
        UE_LOG(LogTemp, Log, TEXT("AttemptTraceInteract_Implementation interaction disabled for this ESM (todo: remove this log if used in production)"));
        return;
    }

    UInstancedStaticMeshComponent* ISMComponent = Cast<UInstancedStaticMeshComponent>(HitResult.GetComponent());
    if (!ISMComponent)
    {
        UE_LOG(LogTemp, Log, TEXT("AttemptTraceInteract_Implementation no ISM component found in trace data"));
        return;
    }

    const FString& InstigatorName = InInteractingActor->GetActorNameOrLabel();
    UStaticMesh* Mesh = ISMComponent->GetStaticMesh();
    const FString& EntityStaticMeshKeyString = Mesh->GetName();
    int32 EntityIndex = HitResult.Item;

    UE_LOG(LogTemp, Log, TEXT("%s Trace Interaction with Mesh %s Instance: %d"), *InstigatorName, *EntityStaticMeshKeyString, EntityIndex);

    bSuccess = SwapStaticInstanceToNearField(Mesh, EntityIndex) != nullptr;
    return;
}

UStaticMesh* AEntitySpawningManagerActor::LoadMeshFromPath(const FString& MeshPath, UObject* WorldContextObject)
{
    return Cast<UStaticMesh>(StaticLoadObject(UStaticMesh::StaticClass(), nullptr, *MeshPath));
}

FString AEntitySpawningManagerActor::TrimPathEnding(const FString& InputPath)
{
    int32 LastDotIndex;
    int32 LastSlashIndex;

    // Find the last occurrence of '.' and '/'
    if (InputPath.FindLastChar('.', LastDotIndex) && InputPath.FindLastChar('/', LastSlashIndex))
    {
        // Ensure that the last '.' occurs after the last '/'
        if (LastDotIndex > LastSlashIndex)
        {
            // Trim the string up to (but not including) the last '.'
            return InputPath.Left(LastDotIndex);
        }
    }
    // If no '.' or '/' is found, or '.' is before '/', return the original path
    return InputPath;
}

void AEntitySpawningManagerActor::ResetRenderCommand(UInstancedStaticMeshComponent* ISMComponent)
{
    //ISMComponent->InstanceUpdateCmdBuffer
    //ISMComponent->InstanceUpdateCmdBuffer.Cmds.Empty();
    //ISMComponent->InstanceUpdateCmdBuffer.NumCustomDataFloats = 0;
    //ISMComponent->InstanceUpdateCmdBuffer.NumAdds = 0;
    //ISMComponent->InstanceUpdateCmdBuffer.NumUpdates = 0;
    //ISMComponent->InstanceUpdateCmdBuffer.NumCustomFloatUpdates = 0;
    //ISMComponent->InstanceUpdateCmdBuffer.NumRemoves = 0;
    //ISMComponent->InstanceUpdateCmdBuffer.NumEdits = 0;
}

AActor* AEntitySpawningManagerActor::GetDefaultPossessedActor()
{
    // Get the player controller for player index 0
    APlayerController* PlayerController = UGameplayStatics::GetPlayerController(this, 0);
    if (PlayerController)
    {
        // Get the possessed pawn (actor) by the player controller
        APawn* PossessedPawn = PlayerController->GetPawn();
        if (PossessedPawn)
        {
            return PossessedPawn;
        }
    }

    // Return nullptr if the player controller or possessed pawn is not found
    return nullptr;
}

bool AEntitySpawningManagerActor::HasMultipleLODsAndNotNanite(UStaticMesh* StaticMesh)
{
    return false;
}

void AEntitySpawningManagerActor::UpdateDynamicISMTransforms(UStaticMesh* Mesh, const TArray<FTransform>& Transforms)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    //FCUScopeTimer Timer(TEXT("4 - Batchupdate"));
    TArray<FTransform> PrevTransforms;
    int32 MaxPrevNum = ISMComponent->PerInstancePrevTransform.Num();
    if (MaxPrevNum == 0)
    {
        PrevTransforms = Transforms;
        for (int32 i = 0; i < PrevTransforms.Num(); i++)
        {
            ISMComponent->PerInstancePrevTransform.Add(PrevTransforms[i].ToMatrixWithScale());
        }
    }
    else
    {
        int32 MaxSMNum = ISMComponent->PerInstanceSMData.Num();
        for (int32 i = 0; i < MaxSMNum; i++)
        {
             PrevTransforms.Add(FTransform(ISMComponent->PerInstanceSMData[i].Transform));
        }
    }

    //TODO: update to use the travel custom method of ISM update, set using this method is about 2x slower than custom method.

    //Use the batch update with transforms and prevtransforms so our motion vectors get correctly set for movement
    ISMComponent->BatchUpdateInstancesTransforms(0, Transforms, PrevTransforms, false, true, false);
}

//This function gets called from javascript to pass memory as arraybuffer through
void AEntitySpawningManagerActor::UpdateISMTransformsFromMemory(UStaticMesh* Mesh, int32 Num /*= 0*/)
{
    //FCUScopeTimer Timer(TEXT("+ - Full update"));
    TArray<uint8> Buffer;

    //Pre-size
    Buffer.SetNumUninitialized(Num);

    //const int32 TransformSize = sizeof(FTransform);
    const int32 abSize = FArrayBufferAccessor::GetSize();

    uint8* DestPointer = Buffer.GetData();

    if (Num == abSize)
    {
        //FCUScopeTimer Timer(TEXT("2 - memcpy"));
        memcpy(DestPointer, FArrayBufferAccessor::GetData(), abSize);

        //We assume 9 float format for transform
        UpdateISMTransformsFromBuffer(Mesh, Buffer);
        //UpdateInstances(Mesh, TransformArray);
    }
    else
    {
        UE_LOG(LogTemp, Log, TEXT("AEntitySpawningManagerActor::UpdateInstancesFromMemory wrong memory size passed in. %d != %d"),
            Num, abSize);
    }
}

void AEntitySpawningManagerActor::UpdateISMTransformsFromBuffer(UStaticMesh* Mesh, const TArray<uint8>& Buffer)
{
    TArray<FTransform> TransformArray;
    UCUBlueprintLibrary::Conv_CompactBytesToTransforms(Buffer, TransformArray);

    if (Mesh->IsValidLowLevel())
    {
        UpdateDynamicISMTransforms(Mesh, TransformArray);
    }
}

void AEntitySpawningManagerActor::SetISMMovementBatchTargetData(UStaticMesh* Mesh, const TArray<FVector>& Targets)
{
    FISMSpecializedData SpecializedDataList;

    for (int32 i = 0; i < Targets.Num(); i++)
    {
        FInstanceSpecializedData PerInstanceData;
        PerInstanceData.Target = Targets[i];
        PerInstanceData.Uid = i;
        PerInstanceData.bReachedTarget = false;

        SpecializedDataList.PerInstance.Add(PerInstanceData);
    }
    SpecializedDataList.bAllReachedTarget = false;
    
    //for now we override fully    
    DynamicMapData.TargetData.Add(Mesh, SpecializedDataList);
}

void AEntitySpawningManagerActor::SetISMMovementTargetDataForIndex(UStaticMesh* Mesh, const FVector& Target, int32 Index, float TargetSpeed /*= -1.f*/)
{
    //Invalid Fallback - 1
    //Invalid list for mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        //Create a list with just all indices up to the desired index

        FISMSpecializedData SpecializedDataList;     

        //duplicate the target info for
        for (int32 i = 0; i <= Index; i++)
        {
            FInstanceSpecializedData PerInstanceData;
            
            PerInstanceData.Uid = i;
            PerInstanceData.bReachedTarget = false;
            //NB: No need to remove ReachedTargetSet since it doesn't exist yet

            if (i == Index)
            {
                PerInstanceData.Target = Target;

                //only update if set as 0 or positive value. Negative values are invalid.
                if (TargetSpeed >= 0)
                {
                    PerInstanceData.Speed = TargetSpeed;
                }
            }
            else
            {
                PerInstanceData.Target = FVector(); //origin target (invalid)
            }
            SpecializedDataList.PerInstance.Add(PerInstanceData);
        }

        DynamicMapData.TargetData.Add(Mesh, SpecializedDataList);
        return;
    }

    FISMSpecializedData& MeshTargetDataList = DynamicMapData.TargetData[Mesh];

    //Target updated invalidate all reached.
    MeshTargetDataList.bAllReachedTarget = false;

    //Invalid Fallback - 2
    //Valid mesh list, but invalid index - fill until index and set
    if (!MeshTargetDataList.PerInstance.IsValidIndex(Index))
    {

        int32 LastIndex = MeshTargetDataList.PerInstance.Num();

        //fill gap indices with empty targeting data and then set our requested index data correctly
        for (int32 i = LastIndex; i <= Index; i++)
        {
            FInstanceSpecializedData PerInstanceData;

            PerInstanceData.Uid = i;
            PerInstanceData.bReachedTarget = false;
            MeshTargetDataList.ReachedTargetSet.Remove(i);
            MeshTargetDataList.ReachedSetSinceLastCheck.Remove(i);

            if (i == Index)
            {
                PerInstanceData.Target = Target;

                //only update if set as 0 or positive value. Negative values are invalid.
                if (TargetSpeed >= 0)
                {
                    PerInstanceData.Speed = TargetSpeed;
                }
            }
            else
            {
                PerInstanceData.Target = FVector(); //origin target (invalid)
            }
            MeshTargetDataList.PerInstance.Add(PerInstanceData);
        }
        return;
    }


    //Valid index case, update
    FInstanceSpecializedData& PerInstanceData = MeshTargetDataList.PerInstance[Index];
    PerInstanceData.Target = Target;
    PerInstanceData.bReachedTarget = false;
    MeshTargetDataList.ReachedTargetSet.Remove(Index);
    MeshTargetDataList.ReachedSetSinceLastCheck.Remove(Index);

    if (TargetSpeed >= 0)
    {
        PerInstanceData.Speed = TargetSpeed;
    }

    if (Settings.bSwapActorsNearFieldActors)
    {
        //Forward position request to the actor handling nearfield if swapped out
        if (PerInstanceData.bIsNearFieldSwapped && PerInstanceData.NearFieldActor)
        {
            if (PerInstanceData.NearFieldActor->Implements<UEntityGroupActionInterface>())
            {
                IEntityGroupActionInterface::Execute_OnGroupWaypointTargetUpdate(PerInstanceData.NearFieldActor, Target);
                IEntityGroupActionInterface::Execute_OnGroupTargetSpeedUpdate(PerInstanceData.NearFieldActor, TargetSpeed);
            }
        }
    }
}

FVector AEntitySpawningManagerActor::GetISMMovementTargetDataForIndex(UStaticMesh* Mesh, int32 Index)
{
    //Invalid list for mesh
    if (!DynamicMapData.TargetData.Contains(Mesh))
    {
        return FVector();
    }
    FISMSpecializedData& MeshTargetDataList = DynamicMapData.TargetData[Mesh];

    //Valid mesh list, but invalid index - fill until index and set
    if (!MeshTargetDataList.PerInstance.IsValidIndex(Index))
    {
        return FVector();
    }

    //We have a valid index, go ahead and update
    FInstanceSpecializedData& PerInstanceData = MeshTargetDataList.PerInstance[Index];
    return PerInstanceData.Target;
}

void AEntitySpawningManagerActor::SetISMMovementTargetCommonData(UStaticMesh* Mesh, const FISMSpecializedCommonData& CommonData)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    if (DynamicMapData.TargetData.Contains(Mesh))
    {
        DynamicMapData.TargetData[Mesh].Common = CommonData;
    }
}

void AEntitySpawningManagerActor::SetISMTransformForIndex(UStaticMesh* Mesh, const FTransform& Transform, int32 Index, bool bMarkDirty)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    if (!ISMComponent)
    {
        return;
    }

    if (bMarkDirty)
    {
        ISMComponent->MarkRenderInstancesDirty();
    }

    ISMComponent->UpdateInstanceTransform(Index, Transform, false, bMarkDirty, false);
    FPrimitiveInstanceId Id = { Index };

    ISMComponent->SetHasPerInstancePrevTransforms(true);
    ISMComponent->SetPreviousTransformById(Id, Transform);

    if (Settings.bSwapActorsNearFieldActors)
    {

        //Check if we're nearfield swapped
        FISMSpecializedData& MeshTargetDataList = DynamicMapData.TargetData[Mesh];
        FInstanceSpecializedData& SpecializedData = MeshTargetDataList.PerInstance[Index];

        if (SpecializedData.bIsNearFieldSwapped && SpecializedData.NearFieldActor)
        {
            if (SpecializedData.NearFieldActor->Implements<UEntityGroupActionInterface>())
            {
                //Sync to desired group transform instruction
                IEntityGroupActionInterface::Execute_OnGroupTransformUpdate(SpecializedData.NearFieldActor, Transform);
            }
        }
    }
}

FTransform AEntitySpawningManagerActor::GetISMTransformForIndex(UStaticMesh* Mesh, int32 Index)
{
    UInstancedStaticMeshComponent* ISMComponent = DynamicInstanceComponentForMesh(Mesh);

    FTransform Transform;
    if (!ISMComponent)
    {
        return Transform;
    }

    if (Settings.bSwapActorsNearFieldActors)
    {
        //Case: we're nearfield swapped
        FISMSpecializedData& ISMSpecializedData = DynamicMapData.TargetData[Mesh];
        FInstanceSpecializedData& SpecializedData = ISMSpecializedData.PerInstance[Index];
        FNearFieldDynamicInfo& NearFieldInfo = ISMSpecializedData.NearFieldInfo;
        FActorSwapPool& SwapPool = NearFieldInfo.SwapPool;

        if (SpecializedData.bIsNearFieldSwapped && SpecializedData.NearFieldActor)
        {
            return SwapPool.ToIsmTransform(SpecializedData.NearFieldActor->GetActorTransform());
        }
    }
    
    ISMComponent->GetInstanceTransform(Index, Transform);
    return Transform;
}

UInstancedStaticMeshComponent* AEntitySpawningManagerActor::StaticInstanceComponentForMesh(UStaticMesh* Mesh)
{
    UInstancedStaticMeshComponent** PointerOrNull = StaticMapData.MeshComponentMap.Find(Mesh);
    if (PointerOrNull == nullptr)
    {
        return nullptr;
    }
    //Deref
    return *PointerOrNull;
}

UInstancedStaticMeshComponent* AEntitySpawningManagerActor::DynamicInstanceComponentForMesh(UStaticMesh* Mesh)
{
    UInstancedStaticMeshComponent** PointerOrNull = DynamicMapData.MeshComponentMap.Find(Mesh);
    if (PointerOrNull == nullptr)
    {
        return nullptr;
    }
    //Deref
    return *PointerOrNull;
}

// Called when the game starts or when spawned
void AEntitySpawningManagerActor::BeginPlay()
{
    Super::BeginPlay();
}

// Called every frame
void AEntitySpawningManagerActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
}