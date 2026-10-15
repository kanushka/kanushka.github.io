kanushka gayan's online resume

A cozy lofi dev room built with plain [Three.js](https://threejs.org) (vendored in `vendor/three`, no build step).

- `index.html` is the page, with a simple non-3D view for search engines, screen readers and old devices.
- `js/room/content.js` holds all the text and links. Edit it to change what the room says.
- `js/room/main.js` builds the room, `js/room/audio.js` is the generated lofi radio and `js/room/toys.js` has the snake game on the TV and the paint easel.
- `classic.html` is the old site.

Run it locally with any static server, for example `python3 -m http.server`, then open http://localhost:8000.
