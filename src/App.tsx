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
  CustomDataSource,
  ColorMaterialProperty,
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
  const ecoDataSourceRef = useRef<CustomDataSource | null>(null);


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
  }, [mode, ecoMetric]);

  useEffect(() => {
    const tileset = tilesetRef.current;
    if (!tileset) return;

    if (mode === "eco") {
      tileset.style = new Cesium3DTileStyle({
        color: {
          conditions: [
            ["true", "color('#5600bfff')"], // Neutral dark grey for Eco Mode
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
            ["true", "color('#5600bfff')"],
          ],
        },
      });
    }
  }, [mode]);


  const loadEcoGeoJSON = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();

    if (ecoDataSourceRef.current) {
      viewer.dataSources.remove(ecoDataSourceRef.current);
      ecoDataSourceRef.current = null;
    }

    const dataSource = new CustomDataSource("eco");
    viewer.dataSources.add(dataSource);
    ecoDataSourceRef.current = dataSource;

    // Максимум хаоса: север чуть грязнее + много слоёв шума разного масштаба
    if (ecoMetric === "air") {
      const heightM = 25;
      const cell = 0.00115;
      const lonMin = 82.52;
      const lonMax = 82.72;
      const latMin = 49.88;
      const latMax = 50.02;
      const latSpan = latMax - latMin;

      const threeColors = [
        Color.fromCssColorString("#22c55e").withAlpha(0.52),
        Color.fromCssColorString("#eab308").withAlpha(0.52),
        Color.fromCssColorString("#ef4444").withAlpha(0.52),
      ];

      const chaos = (xi: number, yj: number) => {
        const x = xi * 0.08;
        const y = yj * 0.08;
        const a = Math.sin(x) * Math.cos(y * 1.7);
        const b = Math.sin((x + 11) * 2.3) * Math.cos((y + 7) * 1.1);
        const c = Math.sin((x * 0.4 + y * 0.6) * 3.1);
        const d = Math.cos((x * 1.3 - y * 0.9) * 2.7);
        const e = Math.sin(x * 5.2 + y * 4.1) * 0.5;
        const f = Math.cos((xi * 0.15 + yj * 0.22) * Math.PI);
        return (a + b + c + d + e + f) / 6;
      };

      for (let j = 0; ; j++) {
        const y0 = latMin + j * cell;
        if (y0 >= latMax) break;
        const yCenter = y0 + cell * 0.5;
        const tBase = (yCenter - latMin) / latSpan;

        for (let i = 0; ; i++) {
          const x0 = lonMin + i * cell;
          if (x0 >= lonMax) break;

          const n = chaos(i, j);
          const bump = 0.07 * Math.sin(i * 0.2 + j * 0.17) * Math.cos((i - j) * 0.1);
          const t = Math.max(0, Math.min(1, tBase * 0.25 + 0.5 + n * 0.55 + bump));
          const colorIndex = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
          const color = threeColors[colorIndex];

          const flat = [
            x0, y0,
            x0 + cell, y0,
            x0 + cell, y0 + cell,
            x0, y0 + cell,
            x0, y0,
          ];
          const flatWithHeight = flat.flatMap((v, idx) =>
            idx % 2 === 1 ? [v, heightM] : [v]
          );
          dataSource.entities.add({
            polygon: {
              hierarchy: Cartesian3.fromDegreesArrayHeights(flatWithHeight),
              material: color,
              outline: false,
              fill: true,
            },
          });
        }
      }
    }

    // Трафик: реальные дороги из OSM (Overpass) или fallback — изолинии по сетке
    if (ecoMetric === "traffic") {
      const lonMin = 82.52;
      const lonMax = 82.72;
      const latMin = 49.88;
      const latMax = 50.02;
      const lonC = 82.614;
      const latC = 49.948;

      const trafficColor = (t: number) =>
        t < 0.4
          ? Color.fromCssColorString("#22c55e").withAlpha(0.85)
          : t < 0.78
            ? Color.fromCssColorString("#eab308").withAlpha(0.85)
            : Color.fromCssColorString("#ef4444").withAlpha(0.85);

      let useOsmRoads = false;
      try {
        const overpassQuery = `[out:json][timeout:25];
(way["highway"](${latMin},${lonMin},${latMax},${lonMax}););
out geom;`;
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: overpassQuery,
          headers: { "Content-Type": "text/plain" },
        });
        if (res.ok) {
          const data = await res.json();
          const ways = (data.elements || []).filter((e: { type: string }) => e.type === "way");
          for (const way of ways) {
            const geom = (way as { geometry?: { lat: number; lon: number }[] }).geometry;
            if (!geom || geom.length < 2) continue;
            const flat = geom.flatMap((p: { lat: number; lon: number }) => [p.lon, p.lat]);
            const avgLon = geom.reduce((s: number, p: { lon: number }) => s + p.lon, 0) / geom.length;
            const avgLat = geom.reduce((s: number, p: { lat: number }) => s + p.lat, 0) / geom.length;
            const dist = Math.sqrt((avgLon - lonC) ** 2 + (avgLat - latC) ** 2);
            const tags = (way as { tags?: { highway?: string } }).tags || {};
            const hw = (tags.highway || "").toLowerCase();
            const roadBonus =
              hw === "motorway" || hw === "trunk" ? 0.35 : hw === "primary" ? 0.25 : hw === "secondary" ? 0.15 : 0;
            const wayId = (way as { id?: number }).id || 0;
            const bump =
              0.18 * Math.sin(wayId * 0.7) +
              0.12 * Math.cos(avgLon * 80) * Math.sin(avgLat * 60) +
              0.08 * Math.sin(flat.length * 0.3 + wayId * 0.2);
            const t = Math.max(0, Math.min(1, 1 - dist / 0.08 + roadBonus + bump));
            dataSource.entities.add({
              polyline: {
                positions: Cartesian3.fromDegreesArray(flat),
                width: hw === "motorway" || hw === "trunk" ? 4 : hw === "primary" ? 3 : 2,
                material: trafficColor(t),
                clampToGround: true,
              },
            });
          }
          useOsmRoads = dataSource.entities.values.length > 0;
        }
      } catch (_) {
        useOsmRoads = false;
      }

      if (!useOsmRoads) {
      const cell = 0.002;
      const bridgeLat = 49.94;

      const ni = Math.ceil((lonMax - lonMin) / cell);
      const nj = Math.ceil((latMax - latMin) / cell);
      const grid: number[][] = [];
      for (let j = 0; j <= nj; j++) {
        const row: number[] = [];
        for (let i = 0; i <= ni; i++) {
          const lon = lonMin + i * cell;
          const lat = latMin + j * cell;
          const dist = Math.sqrt((lon - lonC) ** 2 + (lat - latC) ** 2);
          const centerFactor = Math.max(0, 1 - dist / 0.08);
          const bridgeFactor = 0.6 * Math.exp(-((lat - bridgeLat) ** 2) / 0.00015);
          const noise =
            0.08 * Math.sin(i * 0.04) * Math.cos(j * 0.04) +
            0.11 * Math.sin((i + 7) * 0.09) * Math.cos((j + 3) * 0.07) +
            0.06 * Math.cos(i * 0.15 + j * 0.12);
          row.push(Math.max(0, Math.min(1, centerFactor + bridgeFactor + noise)));
        }
        grid.push(row);
      }

      const lerp = (a: number[], b: number[], t: number) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      const isoLevels = [0.25, 0.5, 0.75];
      const isoColors = [
        Color.fromCssColorString("#22c55e").withAlpha(0.9),
        Color.fromCssColorString("#eab308").withAlpha(0.9),
        Color.fromCssColorString("#ef4444").withAlpha(0.9),
      ];

      for (let li = 0; li < isoLevels.length; li++) {
        const L = isoLevels[li];
        const segments: { a: number[]; b: number[] }[] = [];
        const edgeEnds = [
          (i: number, j: number) => [lonMin + i * cell, latMin + j * cell],
          (i: number, j: number) => [lonMin + (i + 1) * cell, latMin + j * cell],
          (i: number, j: number) => [lonMin + (i + 1) * cell, latMin + (j + 1) * cell],
          (i: number, j: number) => [lonMin + i * cell, latMin + (j + 1) * cell],
        ];
        const edgeVals = (i: number, j: number) => [
          [grid[j][i], grid[j][i + 1]],
          [grid[j][i + 1], grid[j + 1][i + 1]],
          [grid[j + 1][i + 1], grid[j + 1][i]],
          [grid[j + 1][i], grid[j][i]],
        ];

        for (let j = 0; j < nj; j++) {
          for (let i = 0; i < ni; i++) {
            const v00 = grid[j][i];
            const v10 = grid[j][i + 1];
            const v11 = grid[j + 1][i + 1];
            const v01 = grid[j + 1][i];
            const c0 = v00 >= L ? 1 : 0;
            const c1 = v10 >= L ? 1 : 0;
            const c2 = v11 >= L ? 1 : 0;
            const c3 = v01 >= L ? 1 : 0;
            const idx = c0 + c1 * 2 + c2 * 4 + c3 * 8;
            const pts: number[][] = [];
            const addEdge = (edge: number) => {
              const [vA, vB] = edgeVals(i, j)[edge];
              const t = Math.abs(vB - vA) < 1e-9 ? 0.5 : (L - vA) / (vB - vA);
              const p = lerp(edgeEnds[edge](i, j), edgeEnds[(edge + 1) % 4](i, j), t);
              pts.push(p);
            };
            if (idx === 1) { addEdge(0); addEdge(3); }
            else if (idx === 2) { addEdge(0); addEdge(1); }
            else if (idx === 3) { addEdge(1); addEdge(3); }
            else if (idx === 4) { addEdge(1); addEdge(2); }
            else if (idx === 5) { addEdge(0); addEdge(1); addEdge(2); addEdge(3); }
            else if (idx === 6) { addEdge(0); addEdge(2); }
            else if (idx === 7) { addEdge(2); addEdge(3); }
            else if (idx === 8) { addEdge(2); addEdge(3); }
            else if (idx === 9) { addEdge(0); addEdge(2); }
            else if (idx === 10) { addEdge(1); addEdge(3); addEdge(0); addEdge(2); }
            else if (idx === 11) { addEdge(1); addEdge(2); }
            else if (idx === 12) { addEdge(1); addEdge(3); }
            else if (idx === 13) { addEdge(0); addEdge(1); }
            else if (idx === 14) { addEdge(0); addEdge(3); }
            for (let k = 0; k < pts.length; k += 2) {
              if (pts[k + 1]) segments.push({ a: pts[k], b: pts[k + 1] });
            }
          }
        }

        const key = (p: number[]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
        const segKey = (s: { a: number[]; b: number[] }) => key(s.a) + "|" + key(s.b);
        const eps = 1e-8;
        const extend = (from: number[], usedSegs: Set<string>): number[] => {
          const out: number[] = [];
          let cur = from;
          for (;;) {
            let found = false;
            for (const s of segments) {
              if (usedSegs.has(segKey(s))) continue;
              const matchA = Math.abs(cur[0] - s.a[0]) < eps && Math.abs(cur[1] - s.a[1]) < eps;
              const matchB = Math.abs(cur[0] - s.b[0]) < eps && Math.abs(cur[1] - s.b[1]) < eps;
              const next = matchA ? s.b : matchB ? s.a : null;
              if (next) {
                usedSegs.add(segKey(s));
                cur = next;
                out.push(next[0], next[1]);
                found = true;
                break;
              }
            }
            if (!found) break;
          }
          return out;
        };

        const reverseFlat = (arr: number[]) => {
          const out: number[] = [];
          for (let i = arr.length - 2; i >= 0; i -= 2) out.push(arr[i], arr[i + 1]);
          return out;
        };
        const usedSegs = new Set<string>();
        for (const s of segments) {
          if (usedSegs.has(segKey(s))) continue;
          const fwd = extend(s.a, usedSegs);
          usedSegs.delete(segKey(s));
          const bwd = extend(s.b, usedSegs);
          usedSegs.add(segKey(s));
          const flat = [...s.a, ...fwd, ...reverseFlat(bwd)];
          if (flat.length >= 4) {
            const positions = Cartesian3.fromDegreesArray(flat);
            dataSource.entities.add({
              polyline: {
                positions,
                width: 2.5,
                material: isoColors[li],
                clampToGround: true,
              },
            });
          }
        }
      }
      }
    }

    const count = dataSource.entities.values.length;
    viewer.scene.requestRender();
    setStats((s) => ({ ...s, ecoZones: count }));
  };

  const getAirColor = (value: number) => {
    const v = Math.max(0, Math.min(1, value));

    if (v < 0.2) return Color.fromCssColorString("#22c55e").withAlpha(0.92);
    if (v < 0.4) return Color.fromCssColorString("#84cc16").withAlpha(0.92);
    if (v < 0.6) return Color.fromCssColorString("#eab308").withAlpha(0.92);
    if (v < 0.8) return Color.fromCssColorString("#f97316").withAlpha(0.92);

    return Color.fromCssColorString("#ef4444").withAlpha(0.92);
  };

  const getTrafficStyle = (value: number) => {
    const v = Math.max(0, Math.min(1, value));

    let width;

    if (v < 0.3) {
      width = 2;
    } else if (v < 0.6) {
      width = 4;
    } else if (v < 0.8) {
      width = 6;
    } else {
      width = 8;
    }

    return { width };
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
