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

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;

type Mode = "none" | "build" | "eco";
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

const cityCoords = { lon: 82.614, lat: 49.948 };

export default function App() {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);

  const modeRef = useRef<Mode>("none");
  const buildingConfigRef = useRef<BuildingConfig | null>(null);

  const [mode, setMode] = useState<Mode>("none");
  const [pitch, setPitch] = useState(-30);
  const [heading, setHeading] = useState(0);
  const [height, setHeight] = useState(2000);

  const [stats, setStats] = useState({
    buildings: 0,
    ecoZones: 0,
  });

  const [buildingsVisible, setBuildingsVisible] = useState(true);

  const [buildingConfig, setBuildingConfig] = useState<BuildingConfig>({
    type: "residential",
    width: 40,
    length: 40,
    floors: 5,
    floorHeight: 3,
    material: "concrete",
    color: "#f97316",
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
  }, [mode, ecoMetric]);


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

      const air = props?.air_index ?? 0;
      const traffic = props?.traffic_index ?? 0;

      // --- AIR QUALITY MODE ---
      if (ecoMetric === "air" && entity.polygon) {
        const color = getAirColor(air);

        entity.polygon.material = new ColorMaterialProperty(color);
        entity.polygon.outline = false;
        entity.polygon.height = 0;
        entity.polygon.extrudedHeight = 0;
      }

      // --- TRAFFIC MODE ---
      if (ecoMetric === "traffic") {
        // если есть геометрия линии — делаем дорогу
        if (entity.polyline) {
          const { color, width } = getTrafficStyle(traffic);

          entity.polyline.material = new PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: color,
          });
          entity.polyline.width = width;
          entity.polyline.clampToGround = true;
        }

        // если в geojson дороги как полигоны — конвертим их
        if (entity.polygon) {
          const hierarchy = entity.polygon.hierarchy?.getValue();
          if (!hierarchy) return;

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

          viewer.entities.remove(entity);
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

    handler.setInputAction((movement) => {
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

          setStats((s) => ({ ...s, buildings: s.buildings + 1 }));
        }

      });
    }, ScreenSpaceEventType.LEFT_CLICK);

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
