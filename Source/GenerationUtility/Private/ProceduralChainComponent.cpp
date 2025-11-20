#include "ProceduralChainComponent.h"
#include "GESHandler.h"


// Sets default values for this component's properties
UProceduralChainComponent::UProceduralChainComponent(const FObjectInitializer& init) : UActorComponent(init)
{
	PrimaryComponentTick.bCanEverTick = false;
	MainChain = CreateDefaultSubobject<UProcGeneratorChain>(TEXT("MainChain"));

	MainChain->OnPreProcessChainEvent.BindDynamic(this, &UProceduralChainComponent::OnPre);
	MainChain->OnPostProcessChainEvent.BindDynamic(this, &UProceduralChainComponent::OnPost);
	MainChain->OnChainFinishedEvent.BindDynamic(this, &UProceduralChainComponent::OnFinished);

	FScriptDelegate Delegate;

	//forward status and errors
	MainChain->OnChainStatusChanged.AddDynamic(this, &UProceduralChainComponent::OnStatus);
	MainChain->OnChainStatusError.AddDynamic(this, &UProceduralChainComponent::OnError);
	MainChain->OnSubChainProgress.AddDynamic(this, &UProceduralChainComponent::OnSubChainProgress);
	MainChain->OnIntermediateResult.AddDynamic(this, &UProceduralChainComponent::OnIntermediateResult);

	bIsInitialized = false;
	bAddOwnerAsOrigin = true;
	bAutoStartChain = true;
	bWaitForJsChainsBeforeStart = true;
	bListenForJsReload = true;
	bProcessSubchainsInParallel = false;
	bDebugLogFlow = false;
	bRunChainInConstruction = false;
}


void UProceduralChainComponent::BeginPlay()
{
	Super::BeginPlay();

	if (bListenForJsReload)
	{
		FGESEventContext Context;
		Context.Domain = TEXT("Procedural");
		Context.Event = TEXT("JsReloaded");
		Context.WorldContext = this;
		FGESHandler::DefaultHandler()->AddLambdaListener(Context, [this]
		{
			UE_LOG(LogTemp, Log, TEXT("UProceduralChainComponent js reload received for %s"), *this->GetName());
			
			ResetChains();
			MainChain->StartChainProcessWithCurrentData();
		});
	}

	if (bWaitForJsChainsBeforeStart)
	{
		FGESEventContext Context;
		Context.Domain = TEXT("global.javascript");
		Context.Event = TEXT("postinit");
		Context.WorldContext = this;
		FGESHandler::DefaultHandler()->AddLambdaListener(Context, [this]
		{
			UE_LOG(LogTemp, Log, TEXT("UProceduralChainComponent js post init pass for %s"), *this->GetName());
			Initialize();
		});
	}
	else
	{
		Initialize();
	}
}


void UProceduralChainComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	MainChain->StopLatentAction();

	FGESHandler::DefaultHandler()->RemoveAllListenersForReceiver(this);

	Super::EndPlay(EndPlayReason);
}

UProcGeneratorChain* UProceduralChainComponent::AddChainByClass(UClass* ChainClass, EPGChainOrder Order /*= EPGChainOrder::Sub*/)
{
	UProcGeneratorChain* NewChain = NewObject<UProcGeneratorChain>(GetOwner(), ChainClass);

	AddChain(NewChain, Order);

	return NewChain;
}


void UProceduralChainComponent::AddChain(UProcGeneratorChain* Chain, EPGChainOrder Order /*= EPGChainOrder::Sub*/)
{
	if (Order == EPGChainOrder::Sub)
	{
		MainChain->AddSubchain(Chain);
	}
	else if (Order == EPGChainOrder::Next)
	{
		MainChain->LinkNextChain(Chain);
	}
}


void UProceduralChainComponent::AddChainComponent(UProceduralChainComponent* ChainComponent, EPGChainOrder Order /*= EPGChainOrder::Sub*/)
{
	if (ChainComponent->IsValidLowLevelFast())
	{
		AddChain(ChainComponent->MainChain, Order);
	}
}


void UProceduralChainComponent::AddChainByOwningActor(AActor* Owner, EPGChainOrder Order /*= EPGChainOrder::Sub*/)
{
	UProceduralChainComponent* ChainComponent = Cast<UProceduralChainComponent>(Owner->GetComponentByClass(UProceduralChainComponent::StaticClass()));

	if (ChainComponent)
	{
		AddChainComponent(ChainComponent, Order);
	}
}

void UProceduralChainComponent::AddJsChainByName(FString JsClassName, EPGChainOrder Order /*= EPGChainOrder::Sub*/)
{
	MainChain->RequestJsChainByNameLambdaCallback(JsClassName,
	[&, Order](UProcGeneratorChain* NewChain)
	{
		if (Order == EPGChainOrder::Sub)
		{
			MainChain->AddSubchain(NewChain);
		}
		else if (Order == EPGChainOrder::Next)
		{
			MainChain->LinkNextChain(NewChain);
		}

		//maybe a latent return so others can handle it?
	});
}

void UProceduralChainComponent::StartChain()
{
	MainChain->StartChainProcessWithCurrentData();
}

void UProceduralChainComponent::SetResponseAsLatent()
{
	MainChain->WaitForLatentResponse();
}

void UProceduralChainComponent::ResumeChainFromLatent()
{
	MainChain->ResumeChainFromLatentResult();
}

void UProceduralChainComponent::EditorStartChain()
{
	if (bRunChainInConstruction)
	{
		//Force re-init

		//Clear results
		CleanupChain();
		Initialize();
	}
}

void UProceduralChainComponent::CleanupChain()
{
	MainChain->StopLatentAction();
	OnResultCleanup.Broadcast(MainChain->ContextData);
	bIsInitialized = false;
}

void UProceduralChainComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

void UProceduralChainComponent::PostInitProperties()
{
	Super::PostInitProperties();
	/*if (bRunChainInConstruction && !bIsInitialized)
	{
		Initialize();
	}*/
}

void UProceduralChainComponent::OnPre(UPGContextDataObject* Data)
{
	//Append all pre
	Data->Context.AppendData(ExtraConstructionData);
	Data->Context.AppendData(ExtraDefaultData);

	if (bAddOwnerAsOrigin)
	{
		Data->Context.ActorMap.Add(TEXT("Origin"), GetOwner());
	}

	OnPreProcessChainEvent.Broadcast(Data);
}

void UProceduralChainComponent::OnPost(UPGContextDataObject* Data)
{
	OnPostProcessChainEvent.Broadcast(Data);
}

void UProceduralChainComponent::OnFinished(UPGContextDataObject* Data)
{
	OnChainFinishedEvent.Broadcast(Data);
}

void UProceduralChainComponent::OnStatus(EPGChainStatus Status, UProcGeneratorChain* Chain)
{
	OnChainStatusChanged.Broadcast(Status, Chain);
}

void UProceduralChainComponent::OnError(EPGChainStatus Status, const FString& ErrorMessage)
{
	OnChainStatusError.Broadcast(Status, ErrorMessage);
}

void UProceduralChainComponent::OnSubChainProgress(int32 Completed, int32 Total)
{
	OnSubChainProgressEvent.Broadcast(Completed, Total);
}

void UProceduralChainComponent::OnIntermediateResult(UPGContextDataObject* Data, const FString& ContextMessage, UProcGeneratorChain* Chain)
{
	OnIntermediateResultEvent.Broadcast(Data, ContextMessage, Chain);
}

void UProceduralChainComponent::Initialize()
{
	//chain initialization should only happen once, after that call reset chains
	if (!bIsInitialized)
	{
		//Sync options
		MainChain->ChainState.bParallelProcessSubchains = bProcessSubchainsInParallel;
		MainChain->ChainState.bOutputDebugFlowLog = bDebugLogFlow;
		bIsInitialized = true;

		//only initialize if we don't listen for Js reloads
		if (!bListenForJsReload)
		{
			ResetChains();

			if (bAutoStartChain)
			{
				MainChain->StartChainProcessWithCurrentData();
			}
		}
	}
}

void UProceduralChainComponent::ResetChains()
{
	//Clear
	MainChain->RemoveAllSubchains();
	MainChain->StopLatentAction();
	
	//Setup
	OnSetupChain.Broadcast(MainChain->ContextData);
}