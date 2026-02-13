import { useEffect, useRef, useState } from "react";
import {
  Viewer,
  Ion,
  Cartesian3,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  defined,
  Color,
  LabelStyle,
  Cartesian2,
  CesiumTerrainProvider,
  createOsmBuildingsAsync,
  Cesium3DTileset,
  Cesium3DTileStyle,
  sampleTerrainMostDetailed
} from "cesium";

import "./App.css";
import LeftSidebar from "./components/LeftSidebar";
import RightSidebar from "./components/RightSidebar";

import "cesium/Build/Cesium/Widgets/widgets.css";


Ion.defaultAccessToken = import.meta.env.CESIUM_ION_ACCESS_TOKEN;

type Mode = "none" | "build" | "eco";

const cityCoords = { lon: 82.614, lat: 49.948 };

export default function App() {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const [mode, setMode] = useState<Mode>("none");
  const [pitch, setPitch] = useState(-30);
  const [heading, setHeading] = useState(0);
  const [height, setHeight] = useState(2000);

  const [stats, setStats] = useState({
    buildings: 0,
    ecoZones: 0,
  });

  const [buildingsVisible, setBuildingsVisible] = useState(true);

  // INIT
  useEffect(() => {
    if (!cesiumRef.current) return;

    const viewer = new Viewer(cesiumRef.current, {
      baseLayerPicker: false,
      timeline: false,
      animation: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
    });

    viewerRef.current = viewer;

    viewer.scene.globe.depthTestAgainstTerrain = true;

    // terrain
    CesiumTerrainProvider.fromIonAssetId(1).then((terrain) => {
      viewer.terrainProvider = terrain;
    });

    // buildings
    createOsmBuildingsAsync().then((tileset) => {
      viewer.scene.primitives.add(tileset);

      tileset.style = new Cesium3DTileStyle({
        color: {
          conditions: [
            ["${feature['building']} === 'apartments'", "color('#eab308',0.9)"],
            ["${feature['building']} === 'commercial'", "color('#60a5fa',0.9)"],
            ["Number(${feature['building:levels']}) >= 10", "color('#ef4444',0.9)"],
            ["true", "color('#e5e7eb',0.9)"],
          ],
        },
      });
    });

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        cityCoords.lon,
        cityCoords.lat,
        2000
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-30),
        roll: 0,
      },
    });

    // click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement) => {
      if (mode === "none") return;

      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian = viewer.scene.globe.pick(ray!, viewer.scene);
      if (!defined(cartesian)) return;

      const cartographic = Cartographic.fromCartesian(cartesian);
      const lon = CesiumMath.toDegrees(cartographic.longitude);
      const lat = CesiumMath.toDegrees(cartographic.latitude);

      sampleTerrainMostDetailed(viewer.terrainProvider, [
        cartographic,
      ]).then((samples) => {
        const ground = samples[0].height ?? 0;

        if (mode === "build") {
          viewer.entities.add({
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray([
                lon - 0.0003,
                lat - 0.0003,
                lon + 0.0003,
                lat - 0.0003,
                lon + 0.0003,
                lat + 0.0003,
                lon - 0.0003,
                lat + 0.0003,
              ]),
              height: ground,
              extrudedHeight: ground + 100,
              material: Color.ORANGE.withAlpha(0.8),
            },
          });

          setStats((s) => ({ ...s, buildings: s.buildings + 1 }));
        }

        if (mode === "eco") {
          viewer.entities.add({
            position: Cartesian3.fromDegrees(lon, lat, ground + 1),
            ellipse: {
              semiMinorAxis: 500,
              semiMajorAxis: 500,
              material: Color.LIMEGREEN.withAlpha(0.4),
              height: ground,
            },
          });

          setStats((s) => ({ ...s, ecoZones: s.ecoZones + 1 }));
        }
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, [mode]);

  // camera update
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        cityCoords.lon,
        cityCoords.lat,
        height
      ),
      orientation: {
        heading: CesiumMath.toRadians(heading),
        pitch: CesiumMath.toRadians(pitch),
        roll: 0,
      },
    });
  }, [pitch, heading, height]);

  const clearAll = () => {
    viewerRef.current?.entities.removeAll();
    setStats({ buildings: 0, ecoZones: 0 });
    setMode("none");
  };

  const toggleBuildings = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setBuildingsVisible((prev) => {
      viewer.scene.primitives._primitives.forEach((p) => {
        if (p instanceof Cesium3DTileset) {
          p.show = !prev;
        }
      });
      return !prev;
    });
  };

  return (
    <div className="app">
      <LeftSidebar
        mode={mode}
        setMode={setMode}
        stats={stats}
        clearAll={clearAll}
      />

      <div className="viewer" ref={cesiumRef} />

      <RightSidebar
        pitch={pitch}
        heading={heading}
        height={height}
        setPitch={setPitch}
        setHeading={setHeading}
        setHeight={setHeight}
        toggleBuildings={toggleBuildings}
      />
    </div>
  );
}
