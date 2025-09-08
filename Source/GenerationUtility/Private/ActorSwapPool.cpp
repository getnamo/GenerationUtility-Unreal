#include "ActorSwapPool.h"
#include "ActorSwapPool.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "GameFramework/MovementComponent.h"


FActorSwapPool::FActorSwapPool()
{
    // Reserve memory based on the max pool size to minimize reallocations.
    AvailableActors.Reserve(MaxPoolSize);
    AllActors.Reserve(MaxPoolSize);
}

void FActorSwapPool::InitializePool(UObject* WorldContextObject)
{
    if (!WorldContextObject)
    {
        UE_LOG(LogTemp, Warning, TEXT("InitializePool: WorldContextObject is null."));
        return;
    }

    UWorld* World = GEngine->GetWorldFromContextObjectChecked(WorldContextObject);
    if (!World)
    {
        UE_LOG(LogTemp, Warning, TEXT("InitializePool: Unable to get world."));
        return;
    }

    // Pre-populate the pool up to MaxPoolSize.
    for (int32 i = 0; i < MaxPoolSize; ++i)
    {
        if (PooledActorClass)
        {
            FActorSpawnParameters SpawnParams;
            SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
            AActor* NewActor = World->SpawnActor<AActor>(PooledActorClass, FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
            if (NewActor)
            {
                AllActors.Add(NewActor);
                AvailableActors.Add(NewActor);
            }
        }
        else
        {
            UE_LOG(LogTemp, Warning, TEXT("InitializePool: PooledActorClass is not set."));
            break;
        }
    }
}

AActor* FActorSwapPool::RequestActor(UObject* WorldContextObject, int32 UniqueId)
{
    if (!WorldContextObject)
    {
        UE_LOG(LogTemp, Warning, TEXT("RequestActor: WorldContextObject is null."));
        return nullptr;
    }

    UWorld* World = GEngine->GetWorldFromContextObjectChecked(WorldContextObject);
    if (!World)
    {
        UE_LOG(LogTemp, Warning, TEXT("RequestActor: Unable to get world."));
        return nullptr;
    }

    // Check if the UniqueId is already in use.
    if (UniqueId != -1 && InUseActors.Contains(UniqueId))
    {
        UE_LOG(LogTemp, Warning, TEXT("RequestActor: UniqueId %d already in use."), UniqueId);
        return nullptr;
    }

    AActor* Actor = nullptr;

    // If an actor is available, reuse it.
    if (AvailableActors.Num() > 0)
    {
        Actor = AvailableActors.Pop();
    }
    // Otherwise, if we haven't reached max capacity, spawn a new actor.
    else if (AllActors.Num() < MaxPoolSize)
    {
        if (PooledActorClass)
        {
            FActorSpawnParameters SpawnParams;
            SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
            
            Actor = World->SpawnActor<AActor>(PooledActorClass, ActorOffset.GetTranslation(), ActorOffset.GetRotation().Rotator(), SpawnParams);
            if (Actor)
            {
                AllActors.Add(Actor);
            }
            else
            {
                UE_LOG(LogTemp, Warning, TEXT("RequestActor: Actor spawn failed for %s."), *PooledActorClass->GetName());
                return nullptr;
            }
        }
        else
        {
            UE_LOG(LogTemp, Warning, TEXT("RequestActor: PooledActorClass is not set."));
            return nullptr;
        }
    }
    else
    {
        //This will happen often, ignore this
        //UE_LOG(LogTemp, Warning, TEXT("RequestActor: Pool is exhausted."));
        return nullptr;
    }

    if (Actor && UniqueId != -1)
    {
        InUseActors.Add(UniqueId, Actor);
        ActorToUniqueId.Add(Actor, UniqueId);
    }

    if (bDeactivateOnSwap)
    {
        ActivateActor(Actor);
    }

    return Actor;
}

void FActorSwapPool::ReleaseActor(AActor* Actor)
{
    if (!Actor)
    {
        UE_LOG(LogTemp, Warning, TEXT("ReleaseActor: Null actor provided."));
        return;
    }

    // Remove the actor from in-use mappings if it was assigned a unique ID.
    if (ActorToUniqueId.Contains(Actor))
    {
        int32 UniqueId = ActorToUniqueId[Actor];
        InUseActors.Remove(UniqueId);
        ActorToUniqueId.Remove(Actor);
    }

    if (bDeactivateOnSwap)
    {
        DeactivateActor(Actor);
    }

    // Add the actor back to the available pool (if it isn’t already there).
    if (!AvailableActors.Contains(Actor))
    {
        AvailableActors.Add(Actor);
    }

    if (bAutoShrinkSlackSize > 0 && AvailableActors.Num() > bAutoShrinkSlackSize)
    {
        ShrinkPoolToFit();
    }
}

AActor* FActorSwapPool::LookupActor(int32 UniqueId)
{
    if (AActor* const* FoundActor = InUseActors.Find(UniqueId))
    {
        return *FoundActor;
    }
    return nullptr;
}

void FActorSwapPool::ShrinkPoolToFit()
{
    for (AActor* AvailableActor : AvailableActors)
    {
        AvailableActor->Destroy();

        AllActors.Remove(AvailableActor);   //linear search, but for small sizes this is ok.
    }

    AvailableActors.Empty();
}

void FActorSwapPool::DeactivateActor(AActor* Actor)
{
    // Disable collision
    Actor->SetActorEnableCollision(false);

    // Stop movement if it has a movement component
    if (UActorComponent* MovementComp = Actor->FindComponentByClass<UMovementComponent>())
    {
        MovementComp->Deactivate();
    }

    Actor->SetActorHiddenInGame(true);

    Actor->SetActorTickEnabled(false);

    //Actor->SetActorLocation(OutOfWorldLocation);
}

void FActorSwapPool::ActivateActor(AActor* Actor)
{
    // Enable collision
    Actor->SetActorEnableCollision(true);

    // Re-enable movement if it has a movement component
    if (UActorComponent* MovementComp = Actor->FindComponentByClass<UMovementComponent>())
    {
        MovementComp->Activate();
    }

    Actor->SetActorHiddenInGame(false);

    Actor->SetActorTickEnabled(true);
}

FTransform FActorSwapPool::ToActorTransform(const FTransform& ISMTransform)
{
    return ActorOffset * ISMTransform;
}

FTransform FActorSwapPool::ToIsmTransform(const FTransform& ActorTransform)
{
    return ActorOffset.Inverse() * ActorTransform;
}
