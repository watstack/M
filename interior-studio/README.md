# Interior Design Studio

Upload an equirectangular 360° panorama photo of a room and walk into it in
3D: place furniture, try material/color swaps, preview lighting moods, take
calibrated measurements, and link multiple rooms together with portals.

Built with React, Three.js, react-three-fiber, drei, Zustand, and Tailwind.

## Development

```bash
npm install
npm run dev
```

Then open the printed local URL and drop in an equirectangular JPG/PNG/WEBP
(ideally ~2:1 aspect ratio).

Other scripts: `npm run build`, `npm run preview`, `npm run typecheck`,
`npm run lint`.

## Notes

- All project data (uploaded photos, placements, masks, measurements) lives
  client-side — autosaved to `localStorage` and exportable/importable as a
  JSON file. Nothing is uploaded anywhere.
- Furniture placement is intentionally approximate: there's no real depth
  data from a single photo, so placed objects sit at a user-adjustable
  "depth" along the click ray rather than a physically accurate position.
- The 3 bundled furniture models are free CC0/CC BY sample assets — see
  [`CREDITS.md`](./CREDITS.md).
