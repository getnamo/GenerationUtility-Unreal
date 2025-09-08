#include "ProcGeneratorChain.h"
#include "GESDataTypes.h"
#include "GlobalEventSystemBPLibrary.h"


FPGChainState::FPGChainState()
{
	NextChain = nullptr;
	PreviousChain = nullptr;
	Status = EPGChainStatus::Idle;
	StatusMessage = TEXT("None.");
	SubChainProcessingIndex = 0;
	bParallelProcessSubchains = false;
	bOutputDebugFlowLog = false;
}


UProcGeneratorChain::UProcGeneratorChain()
{
	ContextData = CreateDefaultSubobject<UPGContextDataObject>(TEXT("ContextData"));
	ChainState.Status = EPGChainStatus::Idle;
	RemoveAllSubchains();
	bShouldLatentStillRun = false;
}

void UProcGeneratorChain::OnPreProcessChain_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Warning, TEXT("Empty OnPreProcessChain_Implementation for %s"), *this->GetDesc());
}

void UProcGeneratorChain::OnPostProcessChain_Implementation(UPGContextDataObject* Data)
{

}

void UProcGeneratorChain::OnChainFinished_Implementation(UPGContextDataObject* Data)
{

}

void UProcGeneratorChain::OnCleanupRequest_Implementation(UPGContextDataObject* Data)
{

}

void UProcGeneratorChain::OnRequestedChainFound_Implementation(UProcGeneratorChain* RequestedChain, const FString& RequestContext)
{

}

void UProcGeneratorChain::LinkNextChain(UProcGeneratorChain* NextChainLink)
{
	ChainState.NextChain = NextChainLink;
	ChainState.NextChain->ChainState.PreviousChain = this;
}

void UProcGeneratorChain::AddSubchain(UProcGeneratorChain* SubChain, int32 AtIndex /*= -1*/)
{
	SubChain->ChainState.ParentChain = this;

	if (AtIndex == -1)
	{
		ChainState.SubChains.Add(SubChain);
	}
	else
	{
		ChainState.SubChains.Insert(SubChain, AtIndex);
	}
}

void UProcGeneratorChain::RemoveSubchain(UProcGeneratorChain* SubChain)
{
	ChainState.SubChains.Remove(SubChain);
}

void UProcGeneratorChain::RemoveSubchainAtIndex(int32 Index)
{
	ChainState.SubChains.RemoveAt(Index);
}

void UProcGeneratorChain::RemoveAllSubchains()
{
	for (UProcGeneratorChain* Chain : ChainState.SubChains)
	{
		Chain->OnCleanupRequest(ContextData);
	}
	ChainState.SubChains.Empty();
}

bool UProcGeneratorChain::StartChainProcess(UPGContextDataObject* InOutContextData)
{
	bShouldLatentStillRun = true;
	
	//Copy context data state
	ContextData = InOutContextData;

	//Latent resume
	if (ChainState.Status == EPGChainStatus::ResumeLatent)
	{
		//Latent resume branch

		//We can't resume back to 'pre' state so log warning, but fix it and re-loop.
		if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingPre) 
		{
			//Catch wrong state and re-loop with proper state
			UE_LOG(LogTemp, Warning, TEXT("UProcGeneratorChain::StartChainProcess Shouldn't be possible to resume in Pre state. Check logic"));

			//Update status to the next as latent resume
			ChainState.LastLatentStatus = EPGChainStatus::ProcessingSubChains;
			ChainState.SubChainProcessingIndex = 0;
			return StartChainProcess(InOutContextData);
		}
		//resumed either from pre or a latent subchain
		else if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingSubChains)
		{
			//Sequential case, parallel should fall straight through
			if (!ChainState.bParallelProcessSubchains)
			{
				//resume from last index. NB overflow index will resume instantly
				UpdateStatus(EPGChainStatus::ProcessingSubChains);
				bool bValidInstantResponse = ProcessSubChains(ChainState.SubChainProcessingIndex);

				//We could have another latent subchain. Exit and wait again.
				if (!bValidInstantResponse)
				{
					return false;
				}
			}

			//if we have a valid response (might be index overflow or instant subchain), move on to post
			UpdateStatus(EPGChainStatus::ResumeLatent);
			ChainState.LastLatentStatus = EPGChainStatus::ProcessingPost;
			return StartChainProcess(InOutContextData);
		}
		//resumed from last
		else if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingPost)
		{
			UpdateStatus(EPGChainStatus::ProcessingPost);

			//Any processing after sub-chains
			OnPostProcessChain(InOutContextData);
			OnPostProcessChainEvent.ExecuteIfBound(InOutContextData);

			//Both cases are just false returns
			if (ChainState.Status == EPGChainStatus::LatentResponse)
			{
				return false;
			}

			//Same caveat as pre error check. Potential bug if both are latent and overwritten.
			if (IsStatusError())
			{
				return false;
			}

			//Fall through to finish
		}

		//Anything that makes it here is now finishing the chain and will fall through
		UpdateStatus(EPGChainStatus::Finishing);
	}
	else if (ChainState.Status == EPGChainStatus::Done || 
		ChainState.Status == EPGChainStatus::Idle)
	{
		//Instant/Fresh start branch
		
		//PRE PROCESS
		UpdateStatus(EPGChainStatus::ProcessingPre);

		//Any processing before chains
		OnPreProcessChain(InOutContextData);
		OnPreProcessChainEvent.ExecuteIfBound(InOutContextData);
		//OnPreProcessTest.ExecuteIfBound(InOutContextData);

		//Check latent callback/resume. 
		//!NB: either of these could be latent, but we assume only
		//one is used as they are not typically both overwritten; 
		//potential bug if both actually are.
		if (ChainState.Status == EPGChainStatus::LatentResponse)
		{
			return false;
		}

		if (IsStatusError())
		{
			return false;
		}

		UpdateStatus(EPGChainStatus::ProcessingSubChains);
		
		//SUBCHAIN
		bool bValidInstantResponse = ProcessSubChains(0);

		//Either error or latent, in both cases exit out and wait for latent resume or error handling
		if (!bValidInstantResponse)
		{
			return false;
		}

		//POST

		UpdateStatus(EPGChainStatus::ProcessingPost);

		//Any processing after sub-chains
		OnPostProcessChain(InOutContextData);
		OnPostProcessChainEvent.ExecuteIfBound(InOutContextData);

		//Both cases are just false returns
		if (ChainState.Status == EPGChainStatus::LatentResponse)
		{
			return false;
		}

		//Same caveat as pre error check. Potential bug if both are latent and overwritten.
		if (IsStatusError())
		{
			return false;
		}

		UpdateStatus(EPGChainStatus::Finishing);
	}
	else
	{
		FString ErrorMessage = TEXT("Entered fresh chain with invalid status %d");
		UE_LOG(LogTemp, Error, TEXT("Entered fresh chain with invalid status %d"), ChainState.Status);
		ThrowError(ErrorMessage);
		return false;
	}

	bShouldLatentStillRun = false;

	//In both cases we finish the same unless we've exited early. Latent is not allowed in Finished callback.
	OnChainFinished(InOutContextData);
	OnChainFinishedEvent.ExecuteIfBound(InOutContextData);

	UpdateStatus(EPGChainStatus::Done);

	if (IsStatusError())
	{
		return false;
	}

	//Forward to any linked chain
	ProcessNextChain();

	return true;
}

void UProcGeneratorChain::ResumeChainFromLatentResult()
{
	UpdateStatus(EPGChainStatus::ResumeLatent);

	//Advance our processing state for latent resume
	if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingPre)
	{
		ChainState.LastLatentStatus = EPGChainStatus::ProcessingSubChains;
		ChainState.SubChainProcessingIndex = 0;
	}
	else if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingSubChains)
	{
		//We should go to the next subchain index before resuming
		ChainState.SubChainProcessingIndex++;

		//broadcast progress update only if we don't have overflow index
		if (ChainState.SubChainProcessingIndex <= ChainState.SubChains.Num())
		{
			OnSubChainProgress.Broadcast(ChainState.SubChainProcessingIndex, ChainState.SubChains.Num());
		}
		//NB: index overflow is handled in the chain process and will auto-advance
	}
	else if (ChainState.LastLatentStatus == EPGChainStatus::ProcessingPost)
	{
		//This state is only relevant for latent resume
		ChainState.LastLatentStatus = EPGChainStatus::Finishing;
	}

	StartChainProcessWithCurrentData();	
}

void UProcGeneratorChain::WaitForLatentResponse()
{
	UpdateStatus(EPGChainStatus::LatentResponse);
}

bool UProcGeneratorChain::IsStatusLatent()
{
	return (ChainState.Status == EPGChainStatus::LatentResponse);
}

bool UProcGeneratorChain::StartChainProcessWithCurrentData()
{
	return StartChainProcess(ContextData);
}

void UProcGeneratorChain::RequestJsChainByName(const FString& Name)
{
	RequestJsChainByNameLambdaCallback(Name, [this, Name](UProcGeneratorChain* ValidChain)
	{
		OnRequestedChainFound(ValidChain, Name);
		OnRequestedChainFoundEvent.ExecuteIfBound(ValidChain, Name);
	});
}


void UProcGeneratorChain::ThrowError(const FString& ErrorMessage)
{
	bShouldLatentStillRun = false;
	ChainState.StatusMessage = ErrorMessage;
	UpdateStatus(EPGChainStatus::ErrorCurrentChain);
	
	if (ChainState.bOutputDebugFlowLog)
	{
		UE_LOG(LogTemp, Error, TEXT("Flow Error: %s"), *ErrorMessage);
	}
}

void UProcGeneratorChain::StopLatentAction()
{
	UpdateStatus(EPGChainStatus::Done);
	bShouldLatentStillRun = false;

	for (UProcGeneratorChain* Chain : ChainState.SubChains)
	{
		Chain->StopLatentAction();
	}

	//Block wait for latent acknowledgment
}

bool UProcGeneratorChain::IsStatusError()
{
	return (ChainState.Status == EPGChainStatus::ErrorCurrentChain ||
		ChainState.Status == EPGChainStatus::ErrorSubchain);
}

void UProcGeneratorChain::SetStringValue(UPGContextDataObject* Data, const FString& Key, const FString& Value)
{
	Data->Context.StringMap.Add(Key, Value);
}

void UProcGeneratorChain::SetObjectValue(UPGContextDataObject* Data, const FString& Key, UObject* Value)
{
	Data->Context.ObjectMap.Add(Key, Value);
}

void UProcGeneratorChain::SetActorValue(UPGContextDataObject* Data, const FString& Key, AActor* Value)
{
	Data->Context.ActorMap.Add(Key, Value);
}

void UProcGeneratorChain::RequestJsChainByNameLambdaCallback(const FString& Name, TFunction<void(UProcGeneratorChain*)> ReceivingLambda)
{
	FGESEventContext ReplyContext;
	ReplyContext.Domain = TEXT("WaywardProcedural");
	ReplyContext.Event = TEXT("RequestJsCallback"); //unique id? shouldn't need it should call back on same thread immediately
	ReplyContext.WorldContext = this;

	FString Id = FGESHandler::DefaultHandler()->AddLambdaListener(ReplyContext, [this, Name, ReceivingLambda](UObject* FoundChain)
	{
		UE_LOG(LogTemp, Log, TEXT("Received %s"), *Name);

		UProcGeneratorChain* ValidChain = Cast<UProcGeneratorChain>(FoundChain);
		if (ValidChain)
		{
			UE_LOG(LogTemp, Log, TEXT("Valid Chain %s"), *Name);

			if (ReceivingLambda)
			{
				UE_LOG(LogTemp, Log, TEXT("Calling Lambda with chain %s"), *Name);
				ReceivingLambda(ValidChain);
			}
		}
	});

	FGESEmitContext EmitContext;
	EmitContext.Domain = ReplyContext.Domain;
	EmitContext.Event = TEXT("RequestJsChainByName");
	EmitContext.WorldContext = this;

	FGESHandler::DefaultHandler()->EmitEvent(EmitContext, Name);

	FGESHandler::DefaultHandler()->RemoveLambdaListener(ReplyContext, Id);
}

void UProcGeneratorChain::SendIntermediateResult(UPGContextDataObject* Data, const FString& ContextMessage)
{
	//Notify self
	OnIntermediateResult.Broadcast(Data, ContextMessage, this);

	//Notify next
	if (ChainState.NextChain)
	{
		ChainState.NextChain->OnIntermediateResult.Broadcast(Data, ContextMessage, this);
	}

	//Notify parent
	if (ChainState.ParentChain)
	{
		ChainState.ParentChain->OnIntermediateResult.Broadcast(Data, ContextMessage, this);
	}
}

//Protected
bool UProcGeneratorChain::ProcessSubChains(int32 StartIndex /*=0*/)
{
	//Reset subchain tracking index
	ChainState.SubChainProcessingIndex = StartIndex;

	//Run and await all chains in parallel
	if (ChainState.bParallelProcessSubchains)
	{
		//NB: Access safety is a bit more problematic with this setup

		//Run all chains, store output
		int32 SubchainInstantCount = 0;

		for (int32 i = ChainState.SubChainProcessingIndex; i < ChainState.SubChains.Num(); i++)
		{
			//use iterative method to store index for latent responses
			UProcGeneratorChain* SubChain = ChainState.SubChains[i];
			
			bool bValidInstantResponse = SubChain->StartChainProcess(ContextData);

			if (SubChain->IsStatusError())
			{
				ChainState.StatusMessage = SubChain->ChainState.StatusMessage;
				UpdateStatus(EPGChainStatus::ErrorSubchain);
				return false;
			}

			if (bValidInstantResponse)
			{
				SubchainInstantCount++;
			}
			else
			{
				//Subchain is latent, wait for response
				SubChain->OnChainStatusChanged.AddDynamic(this, &UProcGeneratorChain::UpdateSubChainProgress);
			}
		}

		//check if everything in the chain was not latent
		if (SubchainInstantCount != ChainState.SubChains.Num())
		{
			UpdateStatus(EPGChainStatus::LatentResponse);
			return false;
		}
		else
		{
			return true;
		}

	}
	//Serial execution
	else
	{
		for (int32 i = ChainState.SubChainProcessingIndex; i < ChainState.SubChains.Num(); i++)
		{
			//use iterative method to store index for latent responses
			UProcGeneratorChain* SubChain = ChainState.SubChains[i];

			bool bValidInstantResponse = SubChain->StartChainProcess(ContextData);

			if (!bValidInstantResponse)
			{
				//Check for errors
				if (SubChain->IsStatusError())
				{
					ChainState.StatusMessage = SubChain->ChainState.StatusMessage;
					UpdateStatus(EPGChainStatus::ErrorSubchain);
					return false;
				}
				//This may be a latent function
				if (SubChain->ChainState.Status == EPGChainStatus::LatentResponse)
				{
					SubChain->OnChainStatusChanged.AddDynamic(this, &UProcGeneratorChain::UpdateSubChainProgress);
					UpdateStatus(EPGChainStatus::LatentResponse);
					return false;
				}
			}
			ChainState.SubChainProcessingIndex++;

			OnSubChainProgress.Broadcast(ChainState.SubChainProcessingIndex, ChainState.SubChains.Num());
		}
		return true;
	}
}

void UProcGeneratorChain::ProcessNextChain()
{
	if (ChainState.NextChain != nullptr)
	{
		ChainState.NextChain->StartChainProcess(ContextData);
	}
}

void UProcGeneratorChain::UpdateSubChainProgress(EPGChainStatus Status, UProcGeneratorChain* Chain)
{
	//If we're latent...
	if (ChainState.Status == EPGChainStatus::LatentResponse)
	{
		if (Status == EPGChainStatus::Done)
		{
			if (ChainState.bParallelProcessSubchains)
			{
				//Check if all parallel subchains finished
				int32 FinishedCount = 0;
				int32 Total = ChainState.SubChains.Num();
				for (UProcGeneratorChain* SubChain : ChainState.SubChains)
				{
					if (SubChain->ChainState.Status == EPGChainStatus::Done)
					{
						FinishedCount++;
					}
				}

				//TODO: add percent task complete notification

				//All tasks finished
				if (ChainState.bOutputDebugFlowLog)
				{
					UE_LOG(LogTemp, Log, TEXT("Flow Parallel progress: %d/%d"), FinishedCount, Total);
				}
				//Broadcast progress
				OnSubChainProgress.Broadcast(FinishedCount, Total);

				if (FinishedCount >= Total)
				{
					ResumeChainFromLatentResult();
				}
			}
			//Sequential, just resume
			else
			{ 
				ResumeChainFromLatentResult();
			}
		}
	}
}

void UProcGeneratorChain::UpdateStatus(EPGChainStatus NewStatus)
{
	ChainState.Status = NewStatus;
	if (NewStatus != EPGChainStatus::LatentResponse &&
		NewStatus != EPGChainStatus::ResumeLatent)
	{
		ChainState.LastLatentStatus = NewStatus;
	}

	OnChainStatusChanged.Broadcast(ChainState.Status, this);
	if (IsStatusError())
	{
		OnChainStatusError.Broadcast(ChainState.Status, ChainState.StatusMessage);
	}

	if (ChainState.bOutputDebugFlowLog)
	{
		UE_LOG(LogTemp, Log, TEXT("Flow State: %d"), NewStatus);
	}
}

//Log Proc Chain Example

void ULogProcGeneratorChain::OnPreProcessChain_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("ULogProcGeneratorChain::OnPreProcessChain_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());
}

void ULogProcGeneratorChain::OnPostProcessChain_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("ULogProcGeneratorChain::OnPostProcessChain_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());
}


void ULogProcGeneratorChain::OnChainFinished_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("ULogProcGeneratorChain::OnChainFinished_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());
}

void FPGContextData::AppendData(FPGContextData& Other)
{
	ActorMap.Append(Other.ActorMap);
	ObjectMap.Append(Other.ObjectMap);
	StringMap.Append(Other.StringMap);
}
