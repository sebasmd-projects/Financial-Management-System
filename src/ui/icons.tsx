/** Iconos de línea de 24 dp, decorativos (`aria-hidden`): el nombre accesible lo da el botón o el enlace que los contiene. */
const PATHS: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  plus: "M12 5v14M5 12h14",
  "calendar-check": "M4 6.5h16V20H4zM4 10.5h16M8 3.5v4M16 3.5v4M9 15.2l2.2 2.2L15.5 13",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  bank: "M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  loan: "M4 7h16v11H4zM4 11h16M8 15h3",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01",
  chart: "M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.4 1.1-1.5 2.6-1.7-.6a7 7 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a7 7 0 0 1-1.7-1l-1.7.6-1.5-2.6 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.6a7 7 0 0 1 1.7-1l.3-1.8h3l.3 1.8a7 7 0 0 1 1.7 1l1.7-.6 1.5 2.6-1.4 1.1a7 7 0 0 1 0 2z",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  contrast: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 6 6 6-6 6",
  x: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  "panel-left": "M4 5h16v14H4zM9.5 5v14",
  alert: "M12 3.5 21.5 20h-19zM12 10v4.5M12 17.5h.01",
  check: "m5 12.5 4.5 4.5L19 7.5",
  external: "M14 4h6v6M20 4 10 14M18 14v5H5V6h5",
  shield: "M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z",
  wallet: "M4 7.5h15a1 1 0 0 1 1 1V19H5a1 1 0 0 1-1-1zM4 7.5l12-3v3M16 13.5h.01",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}
