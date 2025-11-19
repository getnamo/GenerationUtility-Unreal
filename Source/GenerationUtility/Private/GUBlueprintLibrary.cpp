#include "GUBlueprintLibrary.h"

USubsystem* UGUBlueprintLibrary::GetEngineSubsystem(UClass* Class)
{
	if (!Class)
	{
		return nullptr;
	}
	return  GEngine->GetEngineSubsystemBase(Class);
}

USubsystem* UGUBlueprintLibrary::GetWorldSubsystem(UClass* Class, UObject* WorldContextObject)
{
	if (!Class)
	{
		return nullptr;
	}
	UWorld* World = WorldContextObject->GetWorld();
	if (World) 
	{
		return World->GetSubsystemBase(Class);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("GetWorldSubsystem::Invalid WCO"));
		return nullptr;
	}
}