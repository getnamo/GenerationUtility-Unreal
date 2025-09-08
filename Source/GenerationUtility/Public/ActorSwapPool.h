#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "ActorSwapPool.generated.h"

/**
 * A C++ only, stack-allocatable actor pool.
 */

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FActorSwapPool
{
    GENERATED_BODY()

    FActorSwapPool();

    /** Pre-populate the pool with actors.
     * @param WorldContextObject A valid context object to obtain the world from.
     */
    void InitializePool(UObject* WorldContextObject);

    /** Request an actor from the pool.
     * @param WorldContextObject A valid context object to obtain the world from.
     * @param UniqueId (Optional) Unique identifier to associate with the actor. Use -1 if not used.
     * @return A pointer to an actor from the pool, or nullptr if the pool is exhausted.
     */
    AActor* RequestActor(UObject* WorldContextObject, int32 UniqueId = -1);

    /** Release an actor back into the pool.
     * @param Actor The actor to release.
     */
    void ReleaseActor(AActor* Actor);

    /** Lookup an in-use actor by its unique ID.
     * @param UniqueId The unique identifier associated with the actor.
     * @return The actor pointer if found, or nullptr otherwise.
     */
    AActor* LookupActor(int32 UniqueId);

    /** 
    * Take given pool and remove extra unused actors
    */
    void ShrinkPoolToFit();

    // Editable properties

    /** Maximum number of actors allowed in the pool. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    int32 MaxPoolSize = 10;

    //When the pool has more than this number of available actors, shrink on release. -1 means never shrink
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    int32 bAutoShrinkSlackSize = -1;

    /** The type of actor to pool. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    TSubclassOf<AActor> PooledActorClass;

    /** On spawn adjustment */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    FTransform ActorOffset;

    /** Where instances should move during nearfield swap in */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    FVector OutOfWorldLocation = FVector(0, 0, -1000.f);

    /** This will try to disable actors while they're swapped out */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Actor Pool")
    bool bDeactivateOnSwap = true;

    /** Actors currently in use (mapped by UniqueId). */
    UPROPERTY(BlueprintReadOnly, Category = "Actor Pool")
    TMap<int32, AActor*> InUseActors;

    /** Utility on swap */
    void DeactivateActor(AActor* Actor);

    void ActivateActor(AActor* Actor);

    //utility swap functions
    FTransform ToActorTransform(const FTransform& ISMTransform);
    
    FTransform ToIsmTransform(const FTransform& ActorTransform);

private:

    /** Actors currently available for reuse. */
    UPROPERTY()
    TArray<AActor*> AvailableActors;

    /** Reverse mapping from actor pointer to its unique ID. */
    UPROPERTY()
    TMap<AActor*, int32> ActorToUniqueId;

    /** All actors spawned by the pool. */
    UPROPERTY()
    TArray<AActor*> AllActors;
};