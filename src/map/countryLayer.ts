import { canvas, layerGroup, polygon, type LayerGroup, type Map as LMap, type Polygon } from 'leaflet';
import { loadCountryIndex } from '../geo';
import { buildCountryShapes } from './countryShapes';

export interface CountryBaseColors {
  land: string;
  border: string;
}

export interface CountryBase {
  layer: LayerGroup;
  restyle(colors: CountryBaseColors): void;
}

const PANE = 'country-base';

/**
 * Offline-Hintergrund (Phase 8c, Stufe 1): Länderflächen aus den gebündelten Grenzdaten, gezeichnet auf einer eigenen Ebene
 * unterhalb von Touren und Kacheln. Grenzen sind auf ca. 3 km vereinfacht, die Karte ist deshalb nur für Übersichten
 * (Welt bis grob Region) gedacht, ohne Straßen und Orte. Wirft, wenn die Grenzdaten nicht geladen werden können.
 */
export async function createCountryBase(map: LMap, colors: CountryBaseColors): Promise<CountryBase> {
  const shapes = buildCountryShapes(await loadCountryIndex());
  if (!map.getPane(PANE)) {
    const pane = map.createPane(PANE);
    pane.style.zIndex = '190'; // unter den Kacheln (200) und den Touren (400)
    pane.style.pointerEvents = 'none';
  }
  const renderer = canvas({ pane: PANE, padding: 0.5 });
  const polygons: Polygon[] = shapes.map((s) =>
    polygon(s.polygons, { renderer, pane: PANE, interactive: false, stroke: true, weight: 0.8, color: colors.border, fill: true, fillColor: colors.land, fillOpacity: 1, smoothFactor: 1.5 }),
  );
  return {
    layer: layerGroup(polygons),
    restyle(next) {
      for (const p of polygons) p.setStyle({ color: next.border, fillColor: next.land });
    },
  };
}
