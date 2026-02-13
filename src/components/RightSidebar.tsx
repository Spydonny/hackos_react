type Props = {
    pitch: number;
    heading: number;
    height: number;
    setPitch: (v: number) => void;
    setHeading: (v: number) => void;
    setHeight: (v: number) => void;
    toggleBuildings: () => void;
};

export default function RightSidebar({
    pitch,
    heading,
    height,
    setPitch,
    setHeading,
    setHeight,
    toggleBuildings,
}: Props) {
    return (
        <aside className="sidebar right">
            <h2>Camera</h2>

            <div className="control">
                <label>Pitch {pitch}°</label>
                <input
                    type="range"
                    min={-90}
                    max={0}
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                />
            </div>

            <div className="control">
                <label>Heading {heading}°</label>
                <input
                    type="range"
                    min={0}
                    max={360}
                    value={heading}
                    onChange={(e) => setHeading(Number(e.target.value))}
                />
            </div>

            <div className="control">
                <label>Height {height}m</label>
                <input
                    type="range"
                    min={500}
                    max={10000}
                    step={100}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                />
            </div>

            <button className="btn" onClick={toggleBuildings}>
                Toggle Buildings
            </button>
        </aside>
    );
}
