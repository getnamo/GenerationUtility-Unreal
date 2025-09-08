#include "EntityPlanningSystem.h"
#include "CUFileSubsystem.h"
#include "CUBlueprintLibrary.h"
#include "InstancedStruct.h"
#include "SIOJConvert.h"
#include "EntitySpawningManagerActor.h"

//Plan handler
UEntityPlanTrack::UEntityPlanTrack()
{
    SetDefaultProcessor(NewObject<UPlanProcessor>(this, TEXT("DefaultProcessor")));
    DefaultPlanProcessor->Track = this;
    CacheSettings.FileType = TEXT(".json");
}

void UEntityPlanTrack::SetPlanForEntity(const FEntityPlan& Plan, int32 EntityId)
{
    TrackData.PlanMap.Add(EntityId, Plan);
}

FEntityPlan& UEntityPlanTrack::PlanForEntity(int32 EntityId)
{
    if (!TrackData.PlanMap.Contains(EntityId))
    {
        //Initialize a new plan if this entity doesn't have one
        FEntityPlan Plan;
        TrackData.PlanMap.Add(EntityId, Plan);
    }

    return TrackData.PlanMap[EntityId];
}

bool UEntityPlanTrack::EntityHasPlan(int32 EntityId)
{
    return TrackData.PlanMap.Contains(EntityId);
}

bool UEntityPlanTrack::InstancedActionForEntity(FInstancedAction& Action, int32 EntityId)
{
    if (!TrackData.PlanMap.Contains(EntityId))
    {
        return false;
    }
    FEntityPlan& Plan = TrackData.PlanMap[EntityId];
    if (Plan.Actions.IsValidIndex(Plan.ActionIndex))
    {
        const FInstancedStruct& WrappedAction = Plan.Actions[Plan.ActionIndex];
        const FInstancedAction* ActionPtr = WrappedAction.GetPtr<FInstancedAction>();

        if (ActionPtr)
        {
            Action = *ActionPtr;
            return true;
        }
        else
        {
            return false;
        }
    }
    return false;
}


FString UEntityPlanTrack::CurrentActionTypeForEntity(int32 EntityId)
{
    if (!TrackData.PlanMap.Contains(EntityId))
    {
        return TEXT("Not Found");
    }
    FEntityPlan& Plan = TrackData.PlanMap[EntityId];

    if (Plan.Actions.IsValidIndex(Plan.ActionIndex))
    {
        const FInstancedStruct& WrappedAction = Plan.Actions[Plan.ActionIndex];
        const FEntityBaseAction* ActionPtr = WrappedAction.GetPtr<FEntityBaseAction>();

        if (ActionPtr)
        {
            return ActionPtr->Type;
        }
        else
        {
            return TEXT("Invalid Action");
        }
    }
    return TEXT("Idle");
}

void UEntityPlanTrack::ClearPlanForEntity(int32 EntityId)
{
    TrackData.PlanMap.Remove(EntityId);
}

FString UEntityPlanTrack::PlanDescriptionForEntity(int32 EntityId)
{
    if (!TrackData.PlanMap.Contains(EntityId))
    {
        return FString::Printf(TEXT("No plan found for entity %d."), EntityId);
    }
    FEntityPlan& Plan = TrackData.PlanMap[EntityId];
    FString CompactString;
    for (FInstancedStruct& ActionInstanced : Plan.Actions)
    {
        const FEntityBaseAction* Action = ActionInstanced.GetPtr<FEntityBaseAction>();
        CompactString += TEXT("\n") + Action->Description();
    }
    return CompactString;
}

void UEntityPlanTrack::ClearPlanForAllEntities()
{
    //Fully empty the map
    TrackData.PlanMap.Empty();
}

UPlanProcessor* UEntityPlanTrack::GetProcessorForEntity(int32 EntityId)
{
    if (UniquePlanners.Contains(EntityId))
    {
        return UniquePlanners[EntityId];
    }
    else
    {
        return DefaultPlanProcessor;
    }
}

void UEntityPlanTrack::SetDefaultProcessor(UPlanProcessor* Processor)
{
    DefaultPlanProcessor = Processor;
}

void UEntityPlanTrack::SaveTrackToFile(const FString& FileName, bool bIsFullPath)
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

    //Serialize into bytes
    TArray<uint8> Bytes;

    if (bIsBinaryType)
    {
        UCUBlueprintLibrary::SerializeStruct(FEntityMapTrackData::StaticStruct(), &TrackData, Bytes);
    }
    else
    {
        USIOJConvert::StructToBytes(FEntityMapTrackData::StaticStruct(), &TrackData, Bytes);
    }

    //Save bytes to file
    CUSystem->SaveBytesToPath(Bytes, FullPath, false);
}

void UEntityPlanTrack::LoadTrackFromFile(const FString& FileName, bool bIsFullPath)
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

    if (bIsBinaryType)
    {

        UCUBlueprintLibrary::DeserializeStruct(FEntityMapTrackData::StaticStruct(), &TrackData, Bytes);
    }
    else
    {
        USIOJConvert::BytesToStruct(Bytes, FEntityMapTrackData::StaticStruct(), &TrackData);
    }
}

void UEntityPlanTrack::CacheCurrentEntityPositions(UStaticMesh* ForKey)
{
    //Cache our current position is we have a valid esm link
    if (Esm.IsValid())
    {
        TArray<int32> Keys;
        TrackData.PlanMap.GetKeys(Keys);

        //For each entity plan in this track
        for (int32 Key : Keys)
        {
            //Caching for key must be generalized
            //TrackData.PlanMap[Key].MeshKey = ForKey;

            //Meshkey might be null so this might fail if not set
            UInstancedStaticMeshComponent* ISMComponent = Esm->DynamicInstanceComponentForMesh(ForKey);

            if (ISMComponent)
            {
                FTransform CurrentTransform;
                ISMComponent->GetInstanceTransform(Key, CurrentTransform);

                TrackData.PlanMap[Key].LastTransform = CurrentTransform;
            }
        }
    }
}

void UEntityPlanTrack::LoadCurrentEntityPositions(UStaticMesh* ForKey)
{

    //Get owning esm
    if (Esm.IsValid())
    {
        TArray<int32> Keys;
        TrackData.PlanMap.GetKeys(Keys);

        for (int32 Key : Keys)
        {
            //Grab last transform
            const FTransform& NewTransform = TrackData.PlanMap[Key].LastTransform;

            //feed the positions back into the keyed esm instances
            Esm->SetISMTransformForIndex(ForKey, NewTransform, Key);
        }

    }    
}

void UEntityPlanTrack::SetESMLink(AEntitySpawningManagerActor* Manager)
{
    Esm = Manager;
}


//planning system
UEntityPlanningSystem::UEntityPlanningSystem()
{
    //Start with the default tracks
    AddDefaultTracks();
}

UEntityPlanTrack* UEntityPlanningSystem::GetScheduleTrack()
{
    return Tracks[TEXT("Schedule")];
}

UEntityPlanTrack* UEntityPlanningSystem::GetTacticsTrack()
{
    return Tracks[TEXT("Tactics")];
}

UEntityPlanTrack* UEntityPlanningSystem::GetSurvivalTrack()
{
    return Tracks[TEXT("Survival")];
}

void UEntityPlanningSystem::AddPlanningTrack(const FString& TrackName, UEntityPlanTrack* NewTrack)
{
    Tracks.Add(TrackName, NewTrack);
}

void UEntityPlanningSystem::DeleteAllTracks()
{
    Tracks.Empty();
}

void UEntityPlanningSystem::ClearPlansForAllTracksForEntity(int32 EntityId)
{
    for (auto& TrackPair : Tracks)
    {
        UEntityPlanTrack* Track = TrackPair.Value;
        Track->ClearPlanForEntity(EntityId);
    }
}

void UEntityPlanningSystem::ClearAllPlansForEveryone()
{
    for (auto& TrackPair : Tracks)
    {
        UEntityPlanTrack* Track = TrackPair.Value;
        Track->ClearPlanForAllEntities();
    }
}

void UEntityPlanningSystem::AddDefaultTracks()
{
    UEntityPlanTrack* TrackT0 = NewObject<UEntityPlanTrack>(UEntityPlanTrack::StaticClass(), TEXT("SurvivalPrimalT0"));
    TrackT0->TrackName = TEXT("Survival");
    Tracks.Add(TrackT0->TrackName, TrackT0);

    UEntityPlanTrack* TrackT1 = NewObject<UEntityPlanTrack>(UEntityPlanTrack::StaticClass(), TEXT("TacticsT1"));
    TrackT1->TrackName = TEXT("Tactics");
    Tracks.Add(TrackT1->TrackName, TrackT1);

    UEntityPlanTrack* TrackT2 = NewObject<UEntityPlanTrack>(UEntityPlanTrack::StaticClass(), TEXT("ScheduleT2"));
    TrackT2->TrackName = TEXT("Schedule");
    Tracks.Add(TrackT2->TrackName, TrackT2);
}

void UPlanProcessor::ClearCallbacks()
{
    OnNextAction.Clear();
    OnActionCancelled.Clear();
}

void UPlanProcessor::ProcessPendingEntities(TArray<int32> IdsNeedingProcessing)
{
    for (int32 EntityId : IdsNeedingProcessing)
    {
        ProcessNextActionForEntity(EntityId);
    }
}

void UPlanProcessor::ProcessNextActionForEntity(int32 EntityId)
{
    if (bAutoCompleteActions)
    {
        ActionFinished(EntityId);
    }

    FEntityPlan& Plan = Track->PlanForEntity(EntityId);
    bool bIsValidNext = UEntityPlanConstructor::IncrementActionIndex(Plan);
    if (bIsValidNext)
    {
        FInstancedStruct Action;
        UEntityPlanConstructor::ActivatePlan(Plan);
        if (UEntityPlanConstructor::CurrentAction(Plan, Action))
        {
            OnNextAction.Broadcast(Action, EntityId);
        }
    }
}

void UPlanProcessor::ResumePlanForEntity(int32 EntityId)
{
    FEntityPlan& Plan = Track->PlanForEntity(EntityId);

    //Grab current action if valid
    FInstancedStruct Action;
    if (UEntityPlanConstructor::CurrentAction(Plan, Action))
    {
        UEntityPlanConstructor::ActivatePlan(Plan);
        OnNextAction.Broadcast(Action, EntityId);
    }
}

void UPlanProcessor::PausePlanForEntity(int32 EntityId)
{
    FEntityPlan& Plan = Track->PlanForEntity(EntityId);

    UEntityPlanConstructor::PausePlan(Plan);
}

void UPlanProcessor::ActionFinished(int32 EntityId)
{
    FEntityPlan& Plan = Track->PlanForEntity(EntityId);
    Plan.bActionIsBeingProcessed = false;
}

FInstancedAction UEntityPlanConstructor::InstancedActionFromWrapper(const FInstancedStruct& Wrapper)
{
    FInstancedAction Action;

    const FInstancedAction* ActionPtr = Wrapper.GetPtr<FInstancedAction>();

    if (ActionPtr)
    {
        Action = *ActionPtr;
    }
    return Action;
}

FInstancedStruct UEntityPlanConstructor::WrapperFromInstancedAction(const FInstancedAction& Action)
{
    FInstancedStruct Struct;
    Struct.InitializeAs<FInstancedAction>(Action);

    return Struct;
}

void UEntityPlanConstructor::AddAction(FEntityPlan& Plan, const FInstancedStruct& Action)
{
    Plan.Actions.Add(Action);
}

void UEntityPlanConstructor::InsertActionAtIndex(FEntityPlan& Plan, const FInstancedStruct& Action, int32 Index)
{
    Plan.Actions.Insert(Action, Index);
}

void UEntityPlanConstructor::AddInstanceAction(FEntityPlan& Plan, const FInstancedAction& Action)
{
    UEntityPlanConstructor::AddAction(Plan, UEntityPlanConstructor::WrapperFromInstancedAction(Action));
}

void UEntityPlanConstructor::RemoveActionAtIndex(FEntityPlan& Plan, int32 ActionIndex)
{
    Plan.Actions.RemoveAt(ActionIndex);
}

void UEntityPlanConstructor::ClearPlan(FEntityPlan& Plan)
{
    Plan.Actions.Empty();
}

bool UEntityPlanConstructor::IncrementActionIndex(FEntityPlan& Plan)
{   
    int32 NewIndex = NextActionIndex(Plan);

    Plan.ActionIndex = NewIndex;
    int32 Max = Plan.Actions.Num();

    //Complete non-looping plans on increment
    if (NewIndex == 0 && !Plan.bShouldLoop)
    {
        Plan.bDidComplete = true;
        Plan.bIsActive = false;
        return false;
    }
    return true;
}

int32 UEntityPlanConstructor::NextActionIndex(FEntityPlan& Plan)
{
    int32 NextIndex = Plan.ActionIndex + 1;

    if (NextIndex >= Plan.Actions.Num())
    {
        NextIndex = 0;
    }
    return NextIndex;
}

bool UEntityPlanConstructor::CurrentAction(FEntityPlan& Plan, FInstancedStruct& OutAction)
{
    if (Plan.Actions.IsValidIndex(Plan.ActionIndex))
    {
        OutAction = Plan.Actions[Plan.ActionIndex];
        return true;
    }
    return false;
}

void UEntityPlanConstructor::ActivatePlan(FEntityPlan& Plan)
{
    Plan.bIsActive = true;
    Plan.bActionIsBeingProcessed = true;
}

void UEntityPlanConstructor::PausePlan(FEntityPlan& Plan)
{
    Plan.bIsActive = false;
    Plan.bActionIsBeingProcessed = false;
}

FString UEntityPlanConstructor::CompactDescription(FEntityPlan& Plan)
{
    FString CompactString;
    for (FInstancedStruct& ActionInstanced : Plan.Actions)
    {
        const FEntityBaseAction* Action = ActionInstanced.GetPtr<FEntityBaseAction>();
        CompactString += TEXT("\n") + Action->Description();
    }
    return CompactString;
}

bool UEntityPlanConstructor::SetActionIndex(FEntityPlan& Plan, int32 NewIndex)
{    
    if (Plan.Actions.IsValidIndex(NewIndex))
    {
        PausePlan(Plan);
        Plan.ActionIndex = NewIndex;
        return true;
    }
    else
    {
        return false;
    }
}

bool UEntityPlanConstructor::IsBusyWithAction(FEntityPlan& Plan)
{
    return Plan.bActionIsBeingProcessed;
}

void UEntityPlanConstructor::ClearFutureActions(FEntityPlan& Plan)
{
    //Grab the currently active action if valid
    if (Plan.Actions.IsValidIndex(Plan.ActionIndex))
    {
        //Copy Action to temp
        FInstancedStruct Action = Plan.Actions[Plan.ActionIndex];

        //Clear all actions
        Plan.Actions.Empty();

        //Copy back and set as 0
        Plan.Actions.Add(Action);
        Plan.ActionIndex = 0;
    }
    else
    {
        //Current action wasn't valid, clear the schedule, but don't delete it
        Plan.Actions.Empty();
        Plan.ActionIndex = 0;
    }
}

FString UEntityPlanConstructor::CurrentActionType(FEntityPlan& Plan)
{
    FInstancedStruct Action;
    if (CurrentAction(Plan, Action))
    {
        if (Plan.Actions.IsValidIndex(Plan.ActionIndex))
        {
            const FInstancedStruct& WrappedAction = Plan.Actions[Plan.ActionIndex];

            //Cast to base action specifically
            const FEntityBaseAction* ActionPtr = WrappedAction.GetPtr<FEntityBaseAction>();

            if (ActionPtr)
            {
                return ActionPtr->Type;
            }
            else
            {
                return TEXT("Invalid Action Type");
            }
        }
    }
    return TEXT("Idle");
}
