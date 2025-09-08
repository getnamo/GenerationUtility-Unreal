#include "GUDataTypes.h"

FString FEntityBaseAction::Description() const
{
	return FString::Printf(TEXT("A(%s, D:%1.1f)"), *Type, Duration);
}

FString FInstancedAction::Description() const
{
	return FString::Printf(TEXT("A(%s, D:%1.1f, T:%s, AC:%1.0f)"),
		*Type,
		Duration,
		*Target.ToCompactString(),
		AnimCustom);
}

FPGCacheSettings::FPGCacheSettings()
{
	CacheSavePath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("ProcGen"));
	FileType = TEXT(".bin");    //binary default
}

FString FPGCacheSettings::FullPath(const FString& InFileName)
{
	return CacheSavePath + TEXT("/") + InFileName + FileType;
}

bool FPGCacheSettings::IsBinaryFileType()
{
	return FileType == TEXT(".bin");
}