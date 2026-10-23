# DESIGN.md: NestCast Hub, "Tela y luz"

Design system for the NestCast Hub web app, version 2. It controls Google Home Mini and Nest Mini speakers on a local network. Language: Spanish (es).

## 1. Subject, audience, job

**Product.** A web hub that discovers speakers, controls them (volume, mute, play and pause, play a URL, speak text), pairs new ones over Wi-Fi, and runs scheduled routines, timers and a "No molestar" window. Derived from `server.ts`; the Angular component was not available.

**Audience.** The person who runs the home (and possibly a small office: sample speakers are "Sala Principal", "Consultorio 1", "Recepción"), often on a phone or a wall tablet, often in the evening.

**Primary job.** Answer "what is playing, how loud, and what happens next?" in one glance, and change volume or send a message in one or two taps.

## 2. Concept

**Tela y luz** (fabric and light). Nest Mini speakers are wrapped in fabric and show their state with light. The interface borrows two things from that world:

1. **The day timeline.** A 24-hour strip at the top shows the "No molestar" window as hatched fabric, the routines as ticks, and "ahora" as a line of light. It is structural information, and it is the memorable element.
2. **The level.** Each speaker row leads with its volume as a big condensed number and a wide slider. When it plays, the number turns accent and three small bars move.

Everything else stays quiet: chalk page, one white panel for the speakers, hairlines instead of cards.

### What changed from v1, and why

| v1 (from `index.html` and `styles.css`) | v2 | Reason |
|---|---|---|
| Slate-50 page, Google blue `#1a73e8`, `bg-blue-600` selection | Chalk `#EEF0F0` with ultramarine `#3341C8` | Reads as the default Google look; the new accent is deeper and slightly violet |
| Three families (Outfit, Plus Jakarta Sans, JetBrains Mono) | One family, Archivo, using its width axis | Fewer files, a more distinct voice; the condensed numerals carry the personality |
| Mono for data | Mono only for code, IPs and IDs | Mono on small labels is a template tell |
| Slider thumb only, no fill | Filled track, edge contrast, DND limit tick | Shows value and constraint at once |
| `og:` image card with no image | Metadata corrected, `noindex` added | Private tool; avoid broken share cards and indexing |

## 3. Color

### Light

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--chalk` | `#EEF0F0` | Page | n/a |
| `--panel` | `#FFFFFF` | Speaker panel, inputs, dialog | n/a |
| `--ink` | `#1A2027` | Text | 14.3:1 on chalk |
| `--muted` | `#505B66` | Secondary text | 6.1:1 on chalk, 6.9:1 on panel |
| `--line` | `#D4D9DD` | Hairlines | decorative |
| `--edge` | `#76818C` | Control borders, switch outlines | 3.5:1 on chalk, 4.0:1 on panel |
| `--accent` | `#3341C8` | Primary action, slider fill, playing, now-line | 6.7:1 on chalk, 7.7:1 on white; white text on it 7.7:1 |
| `--accent-soft` | `#E3E6FA` | Pressed buttons | n/a |
| `--hatch` | `#C9CFD6` | No molestar stripes | decorative |
| `--danger` | `#B3261E` | DND volume limit, errors | 6.5:1 on panel |
| `--ok` | `#1C7A4D` | Sent, connected | 5.3:1 on panel |

### Dark

`--chalk #12161B`, `--panel #1A2028`, `--ink #ECEFF2` (15.7:1), `--muted #A4AFBA` (7.4:1), `--line #2C353F`, `--edge #7B8794` (4.5:1), `--accent #8E9BFF` (6.5:1) with `--on-accent #0E1330` (7.2:1), `--accent-soft #262E5C`, `--hatch #2F3945`, `--danger #FF8F85` (7.4:1), `--ok #6FD39A` (9.0:1).

**Meaning rules.** Accent means "active or yours to change" (playing, value, now, primary action). Red appears only for the DND volume limit and errors. Hatching always means "No molestar". Color is never the only signal: playing has text and bars, muted has strike-through and a label, DND has the word and a limit note.

## 4. Typography

One family: **Archivo** (variable, `wdth` 62 to 125, `wght` 400 to 700).

| Role | Setting |
|---|---|
| Body and UI | 400 and 500, normal width, 1rem, line-height 1.5 |
| Section titles (h2) | 650, normal width, 1.25 to 1.5rem, tracking -0.01em |
| Brand and speaker names | 700 and 650 |
| **Volume level** | 700, `font-stretch: 70%`, 3rem (2.4rem on mobile), line-height 1, right-aligned |
| Timeline labels | 500 and 600, .8 to .82rem |
| Code, IPs, IDs | system mono, .875em, only where real code appears |

Rules: sentence case; no all-caps labels, no eyebrows; `font-variant-numeric: tabular-nums` globally so times and volumes align; line length under 65ch; `text-wrap: balance` on headings.

## 5. Layout and spacing

- Unit 0.25rem; common steps .5, .75, 1, 1.5, 2, 3rem.
- Wrap max 1180px, side padding `clamp(1rem, 4vw, 2.5rem)`.
- Desktop grid: speakers column fluid, side column 340px, gap `clamp(1.5rem, 4vw, 3.5rem)`.
- Radius: **8px** controls, **12px** the speaker panel and dialog, 999px sliders and switches, 50% thumbs.
- One breakpoint at **900px**: single column; the volume number shrinks; the timeline keeps a 760px minimum width and scrolls horizontally, opened scrolled to "ahora".
- Alignment: all text left-aligned; only the volume number is right-aligned, against its slider.

```
┌ NestCast Hub                 [No molestar  switch]  [Emparejar altavoz] ┐
├────────────────────────────────────────────────────────────────────────┤
│ Hoy en la casa                                                         │
│ 00    03    06    09    12    15    18    21    24                     │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒│     │      │      ┃ahora                ▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│              07:30 08:00  12:30                 18:00                  │
├──────────────────────────────────────────────┬─────────────────────────┤
│ Altavoces                         3 conectados│ Hablar por los altavoces│
│ ┌──────────────────────────────────────────┐ │  Mensaje [.............]│
│ │ Consultorio 1  ▮▮▮ Reproduciendo: …      │ │  Enviar a  ☑ ☑ ☑       │
│ │  60 ──────●────────────   [Pausar][Silenc]│ │  [Enviar mensaje]       │
│ │──────────────────────────────────────────│ │ Próximas rutinas        │
│ │ Sala Principal …  45 ───●─────            │ │  07:30 Buenos días  [●] │
│ └──────────────────────────────────────────┘ │                         │
└──────────────────────────────────────────────┴─────────────────────────┘
```

## 6. Components

**Day timeline.** Hours every 3 h. A white track holds the DND bands (hatched, labelled "No molestar", visible only when DND is on). Routines are ink ticks of alternating height with time (bold) and name below, so neighbors do not collide. The "ahora" line is accent with its time. Has an `aria-label` summarizing it; the same information is repeated as text in "Próximas rutinas".

**Speaker row.** Inside one panel, separated by hairlines. Contents: name (h3), model, now-playing line, volume number, slider, and actions. Playing rows turn the number accent and show moving bars; muted rows strike the number through.

**Volume slider.** 44px tall hit area, 10px filled track with an edge border, 26px thumb with 3px accent ring. `--fill` is set from the value. When DND is active, a red tick marks the maximum (default 25), the value is clamped to it, and a line of text explains: "Límite de 25 por No molestar".

**Buttons.** Primary: accent fill, 8px radius, 44px minimum height. Secondary: transparent with `--edge` border. Toggle (Silenciar): `aria-pressed`, soft accent fill when on, and the label changes to "Silenciado". Hover is a subtle fill or brightness change only.

**Switch.** 46 by 26, `role="switch"` with `aria-checked`. Used for "No molestar" (with a note of its hours and volume cap) and for each routine.

**Speak form.** Label "Mensaje", a textarea, a fieldset "Enviar a" with one checkbox per speaker (all on by default), and the button **Enviar mensaje**. The result appears in a live region: "Mensaje enviado a Sala Principal, Recepción." The verb stays the same from button to confirmation.

**Pairing dialog** (native `<dialog>`). Title "Emparejar altavoz". Choose a Wi-Fi network (radio list), enter its password (`type=password`, `autocomplete=off`), name the speaker, then **Conectar altavoz** or **Cancelar**. Closes with Escape; focus returns to the opening button.

**Routine item.** Time (bold), name, target and time until it runs ("en 1 h 43 min"), and its switch.

**Icons.** Inline SVG, 24 grid, 2px round stroke, `currentColor`, displayed at 18px.

## 7. Motion

Only one ambient motion: the three-bar indicator on playing speakers (1s, alternating, staggered). Everything else answers an action: switch thumb slides (.2s, `cubic-bezier(.16,1,.3,1)`), buttons change fill (.2s). No entrance animations, no hover lifts. `prefers-reduced-motion` stops the bars (they sit at a static height) and removes transitions.

## 8. Accessibility

- Text contrast 4.5:1 or better; control edges and focus 3:1 or better (see tables).
- Focus: 3px accent outline, 2px offset, on every interactive element.
- Targets 44px or larger (slider hit area, buttons, switches, checkboxes at 40px rows).
- Semantics: one `h1`, section `h2`s, `role="switch"` with `aria-checked`, `aria-pressed` on toggles, labeled sliders ("Volumen de Sala Principal"), `role="status"` for confirmations, native dialog.
- Timeline has a text equivalent (next routines list).
- Both color schemes in the prototype; `color-scheme` and `theme-color` set.

## 9. Voice and copy

Plain Spanish, sentence case, from the person's point of view.

| Say | Don't say |
|---|---|
| Altavoces, conectados | Dispositivos Cast, nodos |
| Reproducir, Pausar, Silenciar | Play, Toggle mute |
| Hablar por los altavoces, Enviar mensaje | TTS, say |
| No molestar, volumen máximo 25 | DND, maxVolume |
| Emparejar altavoz, Conectar altavoz | Provisioning, setup_state |
| Límite de 25 por No molestar | Volume clamped |

Errors say what happened and what to do ("No se pudo conectar al altavoz. Revise que esté encendido y en la misma red."). Empty states invite the next step ("No hay altavoces. Emparéjelo con el botón de arriba.").

## 10. Angular integration (Tailwind v4)

1. Replace `src/index.html` and `src/styles.css` with the new files. Slate and blue classes re-skin automatically; `bg-blue-600`, `text-slate-500`, etc. now map to the new tokens.
2. In the speaker component:
   - volume number: `class="font-level"`;
   - slider: `class="nest-slider"` with `[style.--fill]="volume + '%'"`;
   - wrap the slider in a `position: relative` element and add `<span class="slider-limit" [style.left]="dndMax + '%'">` while DND is active;
   - add `playing` to the row while `player_state === 'PLAYING'` and include `<span class="eq"><i></i><i></i><i></i></span>`.
3. Replace any hard-coded hex colors in `app.html` (for example `#1a73e8`) with the Tailwind classes above.
4. Not included: a dark-mode remap for the Tailwind classes (the prototype has it with CSS variables). Add it once the component is available, so text-white on buttons can be checked.

Data to wire: `GET /api/devices` and status for the rows; `POST .../volume`, `.../mute`, `.../media/:action`, `.../say`; `GET /api/scheduler/overview`, `/routines`, `/dnd`; `/api/setup/scan` and `/api/setup/connect` for pairing.

## 11. Security note (not design)

`server.ts` has no authentication or rate limiting on routes that set volume, speak text, play URLs, delete devices and send Wi-Fi passwords, and the app is reachable through a public ngrok URL. Anyone who finds the link could use them. Turn on ngrok's built-in basic auth or OAuth, or add a login and token check in Express, before sharing the link. Sample SSIDs in `server.ts` look like real networks; replace them with placeholders.

## 12. Assumptions and not covered

- I could not see `app.ts` or `app.html`; the prototype is a redesign from the API, not a patch of the current UI.
- Routine names, times and the sample message are illustrative; DND hours (21:00 to 07:00) and cap (25) are the server defaults.
- Not yet designed: timers, routine editor, history and error notifications, and the empty and error states of the discovery view. They should reuse the same rows, switches and dialog.
