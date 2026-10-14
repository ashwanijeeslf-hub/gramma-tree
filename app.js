/* ==========================================================================
   Gramma-Tree: The Sentence Builder — game logic

   Sections:
     1. DATA        – sentences graded by difficulty (swap/translate freely)
     2. UTILITIES   – shuffle, DOM helpers
     3. STATE       – the single source of truth for the current round
     4. RENDERING   – keeps the DOM in sync with state (with smooth FLIP moves)
     5. SOUND       – tiny synthesized sound effects + mute toggle
     6. FEEDBACK    – success celebration, wrong-answer shake, messages
     7. GAME FLOW   – load / click / check / reset / next
     8. SCORE SCREEN – end-of-game stars, totals and per-level bars
     9. PLAYERS & SAVING – names, saved progress, best/last score, player screen
    10. BOOT        – wire up events and start

   Plain script (no ES modules) so index.html also works when opened
   straight from the file system on a tablet or phone.
   ========================================================================== */
(() => {
  'use strict';

  /* ======================================================================
     1. DATA
     Sentences are stored WITHOUT end punctuation so every token is a word.
     `locale` + `levels` make it easy to add other languages later
     (e.g. load a different GAME_DATA object based on a language picker).
     ====================================================================== */
  const GAME_DATA = {
    locale: 'en',
    levels: [
      {
        id: 1,
        name: 'Seedling',
        wordRange: [3, 4],
        sentences: [
          // Simple subject + verb (+ object)
          'The cat sleeps',
          'I love mangoes',
          'Birds can fly',
          'The sun is hot',
          'My dog is big',
          // Familiar names, food and games (all plain English words)
          'Ravi eats rice',
          'Mother cooks soup',
          'Priya reads books',
          'The crow is black',
          'We love cricket',
        ],
      },
      {
        id: 2,
        name: 'Sapling',
        wordRange: [5, 6],
        sentences: [
          'The sun is very hot',
          'The dog runs in the park',
          'I like to eat red apples',
          'Birds fly high in the sky',
          'We go to school by bus',
          // Basic prepositions: on, under, in, at, with
          'The book is on the table',
          'Meena sits under the tree',
          'Rohan plays cricket with friends',
          'The peacock dances in the rain',
          'We buy mangoes at the market',
        ],
      },
      {
        id: 3,
        name: 'Big Tree',
        wordRange: [7, Infinity],
        sentences: [
          'The little bird sings a happy song',
          'We play in the park after school',
          'My grandmother tells us stories at night',
          'The farmer feeds the cows every morning',
          'Ravi and his sister walk to school together',
          // Longer sentences with prepositions and daily life
          'Grandfather reads the newspaper in the morning',
          'The children fly kites on the roof',
          'My father goes to the office by train',
          'My mother bakes a cake for my birthday',
          'Sita gives sweets to all her friends',
        ],
      },
    ],
  };

  // Stars awarded per sentence: 3 on the first try, 2 on the second, 1 after that.
  const MAX_STARS_PER_SENTENCE = 3;

  const CORRECT_MESSAGES = ['Super!', 'Brilliant!', 'You did it!', 'Hooray!', 'Fantastic!'];
  const TRY_AGAIN_MESSAGES = [
    'Almost! Tap a word to move it, then try again 🌱',
    'So close! Give it another go 💪',
    'Hmm, read it out loud. Does it sound right? 🤔',
  ];

  const SAVE_KEY = 'gramma-tree-save-v1';  // where players, progress and scores live in the browser
  const MAX_NAME_LENGTH = 12;              // kid-sized names; keeps the toolbar chip tidy

  const SCORE_SCREEN_DELAY_MS = 2400;    // lets the last celebration play before the score screen opens
  const LEVEL_ICONS = ['🌱', '🌿', '🌳']; // one per level on the score screen

  // What the child sees on the score screen, by star rating (1–3)
  const RATING_TEXT = {
    3: { title: 'Grammar Superstar!', subtitle: 'You built almost every sentence perfectly!' },
    2: { title: 'Super Sentence Builder!', subtitle: 'Amazing work! Can you win all three stars?' },
    1: { title: 'Great Effort!', subtitle: 'Your tree is growing. Play again to win more stars!' },
  };

  const FRUIT_COLOR_COUNT = 5;           // matches .fruit-0 … .fruit-4 in styles.css
  const CONFETTI_COLORS = ['#facc15', '#fb923c', '#f472b6', '#4ade80', '#60a5fa', '#a78bfa'];

  /* ======================================================================
     2. UTILITIES
     ====================================================================== */

  /** Fisher–Yates shuffle; returns a new array. */
  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Shuffle words but never hand the child the answer already solved.
   * Compares as strings so repeated words ("the … the") are handled.
   */
  function shuffleUntilDifferent(words) {
    if (words.length < 2) return [...words];
    const target = words.join(' ');
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = shuffle(words);
      if (candidate.join(' ') !== target) return candidate;
    }
    return [...words].reverse(); // all-identical edge case; fine for MVP
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Re-trigger a one-shot CSS animation class on an element. */
  function playClass(el, className, durationMs) {
    el.classList.remove(className);
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), durationMs);
  }

  /**
   * Dev-time sanity check: warns if a sentence doesn't fit its level's word range.
   * (Catches typos when content writers edit GAME_DATA.)
   */
  function validateData(data) {
    data.levels.forEach((level) => {
      const [min, max] = level.wordRange;
      level.sentences.forEach((sentence) => {
        const n = sentence.trim().split(/\s+/).length;
        if (n < min || n > max) {
          console.warn(`[Gramma-Tree] Level ${level.id}: "${sentence}" has ${n} words (expected ${min}–${max}).`);
        }
      });
    });
  }

  /* ======================================================================
     3. STATE
     ====================================================================== */

  const dom = {
    levelLabel: document.getElementById('level-label'),
    levelIcon: document.getElementById('level-icon'),
    starCount: document.getElementById('star-count'),
    starPill: document.getElementById('star-pill'),
    btnSound: document.getElementById('btn-sound'),
    soundIcon: document.getElementById('sound-icon'),
    progress: document.getElementById('progress'),
    branch: document.getElementById('branch'),
    nest: document.getElementById('nest'),
    message: document.getElementById('message'),
    btnCheck: document.getElementById('btn-check'),
    btnReset: document.getElementById('btn-reset'),
    btnNext: document.getElementById('btn-next'),
    nextLabel: document.getElementById('next-label'),
    nextIcon: document.getElementById('next-icon'),
    celebration: document.getElementById('celebration'),
    app: document.getElementById('app'),
    scoreScreen: document.getElementById('score-screen'),
    scoreTitle: document.getElementById('score-title'),
    scoreSubtitle: document.getElementById('score-subtitle'),
    scoreStars: document.getElementById('score-stars'),
    scoreTotal: document.getElementById('score-total'),
    scoreMax: document.getElementById('score-max'),
    scoreLevels: document.getElementById('score-levels'),
    scoreFirstTry: document.getElementById('score-firsttry'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    scorePlayer: document.getElementById('score-player'),
    scoreNewBest: document.getElementById('score-newbest'),
    scoreHistory: document.getElementById('score-history'),
    btnScoreSwitch: document.getElementById('btn-score-switch'),
    // toolbar + player screen
    btnPlayer: document.getElementById('btn-player'),
    playerChipName: document.getElementById('player-chip-name'),
    playerScreen: document.getElementById('player-screen'),
    playerTitle: document.getElementById('player-title'),
    viewPick: document.getElementById('view-pick'),
    viewName: document.getElementById('view-name'),
    viewWelcome: document.getElementById('view-welcome'),
    playerList: document.getElementById('player-list'),
    btnNewPlayer: document.getElementById('btn-new-player'),
    playerName: document.getElementById('player-name'),
    nameError: document.getElementById('name-error'),
    btnNameBack: document.getElementById('btn-name-back'),
    welcomeStats: document.getElementById('welcome-stats'),
    btnContinue: document.getElementById('btn-continue'),
    btnFresh: document.getElementById('btn-fresh'),
    freshConfirm: document.getElementById('fresh-confirm'),
    freshConfirmText: document.getElementById('fresh-confirm-text'),
    btnFreshYes: document.getElementById('btn-fresh-yes'),
    btnFreshNo: document.getElementById('btn-fresh-no'),
    btnSwitch: document.getElementById('btn-switch'),
    btnCloseProfile: document.getElementById('btn-close-profile'),
    playerNotice: document.getElementById('player-notice'),
    btnRemove: document.getElementById('btn-remove'),
    viewRemove: document.getElementById('view-remove'),
    removeText: document.getElementById('remove-text'),
    btnRemoveYes: document.getElementById('btn-remove-yes'),
    btnRemoveNo: document.getElementById('btn-remove-no'),
    saveWarning: document.getElementById('save-warning'),
  };

  /**
   * A token is one word bubble:
   *   { id, text, slot, el }
   *   id   – unique per round (so duplicate words like "the" stay distinct)
   *   slot – its position in the shuffled order; used to put a word back in
   *          its ORIGINAL spot on the branch when it returns from the nest
   */
  const state = {
    levelIndex: 0,
    sentenceIndex: 0,
    target: '',          // the correct sentence, e.g. "The cat sleeps"
    tokens: [],          // every word bubble this round
    nestIds: [],         // token ids in the order the child tapped them
    attempts: 0,         // wrong + right checks this round (full-nest checks only)
    totalStars: 0,
    levelStars: GAME_DATA.levels.map(() => 0),   // stars earned in each level (for the score screen)
    firstTry: 0,         // sentences solved on the very first check (3 stars each)
    scoreTimer: null,    // pending "show the score screen" timeout after the last sentence
    playerId: null,      // which saved child is playing (null until they pick a name)
    lastResult: null,    // result of the game just finished: { prevBest, prevLast, newBest, firstEver }
    solved: false,       // true after a correct answer, until Next is pressed
  };

  const currentLevel = () => GAME_DATA.levels[state.levelIndex];
  const tokenById = (id) => state.tokens.find((t) => t.id === id);
  const isInNest = (token) => state.nestIds.includes(token.id);
  const nestWords = () => state.nestIds.map((id) => tokenById(id).text);
  const isLastSentenceOfLevel = () => state.sentenceIndex === currentLevel().sentences.length - 1;
  const isLastLevel = () => state.levelIndex === GAME_DATA.levels.length - 1;

  /* ======================================================================
     4. RENDERING
     ====================================================================== */

  /** Build one clickable bubble <button> for a token. */
  function createBubbleElement(token) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `bubble fruit-${token.id % FRUIT_COLOR_COUNT}`;
    el.textContent = token.text;
    el.dataset.id = String(token.id);
    // Randomise each fruit's sway so the branch never bobs in unison (see .branch-zone .bubble)
    el.style.setProperty('--bob-dur', `${(2.8 + Math.random() * 1.4).toFixed(2)}s`);
    el.style.setProperty('--bob-delay', `${(-Math.random() * 4).toFixed(2)}s`);
    el.addEventListener('click', () => onBubbleClick(token));
    return el;
  }

  /**
   * Make `container`'s children match `elements` exactly, in order.
   * Only moves nodes that are out of place, so keyboard focus is kept.
   */
  function placeInOrder(container, elements) {
    elements.forEach((el, i) => {
      if (container.children[i] !== el) {
        container.insertBefore(el, container.children[i] || null);
      }
    });
  }

  /** Put every bubble in its correct container and order. */
  function syncBubbles() {
    const onBranch = state.tokens.filter((t) => !isInNest(t)).sort((a, b) => a.slot - b.slot);
    const inNest = state.nestIds.map(tokenById);
    placeInOrder(dom.branch, onBranch.map((t) => t.el));
    placeInOrder(dom.nest, inNest.map((t) => t.el));
  }

  /**
   * Smoothly move a bubble between Branch and Nest using the FLIP technique:
   *   First  – measure every bubble's position
   *   Last   – change the DOM (the bubbles jump to their new spots)
   *   Invert – slide each bubble back to where it was, instantly
   *   Play   – animate to its new spot
   * Neighbouring bubbles that reflow glide too, not just the tapped one.
   *
   * @param {object} [movedToken] the bubble the child just tapped. It gets a
   *   floaty arc + a soft landing squash; everything else just glides.
   *   (Omit for Reset, where every bubble glides home together.)
   *
   * The hanging-fruit bob in styles.css uses `translate`/`rotate`, not
   * `transform`, so it never conflicts with the animations below.
   */
  function syncBubblesAnimated(movedToken) {
    const first = new Map(state.tokens.map((t) => [t.id, t.el.getBoundingClientRect()]));
    syncBubbles();
    if (prefersReducedMotion()) return;

    state.tokens.forEach((t) => {
      const before = first.get(t.id);
      const after = t.el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (dx === 0 && dy === 0) return;

      if (t === movedToken) {
        flyWithArc(t.el, dx, dy);
      } else {
        t.el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.1)' }
        );
      }
    });
  }

  /**
   * Fly one bubble from its old spot (offset dx,dy from where it now sits) to home:
   * lift up and grow a touch mid-flight, then land with a small squash and settle.
   * z-index keeps it above the tree and nest while it travels in either direction.
   */
  function flyWithArc(el, dx, dy) {
    const lift = Math.min(48, Math.max(24, Math.hypot(dx, dy) * 0.25));
    const flight = 'cubic-bezier(0.3, 0.6, 0.4, 1)';
    el.style.zIndex = '10';
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, easing: flight, offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(1.12)`, easing: flight, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1.07, 0.9)', easing: 'ease-out', offset: 0.82 },
        { transform: 'translate(0, 0) scale(1)', offset: 1 },
      ],
      { duration: 560 }
    );
    const done = () => { el.style.zIndex = ''; };
    anim.addEventListener('finish', done);
    anim.addEventListener('cancel', done);
  }

  /** Top bar, progress dots and button states. */
  function renderHud() {
    const level = currentLevel();
    dom.levelLabel.textContent = `Level ${level.id} · ${level.name}`;
    dom.levelIcon.textContent = LEVEL_ICONS[state.levelIndex] || '🌳';
    dom.starCount.textContent = String(state.totalStars);

    // One dot per sentence in this level
    dom.progress.replaceChildren(
      ...level.sentences.map((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot';
        const done = i < state.sentenceIndex || (i === state.sentenceIndex && state.solved);
        if (done) dot.classList.add('is-done');
        if (i === state.sentenceIndex) dot.classList.add('is-current');
        return dot;
      })
    );
    dom.progress.setAttribute(
      'aria-label',
      `Sentence ${state.sentenceIndex + 1} of ${level.sentences.length}`
    );

    // Buttons
    dom.btnCheck.disabled = state.solved;
    dom.btnReset.disabled = state.solved;
    dom.btnNext.disabled = !state.solved;

    const finishedGame = state.solved && isLastSentenceOfLevel() && isLastLevel();
    dom.nextLabel.textContent = finishedGame
      ? 'See Score'
      : isLastSentenceOfLevel()
        ? 'Next Level'
        : 'Next';
    dom.nextIcon.textContent = state.solved ? (finishedGame ? '🏆' : '➡️') : '🔒';
  }

  /* ======================================================================
     5. SOUND
     Sounds are synthesized with the Web Audio API, so there are no audio
     files to download and it works offline. Browsers only allow audio after
     a tap/click, so the AudioContext is created lazily on first use (every
     sound here is triggered by a button press, which counts).
     ====================================================================== */

  const Sound = (() => {
    const MUTE_KEY = 'gramma-tree-muted';
    const LEAD_IN = 0.05;               // seconds of head start before the first note
    const MASTER_GAIN = 3.0;        // overall volume boost (the limiter below keeps it clean)
    let ctx = null;
    let bus = null;                     // every note goes through this one loud-but-safe output chain
    let noiseBuffer = null;             // shared static used for pops and crackles
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage blocked: stay unmuted */ }

    /** Create (or wake) the shared AudioContext; null if the browser has no Web Audio. */
    function getContext() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();

        // Output chain: notes -> master volume -> limiter -> speakers.
        // The limiter (a fast, hard compressor) lets us turn the volume up a lot
        // without the loudest moments crackling or clipping.
        bus = ctx.createGain();
        bus.gain.value = MASTER_GAIN;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.15;
        // A limiter can still overshoot a little, so a final fixed gain guarantees
        // the signal never goes past full scale (which would crackle).
        const safety = ctx.createGain();
        safety.gain.value = 0.85;
        bus.connect(limiter);
        limiter.connect(safety);
        safety.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    /**
     * Wake the audio engine on the child's very first tap/key press, so the
     * first real sound isn't clipped while the speakers spin up. Also plays one
     * silent sample, which is what iPhones/iPads need to allow later sounds.
     */
    function unlock() {
      const c = getContext();
      if (!c) return;
      const silent = c.createBufferSource();
      silent.buffer = c.createBuffer(1, 1, 22050);
      silent.connect(c.destination);
      silent.start(0);
    }

    /**
     * Play one note.
     * @param {object} note
     *   freq    – start pitch in Hz
     *   slideTo – optional end pitch in Hz (a glide: whistles, boings, wah-wahs)
     *   start   – delay in seconds from now
     *   dur     – length in seconds
     *   type    – 'sine' (pure), 'triangle' (soft), 'sawtooth' / 'square' (buzzy, LOUD and cartoonish)
     *   vol     – peak loudness 0–1 before the master boost
     *   lowpass – optional filter in Hz that takes the harsh edge off buzzy waves
     *   vibrato – optional { rate, depth }: a wobble in Hz/Hz, like a trombone or a whistle
     */
    function tone(c, { freq, slideTo, start = 0, dur = 0.15, type = 'sine', vol = 0.5, lowpass, vibrato }) {
      // Tiny lead-in so the very first note isn't clipped while the audio device wakes up
      const t0 = c.currentTime + LEAD_IN + start;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

      if (vibrato) {                     // a slow oscillator that wobbles the pitch
        const lfo = c.createOscillator();
        const depth = c.createGain();
        lfo.frequency.value = vibrato.rate;
        depth.gain.value = vibrato.depth;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.05);
      }

      let last = osc;
      if (lowpass) {
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowpass;
        osc.connect(filter);
        last = filter;
      }

      // Quick fade-in, hold, then fade-out. Holding at full volume (instead of
      // fading straight away) makes the notes sound much louder and fuller.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.setValueAtTime(vol, t0 + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      last.connect(gain);
      gain.connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    /**
     * A burst of filtered noise: the "pop" of a party popper, a crackle, a cymbal shimmer.
     * (Oscillators can only make pitched notes; noise is what makes bangs and swishes.)
     * @param {object} burst  { freq: centre pitch of the noise in Hz, start, dur, vol }
     */
    function burst(c, { freq = 2500, start = 0, dur = 0.12, vol = 0.8 }) {
      if (!noiseBuffer) {
        noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);   // 1 second of static, made once
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      const t0 = c.currentTime + LEAD_IN + start;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.7;
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol, t0);                         // a bang starts at full volume...
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);  // ...then dies away fast
      src.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    /**
     * Play a list of notes, unless muted / unsupported. If the audio engine is
     * still waking up, wait for it first so no note is scheduled into silence.
     * A note with `noise: true` is played as a noise burst instead of a pitched tone.
     */
    function play(notes) {
      if (muted) return;
      const c = getContext();
      if (!c) return;
      const schedule = () => notes.forEach((n) => (n.noise ? burst(c, n) : tone(c, n)));
      if (c.state === 'running') schedule();
      else c.resume().then(schedule).catch(() => { /* browser refused audio: stay silent */ });
    }

    return {
      unlock,
      /** CORRECT: a cartoon slide-whistle "wheeee!" then a cheeky party-horn "da-da-da-DAAAA!" */
      playCorrect() {
        play([
          // slide whistle, wobbling upward
          { freq: 400, slideTo: 1800, start: 0.00, dur: 0.30, type: 'sine', vol: 0.7, vibrato: { rate: 16, depth: 40 } },
          // fanfare: buzzy horn notes (G4, C5, E5) ...
          { freq: 392.0, start: 0.34, dur: 0.13, type: 'sawtooth', vol: 0.5, lowpass: 2600 },
          { freq: 523.25, start: 0.47, dur: 0.13, type: 'sawtooth', vol: 0.5, lowpass: 2600 },
          { freq: 659.25, start: 0.60, dur: 0.13, type: 'sawtooth', vol: 0.5, lowpass: 2600 },
          // ... and a long, wobbly, victorious G5 with a sparkle an octave above
          { freq: 783.99, start: 0.73, dur: 0.70, type: 'sawtooth', vol: 0.55, lowpass: 3000, vibrato: { rate: 7, depth: 14 } },
          { freq: 1567.98, start: 0.73, dur: 0.60, type: 'sine', vol: 0.25 },
        ]);
      },
      /**
       * WRONG: the classic silly "sad trombone": wah, wah, wah, waaaaah (with a wobble).
       * Funny rather than scary, and pitched around 330-470 Hz so small speakers can play it.
       */
      playWrong() {
        play([
          { freq: 466.16, start: 0.00, dur: 0.22, type: 'sawtooth', vol: 0.55, lowpass: 1700 },   // Bb4
          { freq: 440.0,  start: 0.24, dur: 0.22, type: 'sawtooth', vol: 0.55, lowpass: 1700 },   // A4
          { freq: 415.3,  start: 0.48, dur: 0.22, type: 'sawtooth', vol: 0.55, lowpass: 1700 },   // Ab4
          { freq: 392.0, slideTo: 311.13, start: 0.72, dur: 0.75, type: 'sawtooth', vol: 0.55, lowpass: 1500,
            vibrato: { rate: 6, depth: 14 } },                                                      // G4 -> Eb4 wobble
        ]);
      },
      /**
       * A funny "bloop" when a fruit moves. Zips UP into the nest like a water drop
       * and zips DOWN when it goes back to the branch.
       */
      playTap(intoNest) {
        play([
          intoNest
            ? { freq: 300, slideTo: 900, dur: 0.13, type: 'sine', vol: 0.75 }
            : { freq: 900, slideTo: 300, dur: 0.13, type: 'sine', vol: 0.75 },
        ]);
      },
      /**
       * CONFETTI: a party-popper "POP!" (bang + low thump), then sparkly pings and
       * tiny crackles at random, like confetti tinkling down. Random every time.
       */
      playConfetti() {
        const sparkle = [1319, 1568, 1760, 2093, 2349, 2637, 3136];   // bright, happy notes
        const notes = [
          { noise: true, freq: 1500, start: 0, dur: 0.14, vol: 1 },           // the bang
          { noise: true, freq: 4500, start: 0.01, dur: 0.08, vol: 0.8 },      // its crackly top
          { freq: 220, slideTo: 70, start: 0, dur: 0.13, type: 'sine', vol: 0.8 },   // thump
        ];
        for (let i = 0; i < 16; i++) {                                        // falling sparkles
          notes.push({
            freq: pick(sparkle),
            start: 0.15 + i * 0.085 + Math.random() * 0.04,
            dur: 0.1,
            type: 'sine',
            vol: 0.2 + Math.random() * 0.12,
          });
        }
        for (let i = 0; i < 10; i++) {                                        // paper fluttering
          notes.push({ noise: true, freq: 5500, start: 0.3 + Math.random() * 1.3, dur: 0.025, vol: 0.3 });
        }
        play(notes);
      },
      /** FINALE for the score screen: a big triumphant "ta-ta-ta-DAAAA!" with a cymbal crash. */
      playFinale() {
        const horn = { type: 'sawtooth', vol: 0.5, lowpass: 2700 };
        play([
          // two quick climbing arpeggios...
          { ...horn, freq: 523.25, start: 0.00, dur: 0.14 },
          { ...horn, freq: 659.25, start: 0.14, dur: 0.14 },
          { ...horn, freq: 783.99, start: 0.28, dur: 0.14 },
          { ...horn, freq: 1046.5, start: 0.42, dur: 0.16 },
          { ...horn, freq: 783.99, start: 0.72, dur: 0.14 },
          { ...horn, freq: 1046.5, start: 0.86, dur: 0.14 },
          { ...horn, freq: 1318.5, start: 1.00, dur: 0.16 },
          // ...then a long, wobbling C-major chord (four notes at once, so each is quieter)
          { ...horn, vol: 0.3, freq: 523.25, start: 1.25, dur: 1.3, vibrato: { rate: 6, depth: 8 } },
          { ...horn, vol: 0.3, freq: 659.25, start: 1.25, dur: 1.3, vibrato: { rate: 6, depth: 8 } },
          { ...horn, vol: 0.3, freq: 783.99, start: 1.25, dur: 1.3, vibrato: { rate: 6, depth: 8 } },
          { ...horn, vol: 0.3, freq: 1046.5, start: 1.25, dur: 1.3, vibrato: { rate: 6, depth: 8 } },
          { freq: 2093, start: 1.25, dur: 1.1, type: 'sine', vol: 0.15 },
          { noise: true, freq: 7000, start: 1.25, dur: 0.9, vol: 0.3 },        // cymbal crash
        ]);
      },
      /** A bright "ding!" confirming sound is on (also works as a speaker test). */
      playBlip() {
        play([
          { freq: 988, dur: 0.28, type: 'sine', vol: 0.7 },
          { freq: 1976, dur: 0.20, type: 'sine', vol: 0.25 },
        ]);
      },
      isMuted: () => muted,
      /** Flip mute on/off, remember the choice, return the new state. */
      toggleMute() {
        muted = !muted;
        try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
        return muted;
      },
    };
  })();

  /** Keep the 🔊/🔇 button's icon and screen-reader label in step with the mute state. */
  function renderSoundButton() {
    const muted = Sound.isMuted();
    dom.soundIcon.textContent = muted ? '🔇' : '🔊';
    dom.btnSound.setAttribute('aria-pressed', String(!muted));
    dom.btnSound.setAttribute('aria-label', muted ? 'Sound is off. Tap to turn on' : 'Sound is on. Tap to turn off');
  }

  function toggleSound() {
    const muted = Sound.toggleMute();
    renderSoundButton();
    if (!muted) Sound.playBlip();
  }

  /* ======================================================================
     6. FEEDBACK
     ====================================================================== */

  function setMessage(text, tone) {
    dom.message.textContent = text || ' ';
    dom.message.classList.toggle('is-good', tone === 'good');
    dom.message.classList.toggle('is-oops', tone === 'oops');
  }

  /** Wrong answer: shake the nest bubbles, flash a red border, invite a retry. */
  function showWrongFeedback() {
    state.tokens.filter(isInNest).forEach((t) => {
      t.el.style.setProperty('--i', String(state.nestIds.indexOf(t.id)));
      playClass(t.el, 'shake', 900);
    });
    playClass(dom.nest, 'nest-wrong', 750);
    setMessage(pick(TRY_AGAIN_MESSAGES), 'oops');
    Sound.playWrong();
  }

  /** Right answer: confetti + bouncing checkmark + a hop wave across the words. */
  function showSuccessFeedback(starsEarned) {
    dom.nest.classList.add('nest-correct');
    state.nestIds.forEach((id, i) => {
      const el = tokenById(id).el;
      el.style.setProperty('--i', String(i));
      playClass(el, 'hop', 1200);
    });
    launchConfetti();
    showCheckmark();
    setMessage(`${pick(CORRECT_MESSAGES)} +${starsEarned} ⭐`, 'good');
    playClass(dom.starPill, 'bump', 650);
    Sound.playCorrect();
  }

  function showCheckmark() {
    const check = document.createElement('div');
    check.className = 'check-pop';
    check.textContent = '✔';
    dom.celebration.appendChild(check);
    window.setTimeout(() => check.remove(), 1600);
  }

  function launchConfetti(count = 48) {
    Sound.playConfetti();                    // the pop + sparkles play even if animations are reduced
    if (prefersReducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = pick(CONFETTI_COLORS);
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      piece.style.setProperty('--spin', `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`);
      piece.style.setProperty('--dur', `${1.8 + Math.random() * 1.2}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.4}s`);
      dom.celebration.appendChild(piece);
      window.setTimeout(() => piece.remove(), 3600);
    }
  }

  /* ======================================================================
     7. GAME FLOW
     ====================================================================== */

  /** Set up the current sentence: shuffle words, build bubbles, reset round state. */
  function loadSentence() {
    const sentence = currentLevel().sentences[state.sentenceIndex];
    const words = sentence.split(/\s+/);

    state.target = words.join(' ');
    state.nestIds = [];
    state.attempts = 0;
    state.solved = false;

    // Tag each word with a stable id first, then shuffle the tagged words.
    const tagged = words.map((text, id) => ({ id, text }));
    const shuffled = shuffleUntilDifferent(tagged.map((t) => t.text));
    // Hand out ids by matching shuffled texts to unused tagged words (handles duplicates).
    const pool = [...tagged];
    state.tokens = shuffled.map((text, slot) => {
      const idx = pool.findIndex((t) => t.text === text);
      const { id } = pool.splice(idx, 1)[0];
      const token = { id, text, slot, el: null };
      token.el = createBubbleElement(token);
      return token;
    });

    // Long sentences get slightly smaller bubbles (see .is-dense in styles.css)
    document.body.classList.toggle('is-dense', words.length >= 7);

    dom.branch.replaceChildren();
    dom.nest.replaceChildren();
    dom.nest.classList.remove('nest-wrong', 'nest-correct');
    syncBubbles();

    setMessage('');
    renderHud();
  }

  /** Tap a bubble: Branch → Nest (in tap order) or Nest → Branch. */
  function onBubbleClick(token) {
    if (state.solved) return;

    const goingIntoNest = !isInNest(token);
    if (goingIntoNest) {
      state.nestIds.push(token.id);
    } else {
      state.nestIds = state.nestIds.filter((id) => id !== token.id);
    }
    Sound.playTap(goingIntoNest);

    dom.nest.classList.remove('nest-wrong');
    setMessage('');
    syncBubblesAnimated(token);
  }

  /** "Check Answer": compare the nest to the target sentence. */
  function checkAnswer() {
    if (state.solved) return;

    // Not every word is in the nest yet: a gentle nudge, not a wrong attempt.
    if (state.nestIds.length < state.tokens.length) {
      playClass(dom.nest, 'nest-nudge', 500);
      setMessage('Use all the fruits to build your sentence first! 🍎');
      return;
    }

    state.attempts += 1;
    if (nestWords().join(' ') === state.target) {
      const stars = Math.max(1, MAX_STARS_PER_SENTENCE + 1 - state.attempts);
      state.totalStars += stars;
      state.levelStars[state.levelIndex] += stars;
      if (stars === MAX_STARS_PER_SENTENCE) state.firstTry += 1;
      state.solved = true;
      saveAfterSolve();                    // remember progress (or the final score) right away
      renderHud();
      showSuccessFeedback(stars);
      dom.btnNext.focus({ preventScroll: true });

      // Last sentence of the last level: let the celebration play, then show the score screen
      if (isLastSentenceOfLevel() && isLastLevel()) {
        window.clearTimeout(state.scoreTimer);
        state.scoreTimer = window.setTimeout(showScoreScreen, SCORE_SCREEN_DELAY_MS);
      }
    } else {
      showWrongFeedback();
    }
  }

  /** "Reset": send every word back to the branch (same shuffled spots). */
  function resetRound() {
    if (state.solved) return;
    state.nestIds = [];
    dom.nest.classList.remove('nest-wrong');
    setMessage('');
    syncBubblesAnimated();
  }

  /** "Next": advance to the next sentence / level, or open the score screen after the last one. */
  function goNext() {
    if (!state.solved) return;

    if (isLastSentenceOfLevel() && isLastLevel()) {
      showScoreScreen();                 // game complete
      return;
    }

    if (isLastSentenceOfLevel()) {
      state.levelIndex += 1;
      state.sentenceIndex = 0;
    } else {
      state.sentenceIndex += 1;
    }

    loadSentence();
    if (state.sentenceIndex === 0 && state.levelIndex > 0) {
      setMessage(`Level ${currentLevel().id}: ${currentLevel().name}! 🌳`, 'good');
    }
  }

  /* ======================================================================
     8. SCORE SCREEN
     Shown after the very last sentence: big stars, total, a bar per level.
     ====================================================================== */

  const maxStarsForLevel = (level) => level.sentences.length * MAX_STARS_PER_SENTENCE;
  const maxStarsTotal = () => GAME_DATA.levels.reduce((sum, level) => sum + maxStarsForLevel(level), 0);
  const totalSentences = () => GAME_DATA.levels.reduce((sum, level) => sum + level.sentences.length, 0);

  /** 1–3 big stars (everyone gets at least one) based on the share of possible stars earned. */
  function starRating(stars, maxStars) {
    const share = stars / maxStars;
    if (share >= 0.85) return 3;
    if (share >= 0.6) return 2;
    return 1;
  }

  function showScoreScreen() {
    window.clearTimeout(state.scoreTimer);
    const max = maxStarsTotal();
    const rating = starRating(state.totalStars, max);
    const text = RATING_TEXT[rating];

    dom.scoreTitle.textContent = text.title;
    dom.scoreSubtitle.textContent = text.subtitle;
    dom.scoreTotal.textContent = String(state.totalStars);
    dom.scoreMax.textContent = String(max);
    dom.scoreFirstTry.textContent =
      `You solved ${state.firstTry} of ${totalSentences()} sentences on the first try!`;
    renderScoreHistory();                  // player name, last time, best score, "New best!" badge

    // Big stars: light up the first `rating` of them
    [...dom.scoreStars.children].forEach((star, i) => star.classList.toggle('is-lit', i < rating));
    dom.scoreStars.setAttribute('aria-label', `${rating} out of 3 stars`);

    // One row per level: name, progress bar, stars earned / possible
    const fills = [];
    dom.scoreLevels.replaceChildren(
      ...GAME_DATA.levels.map((level, i) => {
        const earned = state.levelStars[i];
        const possible = maxStarsForLevel(level);

        const row = document.createElement('li');
        row.className = 'level-row';

        const name = document.createElement('span');
        name.className = 'level-name';
        name.textContent = `${LEVEL_ICONS[i] || '🌳'} ${level.name}`;

        const bar = document.createElement('span');
        bar.className = 'level-bar';
        const fill = document.createElement('span');
        fill.className = 'level-fill';
        bar.appendChild(fill);
        fills.push([fill, Math.round((earned / possible) * 100)]);

        const score = document.createElement('span');
        score.className = 'level-score';
        score.textContent = `${earned}/${possible}`;

        row.append(name, bar, score);
        return row;
      })
    );

    dom.app.inert = true;                  // game behind the card can't be tapped or tabbed to
    dom.scoreScreen.hidden = false;
    // Two frames later, grow the bars (so the CSS transition actually animates from 0)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fills.forEach(([fill, pct]) => { fill.style.width = `${pct}%`; });
    }));

    launchConfetti(120);
    Sound.playFinale();
    dom.btnPlayAgain.focus({ preventScroll: true });
  }

  /** "Play Again": close the score screen and start a fresh game from Level 1 (same player). */
  function restartGame() {
    startGame(state.playerId, 'fresh');
  }

  /* ======================================================================
     9. PLAYERS & SAVING
     Each child types a name. The game remembers, per name: where they were up
     to (so they can Continue), their last score and their best score.
     Everything is stored in this browser's localStorage, on this device only.
     ====================================================================== */

  /**
   * Store: all saved data. One entry per child:
   *   { id, name, playedAt, progress, last, best }
   *   progress – where to resume: { levelIndex, sentenceIndex, levelStars[], firstTry }, or null
   *   last/best – a finished game's score: { stars, max, at }, or null
   * Anything read back from storage is validated, so corrupt or edited data
   * can never crash the game; bad entries are simply dropped.
   * If the browser blocks storage, the game keeps working from memory and
   * canSave() turns false so the screens can warn the child.
   */
  const Store = (() => {
    let players = [];
    let canSave = true;

    /** Tidy a typed name: no control characters, single spaces, max length. */
    const cleanName = (raw) => String(raw || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME_LENGTH)
      .trim();
    const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
    const makeId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const isCount = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;

    function cleanScore(s) {
      if (!s || typeof s !== 'object') return null;
      if (!isCount(s.max, 100000) || s.max === 0 || !isCount(s.stars, s.max)) return null;
      return { stars: s.stars, max: s.max, at: Number.isFinite(s.at) ? s.at : 0 };
    }

    function cleanProgress(p) {
      if (!p || typeof p !== 'object') return null;
      const level = GAME_DATA.levels[p.levelIndex];
      if (!level || !isCount(p.sentenceIndex, level.sentences.length - 1)) return null;
      if (!Array.isArray(p.levelStars) || p.levelStars.length !== GAME_DATA.levels.length) return null;
      if (!p.levelStars.every((n, i) => isCount(n, maxStarsForLevel(GAME_DATA.levels[i])))) return null;
      return {
        levelIndex: p.levelIndex,
        sentenceIndex: p.sentenceIndex,
        levelStars: [...p.levelStars],
        firstTry: isCount(p.firstTry, totalSentences()) ? p.firstTry : 0,
      };
    }

    function persist() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, players }));
        canSave = true;
      } catch (e) {
        canSave = false;                 // private mode, storage full or blocked
      }
    }

    function load() {
      let raw = null;
      try {
        raw = localStorage.getItem(SAVE_KEY);
      } catch (e) {
        canSave = false;                 // storage blocked: the game still works from memory
        return;
      }
      if (!raw) return;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { return; }   // unreadable save: start clean
      if (!parsed || !Array.isArray(parsed.players)) return;

      parsed.players.forEach((p) => {
        const name = p && typeof p.name === 'string' ? cleanName(p.name) : '';
        if (!name || players.some((q) => sameName(q.name, name))) return;
        players.push({
          id: typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : makeId(),
          name,
          playedAt: Number.isFinite(p.playedAt) ? p.playedAt : 0,
          progress: cleanProgress(p.progress),
          last: cleanScore(p.last),
          best: cleanScore(p.best),
        });
      });
    }

    const get = (id) => players.find((p) => p.id === id) || null;

    load();

    return {
      cleanName,
      canSave: () => canSave,
      get,
      /** Players, most recently played first. */
      players: () => [...players].sort((a, b) => b.playedAt - a.playedAt || a.name.localeCompare(b.name)),
      findByName: (name) => players.find((p) => sameName(p.name, name)) || null,
      create(name) {
        const player = { id: makeId(), name: cleanName(name), playedAt: Date.now(), progress: null, last: null, best: null };
        players.push(player);
        persist();
        return player;
      },
      touch(id) {
        const p = get(id);
        if (p) { p.playedAt = Date.now(); persist(); }
      },
      saveProgress(id, progress) {
        const p = get(id);
        if (p) { p.progress = cleanProgress(progress); p.playedAt = Date.now(); persist(); }
      },
      clearProgress(id) {
        const p = get(id);
        if (p) { p.progress = null; persist(); }
      },
      /** Delete a player and everything saved for them (name, progress, last and best score). */
      remove(id) {
        const before = players.length;
        players = players.filter((p) => p.id !== id);
        persist();
        return players.length < before;
      },
      /**
       * A game was finished: store it as the "last" score, replace the "best" if it
       * was beaten (compared as a share of the maximum, in case the content changes),
       * and clear the resume point. Returns what the score screen needs to show.
       */
      recordFinish(id, stars, max) {
        const p = get(id);
        if (!p) return null;
        const prevBest = p.best;
        const prevLast = p.last;
        const score = { stars, max, at: Date.now() };
        const newBest = !prevBest || stars / max > prevBest.stars / prevBest.max;
        p.last = score;
        if (newBest) p.best = score;
        p.progress = null;
        p.playedAt = Date.now();
        persist();
        return { prevBest, prevLast, newBest, firstEver: !prevLast };
      },
    };
  })();

  /** After a correct answer: save where to resume, or (on the very last sentence) the final score. */
  function saveAfterSolve() {
    if (!state.playerId) return;
    if (isLastSentenceOfLevel() && isLastLevel()) {
      state.lastResult = Store.recordFinish(state.playerId, state.totalStars, maxStarsTotal());
      return;
    }
    // Save the NEXT sentence as the resume point, so a solved sentence is never played (and counted) twice
    const next = isLastSentenceOfLevel()
      ? { levelIndex: state.levelIndex + 1, sentenceIndex: 0 }
      : { levelIndex: state.levelIndex, sentenceIndex: state.sentenceIndex + 1 };
    Store.saveProgress(state.playerId, { ...next, levelStars: [...state.levelStars], firstTry: state.firstTry });
  }

  /** "today" / "yesterday" / "3 days ago" / "12 Oct" */
  function describeWhen(timestamp) {
    if (!timestamp) return 'earlier';
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const scoreText = (score) => `⭐ ${score.stars} / ${score.max}`;
  const sumOf = (numbers) => numbers.reduce((a, b) => a + b, 0);

  /** Score screen extras: who played, last time, best, and a "New best!" badge. */
  function renderScoreHistory() {
    const player = state.playerId ? Store.get(state.playerId) : null;
    const result = state.lastResult;

    dom.scorePlayer.textContent = player ? player.name : '';
    dom.scorePlayer.hidden = !player;
    dom.scoreNewBest.hidden = !(result && result.newBest && !result.firstEver);

    const lines = [];
    if (result && result.firstEver) lines.push('Your first score is saved! ⭐');
    if (result && result.prevLast) lines.push(`Last time: ${scoreText(result.prevLast)}`);
    if (player && player.best) lines.push(`Best score: ${scoreText(player.best)}`);
    if (player && !Store.canSave()) lines.push("⚠️ This browser can't save scores.");
    dom.scoreHistory.replaceChildren(...lines.map((text) => {
      const line = document.createElement('span');
      line.textContent = text;
      return line;
    }));
  }

  /** Show the 👤 chip's name (textContent, so a name can never inject HTML). */
  function renderPlayerChip() {
    const player = state.playerId ? Store.get(state.playerId) : null;
    dom.playerChipName.textContent = player ? player.name : 'Player';
    dom.btnPlayer.setAttribute('aria-label', player ? `Player menu. Playing as ${player.name}` : 'Player menu');
  }

  /**
   * Begin playing as a player.
   *   mode 'resume' – pick up exactly where their saved progress left off
   *   mode 'fresh'  – start from Level 1 with 0 stars (best/last scores are kept)
   */
  function startGame(playerId, mode) {
    const player = playerId ? Store.get(playerId) : null;
    const progress = mode === 'resume' && player ? player.progress : null;

    window.clearTimeout(state.scoreTimer);
    dom.playerScreen.hidden = true;
    dom.scoreScreen.hidden = true;
    dom.app.inert = false;

    state.playerId = player ? player.id : null;
    state.lastResult = null;
    if (progress) {
      state.levelIndex = progress.levelIndex;
      state.sentenceIndex = progress.sentenceIndex;
      progress.levelStars.forEach((n, i) => { state.levelStars[i] = n; });
      state.totalStars = sumOf(progress.levelStars);
      state.firstTry = progress.firstTry;
    } else {
      state.levelIndex = 0;
      state.sentenceIndex = 0;
      state.levelStars.fill(0);
      state.totalStars = 0;
      state.firstTry = 0;
      if (player) Store.clearProgress(player.id);
    }
    if (player) Store.touch(player.id);

    renderPlayerChip();
    loadSentence();
    setMessage(
      progress ? `Welcome back, ${player.name}! 🌳` : "Let's grow a new tree! 🌱",
      'good'
    );
    state.tokens[0].el.focus({ preventScroll: true });
  }

  /* ---------- Player screen (who's playing / welcome back) ---------- */

  const profile = { playerId: null, fromGame: false };

  /** Show exactly one of the four views: 'pick', 'name', 'welcome' or 'remove'. */
  function showView(view) {
    dom.viewPick.hidden = view !== 'pick';
    dom.viewName.hidden = view !== 'name';
    dom.viewWelcome.hidden = view !== 'welcome';
    dom.viewRemove.hidden = view !== 'remove';
    dom.playerNotice.hidden = true;           // a notice only lives until the next view change
    dom.saveWarning.hidden = Store.canSave();
  }

  function openProfile({ playerId = null, fromGame = false } = {}) {
    profile.fromGame = fromGame;
    dom.scoreScreen.hidden = true;
    dom.app.inert = true;
    dom.playerScreen.hidden = false;
    if (playerId && Store.get(playerId)) showWelcome(playerId);
    else if (Store.players().length) showPick();
    else showNameForm(false);
  }

  function closeProfile() {
    dom.playerScreen.hidden = true;
    dom.app.inert = false;
  }

  /** View 1: a big button per saved child, plus "New player". */
  function showPick() {
    dom.playerTitle.textContent = "Who's playing?";
    showView('pick');
    dom.playerList.replaceChildren(...Store.players().map((player) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'player-btn';

      const name = document.createElement('span');
      name.className = 'player-btn-name';
      name.textContent = player.name;
      const meta = document.createElement('span');
      meta.className = 'player-btn-meta';
      meta.textContent = player.best ? `Best ⭐ ${player.best.stars}` : player.progress ? `Level ${player.progress.levelIndex + 1}` : 'New';

      button.append(name, meta);
      button.addEventListener('click', () => showWelcome(player.id));
      item.appendChild(button);
      return item;
    }));
    (dom.playerList.querySelector('button') || dom.btnNewPlayer).focus({ preventScroll: true });
  }

  /** View 2: type a name. */
  function showNameForm(canGoBack) {
    dom.playerTitle.textContent = "What's your name?";
    showView('name');
    dom.playerName.value = '';
    dom.nameError.textContent = '';
    dom.btnNameBack.hidden = !canGoBack;
    dom.playerName.focus({ preventScroll: true });
  }

  function submitName(event) {
    event.preventDefault();
    const name = Store.cleanName(dom.playerName.value);
    if (!name) {
      dom.nameError.textContent = 'Please type your name first 🙂';
      dom.playerName.focus();
      return;
    }
    // Same name (any capitals) = same child, so their saved progress comes back
    const player = Store.findByName(name) || Store.create(name);
    showWelcome(player.id);
  }

  /** Swap the Continue / Start New Game buttons for the "are you sure?" question (and back). */
  function setFreshConfirm(on) {
    const player = Store.get(profile.playerId);
    dom.freshConfirm.hidden = !on;
    dom.btnFresh.hidden = on;
    dom.btnContinue.hidden = on || !(player && player.progress);
    if (on && player && player.progress) {
      const p = player.progress;
      dom.freshConfirmText.textContent =
        `Start over from Level 1? You will lose your place (Level ${p.levelIndex + 1}, sentence ${p.sentenceIndex + 1}). Your best score stays safe.`;
      dom.btnFreshNo.focus({ preventScroll: true });
    }
  }

  /** View 3: hello, last/best score, and Continue / Start New Game. */
  function showWelcome(playerId) {
    const player = Store.get(playerId);
    if (!player) { showPick(); return; }
    profile.playerId = playerId;

    dom.playerTitle.textContent = `Hi, ${player.name}! 👋`;
    showView('welcome');

    // One row per score. The "(2 days ago)" part is kept together so it wraps as a whole.
    const rows = [];
    const addRow = (label, score, when) => {
      const row = document.createElement('div');
      row.append(`${label}: ${scoreText(score)} `);
      if (when) {
        const whenEl = document.createElement('span');
        whenEl.className = 'nowrap';
        whenEl.textContent = `(${when})`;
        row.appendChild(whenEl);
      }
      rows.push(row);
    };
    if (player.last) addRow('Last score', player.last, describeWhen(player.last.at));
    if (player.best) addRow('Best score', player.best, null);
    if (rows.length) dom.welcomeStats.replaceChildren(...rows);
    else dom.welcomeStats.textContent = 'No scores yet. Finish a game to set your first one!';

    const progress = player.progress;
    if (progress) {
      // Two lines: the action, then exactly where it will resume
      const title = document.createElement('span');
      title.textContent = '▶ Continue';
      const detail = document.createElement('small');
      detail.className = 'btn-sub';
      detail.textContent =
        `Level ${progress.levelIndex + 1} · sentence ${progress.sentenceIndex + 1} · ⭐ ${sumOf(progress.levelStars)}`;
      dom.btnContinue.replaceChildren(title, detail);
      dom.btnFresh.textContent = '🔄 Start New Game';
      dom.btnFresh.className = 'btn btn-reset player-action';
    } else {
      dom.btnFresh.textContent = '▶ Start Game';
      dom.btnFresh.className = 'btn btn-check player-action';
    }
    setFreshConfirm(false);
    dom.btnCloseProfile.hidden = !profile.fromGame;
    (progress ? dom.btnContinue : dom.btnFresh).focus({ preventScroll: true });
  }

  /** "Remove this player": ask first. The safe answer ("No, keep") gets the focus. */
  function askRemovePlayer() {
    const player = Store.get(profile.playerId);
    if (!player) { showPick(); return; }
    dom.playerTitle.textContent = `Remove ${player.name}?`;
    showView('remove');
    dom.removeText.textContent =
      `This will delete ${player.name}'s name, saved place and all scores. It can't be undone.`;
    dom.btnRemoveNo.textContent = `No, keep ${player.name}`;
    dom.btnRemoveNo.focus({ preventScroll: true });
  }

  /** Confirmed: delete the player for good, then go back to the list of players. */
  function confirmRemovePlayer() {
    const player = Store.get(profile.playerId);
    if (!player) { showPick(); return; }
    const { id, name } = player;
    Store.remove(id);

    // If the removed child was the one playing, the game behind the screen must forget them too
    if (state.playerId === id) {
      window.clearTimeout(state.scoreTimer);
      state.playerId = null;
      state.lastResult = null;
      state.levelIndex = 0;
      state.sentenceIndex = 0;
      state.levelStars.fill(0);
      state.totalStars = 0;
      state.firstTry = 0;
      loadSentence();
      renderPlayerChip();
      profile.fromGame = false;              // no game to go back to until someone picks a name
    }
    profile.playerId = null;

    if (Store.players().length) showPick();
    else showNameForm(false);
    dom.playerNotice.textContent = `${name} was removed.`;
    dom.playerNotice.hidden = false;
  }

  function onFreshClick() {
    const player = Store.get(profile.playerId);
    if (player && player.progress) setFreshConfirm(true);      // would wipe saved progress: ask first
    else startGame(profile.playerId, 'fresh');
  }

  /* ======================================================================
     10. BOOT
     ====================================================================== */

  function init() {
    validateData(GAME_DATA);
    // Wake the audio engine on the first touch/click/key (browsers require a user gesture)
    ['pointerdown', 'keydown'].forEach((type) =>
      document.addEventListener(type, () => Sound.unlock(), { once: true, passive: true })
    );
    dom.btnSound.addEventListener('click', toggleSound);
    renderSoundButton();
    dom.btnCheck.addEventListener('click', checkAnswer);
    dom.btnReset.addEventListener('click', resetRound);
    dom.btnNext.addEventListener('click', goNext);
    dom.btnPlayAgain.addEventListener('click', restartGame);

    // Player screen
    dom.btnPlayer.addEventListener('click', () => openProfile({ playerId: state.playerId, fromGame: true }));
    dom.btnScoreSwitch.addEventListener('click', () => openProfile());
    dom.btnNewPlayer.addEventListener('click', () => showNameForm(true));
    dom.btnNameBack.addEventListener('click', showPick);
    dom.viewName.addEventListener('submit', submitName);
    dom.btnContinue.addEventListener('click', () => startGame(profile.playerId, 'resume'));
    dom.btnFresh.addEventListener('click', onFreshClick);
    dom.btnFreshYes.addEventListener('click', () => startGame(profile.playerId, 'fresh'));
    dom.btnFreshNo.addEventListener('click', () => showWelcome(profile.playerId));
    dom.btnSwitch.addEventListener('click', showPick);
    dom.btnRemove.addEventListener('click', askRemovePlayer);
    dom.btnRemoveYes.addEventListener('click', confirmRemovePlayer);
    dom.btnRemoveNo.addEventListener('click', () => showWelcome(profile.playerId));
    dom.btnCloseProfile.addEventListener('click', closeProfile);
    document.addEventListener('keydown', (event) => {
      // Escape closes the player screen, but only when there is a game to go back to
      if (event.key === 'Escape' && !dom.playerScreen.hidden && profile.fromGame) closeProfile();
    });

    loadSentence();       // draws Level 1 behind the player screen
    renderPlayerChip();
    openProfile();        // everyone starts by saying who is playing
  }

  init();

  // Small debug handle for the browser console while we build the MVP.
  window.GrammaTree = {
    state, GAME_DATA, Store, checkAnswer, resetRound, goNext,
    showScoreScreen, restartGame, openProfile, startGame,
  };
})();
