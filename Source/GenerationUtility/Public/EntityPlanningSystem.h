#pragma once

#include "CoreMinimal.h"
#include "GUDataTypes.h"
#include "EntityPlanningSystem.generated.h"


class AEntitySpawningManagerActor;
class UEntityPlanTrack;


DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FPlanActionSignature, const FInstancedStruct&, InstancedAction, int32, EntityId);


/**
 * Function wrapper for handling processing for plans, can be sub-classed in js
 */
UCLASS(Blueprintable)
class GENERATIONUTILITY_API UPlanProcessor : public UObject
{
    GENERATED_BODY()

public:

    UPROPERTY(BlueprintAssignable, Category = "EntityPlanHandler Events")
    FPlanActionSignature OnNextAction;

    UPROPERTY(BlueprintAssignable, Category = "EntityPlanHandler Events")
    FPlanActionSignature OnActionCancelled;

    //workaround for js<->multicast delegate work
    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")
    void ClearCallbacks();

    //These get called by external processes
    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")
    void ProcessPendingEntities(TArray<int32> IdsNeedingProcessing);

    //Usually called by ProcessPendingEntities, but can be called separately externally
    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")
    void ProcessNextActionForEntity(int32 EntityId);

    //If current action is paused it will resume it (or replay the current action
    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")
    void ResumePlanForEntity(int32 EntityId);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")
    void PausePlanForEntity(int32 EntityId);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Functions")

    void ActionFinished(int32 EntityId);

    UPROPERTY(BlueprintReadWrite, Category = "EntityPlanHandler Properties")
    UEntityPlanTrack* Track;

    UPROPERTY(BlueprintReadWrite, Category = "EntityPlanHandler Properties")
    bool bAutoCompleteActions = true;
};

/**
 * Handle interfacing with FEntityPlan data type via static methods
 */
UCLASS(Blueprintable, BlueprintType)
class GENERATIONUTILITY_API UEntityPlanConstructor : public UObject
{
    GENERATED_BODY()

public:

    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Utility")
    static FInstancedAction InstancedActionFromWrapper(const FInstancedStruct& Wrapper);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanHandler Utility")
    static FInstancedStruct WrapperFromInstancedAction(const FInstancedAction& Action);

    //Add Variants
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void AddAction(FEntityPlan& Plan, const FInstancedStruct& Action);

    //Insert and grow
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void InsertActionAtIndex(FEntityPlan& Plan, const FInstancedStruct& Action, int32 Index = 0);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void AddInstanceAction(FEntityPlan& Plan, const FInstancedAction& Action);

    //Remove and shrink
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void RemoveActionAtIndex(FEntityPlan& Plan, int32 ActionIndex);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void ClearPlan(FEntityPlan& Plan);


    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static bool IncrementActionIndex(FEntityPlan& Plan);

    //Query Test
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static int32 NextActionIndex(FEntityPlan& Plan);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static bool CurrentAction(FEntityPlan& Plan, FInstancedStruct& OutAction);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void ActivatePlan(FEntityPlan& Plan);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void PausePlan(FEntityPlan& Plan);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static FString CompactDescription(FEntityPlan& Plan);

    //successfully setting the new index will stop the current plan, call activate restart
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static bool SetActionIndex(FEntityPlan& Plan, int32 NewIndex);

    //lame wrapper but useful for naming redirect
    UFUNCTION(BlueprintPure, Category = "EntityPlanConstructor Functions")
    static bool IsBusyWithAction(FEntityPlan& Plan);

    //keeps current action, clears all future actions
    UFUNCTION(BlueprintCallable, Category = "EntityPlanConstructor Functions")
    static void ClearFutureActions(FEntityPlan& Plan);

    static FString CurrentActionType(FEntityPlan& Plan);
};

/**
 * Handle interfacing with FEntityPlan data types for all entities (not per entity)
 */
UCLASS(Blueprintable, BlueprintType)
class GENERATIONUTILITY_API UEntityPlanTrack: public UObject
{
    GENERATED_BODY()

public:
    // Constructor
    UEntityPlanTrack();

    UPROPERTY(BlueprintReadWrite, Category = "EntityPlanTrack Properties")
    FString TrackName = TEXT("Unknown");

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void SetPlanForEntity(const FEntityPlan& Plan, int32 EntityId);

    
    //Use this function to deal with actual plans
    //This will always fill a plan out (lazy construction)
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    FEntityPlan& PlanForEntity(int32 EntityId);

    //early out test
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    bool EntityHasPlan(int32 EntityId);

    //quick access
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    bool InstancedActionForEntity(FInstancedAction& Action, int32 EntityId);

    //This is kept for efficient checks in js
    UFUNCTION(BlueprintPure, Category = "EntityPlanHandler Functions")
    FString CurrentActionTypeForEntity(int32 EntityId);

    //A clear schedule means no schedule, so we delete the schedule
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void ClearPlanForEntity(int32 EntityId);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    FString PlanDescriptionForEntity(int32 EntityId);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void ClearPlanForAllEntities();

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    UPlanProcessor* GetProcessorForEntity(int32 EntityId);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void SetDefaultProcessor(UPlanProcessor* Processor);


    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void SaveTrackToFile(const FString& FileName, bool bIsFullPath = false);

    //If not full path, path is determined by settings
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void LoadTrackFromFile(const FString& FileName, bool bIsFullPath = false);


    //Todo: implement position caching
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void CacheCurrentEntityPositions(UStaticMesh* ForKey);

    //Todo: implement position caching
    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void LoadCurrentEntityPositions(UStaticMesh* ForKey);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanTrack Functions")
    void SetESMLink(AEntitySpawningManagerActor* Manager);


    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "EntityPlanTrack Properties")
    FPGCacheSettings CacheSettings;

protected:

    //Current action map, use functions to modify
    UPROPERTY()
    FEntityMapTrackData TrackData;

    //Only some entities might have a different plan handler, most will use the default one
    UPROPERTY()
    TMap<int32, UPlanProcessor*> UniquePlanners;

    UPROPERTY()
    UPlanProcessor* DefaultPlanProcessor;

    UPROPERTY()
    TWeakObjectPtr<AEntitySpawningManagerActor> Esm;
};


UCLASS(Blueprintable, BlueprintType)
class GENERATIONUTILITY_API UEntityPlanningSystem : public UObject
{
    GENERATED_BODY()

    UEntityPlanningSystem();

    //T2 - Main Schedule Habits/etc
    UFUNCTION(BlueprintPure, Category = "EntityPlanningSystem Functions")
    UEntityPlanTrack* GetScheduleTrack();

    //T1 - Tactics, combat etc
    UFUNCTION(BlueprintPure, Category = "EntityPlanningSystem Functions")
    UEntityPlanTrack* GetTacticsTrack();

    //T0 - Primal needs: Food, Sleep, Shelter, Socialization
    UFUNCTION(BlueprintPure, Category = "EntityPlanningSystem Functions")
    UEntityPlanTrack* GetSurvivalTrack();

    UFUNCTION(BlueprintCallable, Category = "EntityPlanningSystem Functions")
    void AddPlanningTrack(const FString& TrackName, UEntityPlanTrack* NewTrack);

    UFUNCTION(BlueprintCallable, Category = "EntityPlanningSystem Functions")
    void DeleteAllTracks();

    //Per entity cleaning of all track info
    UFUNCTION(BlueprintCallable, Category = "EntityPlanningSystem Functions")
    void ClearPlansForAllTracksForEntity(int32 EntityId);

    //Potentially dangerous, but guarantees all entities have no plans
    UFUNCTION(BlueprintCallable, Category = "EntityPlanningSystem Functions")
    void ClearAllPlansForEveryone();

    //Survival, Tactics, Schedule (Baseline)
    UFUNCTION(BlueprintCallable, Category = "EntityPlanningSystem Functions")
    void AddDefaultTracks();

protected:

    //Planning tracks, independent task systems

    UPROPERTY()
    TMap<FString, UEntityPlanTrack*> Tracks;
};