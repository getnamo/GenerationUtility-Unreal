#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Kismet/KismetSystemLibrary.h"
#include "GUBlueprintLibrary.generated.h"

/**
 * Static convenience functions
 */
UCLASS()
class GENERATIONUTILITY_API UGUBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()
	
    //convenience function to get engine subsystem in js
	UFUNCTION(BlueprintCallable, Category = GUCoreUtility)
	static USubsystem* GetEngineSubsystem(UClass* Class);

    //convenience function to get world subsystem in js
	UFUNCTION(BlueprintCallable, Category = GUCoreUtility, meta = (WorldContext = "WorldContextObject"))
	static USubsystem* GetWorldSubsystem(UClass* Class, UObject* WorldContextObject);
};
