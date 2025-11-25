#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Voxel/Public/VoxelCharacter.h"
#include "GUBaseCharacter.generated.h"

/**
 * Inherit from this character to have voxels interaction working
 */

UCLASS()
class GENERATIONUTILITY_API AGUBaseCharacter : public AVoxelCharacter
{
	GENERATED_BODY()

public:
	AGUBaseCharacter();
};
