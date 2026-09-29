import { h } from './dom';

/** Kennzahl-Kachel: großer Wert, darunter die Beschriftung. */
export function kpi(label: string, value: string): HTMLElement {
  return h('div', { class: 'kpi' }, h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-label' }, label));
}
