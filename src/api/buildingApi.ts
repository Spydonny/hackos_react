import type { BuildingTemplate } from "../types/building";

const API_BASE = "/api";
const BUILDING_BASE = "";

/** Fetch all saved building templates */
export async function fetchTemplates(): Promise<BuildingTemplate[]> {
    const res = await fetch(`${API_BASE}/templates`);
    if (!res.ok) throw new Error(`Failed to fetch templates: ${res.statusText}`);
    return res.json();
}

/** Create a new building template */
export async function createTemplate(data: {
    name: string;
    type?: string;
    capacity?: number;
    cost?: number;
    energy?: number;
    eco?: number;
    model_url?: string;
}): Promise<{ message: string; id: number }> {
    const res = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Failed to create template");
    }
    return res.json();
}

/** Analyze an uploaded PDF/document via Gemini AI */
export async function analyzeDocument(
    file: File,
    instruction = "Проанализируй этот PDF."
): Promise<{ status: string; verdict: string }> {
    const form = new FormData();
    form.append("file", file);
    form.append("instruction", instruction);

    const res = await fetch(`${BUILDING_BASE}/analyze`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Analysis failed");
    }
    return res.json();
}

export interface PlaceBuildingResponse {
    status?: string;
    alerts?: string[];
    cost?: number;
    district_name?: string;
    eco_status?: string;
    energy_impact?: number;
    analysis?: PlaceBuildingResponse; // In case it's nested
}

/** Place a building on the map — sends coordinates + template to backend */
export async function placeBuilding(data: {
    lat: number;
    lng: number;
    template_id: number | null;
    type?: string;
    width?: number;
    length?: number;
    floors?: number;
    floor_height?: number;
}): Promise<PlaceBuildingResponse> {
    const res = await fetch(`${API_BASE}/place_building`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Failed to place building");
    }
    return res.json();
}
