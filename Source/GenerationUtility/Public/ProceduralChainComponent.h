#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "ProcGeneratorChain.h"
#include "ProceduralChainComponent.generated.h"

//DECLARE_DYNAMIC_DELEGATE_OneParam(FProcessChainSignature, FPGContextData&, ContextData);

/**
* Convenience wrapper around a proc generator chain for easier use in 
* blueprints. Should reduce overall boilerplate needed to setup a common chain
*/
UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class GENERATIONUTILITY_API UProceduralChainComponent : public UActorComponent
{
	GENERATED_UCLASS_BODY()
public:
	//UProceduralChainComponent();

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FProcessChainMCSignature OnSetupChain;

	/** To undo results */
	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FProcessChainMCSignature OnResultCleanup;

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FProcessChainMCSignature OnPreProcessChainEvent;

	UPROPERTY(BlueprintAssignable, Category = "ProcGeneratorChain")
	FProcessChainMCSignature OnPostProcessChainEvent;

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FProcessChainMCSignature OnChainFinishedEvent;

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FSubChainProgressSignature OnSubChainProgressEvent;

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FChainStatusSignature OnChainStatusChanged;

	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FChainErrorSignature OnChainStatusError;

	/** When results return before chain is finished, e.g. for visual update while processing */
	UPROPERTY(BlueprintAssignable, Category = "Procedural Chain Component")
	FIntermediateResultSignature OnIntermediateResultEvent;

	//modify this in the construction script and it will be appended to the main chain's context data
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	FPGContextData ExtraConstructionData;

	//modify this in the instance or class default and it will be appended to the main chain's context data
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	FPGContextData ExtraDefaultData;

	/** Usually will happen on begin play */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bAutoStartChain;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bRunChainInConstruction;

	/** latent chain start */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bWaitForJsChainsBeforeStart;
	
	/** Can re-run a chain after a reload event */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bListenForJsReload;

	/** Automatically add the owner as 'Origin' in actor map */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bAddOwnerAsOrigin;

	/** Subchains are no longer sequentially processed if latent, each will fire off in parallel instead */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bProcessSubchainsInParallel;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Procedural Chain Component")
	bool bDebugLogFlow;

	//Flow check
	UPROPERTY(BlueprintReadOnly, Category = "Procedural Chain Component")
	bool bIsInitialized;

	UPROPERTY(BlueprintReadOnly, VisibleAnywhere, Category = "Procedural Chain Component")
	UProcGeneratorChain* MainChain;

	/** Add a specified chain class at particular chain order (next or sub)*/
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	UProcGeneratorChain* AddChainByClass(UClass* ChainClass, EPGChainOrder Order = EPGChainOrder::Sub);

	/** Add a specified chain instance at particular chain order (next or sub)*/
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void AddChain(UProcGeneratorChain* Chain, EPGChainOrder Order = EPGChainOrder::Sub);

	/** Convenience component variant, for chaining together multiple component chains */
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void AddChainComponent(UProceduralChainComponent* ChainComponent, EPGChainOrder Order = EPGChainOrder::Sub);

	/** Searches for component on actor*/
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void AddChainByOwningActor(AActor* Owner, EPGChainOrder Order = EPGChainOrder::Sub);

	/** Add a specified chain by Javascript name at particular chain order (next or sub) */
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void AddJsChainByName(FString JsClassName, EPGChainOrder Order = EPGChainOrder::Sub);

	/** If not autostarted, this is the entry point */
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void StartChain();

	/** Call this during Pre, Post, or in obtained in Subchains */
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void SetResponseAsLatent();

	/** Resume after latent results are ready to continue the chain */
	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void ResumeChainFromLatent();

	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void EditorStartChain();

	UFUNCTION(BlueprintCallable, Category = "Procedural Chain Component")
	void CleanupChain();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void PostInitProperties() override;

protected:
	UFUNCTION()
	void OnPre(UPGContextDataObject* Data);

	UFUNCTION()
	void OnPost(UPGContextDataObject* Data);

	UFUNCTION()
	void OnFinished(UPGContextDataObject* Data);

	UFUNCTION()
	void OnStatus(EPGChainStatus Status, UProcGeneratorChain* Chain);

	UFUNCTION()
	void OnError(EPGChainStatus Status, const FString& ErrorMessage);

	UFUNCTION()
	void OnSubChainProgress(int32 Completed, int32 Total);

	UFUNCTION()
	void OnIntermediateResult(UPGContextDataObject* InOutContextData, const FString& ContextMessage, UProcGeneratorChain* Chain);

	UFUNCTION()
	void Initialize();

	UFUNCTION()
	void ResetChains();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
};
