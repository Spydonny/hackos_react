import { Building2, Leaf, Trash2 } from "lucide-react";
import StatsCard from "./StatsCard";

type Props = {
    mode: string;
    setMode: (m: any) => void;
    stats: { buildings: number; ecoZones: number };
    clearAll: () => void;
};

export default function LeftSidebar({
    mode,
    setMode,
    stats,
    clearAll,
}: Props) {
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

            <button
                className={`btn ${mode === "eco" ? "active" : ""}`}
                onClick={() => setMode("eco")}
            >
                <Leaf size={18} />
                Eco Zones
            </button>

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
