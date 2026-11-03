export const IC = {
  dash: "M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z",
  audit: "M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zm1 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z",
  issue: "M12 2L1 21h22L12 2zm0 6l6.5 11h-13L12 8zm-1 3v4h2v-4h-2zm0 5v2h2v-2h-2z",
  user: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z",
  zone: "M4 3h7v7H4V3zm9 0h7v7h-7V3zM4 12h7v9H4v-9zm9 0h7v9h-7v-9z",
  alloc: "M4 4h16v3H4V4zm0 5h10v3H4V9zm0 5h13v3H4v-3zm0 5h7v2H4v-2z",
  rep: "M5 21V9h4v12H5zm5 0V3h4v18h-4zm5 0v-8h4v8h-4z",
  set: "M12 8a4 4 0 100 8 4 4 0 000-8zm9.4 4a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L16.5 3h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  check: "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z",
  alert: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-2V6h2v7zm0 4h-2v-2h2v2z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.6V6h-2v7.4l5 3 1-1.7-4-2.1z",
  search: "M10 2a8 8 0 105.3 14l4.9 4.9 1.4-1.4-4.9-4.9A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z",
  bell: "M12 22a2.5 2.5 0 002.5-2.5h-5A2.5 2.5 0 0012 22zm7-6v-5a7 7 0 10-14 0v5l-2 2v1h18v-1l-2-2z",
  edit: "M3 17.2V21h3.8L17.8 10 14 6.2 3 17.2zM20.7 7.1a1 1 0 000-1.4l-2.4-2.4a1 1 0 00-1.4 0l-1.8 1.8L19 8.9l1.7-1.8z",
  del: "M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
};
export function Icon({ d, color }: { d: string; color?: string }) {
  return <svg viewBox="0 0 24 24" style={color ? { fill: color } : undefined} aria-hidden="true"><path d={d} /></svg>;
}
