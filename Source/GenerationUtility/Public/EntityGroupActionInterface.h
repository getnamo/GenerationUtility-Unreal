#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "EntitySpawningManagerActor.h"
#include "EntityGroupActionInterface.generated.h"


USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FESMNearFieldSwapData
{
    GENERATED_USTRUCT_BODY()

    //Unique ID
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
    int32 EntityId = -1;

    //index in the static mesh array
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
    int32 InstanceId = -1;

    //Far field instance mesh key
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
    UStaticMesh* InstanceMesh;
    
    //Manager for this entity (there can be multiple)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
    AEntitySpawningManagerActor* ESMActor;

    //Extra data used to pass between near and far field
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = InstancePlacementCache)
    UObject* DataObject;
};


UINTERFACE(Blueprintable)
class UEntityGroupActionInterface : public UInterface
{
    GENERATED_BODY()
};

/**
 * 
 */
class GENERATIONUTILITY_API IEntityGroupActionInterface
{
    GENERATED_BODY()

public:
    
    //If the esm entity received a transform update, this will get called
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Group Action")
    void OnGroupTransformUpdate(const FTransform& NewTransform);

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Group Action")
    void OnGroupWaypointTargetUpdate(const FVector& NewTarget);

    //This is speed matching request from group data
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Group Action")
    void OnGroupTargetSpeedUpdate(const float NewSpeed);

    //Called on actor just before swapping out, returning an optional data object esm handling
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Group Action")
    UObject* OnSwapToFarFieldGroup();

    //Called when an entity swaps to an actor with optional data object you wish the actor to reference
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Group Action")
    void OnSwapToNearFieldActor(const FESMNearFieldSwapData& SwapData);
};
