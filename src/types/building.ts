export type BuildingType = "residential" | "commercial" | "industrial" | "office";
export type BuildingMaterial = "concrete" | "glass" | "brick" | "steel";

export type BuildingConfig = {
  type: BuildingType;
  width: number;
  length: number;
  floors: number;
  floorHeight: number;
  material: BuildingMaterial;
  color: string;
  windowDensity: number;
  greenRoof: boolean;
  solarPanels: boolean;
  nightLights: boolean;
  uploadedFile: File | null;
};

/** Shape returned by GET /api/templates (matches Flask model.to_dict()) */
export type BuildingTemplate = {
  id: number;
  name: string;
  type: string;
  capacity: number;
  cost: number;
  energy: number;
  eco: number;
  model_url: string | null;
};
