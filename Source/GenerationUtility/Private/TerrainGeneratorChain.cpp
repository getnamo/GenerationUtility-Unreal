#include "TerrainGeneratorChain.h"
#include "ProceduralMeshComponent.h"
#include "KismetProceduralMeshLibrary.h"
#include "RealtimeMeshSimple.h"
#include "CubicSphere.h"
#include "SIOJConvert.h"

void UTerrainGeneratorChain::OnPreProcessChain_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain::OnPreProcessChain_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());

	//Grab params
	if (Data->Context.ObjectMap.Contains(TEXT("Params")))
	{
		UTerrainGenParams* ParamsWrapper = Cast<UTerrainGenParams>(Data->Context.ObjectMap[TEXT("Params")]);

		Params = ParamsWrapper->ParamsStruct;
	}
	if (Params.bSyncSpacingToPatchSize)
	{
		Params.PerlinSpacing = Params.PatchSize;
		Params.VisualSpacing = (Params.PatchSize - 1) * 16;
	}
	if (Params.Masks.bUseMasks)
	{
		for (FTGMaskReference& Mask : Params.Masks.Masks)
		{
			Mask.MaskFloatArray = UHeightmapDeformersLibrary::Conv_GreyScaleTexture2DToFloatArray(Mask.MaskTexture);
		}
	}

	if (Params.bGenerateCubeQuadSphere)
	{
		GenerateCubeQuadSphere(Data);
	}
	else
	{
		GenerateTerrain(Data);
	}

	//NB: we need a chain cancel callback so we can stop other threads/etc
	//bWorkersShouldRun = false
}

void UTerrainGeneratorChain::OnPostProcessChain_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain::OnPostProcessChain_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());
}


void UTerrainGeneratorChain::OnChainFinished_Implementation(UPGContextDataObject* Data)
{
	UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain::OnChainFinished_Implementation (Len %d %d %d)"),
		Data->Context.StringMap.Num(),
		Data->Context.ObjectMap.Num(),
		Data->Context.ActorMap.Num());
}

void EmitEventWithString(UObject* Context, const FString& FunctionName, const FString& Arg)
{
	if (!Context->IsValidLowLevelFast())
	{
		return;
	}

	UFunction* Function = Context->FindFunction(FName(FunctionName));

	/*FStrProperty* StrProperty =
		new FStrProperty(FFieldVariant(Context->GetClass()),
			TEXT("StringValue"),
			EObjectFlags::RF_Public | EObjectFlags::RF_LoadCompleted);

	TArray<uint8> Buffer;
	Buffer.SetNum(Arg.GetAllocatedSize());
	StrProperty->SetPropertyValue_InContainer(Buffer.GetData(), Arg);*/

	Context->ProcessEvent(Function, (void*)&Arg/*Buffer.GetData()*/);

	//delete StrProperty;
}

void UTerrainGeneratorChain::GenerateTerrain(UPGContextDataObject* Data)
{
	//Default params
	UObject* Callback = nullptr;
	UArrayWrapper* FloatWrapper = NewObject<UArrayWrapper>(this);	

	//for reflection signalling
	if (Data->Context.ObjectMap.Contains(TEXT("Callback")))
	{
		Callback = Data->Context.ObjectMap[TEXT("Callback")];
	}

	//Start temp organization of work groups
	//Generate temp workgrid, string as x,y, current work product

	Params.Debug2DResults.Empty();

	int32 GridSize = Params.ComputeGridSize;
	float Spacing = Params.VisualSpacing;
	bSafeToAccessGrid = false;

	for (int32 Y = 0; Y < GridSize; Y++)
	{
		for (int32 X = 0; X < GridSize; X++)
		{
			WorkProduct NewProduct;
			NewProduct.Origin.SetLocation(FVector(X, Y, 0));
			NewProduct.FloatData = UHeightmapDeformersLibrary::SquareFloatMapSized(Params.PatchSize);
			WorkGrid.Enqueue(NewProduct);
		}
	}

	//Initialize as ready;
	bSafeToAccessGrid = true;

	/*TODO:
	Specify number of patches or distance from frustrum/sphere to render out
	in high detail and in low detail. Generate work requests in an atomic array

	Run multiple workers one per thread up to desired or pool max.
	Pull work from work request array.

	Call intermediate results in a way that a gamethread can allocate and map results to world visuals
	(procgen mesh, one per patch). This would be the parent/receiver chain node.
	*/
	FloatWrapper->FloatData = UHeightmapDeformersLibrary::SquareFloatMapSized(Params.PatchSize);
	UTexture2D* OutputTexture = UHeightmapDeformersLibrary::SquareTextureSized(Params.PatchSize);

	//Allow this to be referenced on later threads
	Data->Context.ObjectMap.Add(TEXT("FloatHeightMap"), FloatWrapper);
	Data->Context.ObjectMap.Add(TEXT("TextureHeightMap"), OutputTexture);

	bWorkersShouldRun = true;
	
	//Run on BG thread - e.g. one work unit
	Async(EAsyncExecution::ThreadPool, [&, Callback, OutputTexture, FloatWrapper, Data]
	{
		FTimespan ThreeSeconds = FTimespan(0, 0, 3);

		//Continuous work loop
		while (bWorkersShouldRun && bShouldLatentStillRun)
		{
			while (!bSafeToAccessGrid)
			{
				FPlatformProcess::Sleep(0.01f);
			}
			//Grab access to next item in queue
			bSafeToAccessGrid = false;
			WorkProduct WorkUnit;
			bool bFoundWork = WorkGrid.Dequeue(WorkUnit);
			bSafeToAccessGrid = true;

			if (!bFoundWork)
			{
				bWorkersShouldRun = false;
				Async(EAsyncExecution::TaskGraphMainThread, [&, Callback, FloatWrapper, OutputTexture, Data]
				{
					if (Data->Context.ObjectMap.Contains(TEXT("Params")))
					{
						UTerrainGenParams* ParamsWrapper = Cast<UTerrainGenParams>(Data->Context.ObjectMap[TEXT("Params")]);

						//update params back
						ParamsWrapper->ParamsStruct = Params;
					}
					UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain: Full generation complete, resuming from latent"));
					ResumeChainFromLatentResult();
				}).WaitFor(ThreeSeconds);
				break;
			}

			//WorkUnit.FloatData

			//Perlin Generation
			UHeightmapDeformersLibrary::PerlinDeformMap(
				WorkUnit.FloatData,
				Params.Magnitude,
				Params.Frequency,
				Params.FrequencyShift + (WorkUnit.Origin.GetLocation() * Params.PerlinSpacing),
				Params.Seed,
				Params.Octaves,
				Params.OctaveFactor,
				Params.bRidgedSource);

			//Masking Test - assume we are in the correct stack index (~1)
			if (Params.Masks.bUseMasks)
			{
				//Prep transform for current work unit
				FTransform WorkUnitSpaced = WorkUnit.Origin;
				WorkUnitSpaced.SetLocation(WorkUnitSpaced.GetLocation() * Params.PerlinSpacing);

				for (FTGMaskReference& Mask : Params.Masks.Masks)
				{
					if (Mask.MaskChainOp != nullptr)
					{
						//TODO: define a chain op that would work here...
						//Custom work, this should be using the chain instead of built in work...
						UHeightmapDeformersLibrary::DeformTerrainByMask(
							WorkUnit.FloatData,
							Mask.MaskFloatArray,
							WorkUnitSpaced,
							Mask.MaskTransform,
							[](float TerrainPixel, float MaskPixel, float MaskScale)
							{
								//Hard cutoff deformer
								if (MaskPixel > 0.5f)
								{
									return TerrainPixel + (TerrainPixel * MaskScale);
								}
								else
								{
									return TerrainPixel;
								}
							}, Mask.MaskScale);
					}
					//Apply default ops (add/sub/multiply etc
					else if (Mask.MaskDefaultOp != EFloatAppendTypes::None)
					{
						UHeightmapDeformersLibrary::DeformTerrainByMaskOp(
							WorkUnit.FloatData,
							Mask.MaskFloatArray,
							WorkUnitSpaced,
							Mask.MaskTransform,
							Mask.MaskDefaultOp, Mask.MaskScale);
					}
				}
			}

			//Call with result signal
			Async(EAsyncExecution::TaskGraphMainThread, [&, Callback, FloatWrapper, Data]
			{
				if (!bShouldLatentStillRun)
				{
					//Exit early
					return;
				}

				//Allocate if needed
				if (!WorkUnit.Mesh)
				{
					AActor* Owner = Data->Context.ActorMap[TEXT("Origin")];

					if (Params.bOutputToGeneratedMesh)
					{
						//Make a UGeneratedMesh and fill dynamic Actor from it
					}
					else
					{
						//Make a procmeshcomponent to fill with vertex offset texture
						WorkUnit.GenerateMesh(Owner, Params.PatchSize);
						WorkUnit.Mesh->SetBoundsScale(10.f);
						WorkUnit.Mesh->SetRelativeLocation(WorkUnit.Origin.GetLocation() * Params.VisualSpacing);
						WorkUnit.MaterialInstance = WorkUnit.Mesh->CreateDynamicMaterialInstance(0, Params.Material);
					}
					
					//Texture prep
					WorkUnit.FloatTexture = UHeightmapDeformersLibrary::SquareTextureSized(Params.PatchSize, Params.GeneratedTextureType);
				}

				UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain: Source generation complete"));
				//Update texture - this might be callable on bg thread since allocation was on game thread. Worst case: copy on render thread
				UHeightmapDeformersLibrary::CopyFloatArrayToTexture(WorkUnit.FloatData, WorkUnit.FloatTexture);

				//Apply directly
				WorkUnit.MaterialInstance->SetTextureParameterValue(FName("Height"), WorkUnit.FloatTexture);
				WorkUnit.MaterialInstance->SetTextureParameterValue(FName("HeightTex"), WorkUnit.FloatTexture);
				WorkUnit.MaterialInstance->SetScalarParameterValue(FName("Scale"), 8000.f);

				Params.Debug2DResults.AddUnique(WorkUnit.FloatTexture);

				//Signal via callback
				//SendIntermediateResult(Data, TEXT("SourceHeightMap"));
			}).WaitFor(ThreeSeconds);


			//Erode
			if (Params.bApplyErosion)
			{
				UHeightmapDeformersLibrary::HydraulicErosionOnHeightMapWithInterrupt(WorkUnit.FloatData, Params.HydroParams, [this]()
				{
					return !bShouldLatentStillRun;
				});

				//Call with result signal		
				Async(EAsyncExecution::TaskGraphMainThread, [&, Callback, Data]
				{
					//long running op, check that we're still valid
					if (!bShouldLatentStillRun)
					{
						//Exit early
						return;
					}

					UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain: Erosion complete"));
					UHeightmapDeformersLibrary::CopyFloatArrayToTexture(WorkUnit.FloatData, WorkUnit.FloatTexture);

					WorkUnit.MaterialInstance->SetTextureParameterValue(FName("Height"), WorkUnit.FloatTexture);
					WorkUnit.MaterialInstance->SetTextureParameterValue(FName("HeightTex"), WorkUnit.FloatTexture);

					Params.Debug2DResults.AddUnique(WorkUnit.FloatTexture);

					//Signal via callback
					//SendIntermediateResult(Data, TEXT("ErodedHeightMap"));
				}).WaitFor(ThreeSeconds);
			}

			//Done, resume chain on game thread
			Async(EAsyncExecution::TaskGraphMainThread, [&]
			{
				UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain: WorkProduct done: %1.3f, %1.3f"), WorkUnit.Origin.GetLocation().X, WorkUnit.Origin.GetLocation().Y);
				//old end point
				//UE_LOG(LogTemp, Log, TEXT("UTerrainGeneratorChain: Full generation complete, resuming from latent"));
				//ResumeChainFromLatentResult();
			}).WaitFor(ThreeSeconds);

			//Sleep 10ms between work checks
			FPlatformProcess::Sleep(0.01f);

			//temp one loop
			//bWorkersShouldRun = false;
		}//end while run
	});

	//Idle downstream chain until ResumeChainFromLatentResult is called.
	WaitForLatentResponse();
}

void UTerrainGeneratorChain::GenerateCubeQuadSphere(UPGContextDataObject* Data)
{
	//Temp for mask testing
	/*if (Params.Masks.bUseMasks)
	{
		for (FTGMaskReference& Mask : Params.Masks.Masks)
		{
			Mask.MaskFloatArray = UHeightmapDeformersLibrary::Conv_GreyScaleTexture2DToFloatArray(Mask.MaskTexture);
		}
	}*/
	bWorkersShouldRun = true;

	//Run on BG thread - e.g. one work unit
	Async(EAsyncExecution::ThreadPool, [&, Data]
	{
		const FTimespan ThreeSeconds = FTimespan(0, 0, 3);

		while(bWorkersShouldRun && bShouldLatentStillRun)
		{
			//Work loop
			WorkProduct WorkUnit;

			//1. Generate planet sphere test
			AActor* Owner = Data->Context.ActorMap[TEXT("Origin")];

			//Make the procmesh
			Async(EAsyncExecution::TaskGraphMainThread, [&]
			{				
				WorkUnit.GenerateMesh(Owner, Params.PatchSize, false);
			}).WaitFor(ThreeSeconds);

			FCubicSphere CubicSphere = FCubicSphere(WorkUnit.Mesh);
			FCubicSphereParams CubicParams;

			CubicParams.Resolution = Params.QuadPatchResolution;
			CubicParams.Scaling = Params.QuadScaling;
			CubicParams.Radius = CubicParams.Scaling/2.f;
			CubicParams.SphericalFactor = Params.QuadSphereFactor;
			CubicParams.WorldCamera = Params.QuadCameraWorldVector;
			CubicParams.EquiAngleFactor = Params.QuadEquiangularFactor;
			CubicParams.bCalculateTangents = Params.bCalculateTangents;
			CubicParams.bTopOnly = Params.bQuadTopOnly;
			CubicParams.bQuadSplit = Params.bQuadSplit;
			CubicParams.QuadBaseline = Params.CubeQuadBaseline;
			CubicParams.QuadDepth = Params.CubeQuadMaxDepth;
			CubicParams.WorldOrigin = Owner->GetActorLocation() + WorkUnit.Mesh->GetRelativeLocation();
			WorkUnit.Mesh->SetRelativeLocation(CubicParams.WorldOrigin);

			//Callback for patch code gen given current data
			TFunction<void(FMeshSectionData&)> GenerateCallback = [&](FMeshSectionData& Data)
			{

				//Perlin Generation

				//Assume we have centered generation
				FVector Center = FVector(0.f);

				UHeightmapDeformersLibrary::PerlinDeformMeshAlongCenter(
					Data.Vertices,
					Center,
					Params.Magnitude,
					Params.Frequency,
					Params.FrequencyShift + (WorkUnit.Origin.GetLocation() * Params.PerlinSpacing),
					Params.Seed,
					Params.Octaves,
					Params.OctaveFactor,
					Params.bRidgedSource);

				//Masking -> need to convert patch from vertices to a float array and then back
				//Use normal to convert?
				/*
				//Masking Test - assume we are in the correct stack index (~1)
				if (Params.Masks.bUseMasks)
				{
					//Prep transform for current work unit
					FTransform WorkUnitSpaced = WorkUnit.Origin;
					WorkUnitSpaced.SetLocation(WorkUnitSpaced.GetLocation() * Params.PerlinSpacing);

					for (FTGMaskReference& Mask : Params.Masks.Masks)
					{
						if (Mask.MaskChainOp != nullptr)
						{
							//TODO: define a chain op that would work here...
							//Custom work, this should be using the chain instead of built in work...
							UHeightmapDeformersLibrary::DeformTerrainByMask(
								WorkUnit.FloatData,
								Mask.MaskFloatArray,
								WorkUnitSpaced,
								Mask.MaskTransform,
								[](float TerrainPixel, float MaskPixel, float MaskScale)
								{
									//Hard cutoff deform
									if (MaskPixel > 0.5f)
									{
										return TerrainPixel + (TerrainPixel * MaskScale);
									}
									else
									{
										return TerrainPixel;
									}
								}, Mask.MaskScale);
						}
						//Apply default ops (add/sub/multiply etc
						else if (Mask.MaskDefaultOp != EFloatAppendTypes::None)
						{
							UHeightmapDeformersLibrary::DeformTerrainByMaskOp(
								WorkUnit.FloatData,
								Mask.MaskFloatArray,
								WorkUnitSpaced,
								Mask.MaskTransform,
								Mask.MaskDefaultOp, Mask.MaskScale);
						}
					}
				}
				*/

				//((URuntimeMeshProviderStatic*)Data.Mesh->GetProvider())->UpdateSectionFromComponents(0, 0, Data.Vertices, Data.Triangles, Data.Normals, Data.UVs, Data.VertexColors, Data.Tangents);


				Async(EAsyncExecution::TaskGraphMainThread, [&]
				{
					//This is broken atm, need to fix the provider api change

					/*URuntimeMeshProviderStatic* Provider = (URuntimeMeshProviderStatic*)Data.Mesh->GetProvider();
					if (!Provider)
					{
						Provider = NewObject<URuntimeMeshProviderStatic>(Data.Mesh, TEXT("RuntimeMeshProvider-Static"));
						if (Provider)
						{
							Data.Mesh->Initialize(Provider);
						}
					}
						
					if (Provider)
					{
						if (Data.Section<= Provider->GetLastSectionId(0))
						{
							Provider->UpdateSectionFromComponents(0, Data.Section, RMC_ConvertTArray<FVector3f>(Data.Vertices), Data.Triangles, RMC_ConvertTArray<FVector3f>(Data.Normals), RMC_ConvertTArray<FVector2f>(Data.UVs), Data.VertexColors, Data.Tangents);
						}
						else
						{
							Provider->CreateSectionFromComponents(0, Data.Section, 0, Data.Vertices, Data.Triangles, Data.Normals, Data.UVs, Data.VertexColors, Data.Tangents, ERuntimeMeshUpdateFrequency::Infrequent, false);
						}
					}*/

					//TODO: RUNTIMEMESHCOMPONENT FIX
					/*Data.Mesh->CreateMeshSection(Data.Section,
						Data.Vertices, Data.Triangles,
						Data.Normals, Data.UVs,
						Data.VertexColors, Data.Tangents,
						false);*/
				}).WaitFor(FTimespan(0, 0, 3));
			};

			//Callback is per tipnode patch, post gen
			CubicSphere.GenerateCube(CubicParams, GenerateCallback);

			//For now we only run this once, TODO: full work loop for quad
			bWorkersShouldRun = false;
			break;
		}

		//Finish call
		Async(EAsyncExecution::TaskGraphMainThread, [&, Data]
		{
			if (Data->Context.ObjectMap.Contains(TEXT("Params")))
			{
				UTerrainGenParams* ParamsWrapper = Cast<UTerrainGenParams>(Data->Context.ObjectMap[TEXT("Params")]);

				//update params back
				ParamsWrapper->ParamsStruct = Params;
			}
			UE_LOG(LogTemp, Log, TEXT("GenerateCubeQuadSphere: Full generation complete, resuming from latent"));
			ResumeChainFromLatentResult();
		}).WaitFor(ThreeSeconds);
	});

	//Idle downstream chain until ResumeChainFromLatentResult is called.
	WaitForLatentResponse();
}

void WorkProduct::GenerateMesh(AActor* Owner, int32 PatchSize, bool bWelded)
{
	Mesh = NewObject<URealtimeMeshComponent>(Owner);

	if (bWelded)
	{
		TArray<int32> Triangles;
		TArray<FVector> Vertices, Normals;
		TArray<FVector2D> UVs;
		TArray<FLinearColor> VertexColors;
		TArray<FRealtimeMeshTangentsNormalPrecision> Tangents;

		UKismetProceduralMeshLibrary::CreateGridMeshWelded(
			PatchSize,
			PatchSize, Triangles, Vertices, UVs);

		// Initialize the mesh
		URealtimeMeshSimple* RealtimeMesh = Mesh->InitializeRealtimeMesh<URealtimeMeshSimple>();

		// Create the stream set
		FRealtimeMeshStreamSet StreamSet;

		// Add streams for your mesh data
		TRealtimeMeshStreamBuilder<FVector3f> PositionBuilder(StreamSet.AddStream(FRealtimeMeshStreams::Position, GetRealtimeMeshBufferLayout<FVector3f>()));
		TRealtimeMeshStreamBuilder<FRealtimeMeshTangentsHighPrecision, FRealtimeMeshTangentsNormalPrecision> TangentBuilder(
			StreamSet.AddStream(FRealtimeMeshStreams::Tangents, GetRealtimeMeshBufferLayout<FRealtimeMeshTangentsNormalPrecision>()));
		TRealtimeMeshStreamBuilder<FVector2f, FVector2DHalf> TexCoordsBuilder(StreamSet.AddStream(FRealtimeMeshStreams::TexCoords, GetRealtimeMeshBufferLayout<FVector2DHalf>()));
		TRealtimeMeshStreamBuilder<FColor> ColorBuilder(StreamSet.AddStream(FRealtimeMeshStreams::Color, GetRealtimeMeshBufferLayout<FColor>()));
		TRealtimeMeshStreamBuilder<TIndex3<uint32>, TIndex3<uint16>> TrianglesBuilder(StreamSet.AddStream(FRealtimeMeshStreams::Triangles, GetRealtimeMeshBufferLayout<TIndex3<uint16>>()));

		// Reserve space based on the array sizes
		PositionBuilder.Reserve(Vertices.Num());
		TangentBuilder.Reserve(Tangents.Num());
		ColorBuilder.Reserve(VertexColors.Num());
		TexCoordsBuilder.Reserve(UVs.Num());
		TrianglesBuilder.Reserve(Triangles.Num() / 3); // Dividing by 3 since each triangle has 3 indices

		// Fill the streams with your data
		for (int32 i = 0; i < Vertices.Num(); i++)
		{
			int32 VIndex = PositionBuilder.Add(FVector3f(Vertices[i]));
			TangentBuilder.Add(FRealtimeMeshTangentsHighPrecision(FVector3f(Normals[i]), Tangents[i].GetTangent()));
			ColorBuilder.Add(VertexColors.IsValidIndex(i) ? VertexColors[i].ToFColor(true) : FColor::White);  // Optional: use white if no color
			TexCoordsBuilder.Add(UVs.IsValidIndex(i) ? FVector2f(UVs[i]) : FVector2f(0.0f, 0.0f));  // Optional: use default UV if not provided
		}

		// Add triangles
		for (int32 i = 0; i < Triangles.Num(); i += 3)
		{
			TrianglesBuilder.Add(TIndex3<uint32>(Triangles[i], Triangles[i + 1], Triangles[i + 2]));
		}

		// Setup material slots (Optional, based on your use case)
		RealtimeMesh->SetupMaterialSlot(0, "MaterialSlot0");

		// Create the group and section keys
		const FRealtimeMeshSectionGroupKey GroupKey = FRealtimeMeshSectionGroupKey::Create(0, FName("MeshGroup"));
		const FRealtimeMeshSectionKey SectionKey = FRealtimeMeshSectionKey::CreateForPolyGroup(GroupKey, 0);

		// Create the section group
		RealtimeMesh->CreateSectionGroup(GroupKey, StreamSet);

		// Update the section configuration
		RealtimeMesh->UpdateSectionConfig(SectionKey, FRealtimeMeshSectionConfig(0));



		//NB: tangents might currently not be set due to PMC ones being used for now
		//StaticProvider->CreateSectionFromComponents(0, 0, 0, RMC_ConvertTArray<FVector3f>(Vertices), Triangles, RMC_ConvertTArray<FVector3f>(Normals), RMC_ConvertTArray<FVector2f>(UVs), VertexColors, Tangents, ERealtimeMeshUpdateFrequency::Infrequent, false);
		

		//Update Loop Notes
		//((URuntimeMeshProviderStatic*)DrawingReceiver->RuntimeMesh->GetProvider())->UpdateSectionFromComponents(0, 0, MeshInfo.Vertices, MeshInfo.Triangles, MeshInfo.Normals, MeshInfo.UV0, MeshInfo.VertexColors, MeshInfo.Tangents);
		
		//PMC Note
		/*Mesh->CreateMeshSection(0,
			Vertices, Triangles,
			Normals, UVs,
			VertexColors, Tangents,
			false);*/
	}
	
	//Mesh->SetRelativeLocation(Origin.GetLocation());
	Owner->AddInstanceComponent(Mesh);
	Mesh->RegisterComponent();
}
