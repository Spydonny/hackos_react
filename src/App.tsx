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
  CesiumTerrainProvider,
  createOsmBuildingsAsync,
  Cesium3DTileset,
  Cesium3DTileStyle,
  sampleTerrainMostDetailed,
  GeoJsonDataSource,
  ColorMaterialProperty,
  PolylineGlowMaterialProperty,
} from "cesium";

import "./App.css";
import { LeftSidebar } from "./components/LeftSidebar";
import RightSidebar from "./components/RightSidebar";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { ConstantProperty } from "cesium";
import type { BuildingConfig } from "./types/building";
import { placeBuilding } from "./api/buildingApi";
import type { PlaceBuildingResponse } from "./api/buildingApi";
import type { Entity } from "cesium";

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;

type Mode = "none" | "build" | "eco";

const cityCoords = { lon: 82.614, lat: 49.948 };

export default function App() {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);

  const modeRef = useRef<Mode>("none");
  const buildingConfigRef = useRef<BuildingConfig | null>(null);

  // Template selection state — lifted from LeftSidebar
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const selectedTemplateIdRef = useRef<number | null>(null);

  // Ghost building preview entity
  const ghostEntityRef = useRef<Entity | null>(null);

  // Result of the last building placement
  const [placementResult, setPlacementResult] = useState<PlaceBuildingResponse | null>(null);

  const [mode, setMode] = useState<Mode>("none");
  const [pitch, setPitch] = useState(-30);
  const [heading, setHeading] = useState(0);
  const [height, setHeight] = useState(2000);

  const [stats, setStats] = useState({
    buildings: 0,
    ecoZones: 0,
  });

  const [, setBuildingsVisible] = useState(true);

  const [buildingConfig, setBuildingConfig] = useState<BuildingConfig>({
    type: "residential",
    width: 40,
    length: 40,
    floors: 5,
    floorHeight: 3,
    material: "concrete",
    color: "#804115ff",
    windowDensity: 50,
    greenRoof: false,
    solarPanels: false,
    nightLights: false,
    uploadedFile: null,
  });

  const [ecoMetric, setEcoMetric] = useState<"air" | "traffic">("air");
  const ecoDataSourceRef = useRef<GeoJsonDataSource | null>(null);


  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    buildingConfigRef.current = buildingConfig;
  }, [buildingConfig]);

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  const totalHeight = buildingConfig.floors * buildingConfig.floorHeight;
  const area = buildingConfig.width * buildingConfig.length;
  const volume = area * totalHeight;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (mode === "eco") {
      loadEcoGeoJSON();
    } else {
      if (ecoDataSourceRef.current) {
        viewer.dataSources.remove(ecoDataSourceRef.current);
        ecoDataSourceRef.current = null;
      }
    }
  }, [mode]);

  useEffect(() => {
    const tileset = tilesetRef.current;
    if (!tileset) return;

    if (mode === "eco") {
      tileset.style = new Cesium3DTileStyle({
        color: {
          conditions: [
            ["true", "color('#1f2937', 0.7)"], // Neutral dark grey for Eco Mode
          ],
        },
      });
    } else {
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
    }
  }, [mode]);


  const loadEcoGeoJSON = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (ecoDataSourceRef.current) {
      viewer.dataSources.remove(ecoDataSourceRef.current);
    }

    const dataSource = await GeoJsonDataSource.load(
      "/data/oskemen_for_cesium_opt.geojson",
      { clampToGround: true }
    );

    ecoDataSourceRef.current = dataSource;
    viewer.dataSources.add(dataSource);

    const entities = dataSource.entities.values;

    entities.forEach((entity) => {
      const props = entity.properties?.getValue();
      const type = props?.type;

      const air = props?.air_index ?? 0;
      const traffic = props?.traffic_index ?? 0;

      // --- AIR ZONES ---
      if (type === "air" && entity.polygon) {
        const color = getAirColor(air);

        entity.polygon.material = new ColorMaterialProperty(color);
        entity.polygon.outline = new ConstantProperty(false);
        entity.polygon.height = new ConstantProperty(0);
        entity.polygon.extrudedHeight = new ConstantProperty(0);
      }


      // --- ROADS AS LINES ---
      if (type === "road") {
        // If already polyline
        if (entity.polyline) {
          const { color, width } = getTrafficStyle(traffic);

          entity.polyline.material = new PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: color,
          });

          entity.polyline.width = new ConstantProperty(width);
          entity.polyline.clampToGround = new ConstantProperty(true);
        }

        // If road is polygon → convert to line
        if (entity.polygon) {
          const hierarchy = entity.polygon.hierarchy?.getValue();
          if (hierarchy) {
            const { color, width } = getTrafficStyle(traffic);

            viewer.entities.add({
              polyline: {
                positions: hierarchy.positions,
                width: width,
                material: new PolylineGlowMaterialProperty({
                  glowPower: 0.2,
                  color: color,
                }),
                clampToGround: true,
              },
            });

            // hide polygon
            entity.polygon.show = new ConstantProperty(false);
          }
        }
      }
    });


    setStats((s) => ({ ...s, ecoZones: entities.length }));
  };

  const getAirColor = (value: number) => {
    const v = Math.max(0, Math.min(1, value));

    if (v < 0.2) return Color.fromCssColorString("#22c55e").withAlpha(0.15);
    if (v < 0.4) return Color.fromCssColorString("#84cc16").withAlpha(0.2);
    if (v < 0.6) return Color.fromCssColorString("#eab308").withAlpha(0.25);
    if (v < 0.8) return Color.fromCssColorString("#f97316").withAlpha(0.3);

    return Color.fromCssColorString("#ef4444").withAlpha(0.35);
  };

  const getTrafficStyle = (value: number) => {
    const v = Math.max(0, Math.min(1, value));

    let color;
    let width;

    if (v < 0.3) {
      color = Color.LIME;
      width = 2;
    } else if (v < 0.6) {
      color = Color.YELLOW;
      width = 4;
    } else if (v < 0.8) {
      color = Color.ORANGE;
      width = 6;
    } else {
      color = Color.RED;
      width = 8;
    }

    return { color, width };
  };



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

    viewer.camera.moveEnd.addEventListener(() => {
      const rect = viewer.camera.computeViewRectangle();
      if (!rect) return;

      const west = CesiumMath.toDegrees(rect.west);
      const east = CesiumMath.toDegrees(rect.east);
      const south = CesiumMath.toDegrees(rect.south);
      const north = CesiumMath.toDegrees(rect.north);

      ecoDataSourceRef.current?.entities.values.forEach((entity) => {
        // Note: Generic entities from GeoJSON (polygons/lines) might not have a .position.
        // If we want to support them, we'd need to check their geometry or set a property.
        const pos = entity.position?.getValue(viewer.clock.currentTime);
        if (!pos) return;

        const cart = Cartographic.fromCartesian(pos);
        const lon = CesiumMath.toDegrees(cart.longitude);
        const lat = CesiumMath.toDegrees(cart.latitude);

        entity.show =
          lon > west && lon < east && lat > south && lat < north;
      });
    });

    viewer.scene.globe.depthTestAgainstTerrain = true;

    CesiumTerrainProvider.fromIonAssetId(1).then((terrain) => {
      viewer.terrainProvider = terrain;
    });

    createOsmBuildingsAsync().then((tileset) => {
      viewer.scene.primitives.add(tileset);
      tilesetRef.current = tileset;

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
        height
      ),
      orientation: {
        heading: CesiumMath.toRadians(heading),
        pitch: CesiumMath.toRadians(pitch),
        roll: 0,
      },
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: any) => {
      if (modeRef.current === "none") return;

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

        if (modeRef.current === "build") {
          const config = buildingConfigRef.current;
          const templateId = selectedTemplateIdRef.current;
          if (!config) return;

          const {
            width,
            length,
            floors,
            floorHeight,
            material,
            color,
            greenRoof,
            nightLights,
          } = config;

          const heightTotal = floors * floorHeight;
          let materialColor = Color.fromCssColorString(color);

          if (material === "glass") {
            materialColor = materialColor.withAlpha(0.5);
          }

          if (material === "steel") {
            materialColor = Color.SILVER;
          }

          if (nightLights) {
            materialColor = materialColor.brighten(0.5, new Color());
          }

          const shiftLon = 0.00004;
          const shiftLat = -0.00002;

          // --- Optimistic UI: draw building immediately ---
          viewer.entities.add({
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray([
                lon - width * 0.000005 + shiftLon,
                lat - length * 0.000005 + shiftLat,
                lon + width * 0.000005 + shiftLon,
                lat - length * 0.000005 + shiftLat,
                lon + width * 0.000005 + shiftLon,
                lat + length * 0.000005 + shiftLat,
                lon - width * 0.000005 + shiftLon,
                lat + length * 0.000005 + shiftLat,
              ]),
              height: ground,
              extrudedHeight: ground + heightTotal,
              material: materialColor,
            },
          });

          if (greenRoof) {
            viewer.entities.add({
              position: Cartesian3.fromDegrees(
                lon,
                lat,
                ground + heightTotal
              ),
              ellipse: {
                semiMinorAxis: width * 10,
                semiMajorAxis: length * 10,
                material: Color.GREEN.withAlpha(0.7),
              },
            });
          }

          // --- Remove ghost preview after placing ---
          if (ghostEntityRef.current) {
            viewer.entities.remove(ghostEntityRef.current);
            ghostEntityRef.current = null;
          }

          // --- Send to backend ---
          const payload = {
            lat,
            lng: lon,
            template_id: templateId,
            type: config.type,
            width,
            length,
            floors,
            floor_height: floorHeight,
          };

          placeBuilding(payload)
            .then((data) => {
              console.log("Building placed:", data);
              // Use analysis data if nested, otherwise use top-level
              const result = data.analysis || data;
              setPlacementResult(result);
            })
            .catch((err) => console.error("Place building error:", err));

          setStats((s) => ({ ...s, buildings: s.buildings + 1 }));
        }

      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // --- Ghost building preview on MOUSE_MOVE ---
    handler.setInputAction((movement: any) => {
      if (modeRef.current !== "build") {
        // Remove ghost when not in build mode
        if (ghostEntityRef.current) {
          viewer.entities.remove(ghostEntityRef.current);
          ghostEntityRef.current = null;
        }
        return;
      }

      const config = buildingConfigRef.current;
      if (!config) return;

      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (!ray) return;
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!defined(cartesian)) return;

      const cartographic = Cartographic.fromCartesian(cartesian);
      const gLon = CesiumMath.toDegrees(cartographic.longitude);
      const gLat = CesiumMath.toDegrees(cartographic.latitude);
      const gHeight = cartographic.height ?? 0;

      const { width, length, floors, floorHeight, color } = config;
      const heightTotal = floors * floorHeight;
      const shiftLon = 0.00004;
      const shiftLat = -0.00002;

      // Remove old ghost
      if (ghostEntityRef.current) {
        viewer.entities.remove(ghostEntityRef.current);
      }

      const ghostColor = Color.fromCssColorString(color).withAlpha(0.3);

      ghostEntityRef.current = viewer.entities.add({
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray([
            gLon - width * 0.000005 + shiftLon,
            gLat - length * 0.000005 + shiftLat,
            gLon + width * 0.000005 + shiftLon,
            gLat - length * 0.000005 + shiftLat,
            gLon + width * 0.000005 + shiftLon,
            gLat + length * 0.000005 + shiftLat,
            gLon - width * 0.000005 + shiftLon,
            gLat + length * 0.000005 + shiftLat,
          ]),
          height: gHeight,
          extrudedHeight: gHeight + heightTotal,
          material: ghostColor,
        },
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, []);


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
    const viewer = viewerRef.current;
    if (!viewer) return;

    // удалить все пользовательские entities (здания, дороги и т.д.)
    viewer.entities.removeAll();

    // удалить GeoJSON из сцены и памяти
    if (ecoDataSourceRef.current) {
      viewer.dataSources.remove(ecoDataSourceRef.current, true);
      // true = destroy => удаляет из памяти
      ecoDataSourceRef.current = null;
    }

    // вернуть режим
    setMode("none");

    // сбросить статистику
    setStats({ buildings: 0, ecoZones: 0 });

    // вернуть камеру к старту города
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
  };


  const toggleBuildings = () => {
    if (!tilesetRef.current) return;

    setBuildingsVisible((prev) => {
      tilesetRef.current!.show = !prev;
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
        buildingConfig={buildingConfig}
        setBuildingConfig={setBuildingConfig}
        totalHeight={totalHeight}
        area={area}
        volume={volume}
        ecoMetric={ecoMetric}
        setEcoMetric={setEcoMetric}
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
      />

      {placementResult && (
        <div className="placement-result-card">
          <div className="result-header">
            <h3>Construction Report</h3>
            <button onClick={() => setPlacementResult(null)}>×</button>
          </div>
          <div className="result-content">
            <div className="result-item">
              <span className="label">District:</span>
              <span className="value">
                {placementResult.district_name || "N/A"}
              </span>
            </div>
            <div className="result-item">
              <span className="label">Eco Status:</span>
              <span className="value status-highlight">
                {placementResult.eco_status || "Unknown"}
              </span>
            </div>
            <div className="result-item">
              <span className="label">Energy Impact:</span>
              <span className="value">{placementResult.energy_impact ?? 0}</span>
            </div>
            {placementResult.alerts && placementResult.alerts.length > 0 && (
              <div className="result-alerts">
                <strong>Alerts:</strong>
                <ul>
                  {placementResult.alerts.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

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
