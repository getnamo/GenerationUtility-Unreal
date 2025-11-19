#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "JsonSerializableInterface.generated.h"

UINTERFACE(BlueprintType)
class UJsonSerializableInterface : public UInterface
{
	GENERATED_BODY()
};

class IJsonSerializableInterface
{
	GENERATED_BODY()

public:

	UFUNCTION(BlueprintCallable, BlueprintNativeEvent)
	FString SerializeJsonData() const;

	UFUNCTION(BlueprintCallable, BlueprintNativeEvent)
	bool DeserializeJsonData(const FString& JsonData);
};
