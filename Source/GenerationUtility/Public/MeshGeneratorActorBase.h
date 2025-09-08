#pragma once

#include "CoreMinimal.h"
#include "DynamicPMCActor.h"
#include "MeshGeneratorActorBase.generated.h"

/**
 * Native Base for extending ADynamicPMCActor used for generation
 */

UCLASS()
class GENERATIONUTILITY_API AMeshGeneratorActorBase : public ADynamicPMCActor
{
	GENERATED_BODY()
	

public:


	// Called every frame
	virtual void Tick(float DeltaTime) override;
};
