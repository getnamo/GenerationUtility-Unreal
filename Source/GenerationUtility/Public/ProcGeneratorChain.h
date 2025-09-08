#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "HAL/ThreadSafeBool.h"
#include "ProcGeneratorChain.generated.h"

/** Store data that gets pass forward through each chain. Uses generic maps (string and object) */
USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FPGContextData
{
	GENERATED_BODY()

	/** Push any contextual string data to this map */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "GeneratorChainContextData")
	TMap<FString, FString> StringMap;

	/** Push any contextual object data to this map */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "GeneratorChainContextData")
	TMap<FString, UObject*> ObjectMap;

	/** Push any contextual actor data to this map */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "GeneratorChainContextData")
	TMap<FString, AActor*> ActorMap;

	void AppendData(FPGContextData& Other);
};

UENUM(BlueprintType)
enum class EPGChainStatus : uint8
{
	Idle,
	ProcessingPre,
	ProcessingSubChains,
	ProcessingPost,
	Finishing,	//Only relevant for latent callback states
	Done,
	ErrorSubchain,
	ErrorCurrentChain,
	LatentResponse,
	ResumeLatent
};

UENUM(BlueprintType)
enum class EPGChainOrder : uint8
{
	Previous,
	Sub,
	Next
};

USTRUCT(BlueprintType)
struct GENERATIONUTILITY_API FPGChainState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	TArray<UProcGeneratorChain*> SubChains;

	UPROPERTY(BlueprintReadWrite, Category = "ProcGeneratorChain")
	bool bParallelProcessSubchains = false;

	UPROPERTY(BlueprintReadWrite, Category = "ProcGeneratorChain")
	bool bOutputDebugFlowLog = false;

	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	int32 SubChainProcessingIndex = 0;

	//Optional next chain that will be processed after this chain. Use SetChain if you wish to link next
	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	UProcGeneratorChain* NextChain = nullptr;

	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	UProcGeneratorChain* PreviousChain = nullptr;

	//This will be filled if this chain was added as subchain
	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	UProcGeneratorChain* ParentChain = nullptr;

	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	EPGChainStatus Status = EPGChainStatus::Idle;

	/** Used to determine where to resume after receiving latent notice */
	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	EPGChainStatus LastLatentStatus = EPGChainStatus::Idle;

	UPROPERTY(BlueprintReadOnly, Category = "ProcGeneratorChain")
	FString StatusMessage = TEXT("None.");

	FPGChainState();
};

//Because pass by ref is kinda garbage in blueprint
UCLASS(Blueprintable)
class GENERATIONUTILITY_API UPGContextDataObject : public UObject
{
	GENERATED_BODY()
public:

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "GeneratorChainContextData")
	FPGContextData Context;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FProcessChainMCSignature, UPGContextDataObject*, InOutContextData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FChainStatusSignature, EPGChainStatus, Status, UProcGeneratorChain*, Chain);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FChainErrorSignature, EPGChainStatus, Status, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSubChainProgressSignature, int32, Completed, int32, Total);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FIntermediateResultSignature, UPGContextDataObject*, InOutContextData, const FString&, ContextMessage, UProcGeneratorChain*, Chain);

DECLARE_DYNAMIC_DELEGATE_OneParam(FProcessChainSignature, UPGContextDataObject*, InOutContextData);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FProcGeneratorRequestSignature, UProcGeneratorChain*, RequestedChain, const FString&, RequestContext);

/**
 * ProcGen core api which processes chains of factories until all subchains are done.
 */
UCLASS(Blueprintable, BlueprintType)
class GENERATIONUTILITY_API UProcGeneratorChain : public UObject
{
	GENERATED_BODY()

public:

	UProcGeneratorChain();

	//External variants (for classes including the object instead of subclassing it)
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	FProcessChainSignature OnPreProcessChainEvent;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	FProcessChainSignature OnPostProcessChainEvent;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	FProcessChainSignature OnChainFinishedEvent;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	FProcGeneratorRequestSignature OnRequestedChainFoundEvent;

	//Assignable
	UPROPERTY(BlueprintAssignable, Category = "ProcGeneratorChain")
	FChainStatusSignature OnChainStatusChanged;

	UPROPERTY(BlueprintAssignable, Category = "ProcGeneratorChain")
	FChainErrorSignature OnChainStatusError;

	UPROPERTY(BlueprintAssignable, Category = "ProcGeneratorChain")
	FIntermediateResultSignature OnIntermediateResult;

	UPROPERTY(BlueprintAssignable, Category = "ProcGeneratorChain")
	FSubChainProgressSignature OnSubChainProgress;





	//js only test
	//UPROPERTY()
	//FProcessChainSignature OnPreProcessTest;

	//Internal variants
	UFUNCTION(BlueprintNativeEvent, Category = "ProcGeneratorChain")
	void OnPreProcessChain(UPGContextDataObject* Data);

	UFUNCTION(BlueprintNativeEvent, Category = "ProcGeneratorChain")
	void OnPostProcessChain(UPGContextDataObject* Data);

	UFUNCTION(BlueprintNativeEvent, Category = "ProcGeneratorChain")
	void OnChainFinished(UPGContextDataObject* Data);

	UFUNCTION(BlueprintNativeEvent, Category = "ProcGeneratorChain")
	void OnCleanupRequest(UPGContextDataObject* Data);

	//callback from RequestJsChainByName. TODO: turn this into a latent function for in-context return
	UFUNCTION(BlueprintNativeEvent, Category = "ProcGeneratorChain")
	void OnRequestedChainFound(UProcGeneratorChain* RequestedChain, const FString& RequestContext);

	/** Holds chain references and status*/
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	FPGChainState ChainState;

	/**
	* This data gets passed through each chain as they process generation. 
	* Store any data you may need to access or depend on in later chains 
	* e.g. lamp locations in a room, visuals to be generated by a future chain 
	*/
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "ProcGeneratorChain")
	UPGContextDataObject* ContextData;

	/** Sets NextChain and sets this as Previous of next chain */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void LinkNextChain(UProcGeneratorChain* NextChainLink);

	/** Add a subchain, optionally an index != -1 will append it in that slot */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void AddSubchain(UProcGeneratorChain* SubChain, int32 AtIndex = -1);

	/** remove subchain by object */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void RemoveSubchain(UProcGeneratorChain* SubChain);

	/** remove subchain by index */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void RemoveSubchainAtIndex(int32 Index);

	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void RemoveAllSubchains();

	/** Main function to call to start the chain process, usually called by parent chains */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	bool StartChainProcess(UPGContextDataObject* InOutContextData);

	
	/** Call this when you've processed a latent response in your chain */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void ResumeChainFromLatentResult();

	//Changes current chain state to be LatentResponse. Resume via ResumeChainFromLatentResult()
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void WaitForLatentResponse();

	//Status convenience check for latent result
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	bool IsStatusLatent();

	/** 
	* Called by the head of the chain
	*/
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	bool StartChainProcessWithCurrentData();

	//Will call OnRequestedChainFound when the chain has been found (created by Js)
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void RequestJsChainByName(const FString& Name);

	/** If for whatever reason you need to stop this chain, call this. Will change status. */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void ThrowError(const FString& ErrorMessage);

	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	void StopLatentAction();

	/** Check if subchains or current chain has thrown an error */
	UFUNCTION(BlueprintCallable, Category = "ProcGeneratorChain")
	bool IsStatusError();

	//JS utility

	//Js struggles setting map values easily, write a utility functions - TODO: make these global?
	UFUNCTION()
	void SetStringValue(UPGContextDataObject* Data, const FString& Key, const FString& Value);

	UFUNCTION()
	void SetObjectValue(UPGContextDataObject* Data, const FString& Key, UObject* Value);
	
	UFUNCTION()
	void SetActorValue(UPGContextDataObject* Data, const FString& Key, AActor* Value);

	//Native variant of Request JsChainByName
	void RequestJsChainByNameLambdaCallback(const FString& Name, TFunction<void(UProcGeneratorChain*)> ReceivingLambda);

protected:

	UFUNCTION()
	void SendIntermediateResult(UPGContextDataObject* Data, const FString& ContextMessage);

	UFUNCTION()
	bool ProcessSubChains(int32 StartIndex = 0);

	UFUNCTION()
	void ProcessNextChain();

	UFUNCTION()
	void UpdateSubChainProgress(EPGChainStatus Status, UProcGeneratorChain* Chain);

	UFUNCTION()
	void UpdateStatus(EPGChainStatus NewStatus);

	FThreadSafeBool bShouldLatentStillRun;
};


/**
 * Example C++ subclass
 */
UCLASS(Blueprintable)
class GENERATIONUTILITY_API ULogProcGeneratorChain : public UProcGeneratorChain
{
	GENERATED_BODY()

public:

	void OnPreProcessChain_Implementation(UPGContextDataObject* InOutContextData);

	void OnPostProcessChain_Implementation(UPGContextDataObject* InOutContextData);

	void OnChainFinished_Implementation(UPGContextDataObject* InOutContextData);

};