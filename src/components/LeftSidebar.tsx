import { useEffect, useState } from "react";
import { Building2, Leaf, Trash2, Upload, FileText, X, Save, Search, Loader2 } from "lucide-react";
import StatsCard from "./StatsCard";
import type { BuildingConfig, BuildingTemplate } from "../types/building";
import { fetchTemplates, createTemplate, analyzeDocument } from "../api/buildingApi";

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
    selectedTemplateId: number | null;
    setSelectedTemplateId: (id: number | null) => void;
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
    setEcoMetric,
    selectedTemplateId,
    setSelectedTemplateId,
}: Props) {
    // ---- Template browser state ----
    const [templates, setTemplates] = useState<BuildingTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    // selectedTemplateId is now managed by App via props

    // ---- Save template state ----
    const [saveName, setSaveName] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    // ---- Analyze document state ----
    const [analyzing, setAnalyzing] = useState(false);
    const [verdict, setVerdict] = useState<string | null>(null);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    const update = (field: keyof BuildingConfig, value: any) => {
        setBuildingConfig({
            ...buildingConfig,
            [field]: value,
        });
    };

    // Fetch templates when build mode is activated
    useEffect(() => {
        if (mode === "build") {
            loadTemplates();
        }
    }, [mode]);

    const loadTemplates = async () => {
        setTemplatesLoading(true);
        setTemplatesError(null);
        try {
            const data = await fetchTemplates();
            setTemplates(data);
        } catch (err: any) {
            setTemplatesError(err.message ?? "Failed to load templates");
        } finally {
            setTemplatesLoading(false);
        }
    };

    // Apply a template to the building config form
    const applyTemplate = (tpl: BuildingTemplate) => {
        setSelectedTemplateId(tpl.id);
        setBuildingConfig({
            ...buildingConfig,
            type: (tpl.type as BuildingConfig["type"]) || "residential",
        });
        setMode("build"); // Auto-activate build mode
    };

    // Save current config as a new template
    const handleSave = async () => {
        if (!saveName.trim()) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            await createTemplate({
                name: saveName.trim(),
                type: buildingConfig.type,
                capacity: 0,
                cost: 0,
                energy: buildingConfig.floors * buildingConfig.floorHeight * 1.5,
                eco: buildingConfig.greenRoof ? 0.2 : 0.6,
            });
            setSaveMsg("Template saved!");
            setSaveName("");
            loadTemplates(); // refresh list
        } catch (err: any) {
            setSaveMsg(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // Analyze the uploaded file via Gemini
    const handleAnalyze = async () => {
        if (!buildingConfig.uploadedFile) return;
        setAnalyzing(true);
        setVerdict(null);
        setAnalyzeError(null);
        try {
            const result = await analyzeDocument(buildingConfig.uploadedFile);
            setVerdict(result.verdict);
        } catch (err: any) {
            setAnalyzeError(err.message ?? "Analysis failed");
        } finally {
            setAnalyzing(false);
        }
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
                    {/* ---- Template browser ---- */}
                    <div className="template-section">
                        <div className="template-header">
                            <Search size={14} />
                            <span>Saved Templates</span>
                            <button className="refresh-btn" onClick={loadTemplates} title="Refresh">
                                ↻
                            </button>
                        </div>

                        {templatesLoading && (
                            <div className="template-loading">
                                <Loader2 size={14} className="spin" /> Loading…
                            </div>
                        )}

                        {templatesError && (
                            <div className="template-error">{templatesError}</div>
                        )}

                        {!templatesLoading && !templatesError && templates.length === 0 && (
                            <div className="template-empty">No templates yet</div>
                        )}

                        {!templatesLoading && templates.length > 0 && (
                            <div className="template-list">
                                {templates.map((tpl) => (
                                    <div
                                        key={tpl.id}
                                        className={`template-card ${selectedTemplateId === tpl.id ? "selected" : ""}`}
                                        onClick={() => applyTemplate(tpl)}
                                    >
                                        <div className="template-name">{tpl.name}</div>
                                        <div className="template-meta">
                                            {tpl.type} · eco {tpl.eco}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ---- Building config form ---- */}
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
                            <option value="hospital">Hospital</option>
                            <option value="municipality">Municipality</option>
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

                    {/* ---- File upload ---- */}
                    <div className="file-upload">
                        <label className="file-label">
                            <Upload size={14} />
                            <span>Upload Blueprint / PDF</span>
                            <input
                                type="file"
                                accept=".pdf,.glb,.gltf,.obj,.fbx,.png,.jpg,.jpeg"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    update("uploadedFile", file);
                                    // Reset previous analysis when a new file is picked
                                    setVerdict(null);
                                    setAnalyzeError(null);
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
                                    onClick={() => {
                                        update("uploadedFile", null);
                                        setVerdict(null);
                                        setAnalyzeError(null);
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* Analyze button — always available when a file is uploaded */}
                        {buildingConfig.uploadedFile && (
                            <button
                                className="btn analyze-btn"
                                onClick={handleAnalyze}
                                disabled={analyzing}
                            >
                                {analyzing ? (
                                    <><Loader2 size={14} className="spin" /> Analyzing…</>
                                ) : (
                                    <><Search size={14} /> Analyze with AI</>
                                )}
                            </button>
                        )}

                        {/* AI Verdict panel */}
                        {verdict && (
                            <div className="ai-verdict">
                                <div className="ai-verdict-title">AI Analysis</div>
                                <div className="ai-verdict-text">{verdict}</div>
                            </div>
                        )}

                        {analyzeError && (
                            <div className="template-error">{analyzeError}</div>
                        )}
                    </div>

                    <div className="calculated">
                        <div>Total height: {totalHeight.toFixed(1)} m</div>
                        <div>Area: {area.toFixed(0)} m²</div>
                        <div>Volume: {volume.toFixed(0)} m³</div>
                    </div>

                    {/* ---- Save as template ---- */}
                    <div className="save-template">
                        <input
                            type="text"
                            placeholder="Template name…"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                        />
                        <button
                            className="btn save-template-btn"
                            onClick={handleSave}
                            disabled={saving || !saveName.trim()}
                        >
                            {saving ? (
                                <><Loader2 size={14} className="spin" /> Saving…</>
                            ) : (
                                <><Save size={14} /> Save Template</>
                            )}
                        </button>
                        {saveMsg && (
                            <div className={`save-msg ${saveMsg.startsWith("Error") ? "error" : ""}`}>
                                {saveMsg}
                            </div>
                        )}
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
