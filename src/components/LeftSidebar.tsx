import { Building2, Leaf, Trash2, Upload, FileText, X } from "lucide-react";
import StatsCard from "./StatsCard";

type BuildingType = "residential" | "commercial" | "industrial" | "office";
type BuildingMaterial = "concrete" | "glass" | "brick" | "steel";

type BuildingConfig = {
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

type Props = {
    mode: string;
    setMode: (m: any) => void;
    stats: { buildings: number; ecoZones: number };
    clearAll: () => void;
    buildingConfig: BuildingConfig;
    setBuildingConfig: (c: BuildingConfig) => void;
    totalHeight: number;
    area: number;
    volume: number;
    ecoMetric: "air" | "traffic";
    setEcoMetric: (v: "air" | "traffic") => void;
};

export function LeftSidebar({
    mode,
    setMode,
    stats,
    clearAll,
    buildingConfig,
    setBuildingConfig,
    totalHeight,
    area,
    volume,
    ecoMetric,
    setEcoMetric
}: Props) {
    const update = (field: keyof BuildingConfig, value: any) => {
        setBuildingConfig({
            ...buildingConfig,
            [field]: value,
        });
    };

    return (
        <aside className="sidebar left">
            <h2>Project Control</h2>

            <button
                className={`btn ${mode === "build" ? "active" : ""}`}
                onClick={() => setMode("build")}
            >
                <Building2 size={18} />
                Construction
            </button>

            {mode === "build" && (
                <div className="form">
                    <label>
                        Type
                        <select
                            value={buildingConfig.type}
                            onChange={(e) => update("type", e.target.value)}
                        >
                            <option value="residential">Residential</option>
                            <option value="commercial">Commercial</option>
                            <option value="office">Office</option>
                            <option value="industrial">Industrial</option>
                        </select>
                    </label>

                    <label>
                        Width (m)
                        <input
                            type="number"
                            value={buildingConfig.width}
                            onChange={(e) => update("width", Number(e.target.value))}
                        />
                    </label>

                    <label>
                        Length (m)
                        <input
                            type="number"
                            value={buildingConfig.length}
                            onChange={(e) => update("length", Number(e.target.value))}
                        />
                    </label>

                    <label>
                        Floors
                        <input
                            type="number"
                            value={buildingConfig.floors}
                            onChange={(e) => update("floors", Number(e.target.value))}
                        />
                    </label>

                    <label>
                        Floor height (m)
                        <input
                            type="number"
                            step="0.5"
                            value={buildingConfig.floorHeight}
                            onChange={(e) =>
                                update("floorHeight", Number(e.target.value))
                            }
                        />
                    </label>

                    <label>
                        Material
                        <select
                            value={buildingConfig.material}
                            onChange={(e) => update("material", e.target.value)}
                        >
                            <option value="concrete">Concrete</option>
                            <option value="glass">Glass</option>
                            <option value="brick">Brick</option>
                            <option value="steel">Steel</option>
                        </select>
                    </label>

                    <label>
                        Color
                        <input
                            type="color"
                            value={buildingConfig.color}
                            onChange={(e) => update("color", e.target.value)}
                        />
                    </label>

                    <label>
                        Window density: {buildingConfig.windowDensity}%
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={buildingConfig.windowDensity}
                            onChange={(e) =>
                                update("windowDensity", Number(e.target.value))
                            }
                        />
                    </label>

                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={buildingConfig.greenRoof}
                            onChange={(e) => update("greenRoof", e.target.checked)}
                        />
                        Green roof
                    </label>

                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={buildingConfig.solarPanels}
                            onChange={(e) => update("solarPanels", e.target.checked)}
                        />
                        Solar panels
                    </label>

                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={buildingConfig.nightLights}
                            onChange={(e) => update("nightLights", e.target.checked)}
                        />
                        Night lights
                    </label>

                    <div className="file-upload">
                        <label className="file-label">
                            <Upload size={14} />
                            <span>Upload Blueprint/Model</span>
                            <input
                                type="file"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    update("uploadedFile", file);
                                }}
                            />
                        </label>

                        {buildingConfig.uploadedFile && (
                            <div className="file-info">
                                <FileText size={14} />
                                <span className="filename">
                                    {buildingConfig.uploadedFile.name}
                                </span>
                                <button
                                    className="clear-file"
                                    onClick={() => update("uploadedFile", null)}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="calculated">
                        <div>Total height: {totalHeight.toFixed(1)} m</div>
                        <div>Area: {area.toFixed(0)} m²</div>
                        <div>Volume: {volume.toFixed(0)} m³</div>
                    </div>
                </div>
            )}

            <button
                className={`btn ${mode === "eco" ? "active" : ""}`}
                onClick={() => setMode("eco")}
            >
                <Leaf size={18} />
                Eco Zones
            </button>

            {mode === "eco" && (
                <div className="eco-toggle">
                    <label>Metric</label>

                    <div className="toggle-group">
                        <button
                            className={ecoMetric === "air" ? "active" : ""}
                            onClick={() => setEcoMetric("air")}
                        >
                            Air Quality
                        </button>

                        <button
                            className={ecoMetric === "traffic" ? "active" : ""}
                            onClick={() => setEcoMetric("traffic")}
                        >
                            Traffic
                        </button>
                    </div>
                </div>
            )}




            <button className="btn ghost" onClick={clearAll}>
                <Trash2 size={18} />
                Clear
            </button>

            <div className="stats">
                <StatsCard label="Buildings" value={stats.buildings} />
                <StatsCard label="Eco Zones" value={stats.ecoZones} />
            </div>
        </aside>
    );
}
